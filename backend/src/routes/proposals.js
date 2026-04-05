import { query } from '../database.js';

export default async function proposalRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Proposals ──────────────────────────────────────────────────────────────
  fastify.get('/proposals', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT p.*, c.name as contact_name FROM proposals p LEFT JOIN contacts c ON c.id = p.contact_id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows;
  });
  fastify.post('/proposals', auth, async (req, reply) => {
    const { contact_id, title, description, status, items, subtotal, discount_percent, total, valid_until, notes } = req.body;
    const { rows } = await query('INSERT INTO proposals (contact_id, title, description, status, items, subtotal, discount_percent, total, valid_until, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [contact_id, title, description, status || 'draft', JSON.stringify(items || []), subtotal || 0, discount_percent || 0, total || 0, valid_until, notes, req.user.id]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/proposals/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE proposals SET title=COALESCE($1,title), status=COALESCE($2,status), items=COALESCE($3,items), total=COALESCE($4,total), updated_at=NOW() WHERE id=$5 RETURNING *', [f.title, f.status, f.items ? JSON.stringify(f.items) : null, f.total, req.params.id]);
    return rows[0];
  });
  fastify.delete('/proposals/:id', auth, async (req) => {
    await query('DELETE FROM proposals WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Sales Goals ────────────────────────────────────────────────────────────
  fastify.get('/sales-goals', auth, async () => {
    const { rows } = await query('SELECT sg.*, p.name as agent_name FROM sales_goals sg LEFT JOIN profiles p ON p.id = sg.agent_id ORDER BY sg.period_year DESC, sg.period_month DESC LIMIT 200');
    return rows;
  });
  fastify.post('/sales-goals', auth, async (req, reply) => {
    const { agent_id, period_month, period_year, goal_type, target_value } = req.body;
    const { rows } = await query('INSERT INTO sales_goals (agent_id, period_month, period_year, goal_type, target_value) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (agent_id, period_month, period_year, goal_type) DO UPDATE SET target_value=$5 RETURNING *', [agent_id || req.user.id, period_month, period_year, goal_type, target_value]);
    return reply.status(201).send(rows[0]);
  });
}
