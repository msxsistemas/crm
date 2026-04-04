import { Queue, Worker } from 'bullmq';
import { createHmac } from 'crypto';
import { query } from '../database.js';

const connection = { host: '127.0.0.1', port: 6379 };

const webhookQueue = new Queue('webhook-delivery', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 }, // 10s, 20s, 40s, 80s, 160s
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

/**
 * Dispatch an event to all active webhooks subscribed to it.
 * Call this from route handlers when relevant events occur.
 *
 * @param {string} event  e.g. 'message.new', 'conversation.updated'
 * @param {object} payload  the event data
 * @param {string} [userId] scope to a specific user's webhooks (optional)
 */
export async function dispatchEvent(event, payload, userId = null) {
  try {
    const conditions = ["is_active = true", "$1 = ANY(events)"];
    const params = [event];
    if (userId) {
      conditions.push(`user_id = $2`);
      params.push(userId);
    }
    const { rows: hooks } = await query(
      `SELECT * FROM webhooks WHERE ${conditions.join(' AND ')}`,
      params
    );
    for (const hook of hooks) {
      await webhookQueue.add('deliver', {
        webhookId: hook.id,
        url: hook.url,
        secret: hook.secret,
        event,
        payload,
      });
    }
  } catch (e) {
    console.error('dispatchEvent error:', e.message);
  }
}

function startWorker() {
  const worker = new Worker('webhook-delivery', async (job) => {
    const { webhookId, url, secret, event, payload } = job.data;
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

    const headers = {
      'Content-Type': 'application/json',
      'X-MSX-Event': event,
    };

    if (secret) {
      const sig = createHmac('sha256', secret).update(body).digest('hex');
      headers['X-MSX-Signature'] = `sha256=${sig}`;
    }

    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15_000) });

    // Log delivery attempt
    await query(
      `INSERT INTO webhook_logs (webhook_id, event, status_code, response_body, delivered_at)
       VALUES ($1,$2,$3,$4,NOW())`,
      [webhookId, event, res.status, (await res.text().catch(() => '')).slice(0, 500)]
    ).catch(() => {});

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, { connection, concurrency: 20 });

  worker.on('failed', (job, err) => {
    console.error(`Webhook delivery failed [attempt ${job?.attemptsMade}] to ${job?.data?.url}: ${err.message}`);
  });

  return worker;
}

export const deliverWebhook = { dispatchEvent, startWorker };
