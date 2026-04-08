import { Queue, Worker } from 'bullmq';
import { query, pool } from '../database.js';
import { enqueueSend } from './messageQueue.js';

const connection = { host: '127.0.0.1', port: 6379 };

const schedulesQueue = new Queue('schedules-check', { connection });

/**
 * Polls the `schedules` table every minute and enqueues any pending messages
 * whose send_at/scheduled_at has passed.
 */
export function startSchedulesWorker(io) {
  // Add repeatable job that fires every 60 seconds
  schedulesQueue.add('check', {}, {
    repeat: { every: 60_000 },
    removeOnComplete: 10,
    removeOnFail: 20,
  }).catch(() => {}); // ignore duplicate key on restart

  const worker = new Worker('schedules-check', async () => {
    const now = new Date().toISOString();

    // Fetch pending schedules whose time has come
    const { rows: pending } = await query(`
      SELECT s.*,
        ct.phone as contact_phone,
        sv.evolution_url,
        ec.evolution_key as instance_token,
        mc.phone_number_id as meta_phone_number_id, mc.access_token as meta_access_token
      FROM schedules s
      LEFT JOIN contacts ct ON ct.id = s.contact_id
      LEFT JOIN settings sv ON sv.id = 1
      LEFT JOIN conversations conv ON conv.id = s.conversation_id
      LEFT JOIN evolution_connections ec ON ec.instance_name = COALESCE(s.connection_name, conv.connection_name)
      LEFT JOIN meta_connections mc ON mc.phone_number_id = conv.connection_name
      WHERE s.status = 'pending'
        AND COALESCE(s.send_at, s.scheduled_at) <= $1
    `, [now]);

    for (const schedule of pending) {
      try {
        // Mark as processing to prevent duplicate sends
        await query("UPDATE schedules SET status='processing' WHERE id=$1 AND status='pending'", [schedule.id]);

        const phone = schedule.contact_phone;
        const content = schedule.message;

        // Find or create conversation
        let convId = schedule.conversation_id;
        if (!convId && phone) {
          const { rows: contacts } = await query('SELECT id FROM contacts WHERE phone=$1', [phone]);
          const contactId = contacts[0]?.id;
          if (contactId) {
            const { rows: convs } = await query(
              "SELECT id FROM conversations WHERE contact_id=$1 AND status!='closed' ORDER BY created_at DESC LIMIT 1",
              [contactId]
            );
            convId = convs[0]?.id;
            if (!convId) {
              const { rows: newConv } = await query(
                "INSERT INTO conversations (contact_id, connection_name, status) VALUES ($1,$2,'open') RETURNING id",
                [contactId, schedule.connection_name]
              );
              convId = newConv[0]?.id;
            }
          }
        }

        if (!convId) {
          await query("UPDATE schedules SET status='failed', error=$1 WHERE id=$2", ['No conversation found', schedule.id]);
          continue;
        }

        // Save message
        const { rows: msgRows } = await query(
          "INSERT INTO messages (conversation_id, content, direction, type) VALUES ($1,$2,'outbound','text') RETURNING *",
          [convId, content]
        );
        const message = msgRows[0];

        await query('UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1', [convId]);

        // Enqueue actual send
        if (schedule.meta_phone_number_id && schedule.meta_access_token) {
          await enqueueSend({
            conversationId: convId, messageId: message.id, phone,
            content, type: 'text', provider: 'meta',
            phoneNumberId: schedule.meta_phone_number_id,
            accessToken: schedule.meta_access_token,
          });
        } else if (schedule.evolution_url) {
          // Use global key from settings (Evolution API — not per-instance)
          const { rows: sv } = await query('SELECT evolution_key FROM settings WHERE id=1').catch(() => ({ rows: [] }));
          const instanceName = schedule.connection_name || '';
          await enqueueSend({
            conversationId: convId, messageId: message.id, phone,
            content, type: 'text', provider: 'evolution',
            evolutionUrl: schedule.evolution_url,
            evolutionKey: sv[0]?.evolution_key || '',
            instance: instanceName,
          });
        }

        io?.to(`conversation:${convId}`).emit('message:new', message);

        // Handle repeat
        const repeat = schedule.repeat_interval || schedule.repeat_daily || 'none';
        if (repeat !== 'none') {
          const intervals = { daily: 86400, weekly: 604800, monthly: 2592000 };
          const secs = intervals[repeat];
          if (secs) {
            const nextAt = new Date(Date.now() + secs * 1000).toISOString();
            await query(
              "UPDATE schedules SET status='pending', send_at=$1, scheduled_at=$1 WHERE id=$2",
              [nextAt, schedule.id]
            );
          } else {
            await query("UPDATE schedules SET status='sent' WHERE id=$1", [schedule.id]);
          }
        } else {
          await query("UPDATE schedules SET status='sent' WHERE id=$1", [schedule.id]);
        }
      } catch (e) {
        console.error(`Schedule ${schedule.id} failed:`, e.message);
        await query("UPDATE schedules SET status='failed', error=$1 WHERE id=$2", [e.message, schedule.id]);
      }
    }
  }, { connection, concurrency: 1 });

  worker.on('failed', (job, err) => {
    console.error('Schedules worker error:', err.message);
  });

  return worker;
}
