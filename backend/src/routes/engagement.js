import { query } from '../database.js';

export default async function engagementRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── WhatsApp Statuses ──────────────────────────────────────────────────────
  fastify.get('/whatsapp-statuses', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT * FROM whatsapp_statuses ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows;
  });
  fastify.post('/whatsapp-statuses', auth, async (req, reply) => {
    const { instance_name, type, content, caption, background_color, expires_at } = req.body;
    const { rows } = await query('INSERT INTO whatsapp_statuses (instance_name, type, content, caption, background_color, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [instance_name, type, content, caption, background_color, expires_at, req.user.id]);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/whatsapp-statuses/:id', auth, async (req) => {
    await query('DELETE FROM whatsapp_statuses WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Contact Forms ──────────────────────────────────────────────────────────
  fastify.get('/contact-forms', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT * FROM contact_forms ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows;
  });
  fastify.post('/contact-forms', auth, async (req, reply) => {
    const { name, description, fields, welcome_message, success_message, assign_tag, is_active } = req.body;
    const { rows } = await query('INSERT INTO contact_forms (name, description, fields, welcome_message, success_message, assign_tag, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, description, JSON.stringify(fields || ['name', 'phone', 'email']), welcome_message, success_message, assign_tag, is_active ?? true]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/contact-forms/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE contact_forms SET name=COALESCE($1,name), is_active=COALESCE($2,is_active) WHERE id=$3 RETURNING *', [f.name, f.is_active, req.params.id]);
    return rows[0];
  });
  fastify.delete('/contact-forms/:id', auth, async (req) => {
    await query('DELETE FROM contact_forms WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Queues ─────────────────────────────────────────────────────────────────
  fastify.get('/queues', auth, async () => {
    const { rows } = await query('SELECT * FROM queues ORDER BY name');
    return rows;
  });
  fastify.post('/queues', auth, async (req, reply) => {
    const { name, description, color } = req.body;
    const { rows } = await query('INSERT INTO queues (name, description, color) VALUES ($1,$2,$3) RETURNING *', [name, description, color || '#3b82f6']);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/queues/:id', auth, async (req) => {
    await query('DELETE FROM queues WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Queue Agents ───────────────────────────────────────────────────────────
  fastify.get('/queue-agents', auth, async (req) => {
    const { queue_id } = req.query;
    if (!queue_id) return [];
    const { rows } = await query('SELECT qa.*, p.name as agent_name FROM queue_agents qa LEFT JOIN profiles p ON p.id = qa.agent_id WHERE qa.queue_id=$1', [queue_id]);
    return rows;
  });
  fastify.post('/queue-agents', auth, async (req, reply) => {
    const { queue_id, agent_id } = req.body;
    const { rows } = await query('INSERT INTO queue_agents (queue_id, agent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *', [queue_id, agent_id]);
    return reply.status(201).send(rows[0] || {});
  });
  fastify.delete('/queue-agents/:id', auth, async (req) => {
    await query('DELETE FROM queue_agents WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Campaign Contacts ──────────────────────────────────────────────────────
  fastify.get('/campaign-contacts', auth, async (req) => {
    const { campaign_id } = req.query;
    const { rows } = await query('SELECT cc.*, c.name as contact_name, c.phone FROM campaign_contacts cc LEFT JOIN contacts c ON c.id = cc.contact_id WHERE cc.campaign_id=$1', [campaign_id]);
    return rows;
  });
  fastify.post('/campaign-contacts', auth, async (req, reply) => {
    const { campaign_id, contact_id } = req.body;
    const { rows } = await query('INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *', [campaign_id, contact_id]);
    return reply.status(201).send(rows[0] || {});
  });

  // ── Conversation Notes ─────────────────────────────────────────────────────
  fastify.get('/conversation-notes', auth, async (req) => {
    const { conversation_id } = req.query;
    const { rows } = await query('SELECT * FROM conversation_notes WHERE conversation_id=$1 ORDER BY created_at DESC', [conversation_id]);
    return rows;
  });
  fastify.post('/conversation-notes', auth, async (req, reply) => {
    const { conversation_id, content, is_internal } = req.body;
    const { rows } = await query('INSERT INTO conversation_notes (conversation_id, content, author_id, author_name, is_internal) VALUES ($1,$2,$3,$4,$5) RETURNING *', [conversation_id, content, req.user.id, req.user.name, is_internal ?? true]);
    return reply.status(201).send(rows[0]);
  });
}
