// Migration SQL (run manually on DB):
// ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcription TEXT;
// ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment TEXT;

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
    const { conversation_id, body, content, from_me, direction, type = 'text', media_url, media_type, status, is_whisper } = req.body;
    const convId = conversation_id;
    const msgContent = content || body || '';
    const msgDirection = from_me === true ? 'outbound' : (from_me === false ? 'inbound' : (direction || 'outbound'));
    const msgType = media_type || type;

    // Whisper: only supervisors and admins can send whisper messages
    const whisper = is_whisper === true;
    if (whisper && !['admin', 'supervisor'].includes(req.user.role)) {
      return reply.status(403).send({ error: 'Apenas supervisores e admins podem enviar mensagens sussurro' });
    }

    const { rows } = await query(
      `INSERT INTO messages (conversation_id, content, direction, type, media_url, is_whisper) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, content as body, (direction = 'outbound') as from_me`,
      [convId, msgContent, msgDirection, msgType, media_url, whisper]
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
          is_whisper: { type: 'boolean', nullable: true },
        },
      },
    },
  }, async (req, reply) => {
    const { content, type = 'text', media_url, quoted_message_id, is_whisper } = req.body;
    const convId = req.params.id;

    // Whisper: only supervisors and admins
    const whisper = is_whisper === true;
    if (whisper && !['admin', 'supervisor'].includes(req.user.role)) {
      return reply.status(403).send({ error: 'Apenas supervisores e admins podem enviar mensagens sussurro' });
    }

    // Get conversation + contact + connection settings + meta connection
    const { rows: convRows } = await query(`
      SELECT c.*, ct.phone, ct.telegram_id, s.evolution_url, s.evolution_key,
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
      'INSERT INTO messages (conversation_id, content, direction, type, media_url, quoted_message_id, is_whisper) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [convId, content, 'outbound', type, media_url, quoted_message_id, whisper]
    );
    const message = rows[0];

    // Update conversation last_message_at
    await query('UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1', [convId]);

    // Whisper messages are NOT sent to the client via Evolution/Meta API
    if (!whisper) {
      // ── Telegram channel ──────────────────────────────────────────────────
      if (conv.channel === 'telegram' && conv.connection_name?.startsWith('telegram_')) {
        const botId = conv.connection_name.replace('telegram_', '');
        const chatId = conv.telegram_id;
        if (chatId) {
          query('SELECT token FROM telegram_bots WHERE id=$1 AND active=true', [botId])
            .then(async ({ rows: botRows }) => {
              if (!botRows[0]) return;
              await fetch(`https://api.telegram.org/bot${botRows[0].token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: content }),
              }).catch(e => console.error('Telegram send error:', e.message));
            }).catch(e => console.error('Telegram bot lookup error:', e.message));
        }
      // Enqueue send (with automatic retry on failure)
      } else if (conv.meta_phone_number_id && conv.meta_access_token) {
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
    }

    // Emit via Socket.io (whisper included, clients filter by role)
    fastify.io?.to(`conversation:${convId}`).emit('message:new', message);

    // Dispatch webhook event (only for real messages)
    if (!whisper) {
      deliverWebhook.dispatchEvent('message.new', { message, conversation_id: convId }).catch(err => console.error('webhook dispatch failed:', err.message));
    }

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

// Recalculate lead score for a contact (non-blocking helper)
async function recalculateLeadScore(contactId) {
  const { rows: convRows } = await pool.query('SELECT id FROM conversations WHERE contact_id=$1', [contactId]);
  const convIds = convRows.map(r => r.id);
  const convPts = Math.min(convIds.length * 4, 20);

  let inboundPts = 0;
  if (convIds.length > 0) {
    const ph = convIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(`SELECT COUNT(*) as cnt FROM messages WHERE conversation_id IN (${ph}) AND direction='inbound'`, convIds);
    inboundPts = Math.min(parseInt(rows[0]?.cnt || '0') * 2, 20);
  }

  let responsePts = 0;
  if (convIds.length > 0) {
    const ph = convIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (m2.created_at - m1.created_at))/60) as avg_min
       FROM messages m1
       JOIN messages m2 ON m2.conversation_id=m1.conversation_id AND m2.direction='outbound' AND m2.created_at>m1.created_at
       WHERE m1.conversation_id IN (${ph}) AND m1.direction='inbound'`, convIds);
    const avgMin = parseFloat(rows[0]?.avg_min || '999');
    if (avgMin < 5) responsePts = 15;
    else if (avgMin < 15) responsePts = 10;
    else if (avgMin < 30) responsePts = 5;
  }

  const { rows: recentRows } = await pool.query(
    `SELECT id FROM conversations WHERE contact_id=$1 AND created_at > NOW() - INTERVAL '30 days' LIMIT 1`, [contactId]);
  const recentPts = recentRows.length > 0 ? 15 : 0;

  const { rows: pixRows } = await pool.query('SELECT id FROM pix_charges WHERE contact_id=$1 LIMIT 1', [contactId]);
  const pixPts = pixRows.length > 0 ? 10 : 0;

  let csatPts = 0;
  if (convIds.length > 0) {
    const ph = convIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(`SELECT AVG(csat_score) as avg FROM conversations WHERE id IN (${ph}) AND csat_score IS NOT NULL`, convIds);
    if (rows[0]?.avg != null && parseFloat(rows[0].avg) >= 4) csatPts = 10;
  }

  const { rows: ctRows } = await pool.query('SELECT email, company FROM contacts WHERE id=$1', [contactId]);
  const ct = ctRows[0];
  const emailPts = ct?.email ? 5 : 0;
  const companyPts = ct?.company ? 5 : 0;

  const score = Math.min(100, convPts + inboundPts + responsePts + recentPts + pixPts + csatPts + emailPts + companyPts);
  await pool.query('UPDATE contacts SET lead_score=$1, lead_score_updated_at=NOW() WHERE id=$2', [score, contactId]);
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

      // Check if contact is blocked
      if (contact.is_blocked) {
        await client.query('ROLLBACK');
        client.release();
        return reply.status(200).send({ blocked: true });
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
              GROUP BY p.id, p.max_conversations
              HAVING p.max_conversations IS NULL OR COUNT(c.id) < p.max_conversations
              ORDER BY open_count ASC LIMIT 1
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

    // ── Recalculate lead score asynchronously ─────────────────────────────
    const contactIdForScore = contact.id;
    (async () => {
      try {
        await recalculateLeadScore(contactIdForScore);
      } catch(e) { /* silent */ }
    })();

    // ── Queue position message — send on new conversation ─────────────────
    if (!conv.assigned_to) {
      (async () => {
        try {
          const { rows: qs } = await pool.query("SELECT queue_message_enabled, queue_message_text FROM settings WHERE id=1");
          if (qs[0]?.queue_message_enabled && qs[0]?.queue_message_text) {
            const { rows: waiting } = await pool.query(
              "SELECT COUNT(*) as count FROM conversations WHERE status='open' AND assigned_to IS NULL AND created_at < NOW()"
            );
            const position = parseInt(waiting[0].count) + 1;
            const msg = (qs[0].queue_message_text || '')
              .replace('{{posicao}}', position)
              .replace('{{tempo}}', Math.ceil(position * 10));
            await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
              body: JSON.stringify({ number: phone, text: msg })
            });
            await pool.query("INSERT INTO messages (conversation_id, content, sender_type, direction) VALUES ($1,$2,'bot','outbound')", [conv.id, msg]);
          }
        } catch(e) {}
      })();
    }

    // ── AI intelligent routing — non-blocking ────────────────────────────
    (async () => {
      try {
        const { rows: routingSettings } = await pool.query("SELECT ai_routing_enabled FROM settings WHERE id=1");
        if (!routingSettings[0]?.ai_routing_enabled) return;
        const anthropicKeyRouting = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKeyRouting) return;
        const { rows: isNew } = await pool.query(
          "SELECT COUNT(*) as cnt FROM messages WHERE conversation_id=$1",
          [conv.id]
        );
        const { rows: hasTeam } = await pool.query(
          "SELECT assigned_team_id FROM conversations WHERE id=$1",
          [conv.id]
        );
        // Only route on first message if no team is assigned
        if (parseInt(isNew[0]?.cnt) <= 1 && !hasTeam[0]?.assigned_team_id) {
          const { rows: teams } = await pool.query("SELECT id, name FROM teams");
          if (teams.length > 1) {
            const teamNames = teams.map(t => t.name).join(', ');
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKeyRouting,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 30,
                messages: [{
                  role: 'user',
                  content: `Com base nesta mensagem de cliente, qual time deve atender? Times disponíveis: ${teamNames}. Responda APENAS com o nome exato de um time da lista.\n\nMensagem: "${(content||'').substring(0,200)}"`
                }]
              })
            });
            const ai = await response.json();
            const suggestedTeam = (ai.content?.[0]?.text || '').trim();
            const matched = teams.find(t => t.name.toLowerCase() === suggestedTeam.toLowerCase());
            if (matched) {
              await pool.query('UPDATE conversations SET assigned_team_id=$1 WHERE id=$2', [matched.id, conv.id]);
              if (fastify.io) fastify.io.emit('conversation:updated', { id: conv.id, assigned_team_id: matched.id });
            }
          }
        }
      } catch(e) { /* AI routing error — silent */ }
    })();

    // ── Automation rules execution ─────────────────────────────────────────
    try {
      const { rows: rules } = await pool.query(
        "SELECT * FROM automation_rules WHERE is_active=true AND trigger IN ('message_received','conversation_created')"
      );
      for (const rule of rules) {
        const ruleActions = rule.actions || [];
        const ruleConditions = rule.conditions || [];
        let match = true;
        for (const cond of ruleConditions) {
          if (cond.field === 'content' && cond.operator === 'contains') {
            if (!(content || '').toLowerCase().includes((cond.value || '').toLowerCase())) { match = false; break; }
          }
          if (cond.field === 'channel' && cond.operator === 'equals') {
            if (instance !== cond.value) { match = false; break; }
          }
        }
        if (!match) continue;
        for (const action of ruleActions) {
          if (action.type === 'assign_team' && action.team_id) {
            await pool.query('UPDATE conversations SET assigned_team_id=$1 WHERE id=$2', [action.team_id, conv.id]);
          } else if (action.type === 'add_label' && action.label) {
            await pool.query('UPDATE conversations SET labels=array_append(COALESCE(labels,ARRAY[]::text[]),$1) WHERE id=$2', [action.label, conv.id]);
          } else if (action.type === 'send_message' && action.message) {
            await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
              body: JSON.stringify({ number: phone, text: action.message })
            });
            await pool.query("INSERT INTO messages (conversation_id, content, sender_type) VALUES ($1,$2,'bot')", [conv.id, action.message]);
          }
        }
      }
    } catch(e) { /* automation error — silent */ }

    // ── AI auto-labeling — non-blocking ──────────────────────────────────
    (async () => {
      try {
        const msgText = content || '';
        if (msgText.length < 5) return;
        const { rows: aiLabelSettings } = await pool.query("SELECT ai_labels_enabled FROM settings WHERE id=1");
        if (!aiLabelSettings[0]?.ai_labels_enabled) return;
        const anthropicKeyLabel = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKeyLabel) return;
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKeyLabel,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 50,
            messages: [{
              role: 'user',
              content: `Classifique esta mensagem de atendimento em UMA das categorias: suporte, financeiro, reclamacao, elogio, informacao, vendas, cancelamento, outro. Responda APENAS com a palavra da categoria, sem explicação.\n\nMensagem: "${msgText}"`
            }]
          })
        });
        const ai = await response.json();
        const label = (ai.content?.[0]?.text || '').trim().toLowerCase().replace(/[^a-z]/g, '');
        const validLabels = ['suporte','financeiro','reclamacao','elogio','informacao','vendas','cancelamento','outro'];
        if (validLabels.includes(label)) {
          await pool.query(
            "UPDATE conversations SET labels=array_append(COALESCE(labels,ARRAY[]::text[]),$1) WHERE id=$2 AND NOT ($1=ANY(COALESCE(labels,ARRAY[]::text[])))",
            [label, conv.id]
          );
          if (fastify.io) fastify.io.emit('conversation:label_added', { conversation_id: conv.id, label });
        }
      } catch(e) {}
    })();

    // ── Audio transcription — non-blocking ────────────────────────────────
    if (type === 'audio' || messageContent?.audioMessage) {
      const openaiKey = process.env.OPENAI_API_KEY;
      const evolutionUrl = process.env.EVOLUTION_API_URL;
      const evolutionKey = process.env.EVOLUTION_API_KEY;
      if (openaiKey && evolutionUrl && msgRow.id) {
        (async () => {
          try {
            const audioResp = await fetch(`${evolutionUrl}/message/download/base64/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
              body: JSON.stringify({ messageId: key?.id })
            });
            if (!audioResp.ok) return;
            const audioJson = await audioResp.json();
            const base64 = audioJson?.base64;
            if (!base64) return;

            const audioBuffer = Buffer.from(base64, 'base64');
            const formData = new FormData();
            const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
            formData.append('file', blob, 'audio.ogg');
            formData.append('model', 'whisper-1');
            formData.append('language', 'pt');

            const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${openaiKey}` },
              body: formData
            });
            if (!whisperResp.ok) return;
            const { text } = await whisperResp.json();
            if (text) {
              await query('UPDATE messages SET transcription=$1 WHERE id=$2', [text, msgRow.id]);
              fastify.io?.to(`conversation:${conv.id}`).emit('message:transcription', { message_id: msgRow.id, transcription: text });
            }
          } catch (e) { /* silent */ }
        })();
      }
    }

    // ── Sentiment analysis — non-blocking, inbound text only ─────────────
    if (textContent) {
      const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
      if (anthropicKey) {
        (async () => {
          try {
            const msgType = messageContent?.conversation ? 'conversation' : (messageContent?.extendedTextMessage ? 'extendedTextMessage' : null);
            if (!msgType) return;
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 10,
                system: 'Classifique o sentimento desta mensagem de cliente. Responda com APENAS uma palavra: positivo, neutro ou negativo.',
                messages: [{ role: 'user', content: textContent }]
              })
            });
            if (!resp.ok) return;
            const data = await resp.json();
            const sentiment = data.content?.[0]?.text?.trim().toLowerCase();
            if (['positivo', 'neutro', 'negativo'].includes(sentiment)) {
              await query('UPDATE conversations SET sentiment=$1 WHERE id=$2', [sentiment, conv.id]);
              fastify.io?.emit('conversation:sentiment', { conversation_id: conv.id, sentiment });
            }
          } catch (e) { /* silent */ }
        })();
      }
    }

    // ── Auto-tag rules ────────────────────────────────────────────────────
    if (textContent) {
      query('SELECT keyword, tag, match_type FROM auto_tag_rules WHERE is_active=true').then(async ({ rows: tagRules }) => {
        const msgLower = textContent.toLowerCase();
        const tagsToAdd = [];
        for (const rule of tagRules) {
          const kw = (rule.keyword || '').toLowerCase();
          let hit = false;
          if (rule.match_type === 'exact') hit = msgLower === kw;
          else if (rule.match_type === 'starts') hit = msgLower.startsWith(kw);
          else if (rule.match_type === 'regex') { try { hit = new RegExp(kw, 'i').test(msgLower); } catch {} }
          else hit = msgLower.includes(kw);
          if (hit) tagsToAdd.push(rule.tag);
        }
        if (tagsToAdd.length) {
          // Fetch current tags and merge
          const { rows: ct } = await query('SELECT tags FROM contacts WHERE id=$1', [conv.contact_id]);
          const existing = ct[0]?.tags || [];
          const merged = [...new Set([...existing, ...tagsToAdd])];
          query('UPDATE contacts SET tags=$1 WHERE id=$2', [merged, conv.contact_id]).catch(() => {});
        }
      }).catch(() => {});
    }

    // ── Blacklist keyword check ────────────────────────────────────────────
    if (textContent) {
      query('SELECT keyword, action FROM blacklist_keywords WHERE is_active=true').then(async ({ rows: kwRules }) => {
        const msgLower = textContent.toLowerCase();
        for (const kw of kwRules) {
          if (msgLower.includes(kw.keyword.toLowerCase())) {
            if (kw.action === 'block') {
              await query(
                'INSERT INTO blacklist (phone, reason, is_active) VALUES ($1,$2,true) ON CONFLICT (phone) DO UPDATE SET is_active=true, reason=$2',
                [phone, `Keyword automático: "${kw.keyword}"`]
              ).catch(() => {});
              await query("UPDATE conversations SET status='closed' WHERE id=$1", [conv.id]).catch(() => {});
              fastify.io?.emit('conversation:updated', { id: conv.id, status: 'closed' });
            }
            break;
          }
        }
      }).catch(() => {});
    }

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

    // ── CSAT automático: detectar resposta 1-5 para conversas fechadas com csat_sent_at ──
    if (textContent) {
      const bodyNum = parseInt(textContent.trim());
      let csatHandled = false;
      if (!isNaN(bodyNum) && bodyNum >= 1 && bodyNum <= 5) {
        const { rows: csatRows } = await query('SELECT csat_sent_at, status FROM conversations WHERE id=$1', [conv.id]).catch(() => ({ rows: [] }));
        if (csatRows[0]?.csat_sent_at && csatRows[0]?.status === 'closed') {
          await query('UPDATE conversations SET csat_score=$1, csat_responded_at=NOW() WHERE id=$2', [bodyNum, conv.id]).catch(() => {});
          csatHandled = true;
          return; // não processar mais
        }
      }

      // ── NPS response: detect 0-10 for closed conversations with nps_sent_at ──
      if (!isNaN(bodyNum) && bodyNum >= 0 && bodyNum <= 10 && !csatHandled) {
        const { rows: npsRows } = await query('SELECT nps_sent_at, status FROM conversations WHERE id=$1', [conv.id]).catch(() => ({ rows: [] }));
        if (npsRows[0]?.nps_sent_at && npsRows[0]?.status === 'closed') {
          await query('UPDATE conversations SET nps_score=$1, nps_responded_at=NOW() WHERE id=$2', [bodyNum, conv.id]).catch(() => {});
          return; // não processar mais
        }
      }
    }

    // ── Flow builder execution ────────────────────────────────────────────
    try {
      const { rows: activeFlows } = await pool.query("SELECT * FROM chatbot_flows WHERE is_active=true LIMIT 1");
      if (activeFlows[0]) {
        const flow = activeFlows[0];
        const nodes = flow.nodes || [];
        const triggerNode = nodes.find(n => n.type === 'trigger');
        if (triggerNode) {
          const edges = flow.edges || [];
          let currentNodeId = triggerNode.id;
          for (let i = 0; i < 10; i++) {
            const edge = edges.find(e => e.source === currentNodeId);
            if (!edge) break;
            const nextNode = nodes.find(n => n.id === edge.target);
            if (!nextNode) break;
            if (nextNode.type === 'send_message' && nextNode.data && nextNode.data.text) {
              await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instance}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
                body: JSON.stringify({ number: phone, text: nextNode.data.text })
              });
              await pool.query("INSERT INTO messages (conversation_id, content, sender_type, created_at) VALUES ($1,$2,'bot',NOW())", [conv.id, nextNode.data.text]);
            } else if (nextNode.type === 'condition' && nextNode.data && nextNode.data.keyword) {
              const msgLowerFlow = (content || '').toLowerCase();
              if (!msgLowerFlow.includes(nextNode.data.keyword.toLowerCase())) break;
            }
            currentNodeId = nextNode.id;
          }
        }
      }
    } catch(e) { /* flow error — silent */ }

    // ── FAQ Bot check — auto-reply if keyword matches ─────────────────────
    try {
      const msgLower = (content || '').toLowerCase().trim();
      const { rows: faqRules } = await pool.query(
        "SELECT * FROM faq_rules WHERE is_active=true"
      );
      const matched = faqRules.find(r => msgLower.includes(r.keyword.toLowerCase()));
      if (matched) {
        const { rows: evo } = await pool.query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
        const e = evo[0];
        if (e?.evolution_url) {
          await fetch(`${e.evolution_url}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': e.evolution_key },
            body: JSON.stringify({ number: phone, text: matched.response })
          });
          await pool.query(
            "INSERT INTO messages (conversation_id, content, direction, type, status) VALUES ($1,$2,'outbound','text','sent')",
            [conv.id, matched.response]
          );
          await pool.query('UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1', [conv.id]);
          fastify.io?.emit('message:new', { conversation_id: conv.id, content: matched.response, direction: 'outbound', type: 'text' });
        }
        return; // FAQ handled — skip chatbot
      }
    } catch(e) { /* FAQ bot error — silent */ }

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

    // ── Out-of-hours bot ──────────────────────────────────────────────────
    try {
      const { rows: s } = await pool.query("SELECT out_of_hours_enabled, out_of_hours_message FROM settings WHERE id=1");
      if (s[0]?.out_of_hours_enabled) {
        const now = new Date();
        const { rows: bh } = await pool.query("SELECT * FROM business_hours WHERE day_of_week=$1 AND is_active=true", [now.getDay()]);
        const isWorkingHour = bh.length > 0 && (() => {
          const [sh, sm] = (bh[0].start_time || '08:00').split(':').map(Number);
          const [eh, em] = (bh[0].end_time || '18:00').split(':').map(Number);
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const startMins = sh * 60 + sm;
          const endMins = eh * 60 + em;
          return nowMins >= startMins && nowMins <= endMins;
        })();
        if (!isWorkingHour && s[0].out_of_hours_message) {
          const { rows: recent } = await pool.query(
            "SELECT id FROM messages WHERE conversation_id=$1 AND sender_type='bot' AND content=$2 AND created_at > NOW() - interval '12 hours'",
            [conv.id, s[0].out_of_hours_message]
          );
          if (!recent.length) {
            await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instance}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
              body: JSON.stringify({ number: phone, text: s[0].out_of_hours_message })
            });
            await pool.query("INSERT INTO messages (conversation_id, content, sender_type) VALUES ($1,$2,'bot')", [conv.id, s[0].out_of_hours_message]);
          }
        }
      }
    } catch(e) { /* out-of-hours error — silent */ }

    // ── AI Generative Chatbot ─────────────────────────────────────────────
    // Runs before legacy chatbot rules; skips if human agent is assigned
    (async () => {
      try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) return;

        const { rows: cbCfg } = await pool.query('SELECT * FROM ai_chatbot_config WHERE id=1');
        const cfg = cbCfg[0];
        if (!cfg || !cfg.enabled) return;

        // Skip if a human agent is assigned
        const { rows: convCheck } = await pool.query('SELECT assigned_to FROM conversations WHERE id=$1', [conv.id]);
        if (convCheck[0]?.assigned_to) return;

        // Skip if contact has chatbot disabled
        const { rows: ctCheck } = await pool.query('SELECT disable_chatbot FROM contacts WHERE id=$1', [conv.contact_id]);
        if (ctCheck[0]?.disable_chatbot) return;

        const msgText = (textContent || '').trim();
        if (!msgText) return;

        // Check trigger_keywords (if any configured, message must match one)
        const triggerKws = cfg.trigger_keywords || [];
        if (triggerKws.length > 0) {
          const lower = msgText.toLowerCase();
          const triggered = triggerKws.some(kw => lower.includes(kw.toLowerCase()));
          if (!triggered) return;
        }

        // Fetch conversation history
        const maxHistory = cfg.max_history_messages || 10;
        const { rows: historyRows } = await pool.query(
          `SELECT content, direction FROM messages
           WHERE conversation_id=$1 AND is_whisper IS NOT TRUE
           ORDER BY created_at DESC LIMIT $2`,
          [conv.id, maxHistory]
        );
        const historyMsgs = historyRows.reverse().map(m => ({
          role: m.direction === 'outbound' ? 'assistant' : 'user',
          content: m.content || ''
        }));

        const systemPrompt = cfg.system_prompt || 'Você é um assistente virtual prestativo. Responda de forma clara e educada em português.';

        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: systemPrompt,
            messages: historyMsgs
          })
        });

        if (!aiResp.ok) return;
        const aiData = await aiResp.json();
        const botReply = (aiData.content?.[0]?.text || '').trim();
        if (!botReply) return;

        // Check handoff keywords in bot reply
        const handoffKws = cfg.handoff_keywords || [];
        const replyLower = botReply.toLowerCase();
        const needsHandoff = handoffKws.some(kw => replyLower.includes(kw.toLowerCase()));

        if (needsHandoff) {
          // Assign to least-busy available agent
          const { rows: agents } = await pool.query(`
            SELECT p.id, COUNT(c.id) as open_count
            FROM profiles p
            LEFT JOIN conversations c ON c.assigned_to = p.id AND c.status != 'closed'
            WHERE p.role IN ('agent','supervisor') AND p.status = 'online'
            GROUP BY p.id, p.max_conversations
            HAVING p.max_conversations IS NULL OR COUNT(c.id) < p.max_conversations
            ORDER BY open_count ASC LIMIT 1
          `);
          if (agents[0]) {
            await pool.query('UPDATE conversations SET assigned_to=$1 WHERE id=$2', [agents[0].id, conv.id]);
            fastify.io?.emit('conversation:updated', { id: conv.id, assigned_to: agents[0].id });
          }
          return; // no auto-reply on handoff
        }

        // Send reply via Evolution API
        const { rows: evoSet } = await pool.query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
        const evo = evoSet[0];
        if (evo?.evolution_url) {
          await fetch(`${evo.evolution_url}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evo.evolution_key },
            body: JSON.stringify({ number: phone, text: botReply })
          });
        }

        // Save bot message in DB
        const { rows: botMsg } = await pool.query(
          "INSERT INTO messages (conversation_id, content, direction, type, status, sender_type) VALUES ($1,$2,'outbound','text','sent','bot') RETURNING *",
          [conv.id, botReply]
        );
        await pool.query('UPDATE conversations SET last_message_at=NOW(), updated_at=NOW() WHERE id=$1', [conv.id]);
        fastify.io?.emit('message:new', { ...botMsg[0], conversation_id: conv.id });

      } catch(e) { /* AI chatbot error — silent */ }
    })();

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
