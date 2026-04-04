import { query, withTransaction } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export default async function misc2Routes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Products ──────────────────────────────────────────────────────────────
  fastify.get('/products', auth, async () => {
    const { rows } = await query('SELECT * FROM products ORDER BY name');
    return rows;
  });
  fastify.post('/products', auth, async (req, reply) => {
    const { name, description, price, image_url, is_active } = req.body;
    const { rows } = await query('INSERT INTO products (name, description, price, image_url, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *', [name, description, price || 0, image_url, is_active ?? true]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/products/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE products SET name=COALESCE($1,name), description=COALESCE($2,description), price=COALESCE($3,price), is_active=COALESCE($4,is_active) WHERE id=$5 RETURNING *', [f.name, f.description, f.price, f.is_active, req.params.id]);
    return rows[0];
  });
  fastify.delete('/products/:id', auth, async (req) => {
    await query('DELETE FROM products WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Webhooks ──────────────────────────────────────────────────────────────
  fastify.get('/webhooks', auth, async (req) => {
    const uid = req.query.user_id || req.user.id;
    const { rows } = await query('SELECT * FROM webhooks WHERE user_id=$1 ORDER BY created_at DESC', [uid]);
    return rows;
  });
  fastify.post('/webhooks', auth, async (req, reply) => {
    const { name, url, events, secret, is_active, active, user_id } = req.body;
    const activeVal = is_active ?? active ?? true;
    const { rows } = await query('INSERT INTO webhooks (name, url, events, secret, is_active, active, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, url, events || [], secret, activeVal, activeVal, user_id || req.user.id]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/webhooks/:id', auth, async (req) => {
    const f = req.body;
    const activeVal = f.is_active ?? f.active;
    const { rows } = await query('UPDATE webhooks SET name=COALESCE($1,name), url=COALESCE($2,url), events=COALESCE($3,events), secret=COALESCE($4,secret), is_active=COALESCE($5,is_active), active=COALESCE($5,active) WHERE id=$6 RETURNING *', [f.name, f.url, f.events, f.secret, activeVal, req.params.id]);
    return rows[0];
  });
  fastify.delete('/webhooks/:id', auth, async (req) => {
    await query('DELETE FROM webhooks WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Webhook Logs ──────────────────────────────────────────────────────────
  fastify.get('/webhook-logs', auth, async () => {
    const { rows } = await query('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 500');
    return rows;
  });

  // ── SLA Rules ─────────────────────────────────────────────────────────────
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

  // ── Reviews ───────────────────────────────────────────────────────────────
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

  // ── Activity Log ──────────────────────────────────────────────────────────
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

  // ── Followup Reminders ────────────────────────────────────────────────────
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

  // ── API Tokens ────────────────────────────────────────────────────────────
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

  // ── Blacklist ─────────────────────────────────────────────────────────────
  fastify.get('/blacklist', auth, async () => {
    const { rows } = await query('SELECT * FROM blacklist ORDER BY created_at DESC LIMIT 500');
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

  // ── Agent Schedules ───────────────────────────────────────────────────────
  fastify.get('/agent-schedules', auth, async () => {
    const { rows } = await query('SELECT a.*, p.name as agent_name FROM agent_schedules a LEFT JOIN profiles p ON p.id = a.agent_id ORDER BY p.name LIMIT 200');
    return rows;
  });
  fastify.post('/agent-schedules', auth, async (req, reply) => {
    const f = req.body;
    const { rows } = await query(`
      INSERT INTO agent_schedules (agent_id, monday_start, monday_end, monday_active, tuesday_start, tuesday_end, tuesday_active, wednesday_start, wednesday_end, wednesday_active, thursday_start, thursday_end, thursday_active, friday_start, friday_end, friday_active, saturday_start, saturday_end, saturday_active, sunday_start, sunday_end, sunday_active, timezone, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      ON CONFLICT (agent_id) DO UPDATE SET
        monday_start=$2, monday_end=$3, monday_active=$4,
        tuesday_start=$5, tuesday_end=$6, tuesday_active=$7,
        wednesday_start=$8, wednesday_end=$9, wednesday_active=$10,
        thursday_start=$11, thursday_end=$12, thursday_active=$13,
        friday_start=$14, friday_end=$15, friday_active=$16,
        saturday_start=$17, saturday_end=$18, saturday_active=$19,
        sunday_start=$20, sunday_end=$21, sunday_active=$22,
        timezone=$23, is_active=$24
      RETURNING *`,
      [f.agent_id || req.user.id, f.monday_start, f.monday_end, f.monday_active ?? true, f.tuesday_start, f.tuesday_end, f.tuesday_active ?? true, f.wednesday_start, f.wednesday_end, f.wednesday_active ?? true, f.thursday_start, f.thursday_end, f.thursday_active ?? true, f.friday_start, f.friday_end, f.friday_active ?? true, f.saturday_start, f.saturday_end, f.saturday_active ?? false, f.sunday_start, f.sunday_end, f.sunday_active ?? false, f.timezone || 'America/Sao_Paulo', f.is_active ?? true]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/agent-schedules/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE agent_schedules SET is_active=COALESCE($1,is_active) WHERE id=$2 RETURNING *', [f.is_active, req.params.id]);
    return rows[0];
  });

  // ── Proposals ─────────────────────────────────────────────────────────────
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

  // ── Sales Goals ───────────────────────────────────────────────────────────
  fastify.get('/sales-goals', auth, async () => {
    const { rows } = await query('SELECT sg.*, p.name as agent_name FROM sales_goals sg LEFT JOIN profiles p ON p.id = sg.agent_id ORDER BY sg.period_year DESC, sg.period_month DESC LIMIT 200');
    return rows;
  });
  fastify.post('/sales-goals', auth, async (req, reply) => {
    const { agent_id, period_month, period_year, goal_type, target_value } = req.body;
    const { rows } = await query('INSERT INTO sales_goals (agent_id, period_month, period_year, goal_type, target_value) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (agent_id, period_month, period_year, goal_type) DO UPDATE SET target_value=$5 RETURNING *', [agent_id || req.user.id, period_month, period_year, goal_type, target_value]);
    return reply.status(201).send(rows[0]);
  });

  // ── Conversation Transfers ────────────────────────────────────────────────
  fastify.get('/conversation-transfers', auth, async () => {
    const { rows } = await query('SELECT * FROM conversation_transfers ORDER BY transferred_at DESC LIMIT 100');
    return rows;
  });
  fastify.post('/conversation-transfers', auth, async (req, reply) => {
    const { conversation_id, to_agent_id, note } = req.body;
    const transfer = await withTransaction(async (client) => {
      const { rows: [agent] } = await client.query('SELECT name FROM profiles WHERE id=$1', [to_agent_id]);
      const { rows: [t] } = await client.query('INSERT INTO conversation_transfers (conversation_id, from_agent_id, to_agent_id, from_agent_name, to_agent_name, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [conversation_id, req.user.id, to_agent_id, req.user.name, agent?.name, note]);
      await client.query('UPDATE conversations SET assigned_to=$1, updated_at=NOW() WHERE id=$2', [to_agent_id, conversation_id]);
      return t;
    });
    return reply.status(201).send(transfer);
  });

  // ── Auto Distribution Config ──────────────────────────────────────────────
  fastify.get('/auto-distribution-config', auth, async () => {
    const { rows } = await query('SELECT * FROM auto_distribution_config LIMIT 1');
    return rows[0] || {};
  });
  fastify.patch('/auto-distribution-config', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE auto_distribution_config SET is_active=COALESCE($1,is_active), mode=COALESCE($2,mode), max_conversations_per_agent=COALESCE($3,max_conversations_per_agent), respect_working_hours=COALESCE($4,respect_working_hours) WHERE id=(SELECT id FROM auto_distribution_config LIMIT 1) RETURNING *', [f.is_active, f.mode, f.max_conversations_per_agent, f.respect_working_hours]);
    return rows[0];
  });

  // ── WhatsApp Statuses ─────────────────────────────────────────────────────
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

  // ── Contact Forms ─────────────────────────────────────────────────────────
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

  // ── Queues ────────────────────────────────────────────────────────────────
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

  // ── Queue Agents ──────────────────────────────────────────────────────────
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

  // ── Campaign Contacts ─────────────────────────────────────────────────────
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

  // ── Conversation Notes ────────────────────────────────────────────────────
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
