import { query } from '../database.js';

export default async function emailNotificationSettingsRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // GET /email-notification-settings — retorna as configurações do usuário logado
  fastify.get('/email-notification-settings', auth, async (req) => {
    const userId = req.user.id;
    const { rows } = await query(
      'SELECT * FROM email_notification_settings WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (rows[0]) return rows[0];
    // Retorna defaults se ainda não configurado
    return {
      user_id: userId,
      on_new_conversation: true,
      on_sla_expiring: true,
      on_mention: true,
      email_override: null,
    };
  });

  // PUT /email-notification-settings — cria ou atualiza configurações do usuário logado
  fastify.put('/email-notification-settings', auth, async (req, reply) => {
    const userId = req.user.id;
    const { on_new_conversation, on_sla_expiring, on_mention, email_override } = req.body || {};

    const { rows } = await query(
      `INSERT INTO email_notification_settings
         (user_id, on_new_conversation, on_sla_expiring, on_mention, email_override, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         on_new_conversation = EXCLUDED.on_new_conversation,
         on_sla_expiring     = EXCLUDED.on_sla_expiring,
         on_mention          = EXCLUDED.on_mention,
         email_override      = EXCLUDED.email_override,
         updated_at          = NOW()
       RETURNING *`,
      [
        userId,
        on_new_conversation !== undefined ? on_new_conversation : true,
        on_sla_expiring !== undefined ? on_sla_expiring : true,
        on_mention !== undefined ? on_mention : true,
        email_override || null,
      ]
    );
    return rows[0];
  });
}
