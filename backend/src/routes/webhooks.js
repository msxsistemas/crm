import { query } from '../database.js';

export default async function webhookRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  fastify.get('/webhooks', auth, async (req) => {
    const uid = req.query.user_id || req.user.id;
    const { rows } = await query('SELECT * FROM webhooks WHERE user_id=$1 ORDER BY created_at DESC', [uid]);
    return rows;
  });
  fastify.post('/webhooks', auth, async (req, reply) => {
    const { name, url, events, secret, is_active, active, user_id } = req.body;
    const activeVal = is_active ?? active ?? true;
    const { rows } = await query('INSERT INTO webhooks (name, url, events, secret, is_active, active, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [name, url, events || [], secret, activeVal, activeVal, user_id || req.user.id]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/webhooks/:id', auth, async (req) => {
    const f = req.body;
    const activeVal = f.is_active ?? f.active;
    const { rows } = await query('UPDATE webhooks SET name=COALESCE($1,name), url=COALESCE($2,url), events=COALESCE($3,events), secret=COALESCE($4,secret), is_active=COALESCE($5,is_active), active=COALESCE($5,active) WHERE id=$6 RETURNING *', [f.name, f.url, f.events, f.secret, activeVal, req.params.id]);
    return rows[0];
  });
  fastify.delete('/webhooks/:id', auth, async (req) => {
    await query('DELETE FROM webhooks WHERE id=$1', [req.params.id]); return { ok: true };
  });

  fastify.get('/webhook-logs', auth, async () => {
    const { rows } = await query('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 500');
    return rows;
  });
}
