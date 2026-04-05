import { query } from '../database.js';

export default async function statsRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // Single endpoint replacing the 5 parallel TopBar queries
  fastify.get('/stats/topbar', auth, async (req) => {
    const userId = req.user.id;

    const { rows } = await query(`
      SELECT
        p.full_name,
        p.status,
        (SELECT COUNT(*)::int FROM evolution_connections WHERE user_id = $1 AND status = 'open') AS connection_count,
        (SELECT COUNT(*)::int FROM conversations WHERE unread_count > 0) AS unread_conversations,
        (SELECT COUNT(*)::int FROM conversations WHERE status = 'open') AS waiting_conversations
      FROM profiles p
      WHERE p.id = $1
    `, [userId]);

    const row = rows[0] || {};
    return {
      fullName: row.full_name || null,
      status: row.status || 'online',
      connectionCount: row.connection_count ?? 0,
      unreadConversations: row.unread_conversations ?? 0,
      waitingConversations: row.waiting_conversations ?? 0,
    };
  });

  // Dashboard summary — returns aggregated counts without loading all rows
  fastify.get('/stats/dashboard', auth, async (req) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString();

    const { rows } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM conversations) AS total_conversations,
        (SELECT COUNT(*)::int FROM conversations WHERE status = 'open') AS open_conversations,
        (SELECT COUNT(*)::int FROM conversations WHERE unread_count > 0) AS unread_conversations,
        (SELECT COUNT(*)::int FROM contacts) AS total_contacts,
        (SELECT COUNT(*)::int FROM messages WHERE created_at >= $1) AS messages_90d,
        (SELECT COUNT(*)::int FROM profiles WHERE role IN ('agent','supervisor','admin')) AS total_agents
    `, [cutoffIso]);

    return rows[0] || {};
  });
}
