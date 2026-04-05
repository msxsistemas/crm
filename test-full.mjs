import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Michael/AppData/Roaming/npm/node_modules/playwright/index.js');
import { mkdirSync } from 'fs';

const BASE = 'https://msxzap.pro';
const EMAIL = 'admin@msxzap.pro';
const PASS  = 'Admin@2026!';

mkdirSync('screenshots/full', { recursive: true });

const ERRORS = [];
let shotN = 0;

async function shot(page, name) {
  const file = `screenshots/full/${String(++shotN).padStart(2,'0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${file}`);
}

async function goto(page, path, label) {
  console.log(`\n→ ${label} (${path})`);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, label.replace(/[^a-z0-9]/gi, '_').toLowerCase());
}

async function clickSave(page, label) {
  // Try various save button selectors
  const selectors = [
    'button:has-text("Salvar")',
    'button:has-text("Salvar alterações")',
    'button:has-text("Salvar configurações")',
    'button:has-text("Confirmar")',
    'button[type="submit"]:visible',
  ];
  for (const sel of selectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      console.log(`    💾 Clicando "${await btn.textContent()}" em ${label}`);
      await btn.click().catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, `${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_saved`);
      return true;
    }
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('requestfailed', r => {
    const url = r.url();
    if (!url.includes('cdn-cgi') && !url.includes('socket.io') && !url.includes('sw.js')) {
      ERRORS.push(`FAILED: ${r.method()} ${url}`);
    }
  });
  page.on('response', r => {
    if (r.status() >= 400 && !r.url().includes('cdn-cgi') && !r.url().includes('socket.io')) {
      ERRORS.push(`HTTP ${r.status()}: ${r.url().replace(BASE,'').replace('https://api.msxzap.pro','')}`);
    }
  });

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  console.log('\n🔐 Login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !String(u).includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(2000);
  console.log('✅ Logado:', page.url());
  await shot(page, 'login_ok');

  // Fechar tour se aparecer
  const tourClose = page.locator('button:has-text("Pular"), button:has-text("Fechar"), button:has-text("×"), [aria-label="Close"]').first();
  if (await tourClose.isVisible().catch(() => false)) {
    await tourClose.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // ── PÁGINAS PRINCIPAIS ────────────────────────────────────────────────────

  await goto(page, '/', 'Dashboard');

  await goto(page, '/inbox', 'Inbox');

  await goto(page, '/contatos', 'Contatos');
  // Tenta abrir modal novo contato
  const btnNovoContato = page.locator('button:has-text("Novo Contato"), button:has-text("+ Novo")').first();
  if (await btnNovoContato.isVisible().catch(() => false)) {
    await btnNovoContato.click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'contatos_modal_novo');
    // Fechar modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  await goto(page, '/tarefas', 'Tarefas');
  const btnNovaTarefa = page.locator('button:has-text("Nova Tarefa"), button:has-text("+ Nova Tarefa")').first();
  if (await btnNovaTarefa.isVisible().catch(() => false)) {
    await btnNovaTarefa.click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'tarefas_modal_novo');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  await goto(page, '/agendamentos', 'Agendamentos');
  const btnNovoAgend = page.locator('button:has-text("Novo Agendamento"), button:has-text("+ Novo Agendamento")').first();
  if (await btnNovoAgend.isVisible().catch(() => false)) {
    await btnNovoAgend.click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'agendamentos_modal_novo');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  await goto(page, '/chat-interno', 'Chat_Interno');

  await goto(page, '/kanban', 'Kanban');

  await goto(page, '/usuarios', 'Usuarios');

  await goto(page, '/configuracoes', 'Configuracoes');
  await clickSave(page, 'Configuracoes');

  await goto(page, '/conexoes', 'Conexoes');

  await goto(page, '/campanhas', 'Campanhas');

  await goto(page, '/tags', 'Tags');

  await goto(page, '/categorias', 'Categorias');

  await goto(page, '/respostas-rapidas', 'Respostas_Rapidas');

  await goto(page, '/bots', 'Bots');

  await goto(page, '/agente-ia', 'Agente_IA');

  await goto(page, '/avaliacoes', 'Avaliacoes');

  await goto(page, '/relatorios', 'Relatorios');

  await goto(page, '/sla', 'SLA');

  await goto(page, '/hsm-templates', 'HSM_Templates');

  await goto(page, '/horarios-agentes', 'Horarios_Agentes');
  await clickSave(page, 'Horarios_Agentes');

  await goto(page, '/distribuicao-automatica', 'Distribuicao_Auto');
  await clickSave(page, 'Distribuicao_Auto');

  await goto(page, '/metas', 'Metas');

  await goto(page, '/supervisor', 'Supervisor');

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  await goto(page, '/admin', 'Admin_Dashboard');
  await goto(page, '/admin/revendedores', 'Admin_Revendedores');
  await goto(page, '/admin/planos', 'Admin_Planos');
  await goto(page, '/admin/usuarios', 'Admin_Usuarios');
  await goto(page, '/admin/financeiro', 'Admin_Financeiro');
  await goto(page, '/admin/conexoes', 'Admin_Conexoes');
  await goto(page, '/admin/assinaturas', 'Admin_Assinaturas');
  await goto(page, '/admin/gateway', 'Admin_Gateway');
  await clickSave(page, 'Admin_Gateway');
  await goto(page, '/admin/configuracoes', 'Admin_Configuracoes');
  await clickSave(page, 'Admin_Configuracoes');

  await browser.close();

  // ── RELATÓRIO ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  const apiErrors = ERRORS.filter(e => e.startsWith('HTTP') && !e.includes('401') && !e.includes('404'));
  const failedReq = ERRORS.filter(e => e.startsWith('FAILED'));
  const http401   = ERRORS.filter(e => e.includes('401'));
  const http4xx   = ERRORS.filter(e => e.startsWith('HTTP 4') && !e.includes('401'));

  if (apiErrors.length === 0 && failedReq.length === 0) {
    console.log('✅ Nenhum erro crítico!');
  } else {
    if (http4xx.length) {
      console.log(`\n🔴 Erros HTTP 4xx (${http4xx.length}):`);
      [...new Set(http4xx)].forEach(e => console.log('  ', e));
    }
    if (failedReq.length) {
      console.log(`\n🟡 Requests com falha de rede (${failedReq.length}):`);
      [...new Set(failedReq)].slice(0, 10).forEach(e => console.log('  ', e));
    }
  }
  if (http401.length) {
    console.log(`\n⚪ 401s (${http401.length} — normais antes do login / token expirado):`);
    [...new Set(http401)].slice(0, 5).forEach(e => console.log('  ', e));
  }
  console.log('\n📁 Screenshots: screenshots/full/');
  console.log('='.repeat(70));
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
