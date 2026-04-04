import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
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
import misc2Routes from './routes/misc2.js';

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

// Rate limiting global (generous limit; overridden per-route where needed)
await fastify.register(rateLimit, {
  global: false, // opt-in per route
});

// Multipart (file uploads)
await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

// Decorate authenticate
fastify.decorate('authenticate', authenticate);

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
}));

// Register all routes
await fastify.register(authRoutes);
await fastify.register(contactRoutes);
await fastify.register(conversationRoutes);
await fastify.register(messageRoutes);
await fastify.register(userRoutes);
await fastify.register(miscRoutes);
await fastify.register(misc2Routes);

// 404 handler
fastify.setNotFoundHandler((req, reply) => {
  reply.status(404).send({ error: `Rota não encontrada: ${req.method} ${req.url}` });
});

// Error handler
fastify.setErrorHandler((err, req, reply) => {
  console.error(err);
  reply.status(err.statusCode || 500).send({ error: err.message || 'Erro interno' });
});

// Create HTTP server + Socket.io
const httpServer = createServer(fastify.server);
const io = setupSocket(httpServer);

// Make io available in routes
fastify.decorate('io', io);

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
