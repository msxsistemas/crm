import { query } from '../database.js';

export default async function miscRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Tags ──────────────────────────────────────────────────────────────────
  fastify.get('/tags', auth, async () => {
    const { rows } = await query('SELECT * FROM tags ORDER BY name');
    return rows;
  });
  fastify.post('/tags', auth, async (req, reply) => {
    const { name, color = '#3b82f6' } = req.body;
    const { rows } = await query('INSERT INTO tags (name, color) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET color=$2 RETURNING *', [name, color]);
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/tags/:id', auth, async (req) => {
    await query('DELETE FROM tags WHERE id = $1', [req.params.id]);
    return { ok: true };
  });

  // ── Categories ────────────────────────────────────────────────────────────
  fastify.get('/categories', auth, async () => {
    const { rows } = await query('SELECT * FROM categories ORDER BY name');
    return rows;
  });
  fastify.post('/categories', auth, async (req, reply) => {
    const { name, color } = req.body;
    const { rows } = await query('INSERT INTO categories (name, color) VALUES ($1,$2) RETURNING *', [name, color]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/categories/:id', auth, async (req) => {
    const { name, color } = req.body;
    const { rows } = await query('UPDATE categories SET name=COALESCE($1,name), color=COALESCE($2,color) WHERE id=$3 RETURNING *', [name, color, req.params.id]);
    return rows[0];
  });
  fastify.delete('/categories/:id', auth, async (req) => {
    await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    return { ok: true };
  });

  // ── Quick Replies ─────────────────────────────────────────────────────────
  fastify.get('/quick-replies', auth, async () => {
    const { rows } = await query('SELECT * FROM quick_replies ORDER BY title');
    return rows;
  });
  fastify.post('/quick-replies', auth, async (req, reply) => {
    const { title, content, tags } = req.body;
    const { rows } = await query('INSERT INTO quick_replies (title, content, tags) VALUES ($1,$2,$3) RETURNING *', [title, content, tags]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/quick-replies/:id', auth, async (req) => {
    const { title, content, tags } = req.body;
    const { rows } = await query('UPDATE quick_replies SET title=COALESCE($1,title), content=COALESCE($2,content), tags=COALESCE($3,tags) WHERE id=$4 RETURNING *', [title, content, tags, req.params.id]);
    return rows[0];
  });
  fastify.delete('/quick-replies/:id', auth, async (req) => {
    await query('DELETE FROM quick_replies WHERE id = $1', [req.params.id]);
    return { ok: true };
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  fastify.get('/notifications', auth, async (req) => {
    const { rows } = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    return rows;
  });
  fastify.patch('/notifications/:id/read', auth, async (req) => {
    await query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    return { ok: true };
  });
  fastify.post('/notifications/read-all', auth, async (req) => {
    await query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    return { ok: true };
  });

  // ── Settings ──────────────────────────────────────────────────────────────
  fastify.get('/settings', auth, async () => {
    const { rows } = await query('SELECT * FROM settings LIMIT 1');
    return rows[0] || {};
  });
  fastify.patch('/settings', auth, async (req) => {
    const keys = Object.keys(req.body);
    if (!keys.length) return {};
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const vals = keys.map(k => req.body[k]);
    vals.push(vals.length + 1);
    const { rows } = await query(`UPDATE settings SET ${sets}, updated_at = NOW() WHERE id = 1 RETURNING *`, vals);
    if (!rows[0]) {
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows: ins } = await query(`INSERT INTO settings (${cols}) VALUES (${placeholders}) RETURNING *`, keys.map(k => req.body[k]));
      return ins[0];
    }
    return rows[0];
  });

  // ── Connections (Evolution API instances) ─────────────────────────────────
  fastify.get('/connections', auth, async () => {
    const { rows } = await query('SELECT * FROM evolution_connections ORDER BY created_at DESC');
    return rows;
  });
  fastify.post('/connections', auth, async (req, reply) => {
    const { name, evolution_url, evolution_key, instance_name } = req.body;
    const { rows } = await query(
      'INSERT INTO evolution_connections (name, evolution_url, evolution_key, instance_name) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, evolution_url, evolution_key, instance_name]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.delete('/connections/:id', auth, async (req) => {
    await query('DELETE FROM evolution_connections WHERE id = $1', [req.params.id]);
    return { ok: true };
  });

  // ── Campaigns ────────────────────────────────────────────────────────────
  fastify.get('/campaigns', auth, async () => {
    const { rows } = await query('SELECT * FROM campaigns ORDER BY created_at DESC');
    return rows;
  });
  fastify.post('/campaigns', auth, async (req, reply) => {
    const { name, message, connection_name } = req.body;
    const { rows } = await query('INSERT INTO campaigns (name, message, connection_name, created_by) VALUES ($1,$2,$3,$4) RETURNING *', [name, message, connection_name, req.user.id]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/campaigns/:id', auth, async (req) => {
    const { name, message, status } = req.body;
    const { rows } = await query('UPDATE campaigns SET name=COALESCE($1,name), message=COALESCE($2,message), status=COALESCE($3,status), updated_at=NOW() WHERE id=$4 RETURNING *', [name, message, status, req.params.id]);
    return rows[0];
  });
  fastify.delete('/campaigns/:id', auth, async (req) => {
    await query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
    return { ok: true };
  });

  // ── Opportunities ─────────────────────────────────────────────────────────
  fastify.get('/opportunities', auth, async () => {
    const { rows } = await query('SELECT o.*, c.name as contact_name FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id ORDER BY o.created_at DESC');
    return rows;
  });
  fastify.post('/opportunities', auth, async (req, reply) => {
    const { title, contact_id, value, stage, probability, description } = req.body;
    const { rows } = await query('INSERT INTO opportunities (title, contact_id, value, stage, probability, description, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [title, contact_id, value, stage, probability, description, req.user.id]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/opportunities/:id', auth, async (req) => {
    const f = req.body; const { rows } = await query('UPDATE opportunities SET title=COALESCE($1,title), value=COALESCE($2,value), stage=COALESCE($3,stage), probability=COALESCE($4,probability), description=COALESCE($5,description), updated_at=NOW() WHERE id=$6 RETURNING *', [f.title, f.value, f.stage, f.probability, f.description, req.params.id]);
    return rows[0];
  });
  fastify.delete('/opportunities/:id', auth, async (req) => {
    await query('DELETE FROM opportunities WHERE id = $1', [req.params.id]); return { ok: true };
  });

  // ── Chatbot Rules ─────────────────────────────────────────────────────────
  fastify.get('/chatbot-rules', auth, async () => {
    const { rows } = await query('SELECT * FROM chatbot_rules ORDER BY created_at DESC');
    return rows;
  });
  fastify.post('/chatbot-rules', auth, async (req, reply) => {
    const { name, trigger, message, flow_data, connection_name, is_active } = req.body;
    const { rows } = await query('INSERT INTO chatbot_rules (name, trigger, message, flow_data, connection_name, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [name, trigger, message, flow_data ? JSON.stringify(flow_data) : null, connection_name, is_active ?? true]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/chatbot-rules/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE chatbot_rules SET name=COALESCE($1,name), trigger=COALESCE($2,trigger), message=COALESCE($3,message), flow_data=COALESCE($4,flow_data), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6 RETURNING *', [f.name, f.trigger, f.message, f.flow_data ? JSON.stringify(f.flow_data) : null, f.is_active, req.params.id]);
    return rows[0];
  });
  fastify.delete('/chatbot-rules/:id', auth, async (req) => {
    await query('DELETE FROM chatbot_rules WHERE id = $1', [req.params.id]); return { ok: true };
  });

  // ── Schedules ─────────────────────────────────────────────────────────────
  fastify.get('/schedules', auth, async (req) => {
    const { rows } = await query('SELECT * FROM schedules ORDER BY COALESCE(send_at, scheduled_at) ASC');
    return rows;
  });
  fastify.post('/schedules', auth, async (req, reply) => {
    const { contact_id, conversation_id, message, scheduled_at, send_at, connection_name, connection_id,
            contact_name, contact_phone, queue, open_ticket, create_note, repeat_interval, repeat_daily, repeat_count } = req.body;
    const { rows } = await query(
      `INSERT INTO schedules (contact_id, conversation_id, message, scheduled_at, send_at, connection_name, created_by,
        contact_name, contact_phone, queue, open_ticket, create_note, repeat_interval, repeat_daily, repeat_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [contact_id, conversation_id, message, scheduled_at, send_at, connection_name || connection_id, req.user.id,
       contact_name, contact_phone, queue, open_ticket || false, create_note || false,
       repeat_interval || 'none', repeat_daily || 'none', repeat_count || 'unlimited']
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/schedules/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE schedules SET status=COALESCE($1,status) WHERE id=$2 RETURNING *', [f.status, req.params.id]);
    return rows[0];
  });
  fastify.delete('/schedules/:id', auth, async (req) => {
    await query('DELETE FROM schedules WHERE id = $1', [req.params.id]); return { ok: true };
  });
}
