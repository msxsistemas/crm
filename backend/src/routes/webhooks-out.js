// CREATE TABLE IF NOT EXISTS outgoing_webhooks (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   name TEXT NOT NULL,
//   url TEXT NOT NULL,
//   events JSONB DEFAULT '[]',
//   secret TEXT,
//   is_active BOOLEAN DEFAULT true,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

import { query } from '../database.js';

export default async function webhooksOutRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // CRUD
  fastify.get('/webhooks-out', auth, async (req) => {
    const { rows } = await query('SELECT * FROM outgoing_webhooks ORDER BY created_at DESC');
    return rows;
  });

  fastify.post('/webhooks-out', auth, async (req, reply) => {
    const { name, url, events, secret, is_active } = req.body;
    // events: array like ['conversation.created', 'conversation.closed', 'message.received', 'conversation.assigned']
    const { rows } = await query(
      'INSERT INTO outgoing_webhooks (name, url, events, secret, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, url, JSON.stringify(events || []), secret || null, is_active !== false]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.patch('/webhooks-out/:id', auth, async (req) => {
    const { name, url, events, secret, is_active } = req.body;
    const updates = [];
    const params = [];
    let p = 1;
    if (name !== undefined) { updates.push(`name=$${p}`); params.push(name); p++; }
    if (url !== undefined) { updates.push(`url=$${p}`); params.push(url); p++; }
    if (events !== undefined) { updates.push(`events=$${p}`); params.push(JSON.stringify(events)); p++; }
    if (secret !== undefined) { updates.push(`secret=$${p}`); params.push(secret); p++; }
    if (is_active !== undefined) { updates.push(`is_active=$${p}`); params.push(is_active); p++; }
    if (!updates.length) return { ok: true };
    params.push(req.params.id);
    const { rows } = await query(`UPDATE outgoing_webhooks SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params);
    return rows[0];
  });

  fastify.delete('/webhooks-out/:id', auth, async (req) => {
    await query('DELETE FROM outgoing_webhooks WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // Test webhook
  fastify.post('/webhooks-out/:id/test', auth, async (req) => {
    const { rows } = await query('SELECT * FROM outgoing_webhooks WHERE id=$1', [req.params.id]);
    if (!rows[0]) return { ok: false };
    try {
      const res = await fetch(rows[0].url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(rows[0].secret ? { 'X-Webhook-Secret': rows[0].secret } : {}) },
        body: JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), data: { message: 'Webhook de teste do MSX CRM' } }),
        signal: AbortSignal.timeout(5000)
      });
      return { ok: res.ok, status: res.status };
    } catch(e) { return { ok: false, error: e.message }; }
  });
}

// Export helper for other routes to call
export async function triggerOutgoingWebhooks(fastifyPool, event, data) {
  try {
    const { rows } = await fastifyPool.query(
      "SELECT * FROM outgoing_webhooks WHERE is_active=true AND events @> $1::jsonb",
      [JSON.stringify([event])]
    );
    for (const wh of rows) {
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(wh.secret ? { 'X-Webhook-Secret': wh.secret } : {}) },
        body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => {}); // fire and forget
    }
  } catch(e) { /* silent */ }
}
