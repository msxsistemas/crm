import nodemailer from 'nodemailer';
import { query } from '../database.js';

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;
  const { rows } = await query('SELECT smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure FROM settings WHERE id=1');
  const s = rows[0];
  if (!s?.smtp_host || !s?.smtp_user) return null;

  _transporter = nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port || '587'),
    secure: s.smtp_secure ?? false,
    auth: { user: s.smtp_user, pass: s.smtp_pass },
  });
  _transporter._from = s.smtp_from || s.smtp_user;
  return _transporter;
}

// Reset cached transporter when settings change
export function resetTransporter() {
  _transporter = null;
}

async function sendMail(to, subject, html) {
  try {
    const transporter = await getTransporter();
    if (!transporter) return; // SMTP not configured — silently skip
    await transporter.sendMail({ from: transporter._from, to, subject, html });
  } catch (e) {
    console.error('Email send error:', e.message);
  }
}

/** Notify agent when a conversation is assigned to them */
export async function notifyConversationAssigned({ agentId, contactName, conversationId }) {
  const { rows } = await query('SELECT email, name FROM profiles WHERE id=$1', [agentId]);
  const agent = rows[0];
  if (!agent?.email) return;

  await sendMail(
    agent.email,
    `Nova conversa atribuída — ${contactName}`,
    `
    <p>Olá, <b>${agent.name}</b>!</p>
    <p>A conversa com <b>${contactName}</b> foi atribuída a você.</p>
    <p><a href="${process.env.FRONTEND_URL}/inbox?conversation=${conversationId}">Abrir conversa</a></p>
    `
  );
}

/** Notify agent when a temporary password is generated */
export async function notifyTempPassword({ email, name, tempPassword }) {
  await sendMail(
    email,
    'Sua conta MSX CRM foi criada',
    `
    <p>Olá, <b>${name}</b>!</p>
    <p>Sua conta foi criada no MSX CRM.</p>
    <p><b>Email:</b> ${email}<br/>
    <b>Senha temporária:</b> <code>${tempPassword}</code></p>
    <p>Faça login e altere sua senha no primeiro acesso.</p>
    <p><a href="${process.env.FRONTEND_URL}/login">Acessar o sistema</a></p>
    `
  );
}

/** Notify agent when SLA deadline is approaching (called from SLA check job) */
export async function notifySLAWarning({ agentId, contactName, conversationId, minutesLeft }) {
  const { rows } = await query('SELECT email, name FROM profiles WHERE id=$1', [agentId]);
  const agent = rows[0];
  if (!agent?.email) return;

  await sendMail(
    agent.email,
    `⚠️ SLA se aproxima — ${contactName}`,
    `
    <p>Olá, <b>${agent.name}</b>!</p>
    <p>A conversa com <b>${contactName}</b> precisa de resposta em <b>${minutesLeft} minutos</b> para cumprir o SLA.</p>
    <p><a href="${process.env.FRONTEND_URL}/inbox?conversation=${conversationId}">Abrir conversa</a></p>
    `
  );
}
