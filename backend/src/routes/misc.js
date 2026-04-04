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

  // ── Contact Tags ──────────────────────────────────────────────────────────
  fastify.get('/contact-tags', auth, async (req) => {
    const { contact_id } = req.query;
    if (contact_id) {
      const { rows } = await query('SELECT * FROM contact_tags WHERE contact_id = $1', [contact_id]);
      return rows;
    }
    // Return all contact_tags (for building the contact->tags map in Inbox)
    const { rows } = await query('SELECT contact_id, tag_id, created_at FROM contact_tags ORDER BY created_at ASC');
    return rows;
  });
  fastify.post('/contact-tags', auth, async (req, reply) => {
    const { contact_id, tag_id } = req.body;
    const { rows } = await query('INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *', [contact_id, tag_id]);
    return reply.status(201).send(rows[0] || {});
  });
  fastify.delete('/contact-tags', auth, async (req) => {
    const { contact_id, tag_id } = req.query;
    await query('DELETE FROM contact_tags WHERE contact_id=$1 AND tag_id=$2', [contact_id, tag_id]);
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

  // ── Kanban ────────────────────────────────────────────────────────────────
  fastify.get('/kanban-boards', auth, async (req) => {
    const { rows } = await query('SELECT * FROM kanban_boards WHERE user_id = $1 ORDER BY created_at ASC', [req.user.id]);
    return rows;
  });
  fastify.post('/kanban-boards', auth, async (req, reply) => {
    const { name, is_default } = req.body;
    const { rows } = await query('INSERT INTO kanban_boards (user_id, name, is_default) VALUES ($1,$2,$3) RETURNING *', [req.user.id, name, is_default ?? false]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/kanban-boards/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE kanban_boards SET name=COALESCE($1,name), is_default=COALESCE($2,is_default), updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING *', [f.name, f.is_default, req.params.id, req.user.id]);
    return rows[0];
  });
  fastify.delete('/kanban-boards/:id', auth, async (req) => {
    await query('DELETE FROM kanban_boards WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });

  fastify.get('/kanban-columns', auth, async (req) => {
    const { board_id } = req.query;
    if (board_id) {
      // Support comma-separated board_ids (from .in() filter)
      const ids = String(board_id).split(',').filter(Boolean);
      if (ids.length === 1) {
        const { rows } = await query('SELECT * FROM kanban_columns WHERE board_id = $1 ORDER BY position ASC', [ids[0]]);
        return rows;
      }
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await query(`SELECT * FROM kanban_columns WHERE board_id IN (${placeholders}) ORDER BY position ASC`, ids);
      return rows;
    }
    const { rows } = await query('SELECT kc.* FROM kanban_columns kc JOIN kanban_boards kb ON kb.id = kc.board_id WHERE kb.user_id = $1 ORDER BY kc.position ASC', [req.user.id]);
    return rows;
  });
  fastify.post('/kanban-columns', auth, async (req, reply) => {
    const { board_id, name, color, position, is_default, is_finalized } = req.body;
    if (Array.isArray(req.body)) {
      const inserted = [];
      for (const col of req.body) {
        const { rows } = await query('INSERT INTO kanban_columns (board_id, name, color, position, is_default, is_finalized) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [col.board_id, col.name, col.color || '#3B82F6', col.position || 0, col.is_default ?? false, col.is_finalized ?? false]);
        inserted.push(rows[0]);
      }
      return reply.status(201).send(inserted);
    }
    const { rows } = await query('INSERT INTO kanban_columns (board_id, name, color, position, is_default, is_finalized) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [board_id, name, color || '#3B82F6', position || 0, is_default ?? false, is_finalized ?? false]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/kanban-columns/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE kanban_columns SET name=COALESCE($1,name), color=COALESCE($2,color), position=COALESCE($3,position), is_finalized=COALESCE($4,is_finalized), updated_at=NOW() WHERE id=$5 RETURNING *', [f.name, f.color, f.position, f.is_finalized, req.params.id]);
    return rows[0];
  });
  fastify.delete('/kanban-columns/:id', auth, async (req) => {
    await query('DELETE FROM kanban_columns WHERE id=$1', [req.params.id]); return { ok: true };
  });

  fastify.get('/kanban-cards', auth, async (req) => {
    const { column_id, board_id } = req.query;
    if (column_id) {
      const ids = Array.isArray(column_id) ? column_id : column_id.split(',');
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await query(`SELECT kc.*, c.name as contact_name, c.phone as contact_phone FROM kanban_cards kc LEFT JOIN contacts c ON c.id = kc.contact_id WHERE kc.column_id IN (${placeholders}) ORDER BY kc.position ASC, kc.created_at ASC`, ids);
      return rows;
    }
    if (board_id) {
      // Support comma-separated board_ids (from .in() filter)
      const boardIds = String(board_id).split(',').filter(Boolean);
      if (boardIds.length === 1) {
        const { rows } = await query('SELECT kc.*, c.name as contact_name, c.phone as contact_phone FROM kanban_cards kc JOIN kanban_columns col ON col.id = kc.column_id LEFT JOIN contacts c ON c.id = kc.contact_id WHERE col.board_id = $1 ORDER BY kc.position ASC', [boardIds[0]]);
        return rows;
      }
      const ph = boardIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await query(`SELECT kc.*, c.name as contact_name, c.phone as contact_phone FROM kanban_cards kc JOIN kanban_columns col ON col.id = kc.column_id LEFT JOIN contacts c ON c.id = kc.contact_id WHERE col.board_id IN (${ph}) ORDER BY kc.position ASC`, boardIds);
      return rows;
    }
    return [];
  });
  fastify.post('/kanban-cards', auth, async (req, reply) => {
    const b = Array.isArray(req.body) ? req.body : [req.body];
    const inserted = [];
    for (const card of b) {
      const { rows } = await query('INSERT INTO kanban_cards (column_id, board_id, contact_id, name, phone, value, priority, tags, labels, assigned_to, due_date, notes, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *', [card.column_id, card.board_id, card.contact_id, card.name, card.phone, card.value || 0, card.priority || 'medium', card.tags || [], card.labels || [], card.assigned_to, card.due_date, card.notes, card.position || 0]);
      inserted.push(rows[0]);
    }
    return reply.status(201).send(b.length === 1 ? inserted[0] : inserted);
  });
  fastify.patch('/kanban-cards/:id', auth, async (req) => {
    const f = req.body;
    const allowed = ['column_id','board_id','name','phone','value','priority','tags','labels','assigned_to','due_date','notes','position'];
    const updates = []; const params = []; let p = 1;
    for (const k of allowed) { if (f[k] !== undefined) { updates.push(`${k}=$${p}`); params.push(f[k]); p++; } }
    if (!updates.length) return {};
    updates.push(`updated_at=NOW()`);
    params.push(req.params.id);
    const { rows } = await query(`UPDATE kanban_cards SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params);
    return rows[0];
  });
  fastify.delete('/kanban-cards/:id', auth, async (req) => {
    await query('DELETE FROM kanban_cards WHERE id=$1', [req.params.id]); return { ok: true };
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
