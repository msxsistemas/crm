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

  // ── Conversation Free Tags ────────────────────────────────────────────────
  fastify.get('/conversations/:id/tags', auth, async (req) => {
    const { rows } = await query('SELECT tags FROM conversations WHERE id=$1', [req.params.id]);
    return rows[0]?.tags || [];
  });

  fastify.post('/conversations/:id/tags', auth, async (req, reply) => {
    const { tag } = req.body;
    if (!tag?.trim()) return reply.status(400).send({ error: 'Tag obrigatória' });
    await query(
      "UPDATE conversations SET tags=array_append(COALESCE(tags,ARRAY[]::text[]),$1) WHERE id=$2 AND NOT ($1=ANY(COALESCE(tags,ARRAY[]::text[])))",
      [tag.trim().toLowerCase(), req.params.id]
    );
    if (fastify.io) fastify.io.emit('conversation:tag_added', { conversation_id: req.params.id, tag: tag.trim().toLowerCase() });
    return { success: true };
  });

  fastify.delete('/conversations/:id/tags/:tag', auth, async (req) => {
    await query(
      "UPDATE conversations SET tags=array_remove(COALESCE(tags,ARRAY[]::text[]),$1) WHERE id=$2",
      [req.params.tag, req.params.id]
    );
    return { success: true };
  });

  // Get all tags used (for autocomplete)
  fastify.get('/conversations/tags/all', auth, async () => {
    const { rows } = await query(`
      SELECT DISTINCT unnest(tags) as tag, COUNT(*) OVER (PARTITION BY unnest(tags)) as count
      FROM conversations WHERE tags IS NOT NULL
      ORDER BY count DESC LIMIT 50
    `);
    return rows;
  });

  // ── Integrations (n8n / Zapier / Make) ────────────────────────────────────
  fastify.post('/integrations/test-webhook', auth, async (req, reply) => {
    const { url, event_type } = req.body;
    if (!url) return reply.status(400).send({ error: 'URL obrigatória' });
    const testPayload = {
      event: event_type || 'conversation.updated',
      timestamp: new Date().toISOString(),
      data: {
        conversation: { id: 'test-id', status: 'open', priority: 'normal' },
        contact: { name: 'Contato Teste', phone: '5511999990000' },
        agent: { name: req.user.full_name },
      }
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });
      return { status: res.status, ok: res.ok };
    } catch (e) {
      return reply.status(500).send({ error: e.message });
    }
  });

  fastify.get('/integrations', auth, async () => {
    const { rows } = await query('SELECT * FROM integrations ORDER BY created_at DESC');
    return rows;
  });

  fastify.post('/integrations', auth, async (req, reply) => {
    if (!['admin','supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { name, webhook_url, events, secret_token, platform } = req.body;
    const { rows } = await query(
      'INSERT INTO integrations (name, webhook_url, events, secret_token, platform) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, webhook_url, JSON.stringify(events || []), secret_token || null, platform || 'generic']
    );
    return rows[0];
  });

  fastify.patch('/integrations/:id', auth, async (req) => {
    const { is_active } = req.body;
    const { rows } = await query('UPDATE integrations SET is_active=$1 WHERE id=$2 RETURNING *', [is_active, req.params.id]);
    return rows[0] || {};
  });

  fastify.delete('/integrations/:id', auth, async (req) => {
    await query('DELETE FROM integrations WHERE id=$1', [req.params.id]);
    return { success: true };
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

  // ── Flow Builder (chatbot_flows) ─────────────────────────────────────────────
  fastify.get('/flow-builder/flows', auth, async () => {
    const { rows } = await query('SELECT * FROM chatbot_flows ORDER BY created_at DESC');
    return rows;
  });

  fastify.post('/flow-builder/flows', auth, async (req, reply) => {
    const { name, nodes, edges } = req.body;
    const { rows } = await query(
      'INSERT INTO chatbot_flows (name, nodes, edges) VALUES ($1,$2,$3) RETURNING *',
      [name || 'Novo Fluxo', JSON.stringify(nodes || []), JSON.stringify(edges || [])]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.get('/flow-builder/flows/:id', auth, async (req, reply) => {
    const { rows } = await query('SELECT * FROM chatbot_flows WHERE id=$1', [req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Fluxo não encontrado' });
    return rows[0];
  });

  fastify.patch('/flow-builder/flows/:id', auth, async (req) => {
    const { name, nodes, edges, is_active } = req.body;
    const sets = []; const vals = []; let p = 1;
    if (name !== undefined) { sets.push(`name=$${p}`); vals.push(name); p++; }
    if (nodes !== undefined) { sets.push(`nodes=$${p}`); vals.push(JSON.stringify(nodes)); p++; }
    if (edges !== undefined) { sets.push(`edges=$${p}`); vals.push(JSON.stringify(edges)); p++; }
    if (is_active !== undefined) {
      // Deactivate all others first if activating
      if (is_active) await query('UPDATE chatbot_flows SET is_active=false').catch(() => {});
      sets.push(`is_active=$${p}`); vals.push(is_active); p++;
    }
    if (!sets.length) return {};
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE chatbot_flows SET ${sets.join(',')} WHERE id=$${p} RETURNING *`, vals);
    return rows[0] || {};
  });

  fastify.delete('/flow-builder/flows/:id', auth, async (req) => {
    await query('DELETE FROM chatbot_flows WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Global Search ─────────────────────────────────────────────────────────────
  fastify.get('/search/global', auth, async (req) => {
    const q = `%${req.query.q || ''}%`;
    const [contacts, conversations, messages] = await Promise.all([
      query('SELECT id, name, phone, email FROM contacts WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 LIMIT 5', [q]),
      query('SELECT c.id, ct.name as contact_name, c.status, c.created_at FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE ct.name ILIKE $1 LIMIT 5', [q]),
      query('SELECT m.id, m.content, m.conversation_id, ct.name as contact_name FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN contacts ct ON ct.id=c.contact_id WHERE m.content ILIKE $1 LIMIT 5', [q]),
    ]);
    return { contacts: contacts.rows, conversations: conversations.rows, messages: messages.rows };
  });

  // ── Quick Replies Preview (template variables) ────────────────────────────────
  fastify.post('/quick-replies/preview', auth, async (req) => {
    const { text, contact_id, conversation_id } = req.body;
    let rendered = text || '';
    if (contact_id) {
      const { rows } = await query('SELECT name, phone, email FROM contacts WHERE id=$1', [contact_id]);
      if (rows[0]) {
        rendered = rendered.replace(/\{\{nome\}\}/gi, rows[0].name || '');
        rendered = rendered.replace(/\{\{telefone\}\}/gi, rows[0].phone || '');
        rendered = rendered.replace(/\{\{email\}\}/gi, rows[0].email || '');
      }
    }
    if (conversation_id) {
      const { rows } = await query('SELECT id FROM conversations WHERE id=$1', [conversation_id]);
      if (rows[0]) {
        rendered = rendered.replace(/\{\{protocolo\}\}/gi, rows[0].id.split('-')[0].toUpperCase());
      }
    }
    rendered = rendered.replace(/\{\{data\}\}/gi, new Date().toLocaleDateString('pt-BR'));
    rendered = rendered.replace(/\{\{hora\}\}/gi, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    return { rendered };
  });

  // ── Interactive WhatsApp Messages (Buttons & Lists) ────────────────────────
  fastify.post('/conversations/:id/send-interactive', auth, async (req, reply) => {
    const { type, body_text, buttons, sections, header_text, footer_text } = req.body;
    const { rows } = await query(
      'SELECT c.name as connection_name, ct.phone FROM conversations cv JOIN contacts ct ON ct.id=cv.contact_id JOIN connections c ON c.name=cv.connection_name WHERE cv.id=$1',
      [req.params.id]
    );
    if (!rows[0]) return reply.status(404).send({ error: 'Conversa não encontrada' });
    const { connection_name, phone } = rows[0];

    let payload;
    if (type === 'button') {
      payload = {
        number: phone,
        buttonMessage: {
          text: body_text,
          buttons: (buttons || []).map((b, i) => ({ buttonId: `btn${i}`, buttonText: { displayText: b }, type: 1 })),
          headerType: 1
        }
      };
      await fetch(`${process.env.EVOLUTION_API_URL}/message/sendButtons/${connection_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
        body: JSON.stringify(payload)
      });
    } else if (type === 'list') {
      payload = {
        number: phone,
        listMessage: {
          title: header_text || '',
          description: body_text,
          buttonText: 'Ver opções',
          footerText: footer_text || '',
          sections: sections || []
        }
      };
      await fetch(`${process.env.EVOLUTION_API_URL}/message/sendList/${connection_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
        body: JSON.stringify(payload)
      });
    }

    await query(
      "INSERT INTO messages (conversation_id, content, sender_type, metadata, created_at) VALUES ($1,$2,'agent',$3,NOW())",
      [req.params.id, body_text, JSON.stringify({ interactive: true, type, buttons, sections })]
    );

    return { success: true };
  });

  // ── Appointments ──────────────────────────────────────────────────────────────
  fastify.get('/appointments', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { contact_id, agent_id } = req.query;
    let q = 'SELECT a.*, ct.name as contact_name, ct.phone as contact_phone, p.full_name as agent_name FROM appointments a LEFT JOIN contacts ct ON ct.id=a.contact_id LEFT JOIN profiles p ON p.id=a.created_by WHERE 1=1';
    const params = [];
    if (contact_id) { params.push(contact_id); q += ` AND a.contact_id=$${params.length}`; }
    if (agent_id) { params.push(agent_id); q += ` AND a.created_by=$${params.length}`; }
    q += ' ORDER BY a.scheduled_at ASC';
    const { rows } = await query(q, params);
    return rows;
  });

  fastify.post('/appointments', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { contact_id, title, description, scheduled_at, notify_via_whatsapp } = req.body;
    if (!title) return reply.status(400).send({ error: 'title é obrigatório' });
    if (!scheduled_at) return reply.status(400).send({ error: 'scheduled_at é obrigatório' });
    const { rows } = await query(
      'INSERT INTO appointments (contact_id, title, description, scheduled_at, notify_via_whatsapp, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [contact_id || null, title, description || null, scheduled_at, notify_via_whatsapp || false, req.user.id]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.patch('/appointments/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { title, description, scheduled_at, notify_via_whatsapp, notified } = req.body;
    const sets = []; const vals = []; let p = 1;
    if (title !== undefined) { sets.push(`title=$${p}`); vals.push(title); p++; }
    if (description !== undefined) { sets.push(`description=$${p}`); vals.push(description); p++; }
    if (scheduled_at !== undefined) { sets.push(`scheduled_at=$${p}`); vals.push(scheduled_at); p++; }
    if (notify_via_whatsapp !== undefined) { sets.push(`notify_via_whatsapp=$${p}`); vals.push(notify_via_whatsapp); p++; }
    if (notified !== undefined) { sets.push(`notified=$${p}`); vals.push(notified); p++; }
    if (!sets.length) return reply.status(400).send({ error: 'Nada para atualizar' });
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE appointments SET ${sets.join(',')} WHERE id=$${p} RETURNING *`, vals);
    return rows[0] || {};
  });

  fastify.delete('/appointments/:id', { onRequest: [fastify.authenticate] }, async (req) => {
    await query('DELETE FROM appointments WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── Audit Log ─────────────────────────────────────────────────────────────────
  fastify.get('/admin/audit-log', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!['admin', 'supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query(
      'SELECT al.*, p.full_name as actor_name FROM audit_log al LEFT JOIN profiles p ON p.id=al.actor_id ORDER BY al.created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return rows;
  });

  // ── Chat Widgets ──────────────────────────────────────────────────────────────
  fastify.get('/chat-widget', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query('SELECT * FROM chat_widgets ORDER BY created_at DESC');
    return rows;
  });

  fastify.post('/chat-widget', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { name, greeting, color, team_id, collect_email } = req.body;
    const crypto = await import('crypto');
    const token = crypto.randomBytes(16).toString('hex');
    const { rows } = await query(
      'INSERT INTO chat_widgets (name, greeting, color, team_id, collect_email, token) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, greeting || 'Olá! Como posso ajudar?', color || '#25D366', team_id || null, collect_email || false, token]
    );
    return rows[0];
  });

  fastify.delete('/chat-widget/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await query('DELETE FROM chat_widgets WHERE id=$1', [req.params.id]);
    return { success: true };
  });

  // Public widget endpoints (no auth)
  fastify.get('/widget/:token/config', async (req, reply) => {
    const { rows } = await query('SELECT id, name, greeting, color, collect_email FROM chat_widgets WHERE token=$1', [req.params.token]);
    if (!rows[0]) return reply.status(404).send({ error: 'Widget not found' });
    return rows[0];
  });

  fastify.post('/widget/:token/start', async (req, reply) => {
    const { name, phone, email, message } = req.body;
    const { rows: w } = await query('SELECT * FROM chat_widgets WHERE token=$1', [req.params.token]);
    if (!w[0]) return reply.status(404).send({ error: 'Widget not found' });

    // Create or find contact
    const { rows: contacts } = await query(
      'INSERT INTO contacts (name, phone, email) VALUES ($1,$2,$3) ON CONFLICT (phone) WHERE phone IS NOT NULL DO UPDATE SET name=EXCLUDED.name RETURNING id',
      [name || 'Visitante', phone || null, email || null]
    );
    const contactId = contacts[0].id;

    // Create conversation
    const { rows: convs } = await query(
      "INSERT INTO conversations (contact_id, status, channel, assigned_team_id, origin) VALUES ($1,'open','web',$2,'widget') RETURNING id",
      [contactId, w[0].team_id]
    );
    const convId = convs[0].id;

    // Save initial message
    if (message) {
      await query("INSERT INTO messages (conversation_id, content, sender_type) VALUES ($1,$2,'contact')", [convId, message]);
    }

    return { conversation_id: convId, contact_id: contactId };
  });

  // ── AI Labels Settings ────────────────────────────────────────────────────────
  fastify.get('/settings/ai-labels', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query("SELECT ai_labels_enabled FROM settings WHERE id=1");
    return { enabled: rows[0]?.ai_labels_enabled || false };
  });

  fastify.patch('/settings/ai-labels', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { enabled } = req.body;
    await query("UPDATE settings SET ai_labels_enabled=$1 WHERE id=1", [enabled]);
    return { success: true };
  });

  // ── Out-of-Hours Bot Settings ─────────────────────────────────────────────────
  fastify.get('/settings/out-of-hours', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query("SELECT out_of_hours_enabled, out_of_hours_message FROM settings WHERE id=1");
    return rows[0] || { out_of_hours_enabled: false, out_of_hours_message: '' };
  });

  fastify.patch('/settings/out-of-hours', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { enabled, message } = req.body;
    await query("UPDATE settings SET out_of_hours_enabled=$1, out_of_hours_message=$2 WHERE id=1", [enabled, message]);
    return { success: true };
  });

  // ── AI Conversation Summarize ─────────────────────────────────────────────────
  fastify.post('/conversations/:id/summarize', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows: msgs } = await query(
      "SELECT content, sender_type, created_at FROM messages WHERE conversation_id=$1 AND content IS NOT NULL ORDER BY created_at ASC LIMIT 100",
      [req.params.id]
    );
    if (!msgs.length) return { summary: 'Conversa sem mensagens.' };

    const transcript = msgs.map(m => `[${m.sender_type === 'agent' ? 'Agente' : 'Cliente'}]: ${m.content}`).join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Resuma esta conversa de atendimento em 3-5 pontos principais. Seja conciso e objetivo. Destaque: motivo do contato, ações tomadas, situação atual.\n\nConversa:\n${transcript}`
        }]
      })
    });
    const ai = await response.json();
    const summary = ai.content?.[0]?.text || 'Não foi possível gerar resumo.';

    // Save summary to conversation
    await query('UPDATE conversations SET ai_summary=$1, ai_summary_at=NOW() WHERE id=$2', [summary, req.params.id]);

    return { summary };
  });

  // ── Automation Rules ─────────────────────────────────────────────────────────
  fastify.get('/automations', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query('SELECT * FROM automation_rules ORDER BY created_at DESC');
    return rows;
  });

  fastify.post('/automations', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { name, trigger, conditions, actions, is_active } = req.body;
    const { rows } = await query(
      'INSERT INTO automation_rules (name, trigger, conditions, actions, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, trigger, JSON.stringify(conditions || []), JSON.stringify(actions || []), is_active !== false]
    );
    return rows[0];
  });

  fastify.patch('/automations/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { name, trigger, conditions, actions, is_active } = req.body;
    const fields = [];
    const vals = [];
    let i = 1;
    if (name !== undefined) { fields.push(`name=$${i++}`); vals.push(name); }
    if (trigger !== undefined) { fields.push(`trigger=$${i++}`); vals.push(trigger); }
    if (conditions !== undefined) { fields.push(`conditions=$${i++}`); vals.push(JSON.stringify(conditions)); }
    if (actions !== undefined) { fields.push(`actions=$${i++}`); vals.push(JSON.stringify(actions)); }
    if (is_active !== undefined) { fields.push(`is_active=$${i++}`); vals.push(is_active); }
    if (!fields.length) return reply.status(400).send({ error: 'No fields' });
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE automation_rules SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, vals);
    return rows[0];
  });

  fastify.delete('/automations/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await query('DELETE FROM automation_rules WHERE id=$1', [req.params.id]);
    return { success: true };
  });

  // ── Push Subscriptions ────────────────────────────────────────────────────────
  fastify.post('/push/subscribe', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { subscription } = req.body;
    await query(
      'INSERT INTO push_subscriptions (user_id, subscription) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET subscription=$2',
      [req.user.id, JSON.stringify(subscription)]
    );
    return { success: true };
  });

  fastify.delete('/push/unsubscribe', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await query('DELETE FROM push_subscriptions WHERE user_id=$1', [req.user.id]);
    return { success: true };
  });

  fastify.get('/push/vapid-public-key', async (req, reply) => {
    return { key: process.env.VAPID_PUBLIC_KEY || '' };
  });

  // ── Advanced Message Search ──────────────────────────────────────────────────
  fastify.get('/messages/search', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { q, agent_id, label, channel, sentiment, start, end, csat_min, limit = 50, offset = 0 } = req.query;

    const where = ['1=1'];
    const params = [];
    let i = 1;

    if (q) { params.push(`%${q}%`); where.push(`m.content ILIKE $${i++}`); }
    if (agent_id) { params.push(agent_id); where.push(`c.assigned_to=$${i++}`); }
    if (label) { params.push(label); where.push(`$${i++}=ANY(c.labels)`); }
    if (channel) { params.push(channel); where.push(`c.connection_name=$${i++}`); }
    if (sentiment) { params.push(sentiment); where.push(`c.sentiment=$${i++}`); }
    if (start) { params.push(start); where.push(`m.created_at>=$${i++}`); }
    if (end) { params.push(end); where.push(`m.created_at<=$${i++}`); }
    if (csat_min) { params.push(parseFloat(csat_min)); where.push(`c.csat_score>=$${i++}`); }

    params.push(parseInt(limit)); params.push(parseInt(offset));

    const { rows } = await query(`
      SELECT m.id, m.content, m.sender_type, m.created_at,
             c.id as conversation_id, c.labels, c.sentiment, c.csat_score, c.connection_name,
             ct.name as contact_name, ct.phone,
             p.full_name as agent_name
      FROM messages m
      JOIN conversations c ON c.id=m.conversation_id
      JOIN contacts ct ON ct.id=c.contact_id
      LEFT JOIN profiles p ON p.id=c.assigned_to
      WHERE ${where.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `, params);
    return rows;
  });

  // ── Export Conversation as HTML/PDF ─────────────────────────────────────────
  fastify.get('/conversations/:id/export-pdf', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows: msgs } = await query(
      `SELECT m.content, m.sender_type, m.created_at, m.metadata,
              p.full_name as agent_name
       FROM messages m
       LEFT JOIN profiles p ON p.id=m.sender_id
       WHERE m.conversation_id=$1 ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    const { rows: conv } = await query(
      `SELECT c.*, ct.name as contact_name, ct.phone, ct.email,
              p.full_name as agent_name, t.name as team_name
       FROM conversations c
       JOIN contacts ct ON ct.id=c.contact_id
       LEFT JOIN profiles p ON p.id=c.assigned_to
       LEFT JOIN teams t ON t.id=c.assigned_team_id
       WHERE c.id=$1`,
      [req.params.id]
    );
    if (!conv[0]) return reply.status(404).send({ error: 'Conversa não encontrada' });
    const c = conv[0];

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Conversa ${c.id.split('-')[0].toUpperCase()}</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
      .header { border-bottom: 2px solid #25D366; padding-bottom: 16px; margin-bottom: 24px; }
      .header h1 { margin: 0; color: #128C7E; font-size: 20px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; font-size: 13px; }
      .msg { margin-bottom: 12px; }
      .msg .bubble { display: inline-block; max-width: 75%; padding: 8px 12px; border-radius: 8px; font-size: 13px; }
      .msg.contact { text-align: left; }
      .msg.contact .bubble { background: #f0f0f0; }
      .msg.agent { text-align: right; }
      .msg.agent .bubble { background: #d9fdd3; }
      .msg.bot { text-align: center; }
      .msg.bot .bubble { background: #fff3cd; font-style: italic; font-size: 12px; }
      .time { font-size: 10px; color: #999; margin-top: 2px; }
      .footer { margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px; font-size: 11px; color: #999; }
    </style></head><body>
    <div class="header">
      <h1>Protocolo: ${c.id.split('-')[0].toUpperCase()}</h1>
      <div class="meta">
        <span><b>Contato:</b> ${c.contact_name} (${c.phone || ''})</span>
        <span><b>Agente:</b> ${c.agent_name || 'Não atribuído'}</span>
        <span><b>Time:</b> ${c.team_name || '-'}</span>
        <span><b>Status:</b> ${c.status}</span>
        <span><b>Aberta em:</b> ${new Date(c.created_at).toLocaleString('pt-BR')}</span>
        <span><b>Canal:</b> ${c.connection_name || 'web'}</span>
      </div>
    </div>
    ${msgs.map(m => `
      <div class="msg ${m.sender_type || 'contact'}">
        <div class="bubble">${(m.content || '').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
        <div class="time">${m.agent_name || m.sender_type || ''} · ${new Date(m.created_at).toLocaleString('pt-BR')}</div>
      </div>
    `).join('')}
    <div class="footer">Exportado em ${new Date().toLocaleString('pt-BR')} · MSX CRM</div>
    </body></html>`;

    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="conversa-${c.id.split('-')[0]}.html"`);
    return html;
  });

  // ── Team Routing Rules ────────────────────────────────────────────────────────
  fastify.get('/team-routing', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query(`
      SELECT tr.*, t.name as team_name, c.name as connection_display
      FROM team_routing tr
      LEFT JOIN teams t ON t.id=tr.team_id
      LEFT JOIN connections c ON c.name=tr.connection_name
      ORDER BY tr.priority ASC
    `);
    return rows;
  });

  fastify.post('/team-routing', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { team_id, connection_name, priority, active_days, start_time, end_time } = req.body;
    const { rows } = await query(
      'INSERT INTO team_routing (team_id, connection_name, priority, active_days, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [team_id, connection_name, priority || 1, active_days || [0,1,2,3,4,5,6], start_time || '00:00', end_time || '23:59']
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.patch('/team-routing/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { team_id, connection_name, priority, active_days, start_time, end_time, is_active } = req.body;
    const { rows } = await query(
      'UPDATE team_routing SET team_id=COALESCE($1,team_id), connection_name=COALESCE($2,connection_name), priority=COALESCE($3,priority), active_days=COALESCE($4,active_days), start_time=COALESCE($5,start_time), end_time=COALESCE($6,end_time), is_active=COALESCE($7,is_active) WHERE id=$8 RETURNING *',
      [team_id, connection_name, priority, active_days, start_time, end_time, is_active, req.params.id]
    );
    return rows[0];
  });

  fastify.delete('/team-routing/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await query('DELETE FROM team_routing WHERE id=$1', [req.params.id]);
    return { success: true };
  });

  // ── Session Timeout Settings ──────────────────────────────────────────────────
  fastify.get('/settings/session', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query("SELECT session_timeout_minutes FROM settings WHERE id=1");
    return { timeout_minutes: rows[0]?.session_timeout_minutes || 30 };
  });

  fastify.patch('/settings/session', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.status(403).send({ error: 'Forbidden' });
    const { timeout_minutes } = req.body;
    await query("UPDATE settings SET session_timeout_minutes=$1 WHERE id=1", [timeout_minutes]);
    return { success: true };
  });

  // ── Payment Links ─────────────────────────────────────────────────────────
  fastify.get('/payment-links', auth, async (req, reply) => {
    const { conversation_id } = req.query;
    let q = 'SELECT * FROM payment_links';
    const vals = [];
    if (conversation_id) { q += ' WHERE conversation_id=$1'; vals.push(conversation_id); }
    q += ' ORDER BY created_at DESC LIMIT 50';
    const { rows } = await query(q, vals);
    return rows;
  });

  fastify.post('/payment-links', auth, async (req, reply) => {
    const { conversation_id, amount, description, provider, external_url } = req.body;
    const { rows } = await query(
      "INSERT INTO payment_links (conversation_id, amount, description, provider, external_url, created_by, status) VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *",
      [conversation_id, amount, description, provider || 'manual', external_url || null, req.user.id]
    );

    // Send payment link via WhatsApp in the conversation
    if (conversation_id) {
      const { rows: conv } = await query(
        'SELECT cv.connection_name, ct.phone FROM conversations cv JOIN contacts ct ON ct.id=cv.contact_id WHERE cv.id=$1',
        [conversation_id]
      );
      if (conv[0] && external_url) {
        const msg = `💳 *Link de Pagamento*\n📋 ${description}\n💰 R$ ${parseFloat(amount).toFixed(2)}\n\n🔗 ${external_url}`;
        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${conv[0].connection_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
          body: JSON.stringify({ number: conv[0].phone, text: msg })
        }).catch(() => {});
        await query("INSERT INTO messages (conversation_id, content, sender_type) VALUES ($1,$2,'agent')", [conversation_id, msg]).catch(() => {});
      }
    }

    return rows[0];
  });

  fastify.patch('/payment-links/:id', auth, async (req, reply) => {
    const { status } = req.body;
    const { rows } = await query('UPDATE payment_links SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    return rows[0];
  });

  // ── Conversation Priority ─────────────────────────────────────────────────
  // Migration: ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
  fastify.patch('/conversations/:id/priority', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { priority } = req.body;
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) return reply.status(400).send({ error: 'Invalid priority' });
    const { rows } = await query('UPDATE conversations SET priority=$1 WHERE id=$2 RETURNING id, priority', [priority, req.params.id]);
    if (rows[0] && fastify.io) fastify.io.emit('conversation:updated', { id: rows[0].id, priority: rows[0].priority });
    return rows[0] || {};
  });

  // ── Pin Message ───────────────────────────────────────────────────────────
  // Migration: ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
  fastify.post('/conversations/:id/pin-message', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { message_id } = req.body;
    await query('UPDATE conversations SET pinned_message_id=$1 WHERE id=$2', [message_id, req.params.id]);
    const { rows } = await query('SELECT m.*, p.full_name as sender_name FROM messages m LEFT JOIN profiles p ON p.id=m.sender_id WHERE m.id=$1', [message_id]);
    if (fastify.io) fastify.io.emit('conversation:message_pinned', { conversation_id: req.params.id, message: rows[0] });
    return { success: true, message: rows[0] };
  });

  fastify.delete('/conversations/:id/pin-message', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await query('UPDATE conversations SET pinned_message_id=NULL WHERE id=$1', [req.params.id]);
    if (fastify.io) fastify.io.emit('conversation:message_unpinned', { conversation_id: req.params.id });
    return { success: true };
  });

  // ── AI Routing Settings ────────────────────────────────────────────────────
  fastify.get('/settings/ai-routing', auth, async (req, reply) => {
    const { rows } = await query("SELECT ai_routing_enabled FROM settings WHERE id=1");
    return { enabled: rows[0]?.ai_routing_enabled || false };
  });

  fastify.patch('/settings/ai-routing', auth, async (req, reply) => {
    const { enabled } = req.body;
    await query("UPDATE settings SET ai_routing_enabled=$1 WHERE id=1", [enabled]);
    return { success: true };
  });

  // ── ViaCEP proxy (avoid CORS) ──────────────────────────────────────────────
  fastify.get('/viacep/:cep', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const cep = req.params.cep.replace(/\D/g, '');
    if (cep.length !== 8) return reply.status(400).send({ error: 'CEP inválido' });
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) return reply.status(404).send({ error: 'CEP não encontrado' });
    return data;
  });

  // ── Conversation Transfer with Mandatory Note ──────────────────────────────
  fastify.post('/conversations/:id/transfer', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { agent_id, team_id, note } = req.body;
    if (!note || note.trim().length < 5) return reply.status(400).send({ error: 'Nota de transferência obrigatória (mínimo 5 caracteres)' });

    const updates = [];
    const vals = [];
    let i = 1;
    if (agent_id) { updates.push(`assigned_to=$${i++}`); vals.push(agent_id); }
    if (team_id) { updates.push(`assigned_team_id=$${i++}`); vals.push(team_id); }
    if (!updates.length) return reply.status(400).send({ error: 'Informe agente ou time' });

    vals.push(req.params.id);
    await query(`UPDATE conversations SET ${updates.join(',')} WHERE id=$${i}`, vals);

    // Save transfer note as an internal note
    await query(
      "INSERT INTO messages (conversation_id, content, sender_type, sender_id, metadata) VALUES ($1,$2,'note',$3,$4)",
      [req.params.id, `🔀 Transferência: ${note}`, req.user.id, JSON.stringify({ transfer_note: true, to_agent: agent_id, to_team: team_id })]
    );

    // Log event
    await query(
      "INSERT INTO conversation_events (conversation_id, event_type, actor_name, new_value) VALUES ($1,'transferred',$2,$3)",
      [req.params.id, req.user.full_name || req.user.id, note]
    ).catch(() => {});

    if (fastify.io) fastify.io.emit('conversation:transferred', { conversation_id: req.params.id, agent_id, team_id, note });

    return { success: true };
  });

  // ── Custom Field Definitions ──────────────────────────────────────────────
  fastify.get('/custom-fields', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query('SELECT * FROM custom_field_definitions ORDER BY position ASC');
    return rows;
  });

  fastify.post('/custom-fields', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!['admin', 'supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { label, field_type, options, required, position } = req.body;
    const { rows: maxPos } = await query('SELECT COALESCE(MAX(position),0) as max FROM custom_field_definitions');
    const { rows } = await query(
      'INSERT INTO custom_field_definitions (label, field_type, options, required, position) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [label, field_type || 'text', JSON.stringify(options || []), required || false, position || maxPos[0].max + 1]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.patch('/custom-fields/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!['admin', 'supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { label, field_type, options, required, position } = req.body;
    const { rows } = await query(
      'UPDATE custom_field_definitions SET label=COALESCE($1,label), field_type=COALESCE($2,field_type), options=COALESCE($3,options), required=COALESCE($4,required), position=COALESCE($5,position) WHERE id=$6 RETURNING *',
      [label, field_type, options ? JSON.stringify(options) : null, required, position, req.params.id]
    );
    return rows[0];
  });

  fastify.delete('/custom-fields/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!['admin', 'supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    await query('DELETE FROM custom_field_definitions WHERE id=$1', [req.params.id]);
    return { success: true };
  });

  // ── Contact Custom Field Values ───────────────────────────────────────────
  fastify.get('/contacts/:id/custom-fields', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows: defs } = await query('SELECT * FROM custom_field_definitions ORDER BY position ASC');
    const { rows: vals } = await query('SELECT * FROM contact_custom_values WHERE contact_id=$1', [req.params.id]);
    const valMap = {};
    vals.forEach(v => { valMap[v.field_id] = v.value; });
    return defs.map(d => ({ ...d, value: valMap[d.id] || null }));
  });

  fastify.post('/contacts/:id/custom-fields', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { field_id, value } = req.body;
    await query(
      'INSERT INTO contact_custom_values (contact_id, field_id, value) VALUES ($1,$2,$3) ON CONFLICT (contact_id, field_id) DO UPDATE SET value=$3',
      [req.params.id, field_id, value]
    );
    return { success: true };
  });

  // ── Template Approval Workflow ────────────────────────────────────────────
  fastify.get('/templates/pending', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!['admin','supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { rows } = await query(
      "SELECT t.*, p.full_name as created_by_name FROM quick_replies t LEFT JOIN profiles p ON p.id=t.created_by WHERE t.approval_status='pending' ORDER BY t.created_at DESC"
    );
    return rows;
  });

  fastify.patch('/templates/:id/approve', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!['admin','supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { approved, rejection_reason } = req.body;
    const status = approved ? 'approved' : 'rejected';
    await query(
      "UPDATE quick_replies SET approval_status=$1, approved_by=$2, approved_at=NOW(), rejection_reason=$3 WHERE id=$4",
      [status, req.user.id, rejection_reason || null, req.params.id]
    );
    if (fastify.io) fastify.io.emit('template:approval_updated', { id: req.params.id, status });
    return { success: true, status };
  });

  fastify.get('/settings/template-approval', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query("SELECT template_approval_required FROM settings WHERE id=1");
    return { enabled: rows[0]?.template_approval_required || false };
  });

  fastify.patch('/settings/template-approval', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.status(403).send({ error: 'Forbidden' });
    await query("UPDATE settings SET template_approval_required=$1 WHERE id=1", [req.body.enabled]);
    return { success: true };
  });

  // ── Login Sessions ────────────────────────────────────────────────────────
  fastify.get('/auth/sessions', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query(
      "SELECT id, ip_address, user_agent, created_at, logged_out_at FROM login_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
      [req.user.id]
    );
    return rows;
  });

  fastify.delete('/auth/sessions/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await query("UPDATE login_sessions SET logged_out_at=NOW() WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    return { success: true };
  });

  fastify.delete('/auth/sessions', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    await query("UPDATE login_sessions SET logged_out_at=NOW() WHERE user_id=$1 AND logged_out_at IS NULL", [req.user.id]);
    return { success: true };
  });

  // ── CSAT Config ────────────────────────────────────────────────────────────
  fastify.get('/settings/csat-config', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query("SELECT csat_enabled, csat_message, csat_delay_minutes FROM settings WHERE id=1");
    return rows[0] || {};
  });

  fastify.patch('/settings/csat-config', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { csat_message, csat_delay_minutes } = req.body;
    await query(
      "UPDATE settings SET csat_message=COALESCE($1,csat_message), csat_delay_minutes=COALESCE($2,csat_delay_minutes) WHERE id=1",
      [csat_message, csat_delay_minutes]
    );
    return { success: true };
  });

  // ── Shifts (Turnos) ───────────────────────────────────────────────────────
  fastify.get('/shifts', auth, async (req, reply) => {
    const { rows } = await query(`
      SELECT s.*,
        json_agg(json_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name) FILTER (WHERE p.id IS NOT NULL) as agents
      FROM shifts s
      LEFT JOIN shift_agents sa ON sa.shift_id = s.id
      LEFT JOIN profiles p ON p.id = sa.agent_id
      GROUP BY s.id ORDER BY s.start_time ASC
    `);
    return rows;
  });

  fastify.post('/shifts', auth, async (req, reply) => {
    if (!['admin','supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { name, start_time, end_time, days, agent_ids } = req.body;
    const { rows } = await query(
      'INSERT INTO shifts (name, start_time, end_time, days) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, start_time, end_time, days || [1,2,3,4,5]]
    );
    const shift = rows[0];
    if (agent_ids && agent_ids.length > 0) {
      for (const aid of agent_ids) {
        await query('INSERT INTO shift_agents (shift_id, agent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [shift.id, aid]);
      }
    }
    return reply.status(201).send(shift);
  });

  fastify.patch('/shifts/:id', auth, async (req, reply) => {
    if (!['admin','supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { name, start_time, end_time, days, agent_ids, is_active } = req.body;
    const { rows } = await query(
      'UPDATE shifts SET name=COALESCE($1,name), start_time=COALESCE($2,start_time), end_time=COALESCE($3,end_time), days=COALESCE($4,days), is_active=COALESCE($5,is_active) WHERE id=$6 RETURNING *',
      [name, start_time, end_time, days, is_active, req.params.id]
    );
    if (agent_ids !== undefined) {
      await query('DELETE FROM shift_agents WHERE shift_id=$1', [req.params.id]);
      for (const aid of agent_ids) {
        await query('INSERT INTO shift_agents (shift_id, agent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, aid]);
      }
    }
    return rows[0];
  });

  fastify.delete('/shifts/:id', auth, async (req, reply) => {
    if (!['admin','supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    await query('DELETE FROM shifts WHERE id=$1', [req.params.id]);
    return { success: true };
  });

  fastify.get('/shifts/current', auth, async (req, reply) => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const { rows } = await query(`
      SELECT s.*,
        json_agg(json_build_object('id', p.id, 'name', p.full_name)) FILTER (WHERE p.id IS NOT NULL) as agents
      FROM shifts s
      LEFT JOIN shift_agents sa ON sa.shift_id = s.id
      LEFT JOIN profiles p ON p.id = sa.agent_id
      WHERE s.is_active = true AND $1 = ANY(s.days) AND s.start_time <= $2 AND s.end_time >= $2
      GROUP BY s.id
    `, [currentDay, currentTime]);
    return rows[0] || null;
  });

  // ── Queue Position (public, no auth) ─────────────────────────────────────
  fastify.get('/queue/position/:conversation_id', async (req, reply) => {
    const { rows: conv } = await query(
      "SELECT id, assigned_to, assigned_team_id, created_at FROM conversations WHERE id=$1 AND status='open'",
      [req.params.conversation_id]
    );
    if (!conv[0]) return { position: 0, estimated_minutes: 0, assigned: true };

    const conv_ = conv[0];
    if (conv_.assigned_to) return { position: 0, estimated_minutes: 0, assigned: true };

    // Count conversations waiting before this one
    const { rows: waiting } = await query(`
      SELECT COUNT(*) as count FROM conversations
      WHERE status='open' AND assigned_to IS NULL
      AND created_at < $1
      AND ($2::uuid IS NULL OR assigned_team_id=$2)
    `, [conv_.created_at, conv_.assigned_team_id]);

    const position = parseInt(waiting[0].count) + 1;
    const { rows: avgTime } = await query(`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/60)::numeric, 0) as avg_min
      FROM conversations WHERE status='closed' AND closed_at > NOW() - interval '7 days'
    `);
    const avgMin = parseFloat(avgTime[0]?.avg_min || 10);

    return {
      position,
      estimated_minutes: Math.ceil(position * avgMin),
      assigned: false,
      queue_size: position
    };
  });

  fastify.get('/settings/queue-message', auth, async (req, reply) => {
    const { rows } = await query("SELECT queue_message_enabled, queue_message_text FROM settings WHERE id=1");
    return rows[0] || {};
  });

  fastify.patch('/settings/queue-message', auth, async (req, reply) => {
    const { enabled, text } = req.body;
    await query("UPDATE settings SET queue_message_enabled=$1, queue_message_text=$2 WHERE id=1", [enabled, text]);
    return { success: true };
  });

  // ── SLA por Categoria ─────────────────────────────────────────────────────
  fastify.get('/sla-categories', auth, async (req, reply) => {
    const { rows } = await query('SELECT * FROM sla_category_rules ORDER BY created_at ASC');
    return rows;
  });

  fastify.post('/sla-categories', auth, async (req, reply) => {
    if (!['admin','supervisor'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });
    const { category_name, sla_hours, priority } = req.body;
    const { rows } = await query(
      'INSERT INTO sla_category_rules (category_name, sla_hours, priority) VALUES ($1,$2,$3) ON CONFLICT (category_name) DO UPDATE SET sla_hours=$2, priority=$3 RETURNING *',
      [category_name, sla_hours, priority || 'normal']
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.delete('/sla-categories/:id', auth, async (req, reply) => {
    await query('DELETE FROM sla_category_rules WHERE id=$1', [req.params.id]);
    return { success: true };
  });

  // ── Voice Transcription (Whisper) ─────────────────────────────────────────
  fastify.post('/voice/transcribe', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'Arquivo de áudio não enviado' });

    const audioBuffer = await data.toBuffer();
    const filename = data.filename || 'audio.webm';

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: data.mimetype || 'audio/webm' });
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData
    });

    if (!response.ok) {
      const err = await response.text();
      return reply.status(500).send({ error: 'Falha na transcrição', details: err });
    }

    const result = await response.json();
    return { text: result.text };
  });

  // ── AI Copilot for Agents ─────────────────────────────────────────────────
  fastify.post('/ai/copilot', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { question, conversation_id, context_messages = 10 } = req.body;

    let conversationContext = '';
    if (conversation_id) {
      const { rows: msgs } = await query(
        "SELECT content, sender_type FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT $2",
        [conversation_id, context_messages]
      );
      conversationContext = msgs.reverse().map(m => `[${m.sender_type === 'agent' ? 'Agente' : 'Cliente'}]: ${m.content}`).join('\n');
    }

    const systemPrompt = `Você é um assistente especializado em atendimento ao cliente para um CRM de WhatsApp.
Ajude o agente a:
- Redigir respostas profissionais e empáticas
- Responder dúvidas sobre produtos/serviços
- Sugerir soluções para problemas
- Manter um tom cordial e profissional

${conversationContext ? `Contexto da conversa atual:\n${conversationContext}\n\n` : ''}Responda de forma concisa e útil.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }]
      })
    });

    const ai = await response.json();
    return { answer: ai.content?.[0]?.text || 'Não foi possível gerar resposta.' };
  });

}
