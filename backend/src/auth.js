import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { query } from './database.js';

export function generateTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });
  return { token, refreshToken };
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

export async function authenticate(request, reply) {
  // 1. httpOnly cookie (new sessions)
  let token = request.cookies?.access_token;

  // 2. Authorization header: Bearer <jwt> or Bearer <api_token>
  if (!token) {
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  }

  if (!token) {
    return reply.status(401).send({ error: 'Token não fornecido' });
  }

  // Try JWT first
  try {
    const payload = verifyToken(token);
    // Check if user logged out after this token was issued
    const { redis } = await import('./redis.js');
    const logoutAt = await redis.get(`logout:${payload.id}`).catch(() => null);
    if (logoutAt && payload.iat < parseInt(logoutAt)) {
      return reply.status(401).send({ error: 'Sessão encerrada' });
    }
    request.user = payload;
    return;
  } catch {
    // Not a JWT — check if it's a static API token
  }

  // Try static API token (stored in api_tokens table)
  try {
    const { rows } = await query(
      `SELECT at.*, p.id as user_id, p.email, p.role, p.name
       FROM api_tokens at
       JOIN profiles p ON p.id = at.user_id
       WHERE at.token = $1
         AND at.is_active = true
         AND (at.expires_at IS NULL OR at.expires_at > NOW())`,
      [token]
    );
    if (!rows[0]) return reply.status(401).send({ error: 'Token inválido ou expirado' });

    // Update last_used_at in background
    query('UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1', [rows[0].id]).catch(() => {});

    request.user = { id: rows[0].user_id, email: rows[0].email, role: rows[0].role, name: rows[0].name };
  } catch {
    return reply.status(401).send({ error: 'Token inválido ou expirado' });
  }
}

export function requireAdmin(request, reply, done) {
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Acesso negado' });
  }
  done();
}
