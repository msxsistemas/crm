import { query, pool } from '../database.js';

export default async function inboundWebhookRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── List inbound webhooks ─────────────────────────────────────────────────
  fastify.get('/inbound-webhooks', auth, async (req) => {
    const orgId = req.user.organization_id || req.user.org_id || null;
    const { rows } = await query(
      'SELECT * FROM inbound_webhooks WHERE (organization_id=$1 OR $1 IS NULL) ORDER BY created_at DESC',
      [orgId]
    );
    const baseUrl = process.env.BACKEND_URL || process.env.VITE_API_URL || '';
    return rows.map(r => ({ ...r, url: `${baseUrl}/hooks/in/${r.token}` }));
  });

  // ── Create inbound webhook ────────────────────────────────────────────────
  fastify.post('/inbound-webhooks', auth, async (req, reply) => {
    const { name, trigger_action, mapping } = req.body;
    if (!name || !trigger_action) return reply.status(400).send({ error: 'name e trigger_action obrigatórios' });
    const orgId = req.user.organization_id || req.user.org_id || null;
    const { rows } = await query(
      'INSERT INTO inbound_webhooks (organization_id, name, trigger_action, mapping) VALUES ($1,$2,$3,$4) RETURNING *',
      [orgId, name.trim(), trigger_action, JSON.stringify(mapping || {})]
    );
    const baseUrl = process.env.BACKEND_URL || process.env.VITE_API_URL || '';
    const row = rows[0];
    return reply.status(201).send({ ...row, url: `${baseUrl}/hooks/in/${row.token}` });
  });

  // ── Delete inbound webhook ────────────────────────────────────────────────
  fastify.delete('/inbound-webhooks/:id', auth, async (req) => {
    await query('DELETE FROM inbound_webhooks WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // ── PUBLIC trigger endpoint (no auth) ────────────────────────────────────
  fastify.post('/hooks/in/:token', async (req, reply) => {
    const { token } = req.params;
    const body = req.body || {};

    // Lookup webhook by token
    const { rows: hooks } = await query('SELECT * FROM inbound_webhooks WHERE token=$1', [token]);
    if (!hooks[0]) return reply.status(404).send({ error: 'Webhook not found' });
    const hook = hooks[0];

    try {
      if (hook.trigger_action === 'create_contact') {
        const phone = body.phone || body.telefone || body.number;
        const name = body.name || body.nome || phone;
        if (!phone) return reply.status(400).send({ error: 'phone is required' });
        await query(
          'INSERT INTO contacts (name, phone, email) VALUES ($1,$2,$3) ON CONFLICT (phone) DO UPDATE SET name=COALESCE(EXCLUDED.name,contacts.name) RETURNING *',
          [name, phone, body.email || null]
        );

      } else if (hook.trigger_action === 'create_conversation') {
        const phone = body.phone || body.telefone || body.number;
        const name = body.name || body.nome || phone;
        if (!phone) return reply.status(400).send({ error: 'phone is required' });
        const { rows: cRows } = await query(
          'INSERT INTO contacts (name, phone, email) VALUES ($1,$2,$3) ON CONFLICT (phone) DO UPDATE SET name=COALESCE(EXCLUDED.name,contacts.name) RETURNING *',
          [name, phone, body.email || null]
        );
        const contact = cRows[0];
        await query(
          "INSERT INTO conversations (contact_id, connection_name, status) VALUES ($1,$2,'open') RETURNING *",
          [contact.id, body.connection_name || body.instance || '']
        );

      } else if (hook.trigger_action === 'send_message') {
        const phone = body.phone || body.telefone || body.number;
        const text = body.text || body.message || body.mensagem;
        const instanceName = body.instance || body.connection_name;
        if (!phone || !text) return reply.status(400).send({ error: 'phone e text são obrigatórios' });
        const { rows: evo } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
        const e = evo[0];
        if (e?.evolution_url && instanceName) {
          await fetch(`${e.evolution_url}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': e.evolution_key },
            body: JSON.stringify({ number: phone, text })
          });
        }
      }
    } catch (err) {
      console.error('Inbound webhook trigger error:', err.message);
      return reply.status(500).send({ error: err.message });
    }

    return { success: true };
  });
}
