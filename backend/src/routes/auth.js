import bcrypt from 'bcryptjs';
import { query } from '../database.js';
import { generateTokens, verifyToken, verifyRefreshToken } from '../auth.js';
import { refreshCsrfToken } from '../middleware/csrf.js';

export default async function authRoutes(fastify) {
  // Login — máximo 10 tentativas por IP a cada 15 minutos
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 128 },
        },
        additionalProperties: false,
      },
    },
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
        errorResponseBuilder: () => ({
          error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
        }),
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) return reply.status(400).send({ error: 'Email e senha obrigatórios' });

    const { rows } = await query('SELECT * FROM profiles WHERE email = $1 LIMIT 1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return reply.status(401).send({ error: 'Credenciais inválidas' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return reply.status(401).send({ error: 'Credenciais inválidas' });

    const { token, refreshToken } = generateTokens(user);
    await query('UPDATE profiles SET last_login = NOW() WHERE id = $1', [user.id]);

    setCookies(reply, token, refreshToken);
    const csrfToken = refreshCsrfToken(reply);
    return { token, refreshToken, csrfToken, user: sanitizeUser(user) };
  });

  // Register — máximo 5 cadastros por IP a cada 1 hora (previne spam)
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 6, maxLength: 128 },
          role: { type: 'string', enum: ['admin', 'manager', 'agent'] },
        },
        additionalProperties: false,
      },
    },
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 hour',
        errorResponseBuilder: () => ({
          error: 'Muitos cadastros. Tente novamente em 1 hora.',
        }),
      },
    },
  }, async (req, reply) => {
    const { name, email, password, role = 'agent' } = req.body;
    if (!name || !email || !password) return reply.status(400).send({ error: 'Dados incompletos' });

    const existing = await query('SELECT id FROM profiles WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return reply.status(400).send({ error: 'Email já cadastrado' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO profiles (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email.toLowerCase(), hash, role]
    );

    const { token, refreshToken } = generateTokens(rows[0]);
    setCookies(reply, token, refreshToken);
    return reply.status(201).send({ token, refreshToken, user: sanitizeUser(rows[0]) });
  });

  // Refresh token — accepts token from body (legacy) or httpOnly cookie
  fastify.post('/auth/refresh', async (req, reply) => {
    const token = req.body?.refreshToken || req.cookies?.refresh_token;
    if (!token) return reply.status(400).send({ error: 'Refresh token obrigatório' });

    try {
      const payload = verifyRefreshToken(token);
      // Reject if user logged out after this token was issued
      const { redis } = await import('../redis.js');
      const logoutAt = await redis.get(`logout:${payload.id}`).catch(() => null);
      if (logoutAt && payload.iat < parseInt(logoutAt)) {
        return reply.status(401).send({ error: 'Sessão encerrada' });
      }
      const { rows } = await query('SELECT * FROM profiles WHERE id = $1', [payload.id]);
      if (!rows[0]) return reply.status(401).send({ error: 'Usuário não encontrado' });

      const tokens = generateTokens(rows[0]);
      setCookies(reply, tokens.token, tokens.refreshToken);
      return tokens;
    } catch {
      return reply.status(401).send({ error: 'Refresh token inválido' });
    }
  });

  // Short-lived socket token — used by Socket.io client (can't read httpOnly cookies from JS)
  fastify.get('/auth/socket-token', { preHandler: fastify.authenticate }, async (req) => {
    const { generateTokens } = await import('../auth.js');
    const { rows } = await query('SELECT * FROM profiles WHERE id = $1', [req.user.id]);
    if (!rows[0]) return { token: null };
    const { token } = generateTokens(rows[0]);
    return { token };
  });

  // Get current user (30s Redis cache)
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { redis } = await import('../redis.js');
    const cacheKey = `auth:me:${req.user.id}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const { rows } = await query('SELECT * FROM profiles WHERE id = $1', [req.user.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Usuário não encontrado' });
    const user = sanitizeUser(rows[0]);
    await redis.set(cacheKey, JSON.stringify(user), 'EX', 30).catch(() => null);
    return user;
  });

  // Update profile
  // -- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'dark';
  fastify.patch('/auth/me', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { name, avatar_url, permissions, two_factor_enabled, signing_enabled, signature, signature_html, signature_enabled, status, max_conversations, absence_enabled, absence_start, absence_end, absence_message, theme_preference } = req.body;
    const updates = [];
    const params = [];
    let p = 1;
    if (name !== undefined) { updates.push(`name = $${p}`); params.push(name); p++; }
    if (avatar_url !== undefined) { updates.push(`avatar_url = $${p}`); params.push(avatar_url); p++; }
    if (permissions !== undefined) { updates.push(`permissions = $${p}`); params.push(JSON.stringify(permissions)); p++; }
    if (two_factor_enabled !== undefined) { updates.push(`two_factor_enabled = $${p}`); params.push(two_factor_enabled); p++; }
    if (signing_enabled !== undefined) { updates.push(`signing_enabled = $${p}`); params.push(signing_enabled); p++; }
    if (signature !== undefined) { updates.push(`signature = $${p}`); params.push(signature); p++; }
    if (signature_html !== undefined) { updates.push(`signature_html = $${p}`); params.push(signature_html); p++; }
    if (signature_enabled !== undefined) { updates.push(`signature_enabled = $${p}`); params.push(signature_enabled); p++; }
    if (status !== undefined && ['online','offline','away'].includes(status)) { updates.push(`status = $${p}`); params.push(status); p++; }
    if (max_conversations !== undefined) { updates.push(`max_conversations = $${p}`); params.push(max_conversations === 0 || max_conversations === null ? null : parseInt(max_conversations) || null); p++; }
    if (absence_enabled !== undefined) { updates.push(`absence_enabled = $${p}`); params.push(absence_enabled); p++; }
    if (absence_start !== undefined) { updates.push(`absence_start = $${p}`); params.push(absence_start || null); p++; }
    if (absence_end !== undefined) { updates.push(`absence_end = $${p}`); params.push(absence_end || null); p++; }
    if (absence_message !== undefined) { updates.push(`absence_message = $${p}`); params.push(absence_message || null); p++; }
    if (theme_preference !== undefined && ['dark','light'].includes(theme_preference)) { updates.push(`theme_preference = $${p}`); params.push(theme_preference); p++; }
    if (!updates.length) return reply.status(400).send({ error: 'Nada para atualizar' });
    updates.push(`updated_at = NOW()`);
    params.push(req.user.id);
    const { rows } = await query(
      `UPDATE profiles SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );
    const { redis } = await import('../redis.js');
    await redis.del(`auth:me:${req.user.id}`).catch(() => null);
    return sanitizeUser(rows[0]);
  });

  // Upload avatar
  fastify.post('/auth/me/avatar', { preHandler: fastify.authenticate }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'Arquivo não encontrado' });
    if (data.file.truncated) return reply.status(413).send({ error: 'Arquivo muito grande (máx 2MB)' });

    const { uploadToMinio, ensureBucket } = await import('../minio.js');
    await ensureBucket();

    const ext = data.filename.split('.').pop() || 'jpg';
    const objectName = `avatars/${req.user.id}/avatar.${ext}`;
    const buffer = await data.toBuffer();
    const url = await uploadToMinio(objectName, buffer, data.mimetype);

    await query('UPDATE profiles SET avatar_url = $1 WHERE id = $2', [url, req.user.id]);
    return { avatar_url: url };
  });

  // CSRF token — frontend calls this on init to get a token for mutating requests
  fastify.get('/auth/csrf-token', async (req, reply) => {
    const token = refreshCsrfToken(reply);
    return { token };
  });

  // Logout — clear httpOnly cookies and server-side invalidate the session
  fastify.post('/auth/logout', async (req, reply) => {
    const token = req.cookies?.access_token;
    if (token) {
      try {
        const payload = verifyToken(token);
        const { redis } = await import('../redis.js');
        const logoutTs = Math.floor(Date.now() / 1000) + 1;
        // Any token with iat < logoutTs is now invalid (covers access + refresh)
        await Promise.all([
          redis.set(`logout:${payload.id}`, logoutTs, 'EX', 60 * 60 * 24 * 30),
          redis.del(`auth:me:${payload.id}`),
        ]).catch(() => null);
      } catch {}
    }
    const secure = process.env.NODE_ENV === 'production';
    reply.clearCookie('access_token', { path: '/', httpOnly: true, secure, sameSite: 'lax' });
    reply.clearCookie('refresh_token', { path: '/auth/refresh', httpOnly: true, secure, sameSite: 'lax' });
    return { ok: true };
  });

  // Change password — máximo 10 tentativas por IP a cada 15 minutos
  fastify.post('/auth/change-password', {
    preHandler: fastify.authenticate,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
        errorResponseBuilder: () => ({
          error: 'Muitas tentativas. Tente novamente em 15 minutos.',
        }),
      },
    },
  }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body;
    const { rows } = await query('SELECT password_hash FROM profiles WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return reply.status(400).send({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE profiles SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    return { message: 'Senha alterada com sucesso' };
  });
}

function sanitizeUser(u) {
  const { password_hash, ...rest } = u;
  // full_name alias for backward compat with frontend
  return { ...rest, full_name: rest.name };
}

function setCookies(reply, token, refreshToken) {
  const secure = process.env.NODE_ENV === 'production';
  reply.setCookie('access_token', token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day
  });
  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/auth/refresh',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}
