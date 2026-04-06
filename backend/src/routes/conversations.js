// Migration SQL (run manually on DB):
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS instance_name TEXT;
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_name TEXT;
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS message TEXT;
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_contacts INTEGER DEFAULT 0;
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0;
// ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;
// CREATE TABLE IF NOT EXISTS campaign_contacts (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE, contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE, UNIQUE(campaign_id, contact_id));
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_sent_at TIMESTAMPTZ;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_score INTEGER;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS csat_responded_at TIMESTAMPTZ;
// ALTER TABLE settings ADD COLUMN IF NOT EXISTS csat_enabled BOOLEAN DEFAULT false;
// ALTER TABLE settings ADD COLUMN IF NOT EXISTS csat_message TEXT;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sla_alerted BOOLEAN DEFAULT false;
// ALTER TABLE categories ADD COLUMN IF NOT EXISTS sla_hours INTEGER;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_conversations INTEGER;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS nps_sent_at TIMESTAMPTZ;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS nps_score INTEGER;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS nps_responded_at TIMESTAMPTZ;
// ALTER TABLE settings ADD COLUMN IF NOT EXISTS nps_enabled BOOLEAN DEFAULT false;
// ALTER TABLE settings ADD COLUMN IF NOT EXISTS nps_message TEXT;

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
        ct.is_blocked as contact_is_blocked,
        jsonb_build_object('id', ct.id, 'name', ct.name, 'phone', ct.phone, 'tags', ct.tags, 'avatar_url', ct.avatar_url, 'is_blocked', ct.is_blocked) as contacts,
        p.name as assigned_to_name, p.avatar_url as assigned_to_avatar,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_body,
        (SELECT COUNT(*) FROM conversations c2 WHERE c2.contact_id = c.contact_id) as contact_conv_count
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
    const { contact_id, connection_name, assigned_to, status = 'open', category_id } = req.body;
    const { rows } = await query(
      'INSERT INTO conversations (contact_id, connection_name, assigned_to, status, category_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [contact_id, connection_name, assigned_to, status, category_id || null]
    );
    const conv = rows[0];
    // Set SLA deadline if category has sla_hours
    if (category_id) {
      query(
        "UPDATE conversations SET sla_deadline=NOW() + interval '1 hour' * (SELECT sla_hours FROM categories WHERE id=$1 AND sla_hours IS NOT NULL) WHERE id=$2 AND (SELECT sla_hours FROM categories WHERE id=$1) IS NOT NULL",
        [category_id, conv.id]
      ).catch(() => {});
    }
    return reply.status(201).send(conv);
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

    // Update SLA deadline when category changes
    if (req.body.category_id) {
      query(
        "UPDATE conversations SET sla_deadline=NOW() + interval '1 hour' * cat.sla_hours FROM categories cat WHERE cat.id=$1 AND cat.sla_hours IS NOT NULL AND conversations.id=$2",
        [req.body.category_id, req.params.id]
      ).catch(() => {});

      // Check for category-specific SLA rule in sla_category_rules
      query(
        "SELECT sla_hours FROM sla_category_rules WHERE category_name=(SELECT name FROM categories WHERE id=$1)",
        [req.body.category_id]
      ).then(({ rows: catSla }) => {
        if (catSla[0]) {
          const slaDeadline = new Date(Date.now() + catSla[0].sla_hours * 3600000);
          query('UPDATE conversations SET sla_deadline=$1 WHERE id=$2', [slaDeadline, req.params.id]).catch(() => {});
        }
      }).catch(() => {});
    }

    // Emit realtime update + invalidate cache
    fastify.io?.emit('conversation:updated', rows[0]);
    invalidate('conv:list:*').catch(() => {});
    deliverWebhook.dispatchEvent('conversation.updated', rows[0]).catch(err => console.error('webhook dispatch failed:', err.message));

    // Fire integrations webhooks on status change
    if (req.body.status && oldConv?.status !== req.body.status) {
      (async () => {
        try {
          const { rows: integrations } = await query("SELECT * FROM integrations WHERE is_active=true");
          for (const integration of integrations) {
            const events = integration.events || [];
            const eventName = 'conversation.status_changed';
            if (events.length > 0 && !events.includes(eventName)) continue;
            await fetch(integration.webhook_url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(integration.secret_token ? { 'X-Webhook-Secret': integration.secret_token } : {})
              },
              body: JSON.stringify({
                event: eventName,
                platform: integration.platform,
                timestamp: new Date().toISOString(),
                data: { conversation_id: req.params.id, status: req.body.status }
              })
            }).catch(() => {});
          }
        } catch(e) {}
      })();
    }

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

    // CSAT automático: enviar mensagem CSAT ao fechar conversa se csat_enabled=true
    if (req.body.status === 'closed') {
      const { rows: sRows } = await query('SELECT csat_enabled, csat_message, csat_delay_minutes FROM settings WHERE id=1').catch(() => ({ rows: [] }));
      if (sRows[0]?.csat_enabled) {
        const { rows: cRows } = await query(
          'SELECT c.connection_name, ct.phone FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.id=$1',
          [req.params.id]
        ).catch(() => ({ rows: [] }));
        if (cRows[0]) {
          const csatMsg = sRows[0].csat_message || '⭐ Como foi seu atendimento?\nAvalie de 1 a 5:';
          const { rows: sEvo } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1').catch(() => ({ rows: [] }));
          if (sEvo[0]?.evolution_url) {
            const instanceName = cRows[0].connection_name;
            const contactPhone = cRows[0].phone;
            const evolutionUrl = sEvo[0].evolution_url;
            const evolutionKey = sEvo[0].evolution_key;

            const sendCsat = async () => {
              const buttons = [
                { buttonId: 'csat_1', buttonText: { displayText: '⭐ 1' }, type: 1 },
                { buttonId: 'csat_2', buttonText: { displayText: '⭐⭐ 2' }, type: 1 },
                { buttonId: 'csat_3', buttonText: { displayText: '⭐⭐⭐ 3' }, type: 1 },
              ];
              try {
                const btnRes = await fetch(`${evolutionUrl}/message/sendButtons/${instanceName}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
                  body: JSON.stringify({
                    number: contactPhone,
                    buttonMessage: { text: csatMsg, buttons, headerType: 1 }
                  })
                });
                if (!btnRes.ok) throw new Error('buttons failed');
              } catch {
                // Fallback to plain text
                await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
                  body: JSON.stringify({ number: contactPhone, text: `${csatMsg}\nDigite um número de 1 a 5.` })
                }).catch(() => {});
              }
              query('UPDATE conversations SET csat_sent_at=NOW() WHERE id=$1', [req.params.id]).catch(() => {});
            };

            const delayMs = (sRows[0].csat_delay_minutes || 0) * 60 * 1000;
            if (delayMs > 0) {
              setTimeout(sendCsat, delayMs);
            } else {
              sendCsat().catch(() => {});
            }
          }
        }
      }
    }

    // NPS automático: enviar pesquisa NPS ao fechar conversa se nps_enabled=true
    if (req.body.status === 'closed') {
      const { rows: npsSettings } = await query('SELECT nps_enabled, nps_message FROM settings WHERE id=1').catch(() => ({ rows: [] }));
      if (npsSettings[0]?.nps_enabled) {
        const npsMsg = npsSettings[0].nps_message || 'Em uma escala de 0 a 10, quanto você recomendaria nosso atendimento? Responda apenas com o número.';
        try {
          const { rows: cRows2 } = await query(
            'SELECT c.connection_name, ct.phone FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.id=$1',
            [req.params.id]
          );
          if (cRows2[0]) {
            const { rows: sEvo2 } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1').catch(() => ({ rows: [] }));
            if (sEvo2[0]?.evolution_url) {
              fetch(`${sEvo2[0].evolution_url}/message/sendText/${cRows2[0].connection_name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': sEvo2[0].evolution_key },
                body: JSON.stringify({ number: cRows2[0].phone, text: npsMsg })
              }).catch(() => {});
              query('UPDATE conversations SET nps_sent_at=NOW() WHERE id=$1', [req.params.id]).catch(() => {});
            }
          }
        } catch (e) { /* silent */ }
      }
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

  // Pin/unpin note or update note content (with version auto-save)
  fastify.patch('/conversations/:id/notes/:noteId', auth, async (req, reply) => {
    const { is_pinned, content } = req.body;
    const updates = [];
    const params = [];
    let p = 1;

    // If content is being updated, save old version first
    if (content !== undefined) {
      const { rows: oldNote } = await query(
        'SELECT content FROM conversation_notes WHERE id=$1 AND conversation_id=$2',
        [req.params.noteId, req.params.id]
      );
      if (oldNote[0] && oldNote[0].content !== content) {
        await query(
          'INSERT INTO note_versions (note_id, content, edited_by) VALUES ($1,$2,$3)',
          [req.params.noteId, oldNote[0].content, req.user.id]
        ).catch(() => {});
      }
      updates.push(`content = $${p}`); params.push(content); p++;
    }

    if (is_pinned !== undefined) { updates.push(`is_pinned = $${p}`); params.push(is_pinned); p++; }
    if (!updates.length) return reply.status(400).send({ error: 'Nada para atualizar' });

    params.push(req.params.noteId);
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE conversation_notes SET ${updates.join(', ')} WHERE id=$${p} AND conversation_id=$${p + 1} RETURNING *`,
      params
    );
    if (!rows[0]) return reply.status(404).send({ error: 'Nota não encontrada' });
    return rows[0];
  });

  // SLA violated conversations
  fastify.get('/conversations/sla-violated', auth, async (req) => {
    const { rows } = await query(`
      SELECT c.*, ct.name as contact_name, ct.phone as contact_phone
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.status='open' AND c.sla_deadline IS NOT NULL AND c.sla_deadline < NOW()
      ORDER BY c.sla_deadline ASC
      LIMIT 50
    `);
    return rows;
  });

  // Bulk archive conversations
  fastify.post('/conversations/archive-bulk', auth, async (req) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return { ok: true };
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await query(`UPDATE conversations SET status='archived', updated_at=NOW() WHERE id IN (${placeholders})`, ids);
    invalidate('conv:list:*').catch(() => {});
    return { ok: true, count: ids.length };
  });

  // Send audio (base64) via Evolution API
  fastify.post('/conversations/:id/send-audio', auth, async (req, reply) => {
    const { audio_base64, mime_type } = req.body;
    const { rows } = await query(
      'SELECT c.connection_name AS instance_name, ct.phone FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.id=$1',
      [req.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    const { rows: settings } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
    const s = settings[0];
    if (!s?.evolution_url) return reply.code(400).send({ error: 'Evolution API não configurada' });
    const resp = await fetch(`${s.evolution_url}/message/sendMedia/${rows[0].instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': s.evolution_key },
      body: JSON.stringify({
        number: rows[0].phone,
        mediatype: 'audio',
        media: audio_base64,
        fileName: 'audio.ogg',
        mimetype: mime_type || 'audio/ogg',
      }),
    });
    return { ok: resp.ok };
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
      'INSERT INTO scheduled_messages (conversation_id, content, scheduled_at, created_by, status) VALUES ($1,$2,$3,$4,\'pending\') RETURNING *',
      [req.params.id, content, scheduled_at, req.user.id]
    );
    return rows[0];
  });
  fastify.get('/conversations/:id/scheduled-messages', auth, async (req) => {
    const { rows } = await query('SELECT * FROM scheduled_messages WHERE conversation_id=$1 AND status=\'pending\' ORDER BY scheduled_at ASC', [req.params.id]);
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

  // ── Supervisor Live Dashboard ──────────────────────────────────────────────
  fastify.get('/supervisor/live', auth, async (req) => {
    const { rows: queue } = await query(`
      SELECT c.id, c.created_at, c.last_message_at, c.unread_count, c.sla_deadline,
             ct.name as contact_name, ct.phone as contact_phone,
             c.connection_name as instance_name, c.category_id, cat.name as category_name,
             p.name as agent_name, p.id as agent_id, p.status as agent_status
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
      LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE c.status = 'open'
      ORDER BY c.last_message_at DESC
      LIMIT 200
    `);

    const { rows: agentStats } = await query(`
      SELECT p.id, p.name as full_name, p.status, p.avatar_url, p.max_conversations,
             COUNT(c.id) FILTER (WHERE c.status='open') as open_count,
             COUNT(c.id) FILTER (WHERE c.status='closed' AND c.closed_at > NOW() - interval '24 hours') as closed_today
      FROM profiles p
      LEFT JOIN conversations c ON c.assigned_to = p.id
      WHERE p.role IN ('agent','supervisor')
      GROUP BY p.id, p.name, p.status, p.avatar_url, p.max_conversations
      ORDER BY open_count DESC
    `);

    return { queue, agentStats };
  });

  // Mass campaign dispatch
  fastify.post('/campaigns/:id/dispatch', auth, async (req, reply) => {
    const { rows: campaign } = await query('SELECT * FROM campaigns WHERE id=$1', [req.params.id]);
    if (!campaign[0]) return reply.code(404).send({ error: 'Not found' });

    const { rows: contacts } = await query(`
      SELECT DISTINCT ct.id, ct.phone, ct.name
      FROM campaign_contacts cc
      JOIN contacts ct ON ct.id = cc.contact_id
      WHERE cc.campaign_id = $1 AND ct.phone IS NOT NULL
    `, [req.params.id]);

    if (!contacts.length) return { ok: true, sent: 0 };

    await query("UPDATE campaigns SET status='sending', started_at=NOW(), total_contacts=$1 WHERE id=$2", [contacts.length, req.params.id]);

    const instance = campaign[0].instance_name || campaign[0].connection_name;
    const template = campaign[0].template_name;
    const message = campaign[0].message || campaign[0].message_template;

    (async () => {
      let sent = 0, failed = 0;
      for (const contact of contacts) {
        try {
          if (template) {
            await fetch(`${process.env.EVOLUTION_API_URL}/message/sendTemplate/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
              body: JSON.stringify({ number: contact.phone, template: { name: template, language: { code: 'pt_BR' }, components: [] } })
            });
          } else if (message) {
            await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
              body: JSON.stringify({ number: contact.phone, text: message })
            });
          }
          sent++;
          await query("UPDATE campaigns SET sent_count=$1 WHERE id=$2", [sent, req.params.id]);
          await new Promise(r => setTimeout(r, 1500));
        } catch(e) {
          failed++;
          await query("UPDATE campaigns SET failed_count=$1 WHERE id=$2", [failed, req.params.id]);
        }
      }
      await query("UPDATE campaigns SET status='completed', completed_at=NOW() WHERE id=$1", [req.params.id]);
    })();

    return { ok: true, total: contacts.length };
  });

  // Add contacts to campaign from segment
  fastify.post('/campaigns/:id/add-from-segment', auth, async (req, reply) => {
    const { segment_id } = req.body;
    const segResult = await query(`
      SELECT DISTINCT ct.id FROM contacts ct
      JOIN contact_segments cs ON cs.contact_id = ct.id
      WHERE cs.segment_id = $1
    `, [segment_id]).catch(() => ({ rows: [] }));

    const segContacts = segResult.rows;
    if (!segContacts.length) return { added: 0 };

    const values = segContacts.map((c, i) => `($1,$${i+2})`).join(',');
    const params = [req.params.id, ...segContacts.map(c => c.id)];
    await query(`INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ${values} ON CONFLICT DO NOTHING`, params);
    return { added: segContacts.length };
  });

  // Get campaign dispatch status
  fastify.get('/campaigns/:id/status', auth, async (req, reply) => {
    const { rows } = await query('SELECT id, status, sent_count, failed_count, total_contacts, started_at, completed_at FROM campaigns WHERE id=$1', [req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });
}
