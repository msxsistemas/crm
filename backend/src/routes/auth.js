import bcrypt from 'bcryptjs';
import { query } from '../database.js';
import { generateTokens, verifyRefreshToken } from '../auth.js';

export default async function authRoutes(fastify) {
  // Login
  fastify.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) return reply.status(400).send({ error: 'Email e senha obrigatórios' });

    const { rows } = await query('SELECT * FROM profiles WHERE email = $1 LIMIT 1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return reply.status(401).send({ error: 'Credenciais inválidas' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return reply.status(401).send({ error: 'Credenciais inválidas' });

    const { token, refreshToken } = generateTokens(user);
    await query('UPDATE profiles SET last_login = NOW() WHERE id = $1', [user.id]);

    return { token, refreshToken, user: sanitizeUser(user) };
  });

  // Register
  fastify.post('/auth/register', async (req, reply) => {
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
    return reply.status(201).send({ token, refreshToken, user: sanitizeUser(rows[0]) });
  });

  // Refresh token
  fastify.post('/auth/refresh', async (req, reply) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return reply.status(400).send({ error: 'Refresh token obrigatório' });

    try {
      const payload = verifyRefreshToken(refreshToken);
      const { rows } = await query('SELECT * FROM profiles WHERE id = $1', [payload.id]);
      if (!rows[0]) return reply.status(401).send({ error: 'Usuário não encontrado' });

      const tokens = generateTokens(rows[0]);
      return tokens;
    } catch {
      return reply.status(401).send({ error: 'Refresh token inválido' });
    }
  });

  // Get current user
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { rows } = await query('SELECT * FROM profiles WHERE id = $1', [req.user.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Usuário não encontrado' });
    return sanitizeUser(rows[0]);
  });

  // Update profile
  fastify.patch('/auth/me', { preHandler: fastify.authenticate }, async (req, reply) => {
    const { name, avatar_url, permissions } = req.body;
    const { rows } = await query(
      'UPDATE profiles SET name = COALESCE($1, name), avatar_url = COALESCE($2, avatar_url), permissions = COALESCE($3, permissions), updated_at = NOW() WHERE id = $4 RETURNING *',
      [name, avatar_url, permissions ? JSON.stringify(permissions) : null, req.user.id]
    );
    return sanitizeUser(rows[0]);
  });

  // Change password
  fastify.post('/auth/change-password', { preHandler: fastify.authenticate }, async (req, reply) => {
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
