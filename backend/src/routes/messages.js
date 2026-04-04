import { query } from '../database.js';
import fetch from 'node:http';

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

  // Generic /messages route for shim compatibility
  fastify.get('/messages', auth, async (req) => {
    const { conversation_id, limit: lim = 50 } = req.query;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!conversation_id || !UUID_RE.test(conversation_id)) return [];
    const { rows } = await query(
      `SELECT *, content as body, (direction = 'outbound') as from_me FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [conversation_id, lim]
    );
    return rows;
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
  fastify.post('/conversations/:id/messages', auth, async (req, reply) => {
    const { content, type = 'text', media_url, quoted_message_id } = req.body;
    const convId = req.params.id;

    // Get conversation + contact + connection settings
    const { rows: convRows } = await query(`
      SELECT c.*, ct.phone, s.evolution_url, s.evolution_key
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN settings s ON s.id = 1
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

    // Send via Evolution API
    if (conv.evolution_url && conv.connection_name) {
      try {
        await sendEvolutionMessage({
          evolutionUrl: conv.evolution_url,
          evolutionKey: conv.evolution_key,
          instance: conv.connection_name,
          phone: conv.phone,
          content,
          type,
          media_url,
        });
      } catch (e) {
        console.error('Evolution API error:', e.message);
      }
    }

    // Emit via Socket.io
    fastify.io?.to(`conversation:${convId}`).emit('message:new', message);

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

async function handleEvolutionWebhook(payload, fastify) {
  const { event, data, instance } = payload;

  if (event === 'messages.upsert' && data?.message) {
    const msg = data.message;
    const phone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '');
    if (!phone || msg.key?.fromMe) return;

    // Find or create contact
    let { rows: contacts } = await query('SELECT * FROM contacts WHERE phone = $1', [phone]);
    let contact = contacts[0];
    if (!contact) {
      const name = data.pushName || phone;
      const { rows } = await query('INSERT INTO contacts (name, phone) VALUES ($1,$2) RETURNING *', [name, phone]);
      contact = rows[0];
    }

    // Find or create conversation
    let { rows: convs } = await query(
      "SELECT * FROM conversations WHERE contact_id = $1 AND connection_name = $2 AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
      [contact.id, instance]
    );
    let conv = convs[0];
    if (!conv) {
      const { rows } = await query(
        "INSERT INTO conversations (contact_id, connection_name, status) VALUES ($1,$2,'open') RETURNING *",
        [contact.id, instance]
      );
      conv = rows[0];
    }

    // Extract message content
    const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[mídia]';
    const type = msg.message?.conversation ? 'text' : 'media';

    // Insert message
    const { rows: msgRows } = await query(
      'INSERT INTO messages (conversation_id, content, direction, type, external_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [conv.id, content, 'inbound', type, msg.key?.id]
    );

    await query(
      'UPDATE conversations SET last_message_at = NOW(), unread_count = unread_count + 1, updated_at = NOW() WHERE id = $1',
      [conv.id]
    );

    // Emit realtime
    fastify.io?.emit('message:new', { ...msgRows[0], conversation_id: conv.id });
    fastify.io?.emit('conversation:updated', { id: conv.id });
  }
}
