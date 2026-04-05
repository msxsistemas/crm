import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Michael/AppData/Roaming/npm/node_modules/playwright/index.js');

const URL = 'https://msxzap.pro';
const EMAIL = 'admin@msxzap.pro';
const PASSWORD = 'Admin@2026!';
const ERRORS = [];

async function shot(page, name) {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  console.log(`📸 ${name}.png`);
}

async function collectErrors(page) {
  const msgs = [];
  page.on('console', m => { if (m.type() === 'error') msgs.push(m.text()); });
  page.on('pageerror', e => msgs.push(e.message));
  page.on('requestfailed', r => msgs.push(`FAILED: ${r.method()} ${r.url()}`));
  return msgs;
}

async function main() {
  const { mkdirSync } = await import('fs');
  mkdirSync('screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = await collectErrors(page);

  // ── 1. Login ──────────────────────────────────────────────────────────────
  console.log('\n🌐 Abrindo', URL);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await shot(page, '01-home');

  // Fill login form
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await shot(page, '02-login-preenchido');
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForURL(u => !u.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, '03-pos-login');
  console.log('✅ URL após login:', page.url());

  // ── 2. Dashboard principal ────────────────────────────────────────────────
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '04-dashboard');

  // ── 3. Inbox ──────────────────────────────────────────────────────────────
  await page.goto(`${URL}/inbox`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '05-inbox');

  // ── 4. Contatos ───────────────────────────────────────────────────────────
  await page.goto(`${URL}/contatos`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '06-contatos');

  // ── 5. Configurações ──────────────────────────────────────────────────────
  await page.goto(`${URL}/configuracoes`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '07-configuracoes');

  // ── 6. Usuários ───────────────────────────────────────────────────────────
  await page.goto(`${URL}/usuarios`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '08-usuarios');

  // ── 7. Tarefas ────────────────────────────────────────────────────────────
  await page.goto(`${URL}/tarefas`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '09-tarefas');

  // ── 8. Agendamentos ───────────────────────────────────────────────────────
  await page.goto(`${URL}/agendamentos`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '10-agendamentos');

  // ── 9. Chat Interno ───────────────────────────────────────────────────────
  await page.goto(`${URL}/chat-interno`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '11-chat-interno');

  // ── 10. Admin Dashboard ───────────────────────────────────────────────────
  await page.goto(`${URL}/admin`, { waitUntil: 'networkidle' }).catch(() => {});
  await shot(page, '12-admin');

  // ── Relatório de erros ────────────────────────────────────────────────────
  await browser.close();

  console.log('\n' + '='.repeat(60));
  if (errors.length === 0) {
    console.log('✅ Nenhum erro de console/rede detectado!');
  } else {
    console.log(`⚠️  ${errors.length} erro(s) detectado(s):`);
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
  console.log('='.repeat(60));
  console.log('📁 Screenshots em: screenshots/');
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
