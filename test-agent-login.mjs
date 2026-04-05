import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Michael/AppData/Roaming/npm/node_modules/playwright/index.js');

const URL = 'https://msxzap.pro';
const EMAIL = 'planostreaming25@gmail.com';
const PASSWORD = '87066690';
const ERRORS = [];

async function shot(page, name) {
  await page.screenshot({ path: `screenshots/agent-${name}.png`, fullPage: true });
  console.log(`📸 agent-${name}.png`);
}

async function main() {
  const { mkdirSync } = await import('fs');
  mkdirSync('screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', m => { if (m.type() === 'error') ERRORS.push(m.text()); });
  page.on('pageerror', e => ERRORS.push(e.message));
  page.on('requestfailed', r => ERRORS.push(`FAILED: ${r.url()}`));

  console.log('\n🌐 Abrindo', URL);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await shot(page, '01-home');

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await shot(page, '02-login-preenchido');
  await page.click('button[type="submit"]');

  await page.waitForURL(u => !u.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, '03-pos-login');
  console.log('✅ URL após login:', page.url());

  // Aguarda um pouco para carregar dados
  await page.waitForTimeout(3000);
  await shot(page, '04-dashboard-carregado');

  await browser.close();

  console.log('\n' + '='.repeat(60));
  if (ERRORS.length === 0) {
    console.log('✅ Nenhum erro detectado!');
  } else {
    const relevant = ERRORS.filter(e => !e.includes('cdn-cgi') && !e.includes('auth/refresh'));
    console.log(`⚠️  ${relevant.length} erro(s) relevante(s):`);
    relevant.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
  console.log('='.repeat(60));
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
