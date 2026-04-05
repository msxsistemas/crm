import { query } from '../database.js';

export default async function blacklistRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Blacklist ──────────────────────────────────────────────────────────────
  fastify.get('/blacklist', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT * FROM blacklist ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows;
  });
  fastify.post('/blacklist', auth, async (req, reply) => {
    const { phone, reason, expires_at } = req.body;
    const { rows } = await query('INSERT INTO blacklist (phone, reason, blocked_by, blocked_by_name, expires_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (phone) DO UPDATE SET is_active=TRUE RETURNING *', [phone, reason, req.user.id, req.user.name, expires_at]);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/blacklist/:id', auth, async (req) => {
    await query('DELETE FROM blacklist WHERE id=$1', [req.params.id]); return { ok: true };
  });
}
