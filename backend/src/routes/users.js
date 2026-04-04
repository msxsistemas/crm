import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { query } from '../database.js';
import { authorize } from '../middleware/authorize.js';

export default async function userRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };
  const adminOnly = { preHandler: [fastify.authenticate, authorize('admin', 'manager')] };

  fastify.get('/users', auth, async (req) => {
    const { rows } = await query('SELECT id, name, name as full_name, email, role, avatar_url, permissions, status, signing_enabled, created_at, last_login FROM profiles ORDER BY name');
    return rows;
  });

  // manage-users function shim — returns { users: [...] }
  fastify.get('/manage-users', auth, async (req) => {
    const { rows } = await query('SELECT id, name, name as full_name, email, role, avatar_url, permissions, status, signing_enabled, created_at, last_login FROM profiles ORDER BY name');
    return { users: rows };
  });

  fastify.get('/users/:id', auth, async (req, reply) => {
    const { rows } = await query('SELECT id, name, name as full_name, email, role, avatar_url, permissions, status, signing_enabled, created_at, last_login FROM profiles WHERE id = $1', [req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Usuário não encontrado' });
    return rows[0];
  });

  fastify.post('/users', adminOnly, async (req, reply) => {
    const { name, email, password, role = 'agent' } = req.body;
    const existing = await query('SELECT id FROM profiles WHERE email = $1', [email]);
    if (existing.rows[0]) return reply.status(400).send({ error: 'Email já cadastrado' });
    const tempPassword = password || randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(tempPassword, 10);
    const { rows } = await query(
      'INSERT INTO profiles (name, email, password_hash, role, must_change_password) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, created_at',
      [name, email.toLowerCase(), hash, role, !password]
    );
    return reply.status(201).send({ ...rows[0], ...(password ? {} : { tempPassword }) });
  });

  fastify.patch('/users/:id', adminOnly, async (req, reply) => {
    const { name, full_name, email, role, permissions, password, status, signing_enabled, avatar_url } = req.body;
    const updates = [];
    const params = [];
    let p = 1;
    if (name || full_name) { updates.push(`name = $${p}`); params.push(name || full_name); p++; }
    if (email) { updates.push(`email = $${p}`); params.push(email.toLowerCase()); p++; }
    if (role) { updates.push(`role = $${p}`); params.push(role); p++; }
    if (permissions) { updates.push(`permissions = $${p}`); params.push(JSON.stringify(permissions)); p++; }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${p}`); params.push(hash); p++;
    }
    if (status !== undefined) { updates.push(`status = $${p}`); params.push(status); p++; }
    if (signing_enabled !== undefined) { updates.push(`signing_enabled = $${p}`); params.push(signing_enabled); p++; }
    if (avatar_url !== undefined) { updates.push(`avatar_url = $${p}`); params.push(avatar_url); p++; }
    if (!updates.length) return reply.status(400).send({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE profiles SET ${updates.join(',')} WHERE id = $${p} RETURNING id, name, name as full_name, email, role, permissions, status, signing_enabled, avatar_url`,
      params
    );
    return rows[0];
  });

  fastify.delete('/users/:id', adminOnly, async (req, reply) => {
    if (req.user.id === req.params.id) return reply.status(400).send({ error: 'Não pode excluir a si mesmo' });
    await query('DELETE FROM profiles WHERE id = $1', [req.params.id]);
    return { message: 'Usuário excluído' };
  });
}
