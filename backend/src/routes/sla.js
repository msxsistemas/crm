import { query } from '../database.js';

export default async function slaRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── SLA Rules ──────────────────────────────────────────────────────────────
  fastify.get('/sla-rules', auth, async () => {
    const { rows } = await query('SELECT * FROM sla_rules ORDER BY name');
    return rows;
  });
  fastify.post('/sla-rules', auth, async (req, reply) => {
    const { name, priority, first_response_minutes, resolution_minutes, warning_threshold, applies_to_tags, is_active } = req.body;
    const { rows } = await query('INSERT INTO sla_rules (name, priority, first_response_minutes, resolution_minutes, warning_threshold, applies_to_tags, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, priority, first_response_minutes, resolution_minutes, warning_threshold, applies_to_tags, is_active ?? true]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/sla-rules/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE sla_rules SET name=COALESCE($1,name), is_active=COALESCE($2,is_active) WHERE id=$3 RETURNING *', [f.name, f.is_active, req.params.id]);
    return rows[0];
  });
  fastify.delete('/sla-rules/:id', auth, async (req) => {
    await query('DELETE FROM sla_rules WHERE id=$1', [req.params.id]); return { ok: true };
  });

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

  // ── Activity Log ───────────────────────────────────────────────────────────
  fastify.get('/activity-log', auth, async (req) => {
    const limit = req.query.limit || 100;
    const { rows } = await query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows;
  });
  fastify.post('/activity-log', auth, async (req, reply) => {
    const { action, resource_type, resource_id, resource_name, metadata } = req.body;
    const { rows } = await query('INSERT INTO activity_log (user_id, user_name, action, resource_type, resource_id, resource_name, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.user.id, req.user.name, action, resource_type, resource_id, resource_name, metadata || {}]);
    return reply.status(201).send(rows[0]);
  });

  // ── Followup Reminders ─────────────────────────────────────────────────────
  fastify.get('/followup-reminders', auth, async (req) => {
    const { rows } = await query('SELECT fr.*, c.name as contact_name FROM followup_reminders fr LEFT JOIN contacts c ON c.id = fr.contact_id WHERE fr.agent_id = $1 AND fr.status = $2 ORDER BY fr.reminder_at ASC', [req.user.id, 'pending']);
    return rows;
  });
  fastify.post('/followup-reminders', auth, async (req, reply) => {
    const { conversation_id, contact_id, reminder_at, note } = req.body;
    const { rows } = await query('INSERT INTO followup_reminders (conversation_id, contact_id, agent_id, reminder_at, note) VALUES ($1,$2,$3,$4,$5) RETURNING *', [conversation_id, contact_id, req.user.id, reminder_at, note]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/followup-reminders/:id', auth, async (req) => {
    const { status } = req.body;
    const { rows } = await query('UPDATE followup_reminders SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    return rows[0];
  });
}
