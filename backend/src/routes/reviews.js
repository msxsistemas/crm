import { query } from '../database.js';

export default async function reviewRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Reviews ────────────────────────────────────────────────────────────────
  fastify.get('/reviews', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT r.*, c.name as contact_name FROM reviews r LEFT JOIN contacts c ON c.id = r.contact_id ORDER BY r.created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows;
  });
  fastify.post('/reviews', auth, async (req, reply) => {
    const { contact_id, conversation_id, rating, type, comment } = req.body;
    const { rows } = await query('INSERT INTO reviews (contact_id, conversation_id, rating, type, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *', [contact_id, conversation_id, rating, type || 'csat', comment]);
    return reply.status(201).send(rows[0]);
  });
}
