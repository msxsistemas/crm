/**
 * Notificações por e-mail configuráveis por usuário
 * Usa Resend API (RESEND_API_KEY) ou SMTP via email.js como fallback
 */

import { query } from '../database.js';

const FROM_EMAIL = process.env.REPORT_FROM_EMAIL || 'noreply@msxzap.pro';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://msxzap.pro';

/**
 * Envia e-mail via Resend API
 */
async function sendViaResend(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    return res.ok;
  } catch (e) {
    console.error('[emailNotifications] Resend error:', e.message);
    return false;
  }
}

/**
 * Busca configurações de notificação do usuário.
 * Retorna defaults (tudo habilitado) se não houver registro.
 */
async function getUserNotifSettings(userId) {
  const { rows } = await query(
    'SELECT * FROM email_notification_settings WHERE user_id = $1 LIMIT 1',
    [userId]
  ).catch(() => ({ rows: [] }));
  if (rows[0]) return rows[0];
  // defaults
  return { on_new_conversation: true, on_sla_expiring: true, on_mention: true, email_override: null };
}

/**
 * Resolve o e-mail de destino: usa email_override se configurado, senão o e-mail do perfil
 */
async function resolveRecipient(userId, settings) {
  if (settings.email_override) return settings.email_override;
  const { rows } = await query('SELECT email FROM profiles WHERE id = $1 LIMIT 1', [userId]);
  return rows[0]?.email || null;
}

/**
 * Envia notificação por e-mail para um usuário conforme o tipo
 * type: 'new_conversation' | 'sla_expiring' | 'mention'
 * data: objeto com campos relevantes ao tipo
 */
export async function sendEmailNotification(userId, type, data) {
  try {
    const settings = await getUserNotifSettings(userId);

    // Verificar se o tipo está habilitado
    const enabledMap = {
      new_conversation: settings.on_new_conversation,
      sla_expiring: settings.on_sla_expiring,
      mention: settings.on_mention,
    };
    if (!enabledMap[type]) return;

    const to = await resolveRecipient(userId, settings);
    if (!to) return;

    const { rows: userRows } = await query('SELECT name FROM profiles WHERE id = $1 LIMIT 1', [userId]);
    const userName = userRows[0]?.name || 'Agente';

    let subject = '';
    let html = '';

    if (type === 'new_conversation') {
      const { contactName, conversationId } = data;
      subject = `Nova conversa atribuída — ${contactName}`;
      html = `
        <p>Olá, <b>${userName}</b>!</p>
        <p>A conversa com <b>${contactName}</b> foi atribuída a você.</p>
        <p><a href="${FRONTEND_URL}/inbox?conversation=${conversationId}"
            style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          Abrir conversa
        </a></p>
      `;
    } else if (type === 'sla_expiring') {
      const { contactName, conversationId, minutesLeft } = data;
      subject = `SLA expirando — ${contactName}`;
      html = `
        <p>Olá, <b>${userName}</b>!</p>
        <p>A conversa com <b>${contactName}</b> precisa de resposta em <b>${minutesLeft} minutos</b> para cumprir o SLA.</p>
        <p><a href="${FRONTEND_URL}/inbox?conversation=${conversationId}"
            style="background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          Abrir conversa
        </a></p>
      `;
    } else if (type === 'mention') {
      const { mentionedBy, conversationId, messagePreview } = data;
      subject = `Você foi mencionado por ${mentionedBy}`;
      html = `
        <p>Olá, <b>${userName}</b>!</p>
        <p><b>${mentionedBy}</b> mencionou você em uma conversa.</p>
        ${messagePreview ? `<blockquote style="border-left:3px solid #3b82f6;padding-left:12px;color:#555;">${messagePreview}</blockquote>` : ''}
        <p><a href="${FRONTEND_URL}/inbox?conversation=${conversationId}"
            style="background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          Ver mensagem
        </a></p>
      `;
    }

    if (!subject) return;
    await sendViaResend(to, subject, html);
  } catch (e) {
    console.error('[emailNotifications] sendEmailNotification error:', e.message);
  }
}
