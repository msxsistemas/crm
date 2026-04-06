// Migration (run manually on VPS if tables don't exist):
//
// CREATE TABLE IF NOT EXISTS api_keys (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   name TEXT NOT NULL,
//   key_hash TEXT NOT NULL UNIQUE,
//   key_prefix TEXT NOT NULL,
//   user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
//   is_active BOOLEAN DEFAULT true,
//   last_used_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE TABLE IF NOT EXISTS quick_replies (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   shortcut TEXT NOT NULL,
//   title TEXT NOT NULL,
//   content TEXT NOT NULL,
//   is_global BOOLEAN DEFAULT false,
//   created_by UUID REFERENCES profiles(id),
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE TABLE IF NOT EXISTS webhook_delivery_log (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   webhook_id UUID, event_type TEXT, url TEXT, status_code INTEGER,
//   request_body JSONB, response_body TEXT, error TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE TABLE IF NOT EXISTS hsm_templates_local (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   name TEXT NOT NULL,
//   language TEXT DEFAULT 'pt_BR',
//   category TEXT DEFAULT 'UTILITY',
//   body_text TEXT,
//   header_text TEXT,
//   footer_text TEXT,
//   template_id TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

import { query } from '../database.js';

export default async function misc3Routes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Webhook Delivery Log ──────────────────────────────────────────────────
  fastify.get('/webhook-delivery-log', auth, async (req) => {
    const { status } = req.query;
    let q = `SELECT * FROM webhook_delivery_log`;
    const vals = [];
    let p = 1;
    if (status === 'success') {
      q += ` WHERE status_code >= 200 AND status_code < 300`;
    } else if (status === 'error') {
      q += ` WHERE (status_code IS NULL OR status_code < 200 OR status_code >= 300 OR error IS NOT NULL)`;
    }
    q += ` ORDER BY created_at DESC LIMIT 50`;
    const { rows } = await query(q, vals);
    return rows;
  });

  // ── Contact Groups ────────────────────────────────────────────────────────
  fastify.get('/contact-groups', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT * FROM contact_groups ORDER BY name LIMIT $1 OFFSET $2', [limit, offset]);
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

  // ── Contact Segments ──────────────────────────────────────────────────────
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
    const { rows } = await query('INSERT INTO contact_segments (contact_id, segment_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *', [contact_id, segment_id]);
    return reply.status(201).send(rows[0] || {});
  });
  fastify.delete('/contact-segments/:id', auth, async (req) => {
    await query('DELETE FROM contact_segments WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── HSM Templates ─────────────────────────────────────────────────────────
  fastify.get('/hsm-templates', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT * FROM hsm_templates ORDER BY name LIMIT $1 OFFSET $2', [limit, offset]);
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

  // ── Message Templates ─────────────────────────────────────────────────────
  fastify.get('/message-templates', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query('SELECT * FROM message_templates ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows;
  });
  fastify.post('/message-templates', auth, async (req, reply) => {
    const { name, content, category, language, status } = req.body;
    const { rows } = await query('INSERT INTO message_templates (name, content, category, language, status, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [name, content, category, language || 'pt-BR', status || 'approved', req.user.id]);
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

  // ── Flow Templates ────────────────────────────────────────────────────────
  fastify.get('/flow-templates', auth, async () => {
    const { rows } = await query('SELECT * FROM attendance_flow_templates ORDER BY name LIMIT 200');
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
    const { rows } = await query('SELECT * FROM conversation_labels ORDER BY name LIMIT 200');
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

  // ── Event Triggers ────────────────────────────────────────────────────────
  fastify.get('/event-triggers', auth, async () => {
    const { rows } = await query('SELECT * FROM event_triggers ORDER BY created_at DESC LIMIT 200');
    return rows;
  });
  fastify.post('/event-triggers', auth, async (req, reply) => {
    const { name, event_type, conditions, actions, is_active } = req.body;
    const { rows } = await query('INSERT INTO event_triggers (name, event_type, conditions, actions, is_active, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [name, event_type, JSON.stringify(conditions || {}), JSON.stringify(actions || []), is_active !== false, req.user.id]);
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
    await query('DELETE FROM event_triggers WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Intent Configs ────────────────────────────────────────────────────────
  fastify.get('/intent-configs', auth, async () => {
    const { rows } = await query('SELECT * FROM intent_configs ORDER BY created_at ASC LIMIT 200');
    return rows;
  });
  fastify.post('/intent-configs', auth, async (req, reply) => {
    const { name, description, patterns, response, is_active, confidence } = req.body;
    const { rows } = await query('INSERT INTO intent_configs (name, description, patterns, response, is_active, confidence, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, description, patterns || [], response, is_active !== false, confidence || 0.8, req.user.id]);
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
    await query('DELETE FROM intent_configs WHERE id=$1', [req.params.id]); return { ok: true };
  });

  // ── Lead Scoring Rules ────────────────────────────────────────────────────
  fastify.get('/lead-scoring-rules', auth, async () => {
    const { rows } = await query('SELECT * FROM lead_scoring_rules ORDER BY created_at DESC LIMIT 200');
    return rows;
  });
  fastify.post('/lead-scoring-rules', auth, async (req, reply) => {
    const { name, condition_field, condition_operator, condition_value, score_delta, is_active } = req.body;
    const { rows } = await query('INSERT INTO lead_scoring_rules (name, condition_field, condition_operator, condition_value, score_delta, is_active, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, condition_field, condition_operator, condition_value, score_delta || 0, is_active !== false, req.user.id]);
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
    await query('DELETE FROM lead_scoring_rules WHERE id=$1', [req.params.id]); return { ok: true };
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
    const instance_name = req.query.instance_name || req.body.instance_name;
    const user_id = req.query.user_id || req.body.user_id || req.user.id;
    const allowed = ['status', 'owner_jid', 'profile_pic_url'];
    const sets = [];
    const vals = [];
    let p = 3;
    if (req.body.new_instance_name !== undefined) { sets.push(`instance_name=$${p}`); vals.push(req.body.new_instance_name); p++; }
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

  // ── Evolution Proxy ───────────────────────────────────────────────────────
  // Helper: get evolution settings
  async function getEvoSettings() {
    const { rows } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
    return rows[0] || null;
  }
  async function evoFetch(s, method, path, body) {
    const res = await fetch(`${s.evolution_url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'apikey': s.evolution_key },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Evolution API ${res.status}`);
    }
    return res.json();
  }

  // Create instance
  fastify.post('/evolution/instance/create', auth, async (req, reply) => {
    const s = await getEvoSettings();
    if (!s?.evolution_url) return reply.status(400).send({ error: 'Evolution API não configurada nas Configurações' });
    const { instanceName } = req.body;
    try {
      const data = await evoFetch(s, 'POST', '/instance/create', {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      });
      return data;
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // List all instances
  fastify.get('/evolution/instance/list', auth, async (req, reply) => {
    const s = await getEvoSettings();
    if (!s?.evolution_url) return reply.status(400).send({ error: 'Evolution API não configurada' });
    try {
      const data = await evoFetch(s, 'GET', '/instance/fetchInstances');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // Get QR code
  fastify.get('/evolution/instance/qr/:instanceName', auth, async (req, reply) => {
    const s = await getEvoSettings();
    if (!s?.evolution_url) return reply.status(400).send({ error: 'Evolution API não configurada' });
    try {
      const data = await evoFetch(s, 'GET', `/instance/connect/${req.params.instanceName}`);
      return data;
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // Get instance status
  fastify.get('/evolution/instance/status/:instanceName', auth, async (req, reply) => {
    const s = await getEvoSettings();
    if (!s?.evolution_url) return reply.status(400).send({ error: 'Evolution API não configurada' });
    try {
      const data = await evoFetch(s, 'GET', `/instance/fetchInstances?instanceName=${req.params.instanceName}`);
      const instance = Array.isArray(data) ? data[0] : data;
      return instance || {};
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // Set webhook
  fastify.post('/evolution/instance/webhook/:instanceName', auth, async (req, reply) => {
    const s = await getEvoSettings();
    if (!s?.evolution_url) return reply.status(400).send({ error: 'Evolution API não configurada' });
    const webhookUrl = req.body?.webhookUrl || `${process.env.BACKEND_URL || 'https://api.msxzap.pro'}/webhook/evolution`;
    try {
      const data = await evoFetch(s, 'POST', `/webhook/set/${req.params.instanceName}`, {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'SEND_MESSAGE'],
        },
      });
      return data;
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // Delete instance
  fastify.delete('/evolution/instance/:instanceName', auth, async (req, reply) => {
    const s = await getEvoSettings();
    if (!s?.evolution_url) return reply.status(400).send({ error: 'Evolution API não configurada' });
    try {
      const data = await evoFetch(s, 'DELETE', `/instance/delete/${req.params.instanceName}`);
      return data;
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // Legacy proxy (kept for backward compat)
  fastify.post('/evolution-proxy', auth, async (req, reply) => {
    const { action, instanceName, data: body } = req.body || {};
    const s = await getEvoSettings();
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

  // ── Auto-tag rules ────────────────────────────────────────────────────────
  fastify.get('/auto-tag-rules', auth, async () => {
    const { rows } = await query('SELECT * FROM auto_tag_rules ORDER BY created_at ASC');
    return rows;
  });
  fastify.post('/auto-tag-rules', auth, async (req, reply) => {
    const { keyword, tag, match_type = 'contains' } = req.body;
    if (!keyword || !tag) return reply.status(400).send({ error: 'keyword e tag obrigatórios' });
    const { rows } = await query(
      'INSERT INTO auto_tag_rules (keyword, tag, match_type) VALUES ($1,$2,$3) RETURNING *',
      [keyword.trim(), tag.trim(), match_type]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/auto-tag-rules/:id', auth, async (req) => {
    const { keyword, tag, match_type, is_active } = req.body;
    const sets = []; const vals = []; let p = 1;
    if (keyword !== undefined) { sets.push(`keyword=$${p}`); vals.push(keyword); p++; }
    if (tag !== undefined) { sets.push(`tag=$${p}`); vals.push(tag); p++; }
    if (match_type !== undefined) { sets.push(`match_type=$${p}`); vals.push(match_type); p++; }
    if (is_active !== undefined) { sets.push(`is_active=$${p}`); vals.push(is_active); p++; }
    if (!sets.length) return {};
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE auto_tag_rules SET ${sets.join(',')} WHERE id=$${p} RETURNING *`, vals);
    return rows[0] || {};
  });
  fastify.delete('/auto-tag-rules/:id', auth, async (req) => {
    await query('DELETE FROM auto_tag_rules WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Blacklist keywords ────────────────────────────────────────────────────
  fastify.get('/blacklist-keywords', auth, async () => {
    const { rows } = await query('SELECT * FROM blacklist_keywords ORDER BY created_at ASC');
    return rows;
  });
  fastify.post('/blacklist-keywords', auth, async (req, reply) => {
    const { keyword, action = 'block' } = req.body;
    if (!keyword) return reply.status(400).send({ error: 'keyword obrigatório' });
    const { rows } = await query(
      'INSERT INTO blacklist_keywords (keyword, action) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
      [keyword.trim(), action]
    );
    return reply.status(201).send(rows[0] || {});
  });
  fastify.patch('/blacklist-keywords/:id', auth, async (req) => {
    const { is_active } = req.body;
    const { rows } = await query('UPDATE blacklist_keywords SET is_active=$1 WHERE id=$2 RETURNING *', [is_active, req.params.id]);
    return rows[0] || {};
  });
  fastify.delete('/blacklist-keywords/:id', auth, async (req) => {
    await query('DELETE FROM blacklist_keywords WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Agents online status ──────────────────────────────────────────────────
  fastify.get('/agents/online', auth, async () => {
    const { rows } = await query(`
      SELECT p.id, p.name, p.avatar_url, p.status,
        COUNT(c.id) FILTER (WHERE c.status != 'closed') as open_count
      FROM profiles p
      LEFT JOIN conversations c ON c.assigned_to = p.id
      WHERE p.role IN ('agent','supervisor','admin')
      GROUP BY p.id, p.name, p.avatar_url, p.status
      ORDER BY p.status = 'online' DESC, open_count ASC
    `);
    return rows;
  });

  // ── AI Response Suggestion ──────────────────────────────────────────────────
  fastify.post('/ai/suggest-reply', auth, async (req) => {
    const { messages, contact_name } = req.body;
    // messages = array of {role: 'user'|'assistant', content: string}
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) return { suggestion: '' };

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `Você é um assistente de atendimento ao cliente. Sugira uma resposta profissional, amigável e concisa em português para a conversa com ${contact_name || 'o cliente'}. Retorne APENAS o texto da resposta, sem explicações adicionais.`,
        messages: messages.slice(-10) // last 10 messages for context
      })
    });

    if (!resp.ok) return { suggestion: '' };
    const data = await resp.json();
    return { suggestion: data.content?.[0]?.text || '' };
  });

  // ── HSM Templates Local ────────────────────────────────────────────────────
  // Templates criados localmente (espelho dos aprovados na Meta)
  fastify.get('/hsm-templates-local', auth, async (req) => {
    const { rows } = await query('SELECT * FROM hsm_templates_local ORDER BY name ASC');
    return rows;
  });
  fastify.post('/hsm-templates-local', auth, async (req, reply) => {
    const { name, language, category, body_text, header_text, footer_text, template_id } = req.body;
    const { rows } = await query(
      'INSERT INTO hsm_templates_local (name, language, category, body_text, header_text, footer_text, template_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, language || 'pt_BR', category || 'UTILITY', body_text, header_text, footer_text, template_id]
    );
    return reply.code(201).send(rows[0]);
  });
  fastify.delete('/hsm-templates-local/:id', auth, async (req) => {
    await query('DELETE FROM hsm_templates_local WHERE id=$1', [req.params.id]);
    return { ok: true };
  });
  // Send HSM template to a conversation
  fastify.post('/conversations/:id/send-hsm', auth, async (req) => {
    const { template_name, language_code, variables } = req.body;
    const { rows } = await query(
      'SELECT c.instance_name, ct.phone FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.id=$1',
      [req.params.id]
    );
    if (!rows[0]) return { ok: false };

    // Build components with variables
    const components = variables && variables.length ? [{
      type: 'body',
      parameters: variables.map(v => ({ type: 'text', text: v }))
    }] : [];

    const resp = await fetch(`${process.env.EVOLUTION_API_URL}/message/sendTemplate/${rows[0].instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
      body: JSON.stringify({
        number: rows[0].phone,
        template: { name: template_name, language: { code: language_code || 'pt_BR' }, components }
      })
    });
    return { ok: resp.ok };
  });

  // ── WhatsApp Groups ──────────────────────────────────────────────────────────
  fastify.get('/whatsapp/groups/:instance', auth, async (req) => {
    const s = await getEvoSettings();
    if (!s?.evolution_url) return [];
    const resp = await fetch(`${s.evolution_url}/group/fetchAllGroups/${req.params.instance}?getParticipants=false`, {
      headers: { 'apikey': s.evolution_key }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data.map(g => ({ id: g.id, subject: g.subject, size: g.size })) : [];
  });

  fastify.post('/whatsapp/groups/:instance/send', auth, async (req, reply) => {
    const { group_id, text } = req.body;
    if (!group_id || !text) return reply.code(400).send({ error: 'group_id e text são obrigatórios' });
    const s = await getEvoSettings();
    if (!s?.evolution_url) return reply.code(400).send({ error: 'Evolution API não configurada' });
    const resp = await fetch(`${s.evolution_url}/message/sendText/${req.params.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': s.evolution_key },
      body: JSON.stringify({ number: group_id, text })
    });
    return { ok: resp.ok };
  });

  // ── Link preview proxy ────────────────────────────────────────────────────
  fastify.get('/link-preview', auth, async (req, reply) => {
    const { url } = req.query;
    if (!url || !/^https?:\/\//.test(url)) return reply.status(400).send({ error: 'URL inválida' });
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MSXCRMBot/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      const html = await res.text();
      const get = (prop) => {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
        return m?.[1] || null;
      };
      const title = get('og:title') || get('twitter:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]) || null;
      const description = get('og:description') || get('twitter:description') || get('description') || null;
      const image = get('og:image') || get('twitter:image') || null;
      const siteName = get('og:site_name') || new URL(url).hostname;
      return { url, title, description, image, siteName };
    } catch {
      return reply.status(422).send({ error: 'Não foi possível carregar preview' });
    }
  });

  // ── Translation proxy ────────────────────────────────────────────────────────
  fastify.post('/translate', auth, async (req) => {
    const { text, target_language } = req.body;
    if (!text) return { translated: text };

    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!anthropicKey) return { translated: text, error: 'No API key' };

    const langNames = { 'pt': 'português', 'en': 'inglês', 'es': 'espanhol', 'fr': 'francês', 'de': 'alemão', 'it': 'italiano', 'zh': 'chinês', 'ja': 'japonês', 'ar': 'árabe' };
    const targetName = langNames[target_language] || target_language || 'português';

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: `Traduza o texto a seguir para ${targetName}. Retorne APENAS o texto traduzido, sem explicações ou aspas.`,
          messages: [{ role: 'user', content: text }]
        })
      });
      if (!resp.ok) return { translated: text };
      const data = await resp.json();
      return { translated: data.content?.[0]?.text || text };
    } catch(e) {
      return { translated: text };
    }
  });

  // ── API Keys (Public API) ────────────────────────────────────────────────────
  fastify.get('/api-keys', auth, async (req) => {
    const { rows } = await query('SELECT id, name, key_prefix, created_at, last_used_at, is_active FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    return rows;
  });

  fastify.post('/api-keys', auth, async (req, reply) => {
    const { name } = req.body;
    const crypto = await import('crypto');
    const fullKey = 'msxcrm_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
    const keyPrefix = fullKey.substring(0, 16) + '...';
    const { rows } = await query(
      'INSERT INTO api_keys (name, key_hash, key_prefix, user_id) VALUES ($1,$2,$3,$4) RETURNING id, name, key_prefix, created_at',
      [name, keyHash, keyPrefix, req.user.id]
    );
    return { ...rows[0], full_key: fullKey }; // Only returned once
  });

  fastify.delete('/api-keys/:id', auth, async (req) => {
    await query('DELETE FROM api_keys WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });

  // ── Public API endpoints (authenticated by X-API-Key header) ─────────────────
  const apiKeyAuth = async (req, reply) => {
    const key = req.headers['x-api-key'];
    if (!key) return reply.code(401).send({ error: 'X-API-Key header required' });
    const crypto = await import('crypto');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const { rows } = await query('SELECT * FROM api_keys WHERE key_hash=$1 AND is_active=true', [keyHash]);
    if (!rows[0]) return reply.code(401).send({ error: 'Invalid API key' });
    await query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1', [rows[0].id]);
    req.apiUser = { id: rows[0].user_id };
  };

  fastify.get('/public/v1/contacts', { preHandler: apiKeyAuth }, async (req) => {
    const { phone, limit } = req.query;
    let q = 'SELECT id, name, phone, email, tags FROM contacts WHERE 1=1';
    const params = [];
    if (phone) { q += ` AND phone LIKE $${params.length+1}`; params.push(`%${phone}%`); }
    q += ` ORDER BY created_at DESC LIMIT ${Math.min(parseInt(limit)||50, 100)}`;
    const { rows } = await query(q, params);
    return { data: rows };
  });

  fastify.post('/public/v1/contacts', { preHandler: apiKeyAuth }, async (req, reply) => {
    const { name, phone, email, tags } = req.body;
    if (!phone) return reply.code(400).send({ error: 'phone is required' });
    const { rows } = await query(
      'INSERT INTO contacts (name, phone, email, tags) VALUES ($1,$2,$3,$4) ON CONFLICT (phone) DO UPDATE SET name=COALESCE(EXCLUDED.name,contacts.name) RETURNING *',
      [name, phone, email, tags || []]
    );
    return reply.code(201).send({ data: rows[0] });
  });

  fastify.post('/public/v1/messages', { preHandler: apiKeyAuth }, async (req, reply) => {
    const { phone, text, instance_name } = req.body;
    if (!phone || !text) return reply.code(400).send({ error: 'phone and text are required' });
    const resp = await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
      body: JSON.stringify({ number: phone, text })
    });
    return { ok: resp.ok };
  });

  fastify.get('/public/v1/conversations', { preHandler: apiKeyAuth }, async (req) => {
    const { status, limit } = req.query;
    const { rows } = await query(
      `SELECT c.id, c.status, c.created_at, c.last_message_at, c.last_message_body, ct.name as contact_name, ct.phone as contact_phone FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE ($1::text IS NULL OR c.status=$1) ORDER BY c.last_message_at DESC LIMIT $2`,
      [status || null, Math.min(parseInt(limit)||50, 100)]
    );
    return { data: rows };
  });

  // ── Capture Forms ─────────────────────────────────────────────────────────
  fastify.get('/capture-forms', auth, async (req) => {
    const { rows } = await query('SELECT * FROM capture_forms ORDER BY created_at DESC');
    return rows;
  });

  fastify.post('/capture-forms', auth, async (req, reply) => {
    const { name, fields, destination_team_id } = req.body;
    const { rows: orgRows } = await query('SELECT organization_id FROM profiles WHERE id=$1', [req.user.id]);
    const organization_id = orgRows[0]?.organization_id || null;
    const { rows } = await query(
      'INSERT INTO capture_forms (name, fields, destination_team_id, organization_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, JSON.stringify(fields || []), destination_team_id || null, organization_id]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.patch('/capture-forms/:id', auth, async (req) => {
    const { name, fields, destination_team_id } = req.body;
    const sets = []; const vals = []; let p = 1;
    if (name !== undefined) { sets.push(`name=$${p}`); vals.push(name); p++; }
    if (fields !== undefined) { sets.push(`fields=$${p}`); vals.push(JSON.stringify(fields)); p++; }
    if (destination_team_id !== undefined) { sets.push(`destination_team_id=$${p}`); vals.push(destination_team_id); p++; }
    if (!sets.length) return {};
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE capture_forms SET ${sets.join(',')} WHERE id=$${p} RETURNING *`, vals);
    return rows[0] || {};
  });

  fastify.delete('/capture-forms/:id', auth, async (req) => {
    await query('DELETE FROM capture_forms WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // Public capture form endpoints (no auth)
  fastify.get('/public/capture/:slug', async (req, reply) => {
    const { rows } = await query('SELECT id, name, fields, slug FROM capture_forms WHERE slug=$1', [req.params.slug]);
    if (!rows[0]) return reply.code(404).send({ error: 'Formulário não encontrado' });
    return rows[0];
  });

  fastify.post('/public/capture/:slug/submit', async (req, reply) => {
    const { rows: formRows } = await query('SELECT * FROM capture_forms WHERE slug=$1', [req.params.slug]);
    if (!formRows[0]) return reply.code(404).send({ error: 'Formulário não encontrado' });
    const form = formRows[0];
    const body = req.body || {};
    // Create contact from form data
    const contactRes = await query(
      'INSERT INTO contacts (name, phone, email, organization_id) VALUES ($1,$2,$3,$4) ON CONFLICT (phone, organization_id) DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [body.name || 'Lead', body.phone || null, body.email || null, form.organization_id]
    );
    const contactId = contactRes.rows[0].id;
    // Create conversation
    const convRes = await query(
      "INSERT INTO conversations (contact_id, organization_id, status, channel, assigned_team_id, origin) VALUES ($1,$2,'open','web',$3,'capture_form') RETURNING id",
      [contactId, form.organization_id, form.destination_team_id]
    );
    return reply.code(201).send({ ok: true, conversation_id: convRes.rows[0].id });
  });

  // ── Conversation Checklist ────────────────────────────────────────────────
  fastify.get('/conversations/:id/checklist', auth, async (req) => {
    const { rows } = await query('SELECT * FROM conversation_checklist WHERE conversation_id=$1 ORDER BY created_at ASC', [req.params.id]);
    return rows;
  });

  fastify.post('/conversations/:id/checklist', auth, async (req, reply) => {
    const { text } = req.body;
    if (!text) return reply.code(400).send({ error: 'text é obrigatório' });
    const { rows } = await query(
      'INSERT INTO conversation_checklist (conversation_id, text) VALUES ($1,$2) RETURNING *',
      [req.params.id, text]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.patch('/conversations/:id/checklist/:itemId', auth, async (req) => {
    const { done, text } = req.body;
    const sets = []; const vals = []; let p = 1;
    if (done !== undefined) { sets.push(`done=$${p}`); vals.push(done); p++; }
    if (text !== undefined) { sets.push(`text=$${p}`); vals.push(text); p++; }
    if (!sets.length) return {};
    vals.push(req.params.itemId);
    const { rows } = await query(`UPDATE conversation_checklist SET ${sets.join(',')} WHERE id=$${p} RETURNING *`, vals);
    return rows[0] || {};
  });

  fastify.delete('/conversations/:id/checklist/:itemId', auth, async (req) => {
    await query('DELETE FROM conversation_checklist WHERE id=$1 AND conversation_id=$2', [req.params.itemId, req.params.id]);
    return { ok: true };
  });

  // ── FAQ Rules (Bot FAQ por Palavras-chave) ───────────────────────────────────
  fastify.get('/faq-rules', auth, async (req) => {
    const orgId = req.user.organization_id || req.user.org_id || null;
    const { rows } = await query(
      'SELECT * FROM faq_rules WHERE (organization_id=$1 OR $1 IS NULL) ORDER BY created_at ASC',
      [orgId]
    );
    return rows;
  });

  fastify.post('/faq-rules', auth, async (req, reply) => {
    const { keyword, response, is_active } = req.body;
    if (!keyword || !response) return reply.status(400).send({ error: 'keyword e response obrigatórios' });
    const orgId = req.user.organization_id || req.user.org_id || null;
    const { rows } = await query(
      'INSERT INTO faq_rules (organization_id, keyword, response, is_active) VALUES ($1,$2,$3,$4) RETURNING *',
      [orgId, keyword.trim(), response.trim(), is_active !== false]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.patch('/faq-rules/:id', auth, async (req) => {
    const { keyword, response, is_active } = req.body;
    const sets = []; const vals = []; let p = 1;
    if (keyword !== undefined) { sets.push(`keyword=$${p}`); vals.push(keyword); p++; }
    if (response !== undefined) { sets.push(`response=$${p}`); vals.push(response); p++; }
    if (is_active !== undefined) { sets.push(`is_active=$${p}`); vals.push(is_active); p++; }
    if (!sets.length) return {};
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE faq_rules SET ${sets.join(',')} WHERE id=$${p} RETURNING *`, vals);
    return rows[0] || {};
  });

  fastify.delete('/faq-rules/:id', auth, async (req) => {
    await query('DELETE FROM faq_rules WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Conversation Collaborators (Co-atendimento) ──────────────────────────────
  fastify.get('/conversations/:id/collaborators', auth, async (req) => {
    const { rows } = await query(
      `SELECT cc.*, p.name, p.full_name, p.avatar_url, p.email
       FROM conversation_collaborators cc
       JOIN profiles p ON p.id = cc.agent_id
       WHERE cc.conversation_id=$1`,
      [req.params.id]
    );
    return rows;
  });

  fastify.post('/conversations/:id/collaborators', auth, async (req, reply) => {
    const { agent_id } = req.body;
    if (!agent_id) return reply.status(400).send({ error: 'agent_id obrigatório' });
    const { rows } = await query(
      'INSERT INTO conversation_collaborators (conversation_id, agent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
      [req.params.id, agent_id]
    );
    const { rows: agentRows } = await query('SELECT id, name, full_name, avatar_url FROM profiles WHERE id=$1', [agent_id]);
    const agentRow = agentRows[0] || { id: agent_id };
    fastify.io?.emit('conversation:collaborator_added', { conversation_id: req.params.id, agent: agentRow });
    return reply.status(201).send(rows[0] || { conversation_id: req.params.id, agent_id });
  });

  fastify.delete('/conversations/:id/collaborators/:agentId', auth, async (req) => {
    await query(
      'DELETE FROM conversation_collaborators WHERE conversation_id=$1 AND agent_id=$2',
      [req.params.id, req.params.agentId]
    );
    return { ok: true };
  });
}
