import { query } from '../database.js';
import { authorize } from '../middleware/authorize.js';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'msxcrm_meta_webhook_2026';

export default async function metaWhatsAppRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Webhook verification (Meta requires GET) ────────────────────────────
  fastify.get('/webhook/meta', async (req, reply) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send('Forbidden');
  });

  // ── Webhook receiver (Meta sends messages here) ─────────────────────────
  fastify.post('/webhook/meta', async (req, reply) => {
    const body = req.body;
    try {
      for (const entry of body?.entry || []) {
        for (const change of entry?.changes || []) {
          if (change.field !== 'messages') continue;
          const val = change.value;
          const phoneNumberId = val?.metadata?.phone_number_id;
          for (const msg of val?.messages || []) {
            await handleIncomingMetaMessage({ msg, phoneNumberId, contacts: val?.contacts || [], fastify });
          }
          // Status updates (delivered, read, etc.)
          for (const status of val?.statuses || []) {
            await handleMetaStatusUpdate(status);
          }
        }
      }
    } catch (e) {
      console.error('Meta webhook error:', e.message);
    }
    return reply.status(200).send({ ok: true });
  });

  // ── CRUD meta_connections ────────────────────────────────────────────────
  fastify.get('/meta-connections', auth, async (req) => {
    const { rows } = await query(
      'SELECT id, label, phone_number_id, waba_id, display_name, verified_name, status, created_at FROM meta_connections WHERE user_id=$1 ORDER BY created_at ASC',
      [req.user.id]
    );
    return rows;
  });

  fastify.post('/meta-connections', auth, async (req, reply) => {
    const { label, phone_number_id, access_token, waba_id } = req.body;
    if (!label || !phone_number_id || !access_token) {
      return reply.status(400).send({ error: 'label, phone_number_id e access_token são obrigatórios' });
    }

    // Verify token + fetch display name from Meta
    let verified_name = null, display_name = null;
    try {
      const res = await fetch(`${GRAPH_URL}/${phone_number_id}?fields=verified_name,display_phone_number&access_token=${access_token}`);
      const data = await res.json();
      if (data.error) return reply.status(400).send({ error: `Meta API: ${data.error.message}` });
      verified_name = data.verified_name || null;
      display_name = data.display_phone_number || null;
    } catch {
      return reply.status(400).send({ error: 'Não foi possível verificar o token com a Meta API' });
    }

    const { rows } = await query(
      `INSERT INTO meta_connections (user_id, label, phone_number_id, access_token, waba_id, verified_name, display_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, phone_number_id) DO UPDATE
         SET label=$2, access_token=$4, waba_id=$5, verified_name=$6, display_name=$7, updated_at=NOW()
       RETURNING id, label, phone_number_id, waba_id, display_name, verified_name, status, created_at`,
      [req.user.id, label, phone_number_id, access_token, waba_id || null, verified_name, display_name]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.patch('/meta-connections/:id', auth, async (req, reply) => {
    const { label, access_token, waba_id } = req.body;
    const updates = [], params = [];
    let p = 1;
    if (label) { updates.push(`label=$${p}`); params.push(label); p++; }
    if (access_token) { updates.push(`access_token=$${p}`); params.push(access_token); p++; }
    if (waba_id) { updates.push(`waba_id=$${p}`); params.push(waba_id); p++; }
    if (!updates.length) return reply.status(400).send({ error: 'Nada para atualizar' });
    updates.push('updated_at=NOW()');
    params.push(req.params.id, req.user.id);
    const { rows } = await query(
      `UPDATE meta_connections SET ${updates.join(',')} WHERE id=$${p} AND user_id=$${p+1} RETURNING id, label, phone_number_id, waba_id, display_name, verified_name, status`,
      params
    );
    if (!rows[0]) return reply.status(404).send({ error: 'Conexão não encontrada' });
    return rows[0];
  });

  fastify.delete('/meta-connections/:id', auth, async (req, reply) => {
    await query('DELETE FROM meta_connections WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });
}

// ── Send message via Meta Graph API ────────────────────────────────────────
export async function sendMetaMessage({ phoneNumberId, accessToken, to, content, type = 'text', mediaUrl }) {
  let msgBody;
  if (type === 'text') {
    msgBody = { type: 'text', text: { body: content, preview_url: false } };
  } else if (type === 'image' || type === 'video' || type === 'audio' || type === 'document') {
    msgBody = { type, [type]: mediaUrl?.startsWith('http') ? { link: mediaUrl } : { id: mediaUrl } };
  } else {
    msgBody = { type: 'text', text: { body: content } };
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...msgBody,
    }),
  });
  return res.json();
}

// ── Incoming message handler ────────────────────────────────────────────────
async function handleIncomingMetaMessage({ msg, phoneNumberId, contacts, fastify }) {
  if (msg.type === 'text' || msg.type === 'image' || msg.type === 'video' || msg.type === 'audio' || msg.type === 'document') {
    const from = msg.from; // phone number (international, no +)
    const profileName = contacts.find(c => c.wa_id === from)?.profile?.name || from;

    // Find or create contact
    let { rows: ctRows } = await query('SELECT * FROM contacts WHERE phone=$1 LIMIT 1', [from]);
    let contact = ctRows[0];
    if (!contact) {
      const { rows } = await query('INSERT INTO contacts (name, phone) VALUES ($1,$2) RETURNING *', [profileName, from]);
      contact = rows[0];
    } else if (contact.name === from && profileName !== from) {
      await query('UPDATE contacts SET name=$1 WHERE id=$2', [profileName, contact.id]);
      contact.name = profileName;
    }

    // Find or create conversation
    let { rows: convRows } = await query(
      "SELECT * FROM conversations WHERE contact_id=$1 AND connection_name=$2 AND status!='closed' ORDER BY created_at DESC LIMIT 1",
      [contact.id, phoneNumberId]
    );
    let conv = convRows[0];
    if (!conv) {
      const { rows } = await query(
        "INSERT INTO conversations (contact_id, connection_name, status) VALUES ($1,$2,'open') RETURNING *",
        [contact.id, phoneNumberId]
      );
      conv = rows[0];
    }

    // Extract content
    let content = '[mídia]';
    let msgType = msg.type;
    let mediaUrl = null;

    if (msg.type === 'text') {
      content = msg.text?.body || '';
    } else if (msg[msg.type]?.caption) {
      content = msg[msg.type].caption;
    }
    if (msg[msg.type]?.id) {
      mediaUrl = `meta_media:${msg[msg.type].id}`;
    }

    // Insert message
    const { rows: msgRows } = await query(
      'INSERT INTO messages (conversation_id, content, direction, type, media_url, external_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [conv.id, content, 'inbound', msgType, mediaUrl, msg.id]
    );

    await query(
      'UPDATE conversations SET last_message_at=NOW(), unread_count=unread_count+1, updated_at=NOW() WHERE id=$1',
      [conv.id]
    );

    fastify.io?.emit('message:new', { ...msgRows[0], conversation_id: conv.id });
    fastify.io?.emit('conversation:updated', { id: conv.id });
  }
}

async function handleMetaStatusUpdate(status) {
  // Update message status (sent/delivered/read/failed)
  const STATUS_MAP = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
  const mapped = STATUS_MAP[status.status];
  if (mapped && status.id) {
    await query('UPDATE messages SET status=$1 WHERE external_id=$2', [mapped, status.id]).catch(() => {});
  }
}
