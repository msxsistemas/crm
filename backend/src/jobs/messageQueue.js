import { Queue, Worker } from 'bullmq';
import { query } from '../database.js';
import { sendMetaMessage } from '../routes/meta-whatsapp.js';

const connection = { host: '127.0.0.1', port: 6379 };

export const messageQueue = new Queue('send-message', {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s, 40s
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/** Enqueue a message send job */
export async function enqueueSend({ conversationId, messageId, phone, content, type, mediaUrl, provider, phoneNumberId, accessToken, evolutionUrl, evolutionKey, instance }) {
  await messageQueue.add('send', {
    conversationId, messageId, phone, content, type, mediaUrl,
    provider, phoneNumberId, accessToken, evolutionUrl, evolutionKey, instance,
  });
}

/** Worker — processes send jobs with automatic retry on failure */
export function startMessageWorker(io) {
  const worker = new Worker('send-message', async (job) => {
    const { provider, phoneNumberId, accessToken, evolutionUrl, evolutionKey, instance, phone, content, type, mediaUrl, messageId } = job.data;

    try {
      if (provider === 'meta') {
        const result = await sendMetaMessage({ phoneNumberId, accessToken, to: phone, content, type, mediaUrl });
        if (result.error) throw new Error(result.error.message);
        // Update external_id on success
        if (result.messages?.[0]?.id) {
          await query('UPDATE messages SET status=$1, external_id=$2 WHERE id=$3', ['sent', result.messages[0].id, messageId]);
        }
      } else {
        // Evolution API — text vs media
        let evoRes;
        if (mediaUrl && type && type !== 'text') {
          // Map type to Evolution mediatype
          const mediaTypeMap = { image: 'image', video: 'video', audio: 'audio', document: 'document' };
          const mediatype = mediaTypeMap[type] || 'document';
          if (type === 'audio') {
            evoRes = await fetch(`${evolutionUrl}/message/sendWhatsAppAudio/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
              body: JSON.stringify({ number: phone, audio: mediaUrl }),
            });
          } else {
            evoRes = await fetch(`${evolutionUrl}/message/sendMedia/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
              body: JSON.stringify({ number: phone, mediatype, media: mediaUrl, caption: content || '' }),
            });
          }
        } else {
          evoRes = await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
            body: JSON.stringify({ number: phone, text: content }),
          });
        }
        const data = await evoRes.json();
        if (data.status === 'error' || data.error) throw new Error(data.message || data.error);
        const extId = data.key?.id || data.id || null;
        await query('UPDATE messages SET status=$1, external_id=COALESCE($2,external_id) WHERE id=$3', ['sent', extId, messageId]);
      }

      io?.to(`conversation:${job.data.conversationId}`).emit('message:status', { id: messageId, status: 'sent' });

    } catch (err) {
      // On final failure, mark message as failed
      if (job.attemptsMade >= job.opts.attempts - 1) {
        await query('UPDATE messages SET status=$1 WHERE id=$2', ['failed', messageId]).catch(() => {});
        io?.to(`conversation:${job.data.conversationId}`).emit('message:status', { id: messageId, status: 'failed' });
      }
      throw err; // re-throw so BullMQ retries
    }
  }, { connection, concurrency: 10 });

  worker.on('failed', (job, err) => {
    console.error(`Message send failed [attempt ${job?.attemptsMade}]:`, err.message);
  });

  return worker;
}
