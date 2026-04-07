// Push Notifications via Web Push (VAPID)
// IMPORTANTE: Adicionar ao .env:
//   VAPID_PUBLIC_KEY=<chave pública gerada com: npx web-push generate-vapid-keys>
//   VAPID_PRIVATE_KEY=<chave privada gerada com: npx web-push generate-vapid-keys>
//   VAPID_EMAIL=mailto:admin@seudominio.com

import webpush from 'web-push';
import { query } from '../database.js';

// Configurar VAPID apenas se as chaves estiverem definidas
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

/**
 * Envia notificação push para um usuário específico
 * @param {string} userId - UUID do usuário
 * @param {string} title - Título da notificação
 * @param {string} body - Corpo da notificação
 * @param {object} data - Dados extras (ex: conversationId)
 */
export async function sendPushNotification(userId, title, body, data = {}) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  try {
    const { rows } = await query(
      'SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    if (!rows.length) return;

    const payload = JSON.stringify({ title, body, data, timestamp: Date.now() });

    for (const sub of rows) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: sub.keys,
      };
      webpush.sendNotification(pushSub, payload).catch(async (err) => {
        // Se 410 Gone ou 404, a subscription expirou — remover
        if (err.statusCode === 410 || err.statusCode === 404) {
          await query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [sub.endpoint]
          ).catch(() => {});
        }
      });
    }
  } catch (err) {
    console.error('sendPushNotification error:', err.message);
  }
}

export const vapidPublicKey = VAPID_PUBLIC || null;
