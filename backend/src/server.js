// Migration (run manually on VPS if table doesn't exist):
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS absence_enabled BOOLEAN DEFAULT false;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS absence_start TIMESTAMPTZ;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS absence_end TIMESTAMPTZ;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS absence_message TEXT;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS absence_redirected BOOLEAN DEFAULT false;
// CREATE TABLE IF NOT EXISTS scheduled_messages (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
//   content TEXT NOT NULL,
//   scheduled_at TIMESTAMPTZ NOT NULL,
//   status TEXT DEFAULT 'pending',
//   sent_at TIMESTAMPTZ,
//   created_by UUID REFERENCES profiles(id),
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

import 'dotenv/config';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  });
}
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { setupSocket } from './socket.js';
import { authenticate } from './auth.js';
import { pool } from './database.js';

// Routes
import authRoutes from './routes/auth.js';
import contactRoutes from './routes/contacts.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import userRoutes from './routes/users.js';
import miscRoutes from './routes/misc.js';
import productRoutes from './routes/products.js';
import webhookRoutes from './routes/webhooks.js';
import slaRoutes from './routes/sla.js';
import apiTokenRoutes from './routes/api-tokens.js';
import agentScheduleRoutes from './routes/agent-schedules.js';
import distributionRoutes from './routes/distribution.js';
import engagementRoutes from './routes/engagement.js';
import misc3Routes from './routes/misc3.js';
import taskRoutes from './routes/tasks.js';
import blacklistRoutes from './routes/blacklist.js';
import reviewRoutes from './routes/reviews.js';
import proposalRoutes from './routes/proposals.js';
import internalChatRoutes from './routes/internal-chat.js';
import statsRoutes from './routes/stats.js';
import metaWhatsAppRoutes from './routes/meta-whatsapp.js';
import inboundWebhookRoutes from './routes/inbound-webhooks.js';
import emailNotificationSettingsRoutes from './routes/email-notification-settings.js';
import { startMessageWorker } from './jobs/messageQueue.js';
import { startSchedulesWorker } from './jobs/schedulesWorker.js';
import { deliverWebhook } from './jobs/webhookDelivery.js';
import { startSLAWorker } from './jobs/slaWorker.js';
import { runPendingMigrations } from './migrations/runner.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { register, httpRequests, httpDuration, wsConnections, queueSize } from './metrics.js';
import { messageQueue } from './jobs/messageQueue.js';

const fastify = Fastify({ logger: { level: 'warn' }, trustProxy: true });

// CORS
await fastify.register(cors, {
  origin: [
    process.env.FRONTEND_URL || 'https://msxzap.pro',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
});

// Security headers
await fastify.register(helmet, {
  contentSecurityPolicy: false, // disabled to allow inline scripts in the SPA
  crossOriginEmbedderPolicy: false,
});

// Cookie support (for httpOnly JWT auth)
await fastify.register(cookie);

// Rate limiting global (generous limit; overridden per-route where needed)
await fastify.register(rateLimit, {
  global: false, // opt-in per route
});

// Multipart (file uploads)
await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

// Decorate authenticate
fastify.decorate('authenticate', authenticate);

// CSRF protection (double-submit cookie)
csrfMiddleware(fastify);

// Metrics endpoint (Prometheus scrape target)
fastify.get('/metrics', async (req, reply) => {
  // Update queue metrics before responding
  try {
    const [waiting, active, failed] = await Promise.all([
      messageQueue.getWaitingCount(),
      messageQueue.getActiveCount(),
      messageQueue.getFailedCount(),
    ]);
    queueSize.set({ queue: 'send-message', state: 'waiting' }, waiting);
    queueSize.set({ queue: 'send-message', state: 'active' }, active);
    queueSize.set({ queue: 'send-message', state: 'failed' }, failed);
  } catch {}

  reply.header('Content-Type', register.contentType);
  return register.metrics();
});

// Request duration + counter hook
fastify.addHook('onResponse', (req, reply, done) => {
  const route = req.routerPath || req.url.split('?')[0];
  httpRequests.inc({ method: req.method, route, status: reply.statusCode });
  done();
});

// Health check — verifica PostgreSQL, Redis e MinIO
fastify.get('/health', async (req, reply) => {
  const { redis } = await import('./redis.js');
  const { minioClient, BUCKET } = await import('./minio.js');

  const checks = { postgres: 'ok', redis: 'ok', minio: 'ok' };

  await pool.query('SELECT 1').catch(() => { checks.postgres = 'error'; });
  await redis.ping().catch(() => { checks.redis = 'error'; });
  await minioClient.bucketExists(BUCKET).catch(() => { checks.minio = 'error'; });

  const healthy = Object.values(checks).every(v => v === 'ok');
  return reply.status(healthy ? 200 : 503).send({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  });
});

// Register all routes
await fastify.register(authRoutes);
await fastify.register(contactRoutes);
await fastify.register(conversationRoutes);
await fastify.register(messageRoutes);
await fastify.register(userRoutes);
await fastify.register(miscRoutes);
await fastify.register(productRoutes);
await fastify.register(webhookRoutes);
await fastify.register(slaRoutes);
await fastify.register(apiTokenRoutes);
await fastify.register(agentScheduleRoutes);
await fastify.register(distributionRoutes);
await fastify.register(engagementRoutes);
await fastify.register(misc3Routes);
await fastify.register(taskRoutes);
await fastify.register(blacklistRoutes);
await fastify.register(reviewRoutes);
await fastify.register(proposalRoutes);
await fastify.register(internalChatRoutes);
await fastify.register(metaWhatsAppRoutes);
await fastify.register(statsRoutes);
await fastify.register(import('./routes/pipeline.js'));
await fastify.register(import('./routes/webhooks-out.js'));
await fastify.register(inboundWebhookRoutes);
await fastify.register(emailNotificationSettingsRoutes);

// 404 handler
fastify.setNotFoundHandler((req, reply) => {
  reply.status(404).send({ error: `Rota não encontrada: ${req.method} ${req.url}` });
});

// Error handler
fastify.setErrorHandler((err, req, reply) => {
  if (err.statusCode >= 500 || !err.statusCode) {
    Sentry.captureException(err, { extra: { url: req.url, method: req.method } });
    console.error(err);
  }
  reply.status(err.statusCode || 500).send({ error: err.message || 'Erro interno' });
});

// Attach Socket.io directly to Fastify's underlying HTTP server
const io = setupSocket(fastify.server);

// Make io available in routes
fastify.decorate('io', io);

// Run pending DB migrations on startup
await runPendingMigrations().catch(e => console.error('Migration error:', e.message));

// Start background workers
startMessageWorker(io);
startSchedulesWorker(io);
deliverWebhook.startWorker();
startSLAWorker();

// SLA violation check — runs every 5 minutes, emits socket event + e-mail
setInterval(async () => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.assigned_to, ct.name as contact_name
      FROM conversations c
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.status='open' AND c.sla_deadline IS NOT NULL
      AND c.sla_deadline < NOW() AND c.sla_alerted = false
    `);
    const { sendEmailNotification } = await import('./notifications/emailNotifications.js').catch(() => ({ sendEmailNotification: null }));
    for (const c of rows) {
      await pool.query('UPDATE conversations SET sla_alerted=true WHERE id=$1', [c.id]);
      if (io) io.emit('sla:violated', { conversation_id: c.id, assigned_to: c.assigned_to });
      // Enviar e-mail de SLA para o agente responsável
      if (c.assigned_to && sendEmailNotification) {
        sendEmailNotification(c.assigned_to, 'sla_expiring', {
          contactName: c.contact_name || 'Contato',
          conversationId: c.id,
          minutesLeft: 0,
        }).catch(() => {});
      }
    }
  } catch(e) { /* silent */ }
}, 300000);

// Absence redistribution job — runs every 5 minutes
setInterval(async () => {
  try {
    const { rows: absentConvos } = await pool.query(`
      SELECT c.id FROM conversations c
      JOIN profiles p ON p.id = c.assigned_to
      WHERE c.status = 'open'
        AND p.absence_enabled = true
        AND p.absence_start <= NOW()
        AND (p.absence_end IS NULL OR p.absence_end >= NOW())
        AND c.absence_redirected != true
    `);
    for (const conv of absentConvos) {
      const { rows: agents } = await pool.query(`
        SELECT p.id, COUNT(c2.id) as open_count
        FROM profiles p
        LEFT JOIN conversations c2 ON c2.assigned_to = p.id AND c2.status = 'open'
        WHERE p.role IN ('agent','supervisor') AND p.status = 'online'
          AND (p.absence_enabled = false OR p.absence_enabled IS NULL OR p.absence_end < NOW())
        GROUP BY p.id ORDER BY open_count ASC LIMIT 1
      `);
      if (agents[0]) {
        await pool.query('UPDATE conversations SET assigned_to=$1, absence_redirected=true WHERE id=$2', [agents[0].id, conv.id]);
      }
    }
  } catch(e) { /* silent */ }
}, 300000);

// Auto-close inactive conversations (runs every hour)
const autoCloseInactive = async () => {
  try {
    const { rows: s } = await pool.query('SELECT auto_close_days FROM settings WHERE id=1');
    const days = parseInt(s[0]?.auto_close_days || 0);
    if (!days) return;
    const { rows } = await pool.query(`
      UPDATE conversations
      SET status='closed', updated_at=NOW()
      WHERE status IN ('open','in_progress')
        AND last_message_at < NOW() - INTERVAL '${days} days'
      RETURNING id
    `);
    if (rows.length) {
      rows.forEach(r => {
        pool.query("INSERT INTO conversation_events (conversation_id, event_type, actor_name, new_value) VALUES ($1,'status_changed','Sistema (auto-fechamento)','closed')", [r.id]).catch(() => {});
      });
      io.emit('conversations:bulk_closed', { ids: rows.map(r => r.id) });
      console.log(`[auto-close] Fechou ${rows.length} conversa(s) inativas`);
    }
  } catch {}
};
setInterval(autoCloseInactive, 60 * 60 * 1000); // a cada hora
autoCloseInactive(); // rodar na inicialização também

// Scheduled reports job — runs every hour
setInterval(async () => {
  try {
    const { rows: reports } = await pool.query("SELECT * FROM scheduled_reports WHERE next_run_at <= NOW() AND is_active=true");
    for (const report of reports) {
      try {
        // Generate CSV data
        let csvData = '';
        if (report.report_type === 'conversations') {
          const { rows } = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as total,
              COUNT(*) FILTER (WHERE status='closed') as closed,
              COUNT(*) FILTER (WHERE status='open') as open,
              ROUND(AVG(csat_score)::numeric,2) as avg_csat
            FROM conversations
            WHERE created_at > NOW() - interval '7 days'
            GROUP BY DATE(created_at) ORDER BY date DESC
          `);
          csvData = 'Data,Total,Fechadas,Abertas,CSAT Médio\n' + rows.map(r => `${r.date},${r.total},${r.closed},${r.open},${r.avg_csat||''}`).join('\n');
        } else if (report.report_type === 'agents') {
          const { rows } = await pool.query(`
            SELECT p.full_name, COUNT(c.id) FILTER (WHERE c.status='closed' AND c.closed_at > NOW()-interval '7 days') as closed_week,
              ROUND(AVG(c.csat_score)::numeric,2) as avg_csat
            FROM profiles p LEFT JOIN conversations c ON c.assigned_to=p.id
            WHERE p.role IN ('agent','supervisor') GROUP BY p.full_name ORDER BY closed_week DESC
          `);
          csvData = 'Agente,Fechadas (7d),CSAT Médio\n' + rows.map(r => `${r.full_name},${r.closed_week||0},${r.avg_csat||''}`).join('\n');
        }

        // Send via Resend API (if configured) or log
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey && csvData) {
          const emails = Array.isArray(report.emails) ? report.emails : [report.emails];
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: process.env.REPORT_FROM_EMAIL || 'relatorios@msxcrm.com',
              to: emails,
              subject: `Relatório ${report.name} — ${new Date().toLocaleDateString('pt-BR')}`,
              html: `<p>Segue o relatório <b>${report.name}</b> em anexo.</p><pre>${csvData}</pre>`
            })
          });
        }

        // Update next_run_at
        const next = report.frequency === 'daily' ? "NOW() + interval '1 day'" : "NOW() + interval '7 days'";
        await pool.query(`UPDATE scheduled_reports SET next_run_at=${next}, last_run_at=NOW() WHERE id=$1`, [report.id]);
      } catch(e) { console.error('Report error:', report.id, e.message); }
    }
  } catch(e) { /* silent */ }
}, 3600000); // every hour

// Escalation rules worker — runs every 5 minutes
setInterval(async () => {
  try {
    const { rows: rules } = await pool.query("SELECT * FROM escalation_rules WHERE enabled=true");
    if (!rules.length) return;

    for (const rule of rules) {
      // Find open conversations idle longer than idle_minutes, not yet assigned to supervisor/admin
      const { rows: convos } = await pool.query(`
        SELECT c.id, c.assigned_to
        FROM conversations c
        LEFT JOIN profiles p ON p.id = c.assigned_to
        WHERE c.status IN ('open','in_progress')
          AND c.last_message_at < NOW() - ($1 || ' minutes')::INTERVAL
          AND (p.role IS NULL OR p.role NOT IN ('supervisor','admin'))
      `, [rule.idle_minutes]);

      if (!convos.length) continue;

      // Find target-role agent with least open conversations
      const { rows: supervisors } = await pool.query(`
        SELECT p.id, COUNT(c2.id) as open_count
        FROM profiles p
        LEFT JOIN conversations c2 ON c2.assigned_to = p.id AND c2.status IN ('open','in_progress')
        WHERE p.role = $1 AND p.status = 'online'
        GROUP BY p.id ORDER BY open_count ASC LIMIT 1
      `, [rule.target_role]);

      const target = supervisors[0];
      if (!target) continue;

      for (const conv of convos) {
        await pool.query('UPDATE conversations SET assigned_to=$1 WHERE id=$2', [target.id, conv.id]);
        await pool.query(
          "INSERT INTO conversation_events (conversation_id, event_type, actor_name, new_value) VALUES ($1,'escalated','Sistema (escalação automática)',$2)",
          [conv.id, `Regra: ${rule.name} — inativo por ${rule.idle_minutes} minutos`]
        ).catch(() => {});
        if (io) io.emit('conversation:escalated', { conversation_id: conv.id, rule_id: rule.id, assigned_to: target.id });
      }
    }
  } catch(e) { /* silent */ }
}, 300000);

// Scheduled messages job — runs every minute
setInterval(async () => {
  try {
    const { rows } = await pool.query("SELECT sm.*, c.connection_name as instance_name, ct.phone FROM scheduled_messages sm JOIN conversations c ON c.id=sm.conversation_id JOIN contacts ct ON ct.id=c.contact_id WHERE sm.status='pending' AND sm.scheduled_at <= NOW()");
    for (const msg of rows) {
      try {
        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${msg.instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
          body: JSON.stringify({ number: msg.phone, text: msg.content })
        });
        await pool.query("UPDATE scheduled_messages SET status='sent', sent_at=NOW() WHERE id=$1", [msg.id]);
      } catch(e) {
        await pool.query("UPDATE scheduled_messages SET status='error' WHERE id=$1", [msg.id]);
      }
    }
  } catch(e) { /* silent */ }
}, 60000);

// Start
const PORT = parseInt(process.env.PORT || '3000');
const HOST = '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`\n🚀 MSX CRM Backend rodando em http://${HOST}:${PORT}`);
  console.log(`📡 Socket.io ativo`);
  console.log(`🗄️  PostgreSQL: ${process.env.DATABASE_URL?.split('@')[1]}\n`);
} catch (err) {
  console.error('Erro ao iniciar servidor:', err);
  process.exit(1);
}

// Appointment reminders — runs every minute
setInterval(async () => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, ct.phone, c.connection_name as instance_name
      FROM appointments a
      JOIN contacts ct ON ct.id=a.contact_id
      JOIN conversations cv ON cv.contact_id=ct.id AND cv.status='open'
      JOIN connections c ON c.name=cv.connection_name
      WHERE a.notify_via_whatsapp=true AND a.notified=false AND a.scheduled_at <= NOW() + interval '15 minutes' AND a.scheduled_at > NOW()
    `);
    for (const appt of rows) {
      try {
        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${appt.instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
          body: JSON.stringify({ number: appt.phone, text: `⏰ Lembrete: ${appt.title} em 15 minutos!` })
        });
        await pool.query('UPDATE appointments SET notified=true WHERE id=$1', [appt.id]);
      } catch(e) {}
    }
  } catch(e) {}
}, 60000);

// Graceful shutdown
const shutdown = async () => {
  console.log('\nEncerrando servidor...');
  await fastify.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
