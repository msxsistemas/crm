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
import { createServer } from 'http';
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
import internalChatRoutes from './routes/internal-chat.js';
import metaWhatsAppRoutes from './routes/meta-whatsapp.js';
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
await fastify.register(internalChatRoutes);
await fastify.register(metaWhatsAppRoutes);

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

// Create HTTP server + Socket.io
const httpServer = createServer(fastify.server);
const io = setupSocket(httpServer);

// Make io available in routes
fastify.decorate('io', io);

// Run pending DB migrations on startup
await runPendingMigrations().catch(e => console.error('Migration error:', e.message));

// Start background workers
startMessageWorker(io);
startSchedulesWorker(io);
deliverWebhook.startWorker();
startSLAWorker();

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

// Graceful shutdown
const shutdown = async () => {
  console.log('\nEncerrando servidor...');
  await fastify.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
