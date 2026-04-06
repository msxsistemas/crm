import { query, pool } from '../database.js';
import { sendMetaMessage } from './meta-whatsapp.js';
import { enqueueSend } from '../jobs/messageQueue.js';
import { deliverWebhook } from '../jobs/webhookDelivery.js';

export default async function messageRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // List messages for a conversation
  fastify.get('/conversations/:id/messages', auth, async (req) => {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT *, content as body, (direction = 'outbound') as from_me FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    return rows;
  });

  // Generic /messages route — supports ?conversation_id=, ?search=, ?conversation_id=a,b,c (last msg per convo)
  fastify.get('/messages', auth, async (req) => {
    const { conversation_id, limit: lim = 50, search } = req.query;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Full-text search across all messages
    if (search) {
      const { rows } = await query(
        `SELECT m.*, m.content as body, (m.direction='outbound') as from_me,
                c.contact_id,
                ct.name as contact_name, ct.phone as contact_phone
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contacts ct ON ct.id = c.contact_id
         WHERE to_tsvector('portuguese', COALESCE(m.content,'')) @@ plainto_tsquery('portuguese', $1)
            OR m.content ILIKE $2
         ORDER BY m.created_at DESC LIMIT 20`,
        [search, `%${search}%`]
      );
      return rows;
    }

    // Multi-conversation last-message fetch (comma-separated IDs)
    if (conversation_id && conversation_id.includes(',')) {
      const ids = conversation_id.split(',').filter(id => UUID_RE.test(id.trim())).map(id => id.trim());
      if (!ids.length) return [];
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await query(
        `SELECT DISTINCT ON (conversation_id) conversation_id, content, created_at, direction
         FROM messages WHERE conversation_id IN (${placeholders})
         ORDER BY conversation_id, created_at DESC`,
        ids
      );
      return rows;
    }

    if (!conversation_id || !UUID_RE.test(conversation_id)) return [];
    const { rows } = await query(
      `SELECT *, content as body, (direction = 'outbound') as from_me FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [conversation_id, lim]
    );
    return rows;
  });

  // ── Message reactions ──────────────────────────────────────────────────────
  fastify.get('/message-reactions', auth, async (req) => {
    const { message_id, conversation_id } = req.query;
    if (conversation_id) {
      const { rows } = await query(
        `SELECT mr.* FROM message_reactions mr
         JOIN messages m ON m.id = mr.message_id
         WHERE m.conversation_id = $1`,
        [conversation_id]
      );
      return rows;
    }
    if (message_id) {
      const { rows } = await query('SELECT * FROM message_reactions WHERE message_id=$1', [message_id]);
      return rows;
    }
    return [];
  });

  fastify.post('/message-reactions', auth, async (req, reply) => {
    const { message_id, emoji } = req.body;
    const user_id = req.user.id;
    // Upsert: if same user+message+emoji exists, toggle off; else insert
    const { rows: existing } = await query(
      'SELECT id FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3',
      [message_id, user_id, emoji]
    );
    if (existing[0]) {
      await query('DELETE FROM message_reactions WHERE id=$1', [existing[0].id]);
      return reply.status(200).send({ deleted: true });
    }
    const { rows } = await query(
      'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3) RETURNING *',
      [message_id, user_id, emoji]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.delete('/message-reactions/:id', auth, async (req) => {
    await query('DELETE FROM message_reactions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });

  // Generic POST /messages for shim compatibility (Inbox page sends here)
  fastify.post('/messages', auth, async (req, reply) => {
    const { conversation_id, body, content, from_me, direction, type = 'text', media_url, media_type, status } = req.body;
    const convId = conversation_id;
    const msgContent = content || body || '';
    const msgDirection = from_me === true ? 'outbound' : (from_me === false ? 'inbound' : (direction || 'outbound'));
    const msgType = media_type || type;

    const { rows } = await query(
      `INSERT INTO messages (conversation_id, content, direction, type, media_url) VALUES ($1,$2,$3,$4,$5) RETURNING *, content as body, (direction = 'outbound') as from_me`,
      [convId, msgContent, msgDirection, msgType, media_url]
    );
    await query('UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1', [convId]);
    fastify.io?.to(`conversation:${convId}`).emit('message:new', rows[0]);
    return reply.status(201).send(rows[0]);
  });

  // Send message (text/audio/file)
  fastify.post('/conversations/:id/messages', {
    preHandler: fastify.authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          content: { type: 'string', maxLength: 65535 },
          type: { type: 'string', enum: ['text', 'image', 'video', 'audio', 'document', 'template'] },
          media_url: { type: 'string', maxLength: 2048, nullable: true },
          quoted_message_id: { type: 'string', nullable: true },
        },
      },
    },
  }, async (req, reply) => {
    const { content, type = 'text', media_url, quoted_message_id } = req.body;
    const convId = req.params.id;

    // Get conversation + contact + connection settings + meta connection
    const { rows: convRows } = await query(`
      SELECT c.*, ct.phone, s.evolution_url, s.evolution_key,
             mc.phone_number_id as meta_phone_number_id, mc.access_token as meta_access_token
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN settings s ON s.id = 1
      LEFT JOIN meta_connections mc ON mc.phone_number_id = c.connection_name
      WHERE c.id = $1
    `, [convId]);
    const conv = convRows[0];
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' });

    // Save message to DB
    const { rows } = await query(
      'INSERT INTO messages (conversation_id, content, direction, type, media_url, quoted_message_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [convId, content, 'outbound', type, media_url, quoted_message_id]
    );
    const message = rows[0];

    // Update conversation last_message_at
    await query('UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1', [convId]);

    // Enqueue send (with automatic retry on failure)
    if (conv.meta_phone_number_id && conv.meta_access_token) {
      await enqueueSend({
        conversationId: convId,
        messageId: message.id,
        phone: conv.phone,
        content, type, mediaUrl: media_url,
        provider: 'meta',
        phoneNumberId: conv.meta_phone_number_id,
        accessToken: conv.meta_access_token,
      }).catch(e => console.error('Enqueue error:', e.message));
    } else if (conv.evolution_url && conv.connection_name) {
      await enqueueSend({
        conversationId: convId,
        messageId: message.id,
        phone: conv.phone,
        content, type, mediaUrl: media_url,
        provider: 'evolution',
        evolutionUrl: conv.evolution_url,
        evolutionKey: conv.evolution_key,
        instance: conv.connection_name,
      }).catch(e => console.error('Enqueue error:', e.message));
    }

    // Emit via Socket.io
    fastify.io?.to(`conversation:${convId}`).emit('message:new', message);

    // Dispatch webhook event
    deliverWebhook.dispatchEvent('message.new', { message, conversation_id: convId }).catch(err => console.error('webhook dispatch failed:', err.message));

    return reply.status(201).send(message);
  });

  // Mark conversation messages as read
  fastify.post('/conversations/:id/read', auth, async (req) => {
    await query(
      'UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    return { ok: true };
  });

  // Webhook receiver from Evolution API
  fastify.post('/webhook/evolution', async (req, reply) => {
    // Validate apikey header matches configured Evolution key
    const incomingKey = req.headers['apikey'] || req.headers['x-api-key'];
    if (incomingKey) {
      try {
        const { rows } = await query('SELECT evolution_key FROM settings WHERE id=1');
        const configuredKey = rows[0]?.evolution_key;
        if (configuredKey && incomingKey !== configuredKey) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
      } catch { /* if DB fails, allow through */ }
    }
    const payload = req.body;
    try {
      await handleEvolutionWebhook(payload, fastify);
    } catch (e) {
      console.error('Webhook error:', e);
    }
    return reply.status(200).send({ ok: true });
  });
}

async function sendEvolutionMessage({ evolutionUrl, evolutionKey, instance, phone, content, type, media_url }) {
  const url = `${evolutionUrl}/message/sendText/${instance}`;
  const body = {
    number: phone,
    text: content,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Extract media URL and type from Evolution message object
function extractMedia(msg) {
  if (!msg) return { mediaUrl: null, mediaType: null };
  if (msg.imageMessage)    return { mediaUrl: msg.imageMessage.url    || msg.imageMessage.directPath, mediaType: 'image' };
  if (msg.videoMessage)    return { mediaUrl: msg.videoMessage.url    || msg.videoMessage.directPath, mediaType: 'video' };
  if (msg.audioMessage)    return { mediaUrl: msg.audioMessage.url    || msg.audioMessage.directPath, mediaType: 'audio' };
  if (msg.documentMessage) return { mediaUrl: msg.documentMessage.url || msg.documentMessage.directPath, mediaType: 'document' };
  if (msg.stickerMessage)  return { mediaUrl: msg.stickerMessage.url  || msg.stickerMessage.directPath, mediaType: 'image' };
  return { mediaUrl: null, mediaType: null };
}

async function handleEvolutionWebhook(payload, fastify) {
  const { event, data, instance } = payload;

  // ── Connection status update ──────────────────────────────────────────────
  if (event === 'connection.update') {
    const state = data?.state;
    fastify.io?.emit('connection:status', { instance, state });

    // Update evolution_connections table
    if (state) {
      query('UPDATE evolution_connections SET status=$1, updated_at=NOW() WHERE instance_name=$2', [state, instance]).catch(() => {});
    }
    return;
  }

  // ── Read receipts ─────────────────────────────────────────────────────────
  if (event === 'messages.update') {
    const updates = Array.isArray(data) ? data : [data];
    for (const upd of updates) {
      const externalId = upd?.key?.id;
      const status = upd?.update?.status;
      // Status 4 = READ in Evolution API
      if (externalId && status >= 4) {
        query('UPDATE messages SET read_at=NOW() WHERE external_id=$1 AND read_at IS NULL', [externalId]).catch(() => {});
      }
    }
    return;
  }

  // ── New message ───────────────────────────────────────────────────────────
  if (event === 'messages.upsert' && (data?.message || data?.key)) {
    const key = data.key || data.message?.key;
    const messageContent = data.message;
    const remoteJid = key?.remoteJid || '';

    // Filter group messages
    if (remoteJid.endsWith('@g.us')) return;

    const phone = remoteJid.replace('@s.whatsapp.net', '');
    if (!phone || key?.fromMe) return;

    // Ignore protocol/system messages
    if (messageContent?.protocolMessage || messageContent?.senderKeyDistributionMessage) return;

    // Extract text content
    const textContent = messageContent?.conversation
      || messageContent?.extendedTextMessage?.text
      || messageContent?.imageMessage?.caption
      || messageContent?.videoMessage?.caption
      || messageContent?.documentMessage?.caption
      || null;

    // Extract media
    const { mediaUrl, mediaType } = extractMedia(messageContent);

    const content = textContent || (mediaType ? `[${mediaType}]` : '[mensagem]');
    const type = mediaType || (textContent ? 'text' : 'media');

    // Use DB transaction for contact + conversation + message creation
    const client = await pool.connect();
    let conv, msgRow;
    try {
      await client.query('BEGIN');

      let { rows: contacts } = await client.query('SELECT * FROM contacts WHERE phone = $1', [phone]);
      let contact = contacts[0];
      if (!contact) {
        const name = data.pushName || phone;
        const { rows } = await client.query('INSERT INTO contacts (name, phone, avatar_url) VALUES ($1,$2,$3) RETURNING *', [name, phone, data.profilePicUrl || null]);
        contact = rows[0];
      } else if (data.profilePicUrl && !contact.avatar_url) {
        // Save profile pic if we didn't have it yet
        await client.query('UPDATE contacts SET avatar_url=$1 WHERE id=$2', [data.profilePicUrl, contact.id]);
      }

      let { rows: convs } = await client.query(
        "SELECT * FROM conversations WHERE contact_id = $1 AND connection_name = $2 AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
        [contact.id, instance]
      );
      conv = convs[0];
      if (!conv) {
        const { rows } = await client.query(
          "INSERT INTO conversations (contact_id, connection_name, status) VALUES ($1,$2,'open') RETURNING *",
          [contact.id, instance]
        );
        conv = rows[0];

        // ── Auto-assign round-robin ─────────────────────────────────────────
        try {
          const { rows: s } = await client.query('SELECT auto_assign_enabled FROM settings WHERE id=1');
          if (s[0]?.auto_assign_enabled) {
            const { rows: agents } = await client.query(`
              SELECT p.id, COUNT(c.id) as open_count
              FROM profiles p
              LEFT JOIN conversations c ON c.assigned_to = p.id AND c.status != 'closed'
              WHERE p.role IN ('agent','supervisor') AND p.status = 'online'
              GROUP BY p.id ORDER BY open_count ASC LIMIT 1
            `);
            if (agents[0]) {
              await client.query('UPDATE conversations SET assigned_to=$1 WHERE id=$2', [agents[0].id, conv.id]);
              conv.assigned_to = agents[0].id;
              // Log event
              client.query("INSERT INTO conversation_events (conversation_id, event_type, actor_name, new_value) VALUES ($1,'assigned','Sistema',$2)",
                [conv.id, agents[0].id]).catch(() => {});
            }
          }
        } catch {}

        // Log conversation created event
        client.query("INSERT INTO conversation_events (conversation_id, event_type, actor_name, new_value) VALUES ($1,'created','Sistema','open')",
          [conv.id]).catch(() => {});
      }

      const { rows: msgRows } = await client.query(
        'INSERT INTO messages (conversation_id, content, direction, type, media_url, external_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [conv.id, content, 'inbound', type, mediaUrl, key?.id]
      );
      msgRow = msgRows[0];

      await client.query(
        'UPDATE conversations SET last_message_at = NOW(), unread_count = unread_count + 1, updated_at = NOW() WHERE id = $1',
        [conv.id]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    fastify.io?.emit('message:new', { ...msgRow, conversation_id: conv.id });
    fastify.io?.emit('conversation:updated', { id: conv.id });

    // ── CSAT response check ────────────────────────────────────────────────
    if (conv.awaiting_csat && textContent) {
      const rating = parseInt(textContent.trim());
      if (rating >= 1 && rating <= 5) {
        await query(
          'INSERT INTO reviews (contact_id, conversation_id, rating, type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [conv.contact_id, conv.id, rating, 'csat']
        ).catch(() => {});
        await query("UPDATE conversations SET awaiting_csat=false WHERE id=$1", [conv.id]).catch(() => {});
        return; // don't process chatbot for CSAT replies
      }
    }

    // ── Office hours check ────────────────────────────────────────────────
    try {
      const { rows: s } = await query('SELECT office_hours_enabled, office_hours_schedule, office_hours_off_message FROM settings WHERE id=1');
      const cfg = s[0];
      if (cfg?.office_hours_enabled && cfg?.office_hours_schedule) {
        const now = new Date();
        const day = now.getDay(); // 0=Sun
        const sched = cfg.office_hours_schedule;
        const todayEntry = Array.isArray(sched) ? sched[day] : null;
        const isOpen = (() => {
          if (!todayEntry?.active) return false;
          const [sh, sm] = (todayEntry.start || '09:00').split(':').map(Number);
          const [eh, em] = (todayEntry.end   || '18:00').split(':').map(Number);
          const cur = now.getHours() * 60 + now.getMinutes();
          return cur >= sh * 60 + sm && cur < eh * 60 + em;
        })();
        if (!isOpen) {
          const msg = cfg.office_hours_off_message || 'No momento estamos fora do horário de atendimento. Retornaremos em breve!';
          const { rows: evo } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
          const e = evo[0];
          if (e?.evolution_url) {
            fetch(`${e.evolution_url}/message/sendText/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': e.evolution_key },
              body: JSON.stringify({ number: phone, text: msg }),
            }).catch(() => {});
          }
          return; // don't process chatbot outside hours
        }
      }
    } catch {}

    // ── Chatbot engine ─────────────────────────────────────────────────────
    // Skip if contact has chatbot disabled or conversation is assigned to an agent
    if (conv.assigned_to) return;
    const { rows: contactRow } = await query('SELECT disable_chatbot FROM contacts WHERE id=$1', [conv.contact_id]);
    if (contactRow[0]?.disable_chatbot) return;

    const { rows: rules } = await query(
      'SELECT * FROM chatbot_rules WHERE is_active=true AND (connection_name=$1 OR connection_name IS NULL OR connection_name=\'\') ORDER BY priority ASC NULLS LAST, created_at ASC',
      [instance]
    );
    if (!rules.length) return;

    const msgText = (textContent || '').trim().toLowerCase();
    for (const rule of rules) {
      const trigger = (rule.trigger || '').trim().toLowerCase();
      const triggerType = rule.trigger_type || 'contains';
      let matched = false;
      if (triggerType === 'exact')       matched = msgText === trigger;
      else if (triggerType === 'starts') matched = msgText.startsWith(trigger);
      else if (triggerType === 'regex')  { try { matched = new RegExp(trigger, 'i').test(msgText); } catch {} }
      else                               matched = msgText.includes(trigger); // 'contains' (default)

      if (!matched) continue;

      const response = rule.response_text || rule.message;
      if (!response) continue;

      // Get Evolution settings
      const { rows: settings } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
      const s = settings[0];
      if (!s?.evolution_url) break;

      // Send auto-reply after 1s delay
      setTimeout(async () => {
        try {
          await fetch(`${s.evolution_url}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': s.evolution_key },
            body: JSON.stringify({ number: phone, text: response }),
          });
          // Save bot message in DB
          const { rows: botMsg } = await query(
            'INSERT INTO messages (conversation_id, content, direction, type, status) VALUES ($1,$2,\'outbound\',\'text\',\'sent\') RETURNING *',
            [conv.id, response]
          );
          await query('UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1', [conv.id]);
          fastify.io?.emit('message:new', { ...botMsg[0], conversation_id: conv.id });
          // Increment trigger count
          query('UPDATE chatbot_rules SET trigger_count=COALESCE(trigger_count,0)+1 WHERE id=$1', [rule.id]).catch(() => {});
        } catch {}
      }, 1000);
      break; // only first matching rule
    }
  }
}
