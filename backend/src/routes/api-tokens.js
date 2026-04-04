import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export default async function apiTokenRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  fastify.get('/api-tokens', auth, async (req) => {
    const { rows } = await query('SELECT id, name, last_used_at, expires_at, scopes, is_active, created_at FROM api_tokens WHERE user_id = $1', [req.user.id]);
    return rows;
  });
  fastify.post('/api-tokens', auth, async (req, reply) => {
    const { name, scopes, expires_at } = req.body;
    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const { rows } = await query('INSERT INTO api_tokens (user_id, name, token, scopes, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.user.id, name, token, scopes || ['read', 'write'], expires_at]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/api-tokens/:id', auth, async (req) => {
    const { is_active } = req.body;
    const { rows } = await query('UPDATE api_tokens SET is_active=$1 WHERE id=$2 AND user_id=$3 RETURNING *', [is_active, req.params.id, req.user.id]);
    return rows[0] || {};
  });
  fastify.delete('/api-tokens/:id', auth, async (req) => {
    await query('DELETE FROM api_tokens WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });
}
