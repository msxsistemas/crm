import { Queue, Worker } from 'bullmq';
import { query } from '../database.js';
import { notifySLAWarning } from '../notifications/email.js';

const connection = { host: '127.0.0.1', port: 6379 };

const slaQueue = new Queue('sla-check', { connection });

export function startSLAWorker() {
  // Check SLA every 5 minutes
  slaQueue.add('check', {}, {
    repeat: { every: 5 * 60_000 },
    removeOnComplete: 5,
    removeOnFail: 10,
  }).catch(() => {});

  const worker = new Worker('sla-check', async () => {
    const { rows: rules } = await query(
      'SELECT * FROM sla_rules WHERE is_active = true'
    );
    if (!rules.length) return;

    for (const rule of rules) {
      // First response SLA: conversations open with no outbound messages within first_response_minutes
      const warningAt = rule.first_response_minutes - (rule.warning_threshold || 10);
      if (warningAt <= 0) continue;

      const { rows: breaching } = await query(`
        SELECT c.id, c.assigned_to, c.created_at,
               ct.name as contact_name,
               EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 60 AS minutes_open
        FROM conversations c
        JOIN contacts ct ON ct.id = c.contact_id
        WHERE c.status = 'open'
          AND c.assigned_to IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM messages m
            WHERE m.conversation_id = c.id AND m.direction = 'outbound'
          )
          AND EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 60 >= $1
          AND EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 60 < $2
          AND (
            $3::text[] IS NULL
            OR ct.tags && $3::text[]
          )
      `, [warningAt, rule.first_response_minutes, rule.applies_to_tags?.length ? rule.applies_to_tags : null]);

      for (const conv of breaching) {
        const minutesLeft = Math.ceil(rule.first_response_minutes - conv.minutes_open);

        // Avoid duplicate notifications: check if we already notified in the last 10 mins
        const { rows: recent } = await query(`
          SELECT 1 FROM notifications
          WHERE user_id = $1
            AND metadata->>'conversation_id' = $2
            AND metadata->>'sla_rule_id' = $3
            AND created_at > NOW() - INTERVAL '10 minutes'
          LIMIT 1
        `, [conv.assigned_to, conv.id, rule.id]);
        if (recent.length) continue;

        // Create in-app notification
        await query(`
          INSERT INTO notifications (user_id, type, title, message, metadata)
          VALUES ($1, 'sla_warning', $2, $3, $4)
        `, [
          conv.assigned_to,
          `SLA: ${rule.name}`,
          `Conversa com ${conv.contact_name} precisa de resposta em ${minutesLeft} minutos`,
          JSON.stringify({ conversation_id: conv.id, sla_rule_id: String(rule.id), minutes_left: minutesLeft }),
        ]);

        // Email notification
        notifySLAWarning({
          agentId: conv.assigned_to,
          contactName: conv.contact_name,
          conversationId: conv.id,
          minutesLeft,
        }).catch(() => {});
      }
    }
  }, { connection, concurrency: 1 });

  worker.on('failed', (job, err) => {
    console.error('SLA worker error:', err.message);
  });

  return worker;
}
