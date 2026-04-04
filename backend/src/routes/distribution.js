import { query, withTransaction } from '../database.js';

export default async function distributionRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // ── Conversation Transfers ─────────────────────────────────────────────────
  fastify.get('/conversation-transfers', auth, async () => {
    const { rows } = await query('SELECT * FROM conversation_transfers ORDER BY transferred_at DESC LIMIT 100');
    return rows;
  });
  fastify.post('/conversation-transfers', auth, async (req, reply) => {
    const { conversation_id, to_agent_id, note } = req.body;
    const transfer = await withTransaction(async (client) => {
      const { rows: [agent] } = await client.query('SELECT name FROM profiles WHERE id=$1', [to_agent_id]);
      const { rows: [t] } = await client.query('INSERT INTO conversation_transfers (conversation_id, from_agent_id, to_agent_id, from_agent_name, to_agent_name, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [conversation_id, req.user.id, to_agent_id, req.user.name, agent?.name, note]);
      await client.query('UPDATE conversations SET assigned_to=$1, updated_at=NOW() WHERE id=$2', [to_agent_id, conversation_id]);
      return t;
    });
    return reply.status(201).send(transfer);
  });

  // ── Auto Distribution Config ───────────────────────────────────────────────
  fastify.get('/auto-distribution-config', auth, async () => {
    const { rows } = await query('SELECT * FROM auto_distribution_config LIMIT 1');
    return rows[0] || {};
  });
  fastify.patch('/auto-distribution-config', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE auto_distribution_config SET is_active=COALESCE($1,is_active), mode=COALESCE($2,mode), max_conversations_per_agent=COALESCE($3,max_conversations_per_agent), respect_working_hours=COALESCE($4,respect_working_hours) WHERE id=(SELECT id FROM auto_distribution_config LIMIT 1) RETURNING *', [f.is_active, f.mode, f.max_conversations_per_agent, f.respect_working_hours]);
    return rows[0];
  });
}
