import { query, pool, withTransaction } from '../database.js';
import { cached, invalidate } from '../redis.js';
import { deliverWebhook } from '../jobs/webhookDelivery.js';
import { notifyConversationAssigned } from '../notifications/email.js';

export default async function conversationRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // List conversations — cursor-based pagination for performance
  // Use ?cursor=<last_message_at>_<id> to get next page (opaque cursor)
  fastify.get('/conversations', auth, async (req) => {
    const { status, assigned_to, search, limit = 50, connection_name, cursor, page } = req.query;
    const conditions = ['c.is_merged = false'];
    const params = [];
    let p = 1;

    if (status) { conditions.push(`c.status = $${p}`); params.push(status); p++; }
    if (assigned_to && assigned_to !== 'null') {
      const ids = assigned_to.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 1) {
        conditions.push(`c.assigned_to = $${p}`); params.push(ids[0]); p++;
      } else {
        const ph = ids.map((_, i) => `$${p + i}`).join(',');
        conditions.push(`c.assigned_to IN (${ph})`); params.push(...ids); p += ids.length;
      }
    }
    if (connection_name && connection_name !== 'null') { conditions.push(`c.connection_name = $${p}`); params.push(connection_name); p++; }
    if (search) {
      conditions.push(`(ct.name ILIKE $${p} OR ct.phone ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }

    // Cursor: encode as "<last_message_at>|<id>" for keyset pagination
    // Falls back to OFFSET for legacy callers that pass ?page=
    let cursorClause = '';
    if (cursor) {
      const [cursorTs, cursorId] = Buffer.from(cursor, 'base64url').toString().split('|');
      if (cursorTs && cursorId) {
        cursorClause = `AND (c.last_message_at < $${p} OR (c.last_message_at = $${p} AND c.id < $${p+1}))`;
        params.push(cursorTs, cursorId); p += 2;
      }
    }

    const where = conditions.join(' AND ');
    const lim = Math.min(parseInt(limit) || 50, 200);
    params.push(lim);

    // Legacy OFFSET fallback for ?page= callers
    let offsetClause = '';
    if (!cursor && page && parseInt(page) > 1) {
      const offset = (parseInt(page) - 1) * lim;
      offsetClause = `OFFSET $${p + 1}`;
      params.push(offset);
    }

    const sql = `
      SELECT c.*,
        c.connection_name as instance_name,
        ct.name as contact_name, ct.phone as contact_phone, ct.tags as contact_tags,
        ct.avatar_url as contact_avatar_url,
        jsonb_build_object('id', ct.id, 'name', ct.name, 'phone', ct.phone, 'tags', ct.tags, 'avatar_url', ct.avatar_url) as contacts,
        p.name as assigned_to_name, p.avatar_url as assigned_to_avatar,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_body
      FROM conversations c
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
      WHERE ${where} ${cursorClause}
      ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
      LIMIT $${p} ${offsetClause}
    `;

    // Only cache non-search, no-cursor first-page queries
    const cacheKey = !search && !cursor && (!page || page == 1)
      ? `conv:list:${status||'all'}:${assigned_to||'all'}:${connection_name||'all'}:${lim}`
      : null;

    const rows = cacheKey
      ? await cached(cacheKey, 20, () => query(sql, params).then(r => r.rows))
      : (await query(sql, params)).rows;

    // If caller requested cursor pagination, return { data, nextCursor }
    // Otherwise return plain array for backward compat with existing frontend
    if (cursor !== undefined) {
      const nextCursor = rows.length === lim && rows.at(-1)
        ? Buffer.from(`${rows.at(-1).last_message_at}|${rows.at(-1).id}`).toString('base64url')
        : null;
      return { data: rows, nextCursor };
    }
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
  // Bulk/filtered PATCH (from .in("id", ids) or .eq(field).in(field) calls)
  fastify.patch('/conversations', auth, async (req, reply) => {
    const ALLOWED_UPDATE = ['status','assigned_to','category_id','starred','unread_count','last_message_at','contact_id'];
    const updates = [];
    const params = [];
    let p = 1;
    for (const f of ALLOWED_UPDATE) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${p}`); params.push(req.body[f]); p++; }
    }
    if (!updates.length) return { ok: true };
    updates.push('updated_at = NOW()');

    const conditions = ['1=1'];
    // Filter by IDs list (from .in("id", ids))
    const { ids, assigned_to, status, contact_id } = req.query;
    if (ids) {
      const idList = String(ids).split(',').filter(Boolean);
      if (!idList.length) return { ok: true };
      const placeholders = idList.map((_, i) => `$${p + i}`).join(',');
      conditions.push(`id IN (${placeholders})`);
      params.push(...idList);
      p += idList.length;
    }
    // Filter by assigned_to (from .eq("assigned_to", uid))
    if (assigned_to) {
      conditions.push(`assigned_to = $${p}`);
      params.push(assigned_to);
      p++;
    }
    // Filter by contact_id (from deduplication: .eq("contact_id", secId))
    if (contact_id) {
      conditions.push(`contact_id = $${p}`);
      params.push(contact_id);
      p++;
    }
    // Filter by status (single or comma-separated from .in("status", [...]))
    if (status) {
      const statuses = String(status).split(',').filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(`status = $${p}`);
        params.push(statuses[0]);
        p++;
      } else if (statuses.length > 1) {
        const ph = statuses.map((_, i) => `$${p + i}`).join(',');
        conditions.push(`status IN (${ph})`);
        params.push(...statuses);
        p += statuses.length;
      }
    }
    // Safety: refuse to update ALL conversations if no meaningful filter provided
    if (conditions.length === 1) return reply.status(400).send({ error: 'Filtro obrigatório' });
    await query(`UPDATE conversations SET ${updates.join(',')} WHERE ${conditions.join(' AND ')}`, params);
    invalidate('conv:list:*').catch(() => {});
    return { ok: true };
  });

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

    // Snapshot old values for audit trail
    const { rows: oldRows } = await query('SELECT status, assigned_to FROM conversations WHERE id=$1', [req.params.id]);
    const oldConv = oldRows[0];

    const { rows } = await query(`UPDATE conversations SET ${updates.join(',')} WHERE id = $${p} RETURNING *`, params);
    if (!rows[0]) return reply.status(404).send({ error: 'Conversa não encontrada' });

    // ── Audit trail ──────────────────────────────────────────────────────────
    const actorName = req.user?.name || 'Sistema';
    if (req.body.status && oldConv?.status !== req.body.status) {
      query('INSERT INTO conversation_events (conversation_id, event_type, actor_id, actor_name, old_value, new_value) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id, 'status_changed', req.user?.id || null, actorName, oldConv?.status, req.body.status]).catch(() => {});
    }
    if (req.body.assigned_to !== undefined && oldConv?.assigned_to !== req.body.assigned_to) {
      const agentLabel = req.body.assigned_to
        ? (await query('SELECT name FROM profiles WHERE id=$1', [req.body.assigned_to]).catch(() => ({ rows: [] }))).rows[0]?.name || req.body.assigned_to
        : null;
      query('INSERT INTO conversation_events (conversation_id, event_type, actor_id, actor_name, old_value, new_value) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id, req.body.assigned_to ? 'assigned' : 'unassigned', req.user?.id || null, actorName, null, agentLabel]).catch(() => {});
    }

    // Emit realtime update + invalidate cache
    fastify.io?.emit('conversation:updated', rows[0]);
    invalidate('conv:list:*').catch(() => {});
    deliverWebhook.dispatchEvent('conversation.updated', rows[0]).catch(err => console.error('webhook dispatch failed:', err.message));

    // Socket + DB notification when assigned_to changes
    if (req.body.assigned_to) {
      const contactName = rows[0].contact_name || rows[0].contact_phone || 'Contato';
      query(
        "INSERT INTO notifications (user_id, type, title, message, metadata) VALUES ($1,'assignment','Nova conversa atribuída',$2,$3) RETURNING *",
        [req.body.assigned_to, `Conversa com ${contactName} foi atribuída a você`, JSON.stringify({ conversation_id: req.params.id })]
      ).then(({ rows: n }) => {
        if (n[0]) fastify.io?.to(`user:${req.body.assigned_to}`).emit('notification:new', n[0]);
      }).catch(() => {});
      notifyConversationAssigned({
        agentId: req.body.assigned_to,
        contactName,
        conversationId: req.params.id,
      }).catch(err => console.error('notifyConversationAssigned failed:', err.message));
    }

    // CSAT: send rating request when conversation closes with awaiting_csat=true
    if (req.body.status === 'closed' && rows[0].awaiting_csat) {
      query(`
        SELECT ct.phone, s.evolution_url, s.evolution_key, c.connection_name
        FROM conversations c JOIN contacts ct ON ct.id=c.contact_id, settings s
        WHERE c.id=$1 AND s.id=1
      `, [req.params.id]).then(async ({ rows: r }) => {
        const row = r[0];
        if (!row?.evolution_url || !row?.phone) return;
        await fetch(`${row.evolution_url}/message/sendText/${row.connection_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': row.evolution_key },
          body: JSON.stringify({ number: row.phone, text: '⭐ Como você avaliaria nosso atendimento?\nResponda com um número de *1* a *5*:\n\n1 - Muito ruim\n2 - Ruim\n3 - Regular\n4 - Bom\n5 - Excelente' }),
        }).catch(() => {});
      }).catch(() => {});
    }

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
    const note = await withTransaction(async (client) => {
      const { rows: profile } = await client.query('SELECT name FROM profiles WHERE id = $1', [req.user.id]);
      const { rows } = await client.query(
        'INSERT INTO conversation_notes (conversation_id, content, author_id, author_name, is_internal) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.params.id, content, req.user.id, profile[0]?.name, is_internal]
      );
      // Log audit event
      client.query('INSERT INTO conversation_events (conversation_id, event_type, actor_id, actor_name, new_value) VALUES ($1,$2,$3,$4,$5)',
        [req.params.id, 'note_added', req.user.id, profile[0]?.name, content.slice(0, 120)]).catch(() => {});
      return rows[0];
    });
    // Parse @mentions and notify tagged agents
    const mentions = [...(content.matchAll(/@(\w+[\w\s]*)/g) || [])].map(m => m[1].trim());
    if (mentions.length) {
      query(`SELECT id, name FROM profiles WHERE ${mentions.map((_, i) => `name ILIKE $${i+1}`).join(' OR ')}`,
        mentions.map(m => `%${m}%`)).then(({ rows: agents }) => {
        agents.forEach(agent => {
          query("INSERT INTO notifications (user_id, type, title, message, metadata) VALUES ($1,'mention','Você foi mencionado em uma nota',$2,$3)",
            [agent.id, `Mencionado na conversa ${req.params.id}`, JSON.stringify({ conversation_id: req.params.id, note: content.slice(0, 80) })]).then(({ rows: n }) => {
            if (n[0]) fastify.io?.to(`user:${agent.id}`).emit('notification:new', n[0]);
          }).catch(() => {});
        });
      }).catch(() => {});
    }
    return reply.status(201).send(note);
  });

  // Conversation audit trail
  fastify.get('/conversations/:id/events', auth, async (req) => {
    const { rows } = await query(
      'SELECT * FROM conversation_events WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    return rows;
  });

  // Export conversation as plain text
  fastify.get('/conversations/:id/export', auth, async (req, reply) => {
    const { rows: conv } = await query(`
      SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, p.name as agent_name
      FROM conversations c
      LEFT JOIN contacts ct ON ct.id=c.contact_id
      LEFT JOIN profiles p ON p.id=c.assigned_to
      WHERE c.id=$1
    `, [req.params.id]);
    if (!conv[0]) return reply.status(404).send({ error: 'Não encontrada' });
    const { rows: msgs } = await query(
      'SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    const c = conv[0];
    const header = `Conversa exportada — ${new Date().toLocaleString('pt-BR')}
Contato: ${c.contact_name || c.contact_phone}
Telefone: ${c.contact_phone}
Agente: ${c.agent_name || 'Não atribuído'}
Status: ${c.status}
Conexão: ${c.connection_name || '-'}
${'─'.repeat(60)}
`;
    const body = msgs.map(m => {
      const who = m.direction === 'outbound' ? (c.agent_name || 'Agente') : (c.contact_name || c.contact_phone);
      const time = new Date(m.created_at).toLocaleString('pt-BR');
      const text = m.media_url ? `[${m.type || 'mídia'}] ${m.media_url}` : (m.content || '');
      return `[${time}] ${who}:\n${text}`;
    }).join('\n\n');
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="conversa_${req.params.id.slice(0,8)}.txt"`);
    return header + body;
  });

  // Shim-compatible alias for conversation events (db.ts uses /conversation-events)
  fastify.get('/conversation-events', auth, async (req) => {
    const { conversation_id } = req.query;
    if (!conversation_id) return [];
    const { rows } = await query(
      'SELECT * FROM conversation_events WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 50',
      [conversation_id]
    );
    return rows;
  });

  // Pin/unpin note
  fastify.patch('/conversations/:id/notes/:noteId', auth, async (req, reply) => {
    const { is_pinned } = req.body;
    const { rows } = await query(
      'UPDATE conversation_notes SET is_pinned=$1 WHERE id=$2 AND conversation_id=$3 RETURNING *',
      [is_pinned, req.params.noteId, req.params.id]
    );
    if (!rows[0]) return reply.status(404).send({ error: 'Nota não encontrada' });
    return rows[0];
  });

  // Bulk assign conversations from one agent to another
  fastify.post('/conversations/bulk-assign', auth, async (req) => {
    const { from_user, to_user } = req.body;
    const { rowCount } = await query(
      "UPDATE conversations SET assigned_to = $1 WHERE assigned_to = $2 AND status IN ('open', 'attending')",
      [to_user, from_user]
    );
    return { updated: rowCount };
  });

  // Bulk close conversations for an agent
  fastify.post('/conversations/bulk-close', auth, async (req) => {
    const { user_id } = req.body;
    const { rowCount } = await query(
      "UPDATE conversations SET status = 'closed' WHERE assigned_to = $1 AND status IN ('open', 'attending')",
      [user_id]
    );
    return { updated: rowCount };
  });

  // ── Conversas aguardando resposta ──────────────────────────────────────────
  // Count of conversations where the last message is inbound (client waiting for agent reply)
  fastify.get('/conversations/pending-response/count', auth, async () => {
    const { rows } = await query(`
      SELECT COUNT(*)::int AS count
      FROM conversations c
      WHERE c.status != 'closed' AND c.is_merged = false
        AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
            AND m.direction = 'inbound'
            AND m.created_at = (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id)
        )
    `);
    return { count: rows[0]?.count ?? 0 };
  });

  // ── Scheduled Messages ────────────────────────────────────────────────────
  fastify.post('/conversations/:id/scheduled-messages', auth, async (req, reply) => {
    const { content, scheduled_at } = req.body;
    const { rows } = await query(
      'INSERT INTO scheduled_messages (conversation_id, content, scheduled_at, created_by, status) VALUES ($1,$2,$3,$4,'pending') RETURNING *',
      [req.params.id, content, scheduled_at, req.user.id]
    );
    return rows[0];
  });
  fastify.get('/conversations/:id/scheduled-messages', auth, async (req) => {
    const { rows } = await query('SELECT * FROM scheduled_messages WHERE conversation_id=$1 AND status='pending' ORDER BY scheduled_at ASC', [req.params.id]);
    return rows;
  });
  fastify.delete('/scheduled-messages/:id', auth, async (req) => {
    await query('DELETE FROM scheduled_messages WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

    fastify.get('/conversations/pending-response', auth, async (req) => {
    const { list } = req.query;
    if (list !== 'true') {
      const { rows } = await query(`
        SELECT COUNT(*)::int AS count
        FROM conversations c
        WHERE c.status != 'closed' AND c.is_merged = false
          AND EXISTS (
            SELECT 1 FROM messages m
            WHERE m.conversation_id = c.id
              AND m.direction = 'inbound'
              AND m.created_at = (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id)
          )
      `);
      return { count: rows[0]?.count ?? 0 };
    }
    const { rows } = await query(`
      SELECT c.id, c.contact_id, c.last_message_at,
        ct.name AS contact_name, ct.phone AS contact_phone,
        ct.avatar_url AS contact_avatar_url,
        jsonb_build_object('id',ct.id,'name',ct.name,'phone',ct.phone,'avatar_url',ct.avatar_url) AS contacts
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.status != 'closed' AND c.is_merged = false
        AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
            AND m.direction = 'inbound'
            AND m.created_at = (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id)
        )
      ORDER BY c.last_message_at ASC
      LIMIT 100
    `);
    return rows;
  });
}
