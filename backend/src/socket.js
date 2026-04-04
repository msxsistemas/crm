import { Server } from 'socket.io';
import { verifyToken } from './auth.js';

export function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Token obrigatório'));
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    console.log(`Socket connected: ${userId}`);

    // Join personal room
    socket.join(`user:${userId}`);

    // Join conversation room
    socket.on('join:conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave:conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Typing indicator
    socket.on('typing:start', ({ conversationId, userName }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:update', {
        userId, userName, typing: true,
      });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:update', {
        userId, typing: false,
      });
    });

    // Presence
    socket.on('presence:update', (status) => {
      socket.broadcast.emit('presence:changed', { userId, status });
    });

    socket.on('disconnect', () => {
      socket.broadcast.emit('presence:changed', { userId, status: 'offline' });
      console.log(`Socket disconnected: ${userId}`);
    });
  });

  return io;
}
