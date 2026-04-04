import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export default async function misc2Routes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Tasks ─────────────────────────────────────────────────────────────────
  fastify.get('/tasks', auth, async () => {
    const { rows } = await query(`
      SELECT t.*,
        jsonb_build_object('full_name', p1.name) as assigned_profile,
        jsonb_build_object('full_name', p2.name) as creator_profile
      FROM tasks t
      LEFT JOIN profiles p1 ON p1.id = t.assigned_to
      LEFT JOIN profiles p2 ON p2.id = t.user_id
      ORDER BY t.created_at DESC
    `);
    return rows;
  });
  fastify.post('/tasks', auth, async (req, reply) => {
    const { title, description, priority, status, due_date, assigned_to, reminder_minutes, repeat_interval, user_id } = req.body;
    const { rows } = await query(
      'INSERT INTO tasks (title, description, priority, status, due_date, assigned_to, user_id, reminder_minutes, repeat_interval) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [title, description, priority || 'medium', status || 'pending', due_date, assigned_to, user_id || req.user.id, reminder_minutes, repeat_interval || 'none']
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/tasks/:id', auth, async (req) => {
    const f = req.body;
    const allowed = ['title', 'description', 'priority', 'status', 'due_date', 'assigned_to', 'reminder_minutes'];
    const updates = []; const params = []; let p = 1;
    for (const k of allowed) { if (f[k] !== undefined) { updates.push(`${k}=$${p}`); params.push(f[k]); p++; } }
    if (!updates.length) return {};
    updates.push('updated_at=NOW()');
    params.push(req.params.id);
    const { rows } = await query(`UPDATE tasks SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params);
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
    const { title, participant_ids = [], created_by } = req.body;
    const { rows: [conv] } = await query(
      'INSERT INTO internal_conversations (title, created_by) VALUES ($1,$2) RETURNING *',
      [title, created_by || req.user.id]
    );
    // Add creator as participant
    const allParticipants = [...new Set([req.user.id, ...participant_ids])];
    for (const uid of allParticipants) {
      await query('INSERT INTO internal_conversation_participants (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [conv.id, uid]);
    }
    return reply.status(201).send(conv);
  });
  fastify.patch('/internal-channels/:id', auth, async (req) => {
    const { title, updated_at } = req.body;
    const { rows } = await query(
      'UPDATE internal_conversations SET title=COALESCE($1,title), updated_at=COALESCE($2::timestamptz,NOW()) WHERE id=$3 RETURNING *',
      [title, updated_at, req.params.id]
    );
    return rows[0];
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
  fastify.get('/webhooks', auth, async (req) => {
    const { user_id } = req.query;
    if (user_id) {
      const { rows } = await query('SELECT * FROM webhooks WHERE user_id=$1 ORDER BY created_at DESC', [user_id]);
      return rows;
    }
    const { rows } = await query('SELECT * FROM webhooks WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    return rows;
  });
  fastify.post('/webhooks', auth, async (req, reply) => {
    const { name, url, events, secret, is_active, active, user_id } = req.body;
    const activeVal = is_active ?? active ?? true;
    const { rows } = await query(
      'INSERT INTO webhooks (name, url, events, secret, is_active, active, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, url, events || [], secret, activeVal, activeVal, user_id || req.user.id]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/webhooks/:id', auth, async (req) => {
    const f = req.body;
    const activeVal = f.is_active ?? f.active;
    const { rows } = await query(
      'UPDATE webhooks SET name=COALESCE($1,name), url=COALESCE($2,url), events=COALESCE($3,events), secret=COALESCE($4,secret), is_active=COALESCE($5,is_active), active=COALESCE($5,active) WHERE id=$6 RETURNING *',
      [f.name, f.url, f.events, f.secret, activeVal, req.params.id]
    );
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
  fastify.patch('/api-tokens/:id', auth, async (req) => {
    const { is_active } = req.body;
    const { rows } = await query('UPDATE api_tokens SET is_active=$1 WHERE id=$2 AND user_id=$3 RETURNING *', [is_active, req.params.id, req.user.id]);
    return rows[0] || {};
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
  fastify.patch('/conversation-labels/:id', auth, async (req) => {
    const { name, color } = req.body;
    const { rows } = await query('UPDATE conversation_labels SET name=COALESCE($1,name), color=COALESCE($2,color) WHERE id=$3 RETURNING *', [name, color, req.params.id]);
    return rows[0];
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

  // ── Contact Group Members ─────────────────────────────────────────────────
  fastify.get('/contact-group-members', auth, async (req) => {
    const { group_id } = req.query;
    if (!group_id) return [];
    const { rows } = await query('SELECT cgm.*, c.name as contact_name, c.phone FROM contact_group_members cgm LEFT JOIN contacts c ON c.id = cgm.contact_id WHERE cgm.group_id=$1', [group_id]);
    return rows;
  });
  fastify.post('/contact-group-members', auth, async (req, reply) => {
    const { group_id, contact_id } = req.body;
    const { rows } = await query('INSERT INTO contact_group_members (group_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *', [group_id, contact_id]);
    return reply.status(201).send(rows[0] || {});
  });
  fastify.delete('/contact-group-members/:id', auth, async (req) => {
    await query('DELETE FROM contact_group_members WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Internal Conversation Participants ───────────────────────────────────
  fastify.post('/internal-conversation-participants', auth, async (req, reply) => {
    const body = req.body;
    const participants = Array.isArray(body) ? body : [body];
    for (const p of participants) {
      await query(
        'INSERT INTO internal_conversation_participants (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [p.conversation_id, p.user_id]
      ).catch(() => {});
    }
    return reply.status(201).send({ ok: true });
  });

  // ── Evolution Proxy ───────────────────────────────────────────────────────
  fastify.post('/evolution-proxy', auth, async (req, reply) => {
    const { action, instanceName, data: body } = req.body || {};
    const { rows: settings } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
    const s = settings[0];
    if (!s?.evolution_url) return { data: null, error: { message: 'Evolution API não configurada' } };
    try {
      const url = `${s.evolution_url}/${action || 'message/sendText'}/${instanceName}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': s.evolution_key }, body: JSON.stringify(body) });
      const data = await res.json();
      return { data, error: null };
    } catch (e) {
      return reply.status(500).send({ data: null, error: { message: e.message } });
    }
  });

  // ── Contact Segments ─────────────────────────────────────────────────────
  fastify.get('/contact-segments', auth, async (req) => {
    const { contact_id, segment_id } = req.query;
    let q = 'SELECT * FROM contact_segments WHERE 1=1';
    const vals = [];
    let p = 1;
    if (contact_id) { q += ` AND contact_id=$${p}`; vals.push(contact_id); p++; }
    if (segment_id) { q += ` AND segment_id=$${p}`; vals.push(segment_id); p++; }
    const { rows } = await query(q, vals);
    return rows;
  });
  fastify.post('/contact-segments', auth, async (req, reply) => {
    const { contact_id, segment_id } = req.body;
    const { rows } = await query(
      'INSERT INTO contact_segments (contact_id, segment_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
      [contact_id, segment_id]
    );
    return reply.status(201).send(rows[0] || {});
  });
  fastify.delete('/contact-segments/:id', auth, async (req) => {
    await query('DELETE FROM contact_segments WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Message Templates ─────────────────────────────────────────────────────
  fastify.get('/message-templates', auth, async (req) => {
    const { rows } = await query('SELECT * FROM message_templates ORDER BY created_at DESC');
    return rows;
  });
  fastify.post('/message-templates', auth, async (req, reply) => {
    const { name, content, category, language, status } = req.body;
    const { rows } = await query(
      'INSERT INTO message_templates (name, content, category, language, status, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, content, category, language || 'pt-BR', status || 'approved', req.user.id]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/message-templates/:id', auth, async (req) => {
    const { name, content, category, language, status } = req.body;
    const { rows } = await query(
      `UPDATE message_templates SET name=COALESCE($1,name), content=COALESCE($2,content), category=COALESCE($3,category), language=COALESCE($4,language), status=COALESCE($5,status), updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, content, category, language, status, req.params.id]
    );
    return rows[0] || {};
  });
  fastify.delete('/message-templates/:id', auth, async (req) => {
    await query('DELETE FROM message_templates WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Event Triggers ───────────────────────────────────────────────────────
  fastify.get('/event-triggers', auth, async (req) => {
    const { rows } = await query('SELECT * FROM event_triggers ORDER BY created_at DESC');
    return rows;
  });
  fastify.post('/event-triggers', auth, async (req, reply) => {
    const { name, event_type, conditions, actions, is_active } = req.body;
    const { rows } = await query(
      'INSERT INTO event_triggers (name, event_type, conditions, actions, is_active, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, event_type, JSON.stringify(conditions || {}), JSON.stringify(actions || []), is_active !== false, req.user.id]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/event-triggers/:id', auth, async (req) => {
    const { name, event_type, conditions, actions, is_active } = req.body;
    const { rows } = await query(
      `UPDATE event_triggers SET name=COALESCE($1,name), event_type=COALESCE($2,event_type), conditions=COALESCE($3,conditions), actions=COALESCE($4,actions), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, event_type, conditions ? JSON.stringify(conditions) : null, actions ? JSON.stringify(actions) : null, is_active, req.params.id]
    );
    return rows[0] || {};
  });
  fastify.delete('/event-triggers/:id', auth, async (req) => {
    await query('DELETE FROM event_triggers WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Intent Configs ────────────────────────────────────────────────────────
  fastify.get('/intent-configs', auth, async (req) => {
    const { rows } = await query('SELECT * FROM intent_configs ORDER BY created_at ASC');
    return rows;
  });
  fastify.post('/intent-configs', auth, async (req, reply) => {
    const { name, description, patterns, response, is_active, confidence } = req.body;
    const { rows } = await query(
      'INSERT INTO intent_configs (name, description, patterns, response, is_active, confidence, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, description, patterns || [], response, is_active !== false, confidence || 0.8, req.user.id]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/intent-configs/:id', auth, async (req) => {
    const { name, description, patterns, response, is_active, confidence } = req.body;
    const { rows } = await query(
      `UPDATE intent_configs SET name=COALESCE($1,name), description=COALESCE($2,description), patterns=COALESCE($3,patterns), response=COALESCE($4,response), is_active=COALESCE($5,is_active), confidence=COALESCE($6,confidence), updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, description, patterns, response, is_active, confidence, req.params.id]
    );
    return rows[0] || {};
  });
  fastify.delete('/intent-configs/:id', auth, async (req) => {
    await query('DELETE FROM intent_configs WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Lead Scoring Rules ────────────────────────────────────────────────────
  fastify.get('/lead-scoring-rules', auth, async (req) => {
    const { rows } = await query('SELECT * FROM lead_scoring_rules ORDER BY created_at DESC');
    return rows;
  });
  fastify.post('/lead-scoring-rules', auth, async (req, reply) => {
    const { name, condition_field, condition_operator, condition_value, score_delta, is_active } = req.body;
    const { rows } = await query(
      'INSERT INTO lead_scoring_rules (name, condition_field, condition_operator, condition_value, score_delta, is_active, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, condition_field, condition_operator, condition_value, score_delta || 0, is_active !== false, req.user.id]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/lead-scoring-rules/:id', auth, async (req) => {
    const { name, condition_field, condition_operator, condition_value, score_delta, is_active } = req.body;
    const { rows } = await query(
      `UPDATE lead_scoring_rules SET name=COALESCE($1,name), condition_field=COALESCE($2,condition_field), condition_operator=COALESCE($3,condition_operator), condition_value=COALESCE($4,condition_value), score_delta=COALESCE($5,score_delta), is_active=COALESCE($6,is_active), updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, condition_field, condition_operator, condition_value, score_delta, is_active, req.params.id]
    );
    return rows[0] || {};
  });
  fastify.delete('/lead-scoring-rules/:id', auth, async (req) => {
    await query('DELETE FROM lead_scoring_rules WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Z-API Connections ────────────────────────────────────────────────────
  fastify.get('/zapi-connections', auth, async (req) => {
    const { rows } = await query('SELECT * FROM zapi_connections WHERE user_id=$1 ORDER BY created_at ASC', [req.user.id]);
    return rows;
  });
  fastify.post('/zapi-connections', auth, async (req, reply) => {
    const { label, instance_id, instance_token, client_token } = req.body;
    const { rows } = await query(
      'INSERT INTO zapi_connections (user_id, label, instance_id, instance_token, client_token) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, label, instance_id, instance_token, client_token]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/zapi-connections/:id', auth, async (req) => {
    const { label, instance_id, instance_token, client_token, status, connected } = req.body;
    const { rows } = await query(
      `UPDATE zapi_connections SET label=COALESCE($1,label), instance_id=COALESCE($2,instance_id), instance_token=COALESCE($3,instance_token), client_token=COALESCE($4,client_token), status=COALESCE($5,status), connected=COALESCE($6,connected), updated_at=NOW() WHERE id=$7 AND user_id=$8 RETURNING *`,
      [label, instance_id, instance_token, client_token, status, connected, req.params.id, req.user.id]
    );
    return rows[0] || {};
  });
  fastify.delete('/zapi-connections/:id', auth, async (req) => {
    await query('DELETE FROM zapi_connections WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });

  // ── Evolution Connections (DB) ────────────────────────────────────────────
  fastify.get('/evolution-connections', auth, async (req) => {
    const { rows } = await query('SELECT * FROM evolution_connections WHERE user_id=$1 ORDER BY created_at ASC', [req.user.id]);
    return rows;
  });
  fastify.post('/evolution-connections', auth, async (req, reply) => {
    const { instance_name, name, status, owner_jid, profile_pic_url, user_id } = req.body;
    const uid = user_id || req.user.id;
    const { rows } = await query(
      `INSERT INTO evolution_connections (user_id, instance_name, name, status, owner_jid, profile_pic_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, instance_name) DO UPDATE SET status=EXCLUDED.status, owner_jid=EXCLUDED.owner_jid, profile_pic_url=EXCLUDED.profile_pic_url, updated_at=NOW()
       RETURNING *`,
      [uid, instance_name, name || instance_name || '', status || 'disconnected', owner_jid || '', profile_pic_url || '']
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/evolution-connections', auth, async (req) => {
    // Accepts filters as query params (user_id, instance_name) or from body
    const instance_name = req.query.instance_name || req.body.instance_name;
    const user_id = req.query.user_id || req.body.user_id || req.user.id;
    const allowed = ['status','owner_jid','profile_pic_url'];
    const sets = [];
    const vals = [];
    let p = 3;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=$${p}`); vals.push(req.body[k]); p++; }
    }
    if (!sets.length) return {};
    sets.push('updated_at=NOW()');
    const { rows } = await query(
      `UPDATE evolution_connections SET ${sets.join(',')} WHERE user_id=$1 AND instance_name=$2 RETURNING *`,
      [user_id, instance_name, ...vals]
    );
    return rows[0] || {};
  });
  fastify.delete('/evolution-connections', auth, async (req) => {
    const uid = req.query.user_id || req.user.id;
    const instance_name = req.query.instance_name;
    if (instance_name) {
      // May be comma-separated (from .in() filter)
      const names = String(instance_name).split(',').map(s => s.trim()).filter(Boolean);
      if (names.length === 1) {
        await query('DELETE FROM evolution_connections WHERE user_id=$1 AND instance_name=$2', [uid, names[0]]);
      } else if (names.length > 1) {
        const placeholders = names.map((_, i) => `$${i + 2}`).join(',');
        await query(`DELETE FROM evolution_connections WHERE user_id=$1 AND instance_name IN (${placeholders})`, [uid, ...names]);
      }
    }
    return { ok: true };
  });

  // ── AI Agent proxy ────────────────────────────────────────────────────────
  fastify.post('/ai-agent', auth, async (req, reply) => {
    const { rows: settings } = await query('SELECT openai_key FROM settings WHERE id=1');
    const key = settings[0]?.openai_key;
    if (!key) return reply.status(400).send({ error: 'OpenAI key não configurada' });
    const { messages, model = 'gpt-4o-mini' } = req.body;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages }),
      });
      const data = await res.json();
      return { data, error: null };
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });
}
