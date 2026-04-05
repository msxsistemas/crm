import { createHmac } from 'crypto';
import { query } from '../database.js';
import { uploadToMinio, ensureBucket } from '../minio.js';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'msxcrm_meta_webhook_2026';
const APP_SECRET = process.env.META_APP_SECRET || '';

ensureBucket().catch(() => {});

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
  fastify.post('/webhook/meta', {
    config: { rawBody: true }, // need raw body for signature
  }, async (req, reply) => {
    // Verify X-Hub-Signature-256 if APP_SECRET is configured
    if (APP_SECRET) {
      const sig = req.headers['x-hub-signature-256'];
      if (!sig) return reply.status(403).send('Missing signature');
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const expected = 'sha256=' + createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
      if (sig !== expected) return reply.status(403).send('Invalid signature');
    }

    const body = req.body;
    try {
      for (const entry of body?.entry || []) {
        for (const change of entry?.changes || []) {
          if (change.field !== 'messages') continue;
          const val = change.value;
          const phoneNumberId = val?.metadata?.phone_number_id;
          // Find access token for this phone number (for media download)
          const { rows: connRows } = await query(
            'SELECT access_token FROM meta_connections WHERE phone_number_id=$1 LIMIT 1',
            [phoneNumberId]
          );
          const accessToken = connRows[0]?.access_token;
          for (const msg of val?.messages || []) {
            await handleIncomingMetaMessage({ msg, phoneNumberId, contacts: val?.contacts || [], accessToken, fastify });
          }
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

  // ── Embedded Signup — troca token do SDK e busca WABAs + números ─────────
  fastify.post('/meta-connections/embedded-signup', auth, async (req, reply) => {
    const { access_token } = req.body;
    if (!access_token) return reply.status(400).send({ error: 'access_token é obrigatório' });

    const APP_ID = process.env.META_APP_ID;
    const SECRET = process.env.META_APP_SECRET;

    // Troca por token de longa duração (60 dias)
    let longToken = access_token;
    if (APP_ID && SECRET) {
      try {
        const r = await fetch(
          `${GRAPH_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${SECRET}&fb_exchange_token=${access_token}`
        );
        const d = await r.json();
        if (d.access_token) longToken = d.access_token;
      } catch {}
    }

    // 1. Busca os negócios do usuário
    const bizRes = await fetch(`${GRAPH_URL}/me/businesses?access_token=${longToken}&fields=id,name`);
    const bizData = await bizRes.json();
    if (bizData.error) return reply.status(400).send({ error: bizData.error.message });

    const phones = [];
    const businesses = bizData.data || [];

    // 2. Para cada negócio, busca WABAs (owned + client)
    for (const biz of businesses) {
      for (const wabaType of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
        const wabaRes = await fetch(
          `${GRAPH_URL}/${biz.id}/${wabaType}?access_token=${longToken}&fields=id,name`
        );
        const wabaData = await wabaRes.json();
        for (const waba of wabaData.data || []) {
          // 3. Para cada WABA, busca números
          const phoneRes = await fetch(
            `${GRAPH_URL}/${waba.id}/phone_numbers?access_token=${longToken}&fields=id,display_phone_number,verified_name,status,quality_rating`
          );
          const phoneData = await phoneRes.json();
          for (const phone of phoneData.data || []) {
            phones.push({
              waba_id: waba.id,
              waba_name: waba.name || biz.name,
              phone_number_id: phone.id,
              display_phone_number: phone.display_phone_number,
              verified_name: phone.verified_name,
              status: phone.status,
              access_token: longToken,
            });
          }
        }
      }
    }

    if (phones.length === 0) {
      return reply.status(400).send({ error: 'Nenhum número encontrado. Verifique se a conta Meta Business tem um WABA com números registrados.' });
    }
    return { phones };
  });

  // ── Embedded Signup — salva número selecionado ────────────────────────────
  fastify.post('/meta-connections/embedded-signup/save', auth, async (req, reply) => {
    const { phone_number_id, waba_id, access_token, display_phone_number, verified_name, label } = req.body;
    if (!phone_number_id || !waba_id || !access_token) {
      return reply.status(400).send({ error: 'Dados incompletos' });
    }

    // Assina o WABA no webhook automaticamente
    try {
      await fetch(`${GRAPH_URL}/${waba_id}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
    } catch {}

    const connLabel = label || verified_name || display_phone_number || phone_number_id;
    const { rows } = await query(
      `INSERT INTO meta_connections (user_id, label, phone_number_id, access_token, waba_id, verified_name, display_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, phone_number_id) DO UPDATE
         SET label=$2, access_token=$4, waba_id=$5, verified_name=$6, display_name=$7, updated_at=NOW()
       RETURNING id, label, phone_number_id, waba_id, display_name, verified_name, status, created_at`,
      [req.user.id, connLabel, phone_number_id, access_token, waba_id, verified_name || null, display_phone_number || null]
    );
    return reply.status(201).send(rows[0]);
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

  // ── Send HSM Template via Meta API ──────────────────────────────────────
  fastify.post('/meta-connections/:id/send-template', auth, async (req, reply) => {
    const { to, template_name, language_code = 'pt_BR', components = [] } = req.body;
    if (!to || !template_name) return reply.status(400).send({ error: 'to e template_name são obrigatórios' });

    const { rows } = await query(
      'SELECT phone_number_id, access_token FROM meta_connections WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return reply.status(404).send({ error: 'Conexão não encontrada' });

    const result = await sendMetaTemplate({
      phoneNumberId: rows[0].phone_number_id,
      accessToken: rows[0].access_token,
      to,
      templateName: template_name,
      languageCode: language_code,
      components,
    });

    if (result.error) return reply.status(400).send({ error: result.error.message });
    return result;
  });
}

// ── Send text/media message via Meta Graph API ─────────────────────────────
export async function sendMetaMessage({ phoneNumberId, accessToken, to, content, type = 'text', mediaUrl }) {
  let msgBody;

  if (type === 'text') {
    msgBody = { type: 'text', text: { body: content, preview_url: false } };
  } else if (type === 'image') {
    msgBody = { type: 'image', image: { link: mediaUrl, caption: content || undefined } };
  } else if (type === 'video') {
    msgBody = { type: 'video', video: { link: mediaUrl, caption: content || undefined } };
  } else if (type === 'audio') {
    msgBody = { type: 'audio', audio: { link: mediaUrl } };
  } else if (type === 'document') {
    msgBody = { type: 'document', document: { link: mediaUrl, caption: content || undefined, filename: mediaUrl?.split('/').pop() || 'arquivo' } };
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

// ── Send HSM template via Meta Graph API ──────────────────────────────────
export async function sendMetaTemplate({ phoneNumberId, accessToken, to, templateName, languageCode = 'pt_BR', components = [] }) {
  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }),
  });
  return res.json();
}

// ── Download Meta media and upload to MinIO ────────────────────────────────
async function downloadMetaMedia(mediaId, accessToken) {
  try {
    // Get media URL
    const urlRes = await fetch(`${GRAPH_URL}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const urlData = await urlRes.json();
    if (!urlData.url) return null;

    // Download the actual file
    const fileRes = await fetch(urlData.url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!fileRes.ok) return null;

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const mime = urlData.mime_type || 'application/octet-stream';
    const ext = mime.split('/')[1]?.split(';')[0] || 'bin';
    const objectName = `meta-media/${mediaId}.${ext}`;

    const publicUrl = await uploadToMinio(objectName, buffer, mime);
    return { url: publicUrl, mime };
  } catch (e) {
    console.error('Meta media download error:', e.message);
    return null;
  }
}

// ── Incoming message handler ────────────────────────────────────────────────
async function handleIncomingMetaMessage({ msg, phoneNumberId, contacts, accessToken, fastify }) {
  const SUPPORTED = ['text', 'image', 'video', 'audio', 'document', 'sticker'];
  if (!SUPPORTED.includes(msg.type)) return;

  const from = msg.from;
  const profileName = contacts.find(c => c.wa_id === from)?.profile?.name || from;

  // Find or create contact + conversation in a transaction
  const client = await (await import('../database.js')).pool.connect();
  let conv, msgRow;
  try {
    await client.query('BEGIN');

    let { rows: ctRows } = await client.query('SELECT * FROM contacts WHERE phone=$1 LIMIT 1', [from]);
    let contact = ctRows[0];
    if (!contact) {
      const { rows } = await client.query('INSERT INTO contacts (name, phone) VALUES ($1,$2) RETURNING *', [profileName, from]);
      contact = rows[0];
    } else if (contact.name === from && profileName !== from) {
      await client.query('UPDATE contacts SET name=$1 WHERE id=$2', [profileName, contact.id]);
    }

    let { rows: convRows } = await client.query(
      "SELECT * FROM conversations WHERE contact_id=$1 AND connection_name=$2 AND status!='closed' ORDER BY created_at DESC LIMIT 1",
      [contact.id, phoneNumberId]
    );
    conv = convRows[0];
    if (!conv) {
      const { rows } = await client.query(
        "INSERT INTO conversations (contact_id, connection_name, status) VALUES ($1,$2,'open') RETURNING *",
        [contact.id, phoneNumberId]
      );
      conv = rows[0];
    }

    // Extract content and media
    let content = '';
    let msgType = msg.type;
    let mediaUrl = null;

    if (msg.type === 'text') {
      content = msg.text?.body || '';
    } else {
      content = msg[msg.type]?.caption || '';
      const mediaId = msg[msg.type]?.id;
      if (mediaId && accessToken) {
        // Download async — don't block webhook response
        downloadMetaMedia(mediaId, accessToken).then(async (result) => {
          if (result?.url) {
            await query('UPDATE messages SET media_url=$1 WHERE external_id=$2', [result.url, msg.id]).catch(err => console.error('media_url update failed:', err.message));
          }
        }).catch(err => console.error('downloadMetaMedia failed:', err.message));
        mediaUrl = `pending:${mediaId}`; // temporary placeholder
      }
    }

    const { rows: msgRows } = await client.query(
      'INSERT INTO messages (conversation_id, content, direction, type, media_url, external_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [conv.id, content, 'inbound', msgType, mediaUrl, msg.id]
    );
    msgRow = msgRows[0];

    await client.query(
      'UPDATE conversations SET last_message_at=NOW(), unread_count=unread_count+1, updated_at=NOW() WHERE id=$1',
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

async function handleMetaStatusUpdate(status) {
  const STATUS_MAP = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
  const mapped = STATUS_MAP[status.status];
  if (mapped && status.id) {
    await query('UPDATE messages SET status=$1 WHERE external_id=$2', [mapped, status.id]).catch(err => console.error('message status update failed:', err.message));
  }
}
