import { query } from '../database.js';

export default async function conversationRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // List conversations
  fastify.get('/conversations', auth, async (req) => {
    const { status, assigned_to, search, page = 1, limit = 50, connection_name } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['c.is_merged = false'];
    const params = [];
    let p = 1;

    if (status) { conditions.push(`c.status = $${p}`); params.push(status); p++; }
    if (assigned_to && assigned_to !== 'null') { conditions.push(`c.assigned_to = $${p}`); params.push(assigned_to); p++; }
    if (connection_name && connection_name !== 'null') { conditions.push(`c.connection_name = $${p}`); params.push(connection_name); p++; }
    if (search) {
      conditions.push(`(ct.name ILIKE $${p} OR ct.phone ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }

    const where = conditions.join(' AND ');
    const { rows } = await query(`
      SELECT c.*,
        c.connection_name as instance_name,
        ct.name as contact_name, ct.phone as contact_phone, ct.tags as contact_tags,
        jsonb_build_object('id', ct.id, 'name', ct.name, 'phone', ct.phone, 'tags', ct.tags) as contacts,
        p.name as assigned_to_name, p.avatar_url as assigned_to_avatar
      FROM conversations c
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
      WHERE ${where}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT $${p} OFFSET $${p+1}
    `, [...params, limit, offset]);

    const { rows: countRows } = await query(`
      SELECT COUNT(*) FROM conversations c
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE ${where}
    `, params);

    return rows;
  });

  // Get single conversation
  fastify.get('/conversations/:id', auth, async (req, reply) => {
    const { rows } = await query(`
      SELECT c.*,
        c.connection_name as instance_name,
        ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email,
        ct.tags as contact_tags, ct.custom_fields, ct.birthday, ct.lead_score,
        jsonb_build_object('id', ct.id, 'name', ct.name, 'phone', ct.phone, 'email', ct.email, 'tags', ct.tags, 'birthday', ct.birthday, 'lead_score', ct.lead_score) as contacts,
        p.name as assigned_to_name
      FROM conversations c
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
      WHERE c.id = $1
    `, [req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Conversa não encontrada' });
    return rows[0];
  });

  // Create conversation
  fastify.post('/conversations', auth, async (req, reply) => {
    const { contact_id, connection_name, assigned_to, status = 'open' } = req.body;
    const { rows } = await query(
      'INSERT INTO conversations (contact_id, connection_name, assigned_to, status) VALUES ($1,$2,$3,$4) RETURNING *',
      [contact_id, connection_name, assigned_to, status]
    );
    return reply.status(201).send(rows[0]);
  });

  // Update conversation
  fastify.patch('/conversations/:id', auth, async (req, reply) => {
    const allowed = ['status','assigned_to','category_id','starred','sentiment','label_ids','awaiting_csat','is_merged','merged_into','unread_count','connection_name','last_message_at'];
    const updates = [];
    const params = [];
    let p = 1;

    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${p}`);
        params.push(req.body[f]); p++;
      }
    }
    if (!updates.length) return reply.status(400).send({ error: 'Nada para atualizar' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await query(`UPDATE conversations SET ${updates.join(',')} WHERE id = $${p} RETURNING *`, params);
    if (!rows[0]) return reply.status(404).send({ error: 'Conversa não encontrada' });

    // Emit realtime update
    fastify.io?.emit('conversation:updated', rows[0]);
    return rows[0];
  });

  // Status counts
  fastify.get('/conversations/stats/counts', auth, async (req) => {
    const { rows } = await query(`
      SELECT status, COUNT(*) as count FROM conversations
      WHERE is_merged = false
      GROUP BY status
    `);
    const result = { open: 0, in_progress: 0, closed: 0 };
    rows.forEach(r => { result[r.status] = parseInt(r.count); });
    return result;
  });

  // Notes
  fastify.get('/conversations/:id/notes', auth, async (req) => {
    const { rows } = await query(
      'SELECT * FROM conversation_notes WHERE conversation_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    return rows;
  });

  fastify.post('/conversations/:id/notes', auth, async (req, reply) => {
    const { content, is_internal = true } = req.body;
    const { rows: profile } = await query('SELECT name FROM profiles WHERE id = $1', [req.user.id]);
    const { rows } = await query(
      'INSERT INTO conversation_notes (conversation_id, content, author_id, author_name, is_internal) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, content, req.user.id, profile[0]?.name, is_internal]
    );
    return reply.status(201).send(rows[0]);
  });
}
