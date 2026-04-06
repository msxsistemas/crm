import { query, withTransaction } from '../database.js';
import { sendEmailNotification } from '../notifications/emailNotifications.js';

export default async function internalChatRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  fastify.get('/internal-channels', auth, async (req) => {
    const { rows } = await query(`
      SELECT c.*,
        json_agg(DISTINCT jsonb_build_object('id', p.id, 'name', p.name)) FILTER (WHERE p.id IS NOT NULL) as participants
      FROM internal_conversations c
      LEFT JOIN internal_conversation_participants icp ON icp.conversation_id = c.id
      LEFT JOIN profiles p ON p.id = icp.user_id
      WHERE c.created_by = $1 OR icp.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [req.user.id]);
    return rows;
  });

  fastify.post('/internal-channels', auth, async (req, reply) => {
    const { title, participant_ids = [], created_by } = req.body;
    const conv = await withTransaction(async (client) => {
      const { rows: [c] } = await client.query(
        'INSERT INTO internal_conversations (title, created_by) VALUES ($1,$2) RETURNING *',
        [title, created_by || req.user.id]
      );
      const allParticipants = [...new Set([req.user.id, ...participant_ids])];
      for (const uid of allParticipants) {
        await client.query('INSERT INTO internal_conversation_participants (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c.id, uid]);
      }
      return c;
    });
    return reply.status(201).send(conv);
  });

  fastify.patch('/internal-channels/:id', auth, async (req) => {
    const { title, updated_at } = req.body;
    const { rows } = await query(
      'UPDATE internal_conversations SET title=COALESCE($1,title), updated_at=COALESCE($2::timestamptz,NOW()) WHERE id=$3 RETURNING *',
      [title, updated_at, req.params.id]
    );
    return rows[0];
  });

  fastify.get('/internal-messages', auth, async (req) => {
    const { conversation_id } = req.query;
    if (!conversation_id) return [];
    const { rows } = await query(
      'SELECT m.*, p.name as sender_name FROM internal_messages m LEFT JOIN profiles p ON p.id = m.sender_id WHERE m.conversation_id = $1 ORDER BY m.created_at ASC',
      [conversation_id]
    );
    return rows;
  });

  fastify.post('/internal-messages', auth, async (req, reply) => {
    const { conversation_id, text } = req.body;
    const msg = await withTransaction(async (client) => {
      const { rows: [m] } = await client.query(
        'INSERT INTO internal_messages (conversation_id, sender_id, sender_name, text) VALUES ($1,$2,$3,$4) RETURNING *',
        [conversation_id, req.user.id, req.user.name, text]
      );
      await client.query('UPDATE internal_conversations SET updated_at = NOW() WHERE id = $1', [conversation_id]);
      return m;
    });
    if (fastify.io) fastify.io.emit(`chat:${conversation_id}`, msg);

    // Detectar menções @nome e enviar notificação por e-mail
    if (text && text.includes('@')) {
      const mentionPattern = /@([a-zA-ZÀ-ÿ0-9_.\- ]+)/g;
      const mentions = [];
      let match;
      while ((match = mentionPattern.exec(text)) !== null) {
        mentions.push(match[1].trim());
      }
      if (mentions.length > 0) {
        query(
          `SELECT id FROM profiles WHERE name ILIKE ANY($1::text[])`,
          [mentions]
        ).then(({ rows: mentionedUsers }) => {
          for (const u of mentionedUsers) {
            if (u.id === req.user.id) continue; // não notificar a si mesmo
            sendEmailNotification(u.id, 'mention', {
              mentionedBy: req.user.name || 'Agente',
              conversationId: conversation_id,
              messagePreview: text.substring(0, 200),
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    return reply.status(201).send(msg);
  });

  fastify.post('/internal-conversation-participants', auth, async (req, reply) => {
    const body = req.body;
    const participants = Array.isArray(body) ? body : [body];
    for (const p of participants) {
      await query(
        'INSERT INTO internal_conversation_participants (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [p.conversation_id, p.user_id]
      ).catch(() => {});
    }
    return reply.status(201).send({ ok: true });
  });
}
