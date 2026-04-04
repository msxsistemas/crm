import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export default async function misc2Routes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Tasks ─────────────────────────────────────────────────────────────────
  fastify.get('/tasks', auth, async (req) => {
    const { rows } = await query(`
      SELECT t.*,
        p1.name as assigned_name,
        p2.name as creator_name
      FROM tasks t
      LEFT JOIN profiles p1 ON p1.id = t.assigned_to
      LEFT JOIN profiles p2 ON p2.id = t.user_id
      ORDER BY t.created_at DESC
    `);
    return rows;
  });
  fastify.post('/tasks', auth, async (req, reply) => {
    const { title, description, priority, status, due_date, assigned_to, reminder_minutes, repeat_interval } = req.body;
    const { rows } = await query(
      'INSERT INTO tasks (title, description, priority, status, due_date, assigned_to, user_id, reminder_minutes, repeat_interval) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [title, description, priority || 'medium', status || 'pending', due_date, assigned_to, req.user.id, reminder_minutes, repeat_interval || 'none']
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/tasks/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query(
      'UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description), priority=COALESCE($3,priority), status=COALESCE($4,status), due_date=COALESCE($5,due_date), assigned_to=COALESCE($6,assigned_to), updated_at=NOW() WHERE id=$7 RETURNING *',
      [f.title, f.description, f.priority, f.status, f.due_date, f.assigned_to, req.params.id]
    );
    return rows[0];
  });
  fastify.delete('/tasks/:id', auth, async (req) => {
    await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    return { ok: true };
  });

  // ── Internal Chat ──────────────────────────────────────────────────────────
  fastify.get('/internal-channels', auth, async (req) => {
    const { rows } = await query(`
      SELECT c.*,
        json_agg(DISTINCT jsonb_build_object('id', p.id, 'name', p.name)) FILTER (WHERE p.id IS NOT NULL) as participants
      FROM internal_conversations c
      LEFT JOIN internal_conversation_participants icp ON icp.conversation_id = c.id
      LEFT JOIN profiles p ON p.id = icp.user_id
      WHERE c.created_by = $1 OR icp.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [req.user.id]);
    return rows;
  });
  fastify.post('/internal-channels', auth, async (req, reply) => {
    const { title, participant_ids = [] } = req.body;
    const { rows: [conv] } = await query(
      'INSERT INTO internal_conversations (title, created_by) VALUES ($1,$2) RETURNING *',
      [title, req.user.id]
    );
    // Add creator as participant
    const allParticipants = [...new Set([req.user.id, ...participant_ids])];
    for (const uid of allParticipants) {
      await query('INSERT INTO internal_conversation_participants (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [conv.id, uid]);
    }
    return reply.status(201).send(conv);
  });

  fastify.get('/internal-messages', auth, async (req) => {
    const { conversation_id } = req.query;
    if (!conversation_id) return [];
    const { rows } = await query(
      'SELECT m.*, p.name as sender_name FROM internal_messages m LEFT JOIN profiles p ON p.id = m.sender_id WHERE m.conversation_id = $1 ORDER BY m.created_at ASC',
      [conversation_id]
    );
    return rows;
  });
  fastify.post('/internal-messages', auth, async (req, reply) => {
    const { conversation_id, text } = req.body;
    const { rows: [msg] } = await query(
      'INSERT INTO internal_messages (conversation_id, sender_id, sender_name, text) VALUES ($1,$2,$3,$4) RETURNING *',
      [conversation_id, req.user.id, req.user.name, text]
    );
    await query('UPDATE internal_conversations SET updated_at = NOW() WHERE id = $1', [conversation_id]);
    if (fastify.io) fastify.io.emit(`chat:${conversation_id}`, msg);
    return reply.status(201).send(msg);
  });

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
  fastify.get('/webhooks', auth, async () => {
    const { rows } = await query('SELECT * FROM webhooks ORDER BY created_at DESC');
    return rows;
  });
  fastify.post('/webhooks', auth, async (req, reply) => {
    const { name, url, events, secret, is_active } = req.body;
    const { rows } = await query('INSERT INTO webhooks (name, url, events, secret, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *', [name, url, events, secret, is_active ?? true]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/webhooks/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE webhooks SET name=COALESCE($1,name), url=COALESCE($2,url), events=COALESCE($3,events), is_active=COALESCE($4,is_active) WHERE id=$5 RETURNING *', [f.name, f.url, f.events, f.is_active, req.params.id]);
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
  fastify.get('/reviews', auth, async () => {
    const { rows } = await query('SELECT r.*, c.name as contact_name FROM reviews r LEFT JOIN contacts c ON c.id = r.contact_id ORDER BY r.created_at DESC');
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
  fastify.delete('/api-tokens/:id', auth, async (req) => {
    await query('DELETE FROM api_tokens WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });

  // ── HSM Templates ─────────────────────────────────────────────────────────
  fastify.get('/hsm-templates', auth, async () => {
    const { rows } = await query('SELECT * FROM hsm_templates ORDER BY name');
    return rows;
  });
  fastify.post('/hsm-templates', auth, async (req, reply) => {
    const { name, category, language, body, header_type, header_content, footer, buttons, variables } = req.body;
    const { rows } = await query('INSERT INTO hsm_templates (name, category, language, body, header_type, header_content, footer, buttons, variables) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [name, category, language || 'pt_BR', body, header_type, header_content, footer, JSON.stringify(buttons || []), variables || []]);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/hsm-templates/:id', auth, async (req) => {
    await query('DELETE FROM hsm_templates WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Segments ──────────────────────────────────────────────────────────────
  fastify.get('/segments', auth, async () => {
    const { rows } = await query('SELECT * FROM segments ORDER BY name');
    return rows;
  });
  fastify.post('/segments', auth, async (req, reply) => {
    const { name, description, conditions, operator } = req.body;
    const { rows } = await query('INSERT INTO segments (name, description, conditions, operator) VALUES ($1,$2,$3,$4) RETURNING *', [name, description, JSON.stringify(conditions || []), operator || 'AND']);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/segments/:id', auth, async (req) => {
    await query('DELETE FROM segments WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Contact Groups ────────────────────────────────────────────────────────
  fastify.get('/contact-groups', auth, async () => {
    const { rows } = await query('SELECT * FROM contact_groups ORDER BY name');
    return rows;
  });
  fastify.post('/contact-groups', auth, async (req, reply) => {
    const { name, description, color } = req.body;
    const { rows } = await query('INSERT INTO contact_groups (name, description, color) VALUES ($1,$2,$3) RETURNING *', [name, description, color || '#3b82f6']);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/contact-groups/:id', auth, async (req) => {
    await query('DELETE FROM contact_groups WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Blacklist ─────────────────────────────────────────────────────────────
  fastify.get('/blacklist', auth, async () => {
    const { rows } = await query('SELECT * FROM blacklist ORDER BY created_at DESC');
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
    const { rows } = await query('SELECT a.*, p.name as agent_name FROM agent_schedules a LEFT JOIN profiles p ON p.id = a.agent_id ORDER BY p.name');
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
  fastify.get('/proposals', auth, async () => {
    const { rows } = await query('SELECT p.*, c.name as contact_name FROM proposals p LEFT JOIN contacts c ON c.id = p.contact_id ORDER BY p.created_at DESC');
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
    const { rows } = await query('SELECT sg.*, p.name as agent_name FROM sales_goals sg LEFT JOIN profiles p ON p.id = sg.agent_id ORDER BY sg.period_year DESC, sg.period_month DESC');
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
    // Get target agent name
    const { rows: [agent] } = await query('SELECT name FROM profiles WHERE id=$1', [to_agent_id]);
    const { rows: [transfer] } = await query(
      'INSERT INTO conversation_transfers (conversation_id, from_agent_id, to_agent_id, from_agent_name, to_agent_name, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [conversation_id, req.user.id, to_agent_id, req.user.name, agent?.name, note]
    );
    // Update conversation assigned_to
    await query('UPDATE conversations SET assigned_to=$1, updated_at=NOW() WHERE id=$2', [to_agent_id, conversation_id]);
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
  fastify.get('/whatsapp-statuses', auth, async () => {
    const { rows } = await query('SELECT * FROM whatsapp_statuses ORDER BY created_at DESC');
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
  fastify.get('/contact-forms', auth, async () => {
    const { rows } = await query('SELECT * FROM contact_forms ORDER BY created_at DESC');
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

  // ── Flow Templates ────────────────────────────────────────────────────────
  fastify.get('/flow-templates', auth, async () => {
    const { rows } = await query('SELECT * FROM attendance_flow_templates ORDER BY name');
    return rows;
  });
  fastify.post('/flow-templates', auth, async (req, reply) => {
    const { name, description, steps } = req.body;
    const { rows } = await query('INSERT INTO attendance_flow_templates (name, description, steps, created_by) VALUES ($1,$2,$3,$4) RETURNING *', [name, description, JSON.stringify(steps || []), req.user.id]);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/flow-templates/:id', auth, async (req) => {
    await query('DELETE FROM attendance_flow_templates WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Conversation Labels ───────────────────────────────────────────────────
  fastify.get('/conversation-labels', auth, async () => {
    const { rows } = await query('SELECT * FROM conversation_labels ORDER BY name');
    return rows;
  });
  fastify.post('/conversation-labels', auth, async (req, reply) => {
    const { name, color } = req.body;
    const { rows } = await query('INSERT INTO conversation_labels (name, color) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET color=$2 RETURNING *', [name, color || '#3b82f6']);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/conversation-labels/:id', auth, async (req) => {
    await query('DELETE FROM conversation_labels WHERE id=$1', [req.params.id]); return { ok: true };
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
}
