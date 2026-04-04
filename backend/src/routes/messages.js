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
    deliverWebhook.dispatchEvent('message.new', { message, conversation_id: convId }).catch(() => {});

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

    const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[mídia]';
    const type = msg.message?.conversation ? 'text' : 'media';

    // Use DB transaction for contact + conversation + message creation
    const client = await pool.connect();
    let conv, msgRow;
    try {
      await client.query('BEGIN');

      let { rows: contacts } = await client.query('SELECT * FROM contacts WHERE phone = $1', [phone]);
      let contact = contacts[0];
      if (!contact) {
        const name = data.pushName || phone;
        const { rows } = await client.query('INSERT INTO contacts (name, phone) VALUES ($1,$2) RETURNING *', [name, phone]);
        contact = rows[0];
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
      }

      const { rows: msgRows } = await client.query(
        'INSERT INTO messages (conversation_id, content, direction, type, external_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [conv.id, content, 'inbound', type, msg.key?.id]
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
  }
}
