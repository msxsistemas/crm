import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Michael/AppData/Roaming/npm/node_modules/playwright/index.js');
import { mkdirSync } from 'fs';

const BASE  = 'https://msxzap.pro';
const EMAIL = 'planostreaming25@gmail.com';
const PASS  = '87066690';

mkdirSync('screenshots/agent', { recursive: true });

let shotN = 0;
const ERROS = [];
const SAVES = [];

async function shot(page, name) {
  const f = `screenshots/agent/${String(++shotN).padStart(2,'0')}-${name}.png`;
  await page.screenshot({ path: f, fullPage: false });
  console.log(`  📸 ${f}`);
}

async function goto(page, path, label) {
  console.log(`\n→ ${label}`);
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, label.replace(/[^a-z0-9]/gi,'_').toLowerCase());
}

// Tenta clicar qualquer botão de salvar visível
async function trySave(page, label) {
  const btns = [
    'button:has-text("Salvar")',
    'button:has-text("Confirmar")',
    'button[type="submit"]:visible',
  ];
  for (const sel of btns) {
    const b = page.locator(sel).first();
    if (await b.isVisible().catch(() => false)) {
      const txt = (await b.textContent().catch(() => '')).trim();
      await b.click().catch(() => {});
      await page.waitForTimeout(1800);
      // Verifica toast de sucesso ou erro
      const successToast = page.locator('[data-sonner-toast], .toast, [role="status"]').filter({ hasText: /sucesso|salvo|criado|atualizado/i });
      const errorToast   = page.locator('[data-sonner-toast], .toast, [role="alert"]').filter({ hasText: /erro|falhou|inválido/i });
      const ok  = await successToast.first().isVisible().catch(() => false);
      const err = await errorToast.first().isVisible().catch(() => false);
      const status = ok ? '✅' : err ? '❌' : '⚪';
      console.log(`    💾 "${txt}" → ${status} ${ok ? 'SALVO' : err ? 'ERRO' : 'sem toast'}`);
      SAVES.push({ page: label, btn: txt, ok, err });
      await shot(page, label.replace(/[^a-z0-9]/gi,'_').toLowerCase() + '_save');
      return;
    }
  }
}

// Fecha modais/dialogs abertos
async function closeModal(page) {
  const keys = ['Escape'];
  for (const k of keys) {
    await page.keyboard.press(k).catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Captura erros
  page.on('response', r => {
    const url = r.url();
    if (r.status() >= 400 && !url.includes('cdn-cgi') && !url.includes('socket.io') && !url.includes('auth/refresh') && !url.includes('cdn.pixabay')) {
      ERROS.push(`HTTP ${r.status()}: ${url.replace('https://api.msxzap.pro','API').replace(BASE,'')}`);
    }
  });
  page.on('pageerror', e => ERROS.push(`JS: ${e.message.substring(0,120)}`));

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  console.log('\n🔐 Fazendo login como agente...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !String(u).includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(2500);
  console.log('✅ Logado:', page.url());
  await shot(page, '00_login_ok');

  // Fechar onboarding tour se aparecer
  await page.locator('button:has-text("Pular"), button:has-text("Fechar")').first().click().catch(() => {});
  await page.waitForTimeout(400);

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  await goto(page, '/', 'Dashboard');

  // ── INBOX / CHATS ─────────────────────────────────────────────────────────
  await goto(page, '/inbox', 'Inbox_Chats');

  // ── CONTATOS ──────────────────────────────────────────────────────────────
  await goto(page, '/contatos', 'Contatos');
  // Criar novo contato
  const btnNovoC = page.locator('button:has-text("Novo Contato"), button:has-text("+ Novo")').first();
  if (await btnNovoC.isVisible().catch(() => false)) {
    await btnNovoC.click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'contatos_modal');
    // Preenche campos obrigatórios
    await page.locator('input[placeholder*="nome"], input[placeholder*="Nome"], [name="name"]').first().fill('Contato Teste Playwright').catch(() => {});
    await page.locator('input[placeholder*="telefone"], input[placeholder*="55"], [name="phone"]').first().fill('5511999887766').catch(() => {});
    await page.locator('input[placeholder*="email"], input[type="email"]').last().fill('teste@playwright.com').catch(() => {});
    await trySave(page, 'Contatos_Novo');
    await closeModal(page);
  }
  await shot(page, 'contatos_apos_save');

  // ── TAREFAS ───────────────────────────────────────────────────────────────
  await goto(page, '/tarefas', 'Tarefas');
  const btnNovaTarefa = page.locator('button:has-text("Nova Tarefa"), button:has-text("+ Nova")').first();
  if (await btnNovaTarefa.isVisible().catch(() => false)) {
    await btnNovaTarefa.click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'tarefas_modal');
    await page.locator('input[placeholder*="título"], input[placeholder*="Título"], [name="title"]').first().fill('Tarefa de Teste Playwright').catch(() => {});
    await page.locator('textarea, [name="description"]').first().fill('Descrição da tarefa de teste').catch(() => {});
    await trySave(page, 'Tarefas_Nova');
    await closeModal(page);
  }

  // ── AGENDAMENTOS ──────────────────────────────────────────────────────────
  await goto(page, '/agendamentos', 'Agendamentos');
  const btnNovoAgend = page.locator('button:has-text("+ Novo Agendamento"), button:has-text("Novo Agendamento")').first();
  if (await btnNovoAgend.isVisible().catch(() => false)) {
    await btnNovoAgend.click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'agendamentos_modal');
    // Preenche campos
    await page.locator('input[placeholder*="nome"], [placeholder*="Nome"]').first().fill('João Teste').catch(() => {});
    await page.locator('input[placeholder*="55"], [placeholder*="telefone"]').first().fill('5511988776655').catch(() => {});
    await page.locator('textarea, input[placeholder*="mensagem"]').first().fill('Mensagem de teste para agendamento').catch(() => {});
    await trySave(page, 'Agendamentos_Novo');
    await closeModal(page);
  }

  // ── CHAT INTERNO ─────────────────────────────────────────────────────────
  await goto(page, '/chat-interno', 'Chat_Interno');
  const btnNovaConversa = page.locator('button:has-text("Nova Conversa"), button:has-text("+ Nova Conversa")').first();
  if (await btnNovaConversa.isVisible().catch(() => false)) {
    await btnNovaConversa.click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, 'chat_interno_modal');
    await closeModal(page);
  }

  // ── KANBAN ────────────────────────────────────────────────────────────────
  await goto(page, '/kanban', 'Kanban');
  await page.waitForTimeout(2000); // espera carregar boards
  await shot(page, 'kanban_carregado');

  // ── PESQUISAR ─────────────────────────────────────────────────────────────
  await goto(page, '/pesquisar', 'Pesquisar');

  // ── GRUPOS DE CONTATOS ───────────────────────────────────────────────────
  await goto(page, '/grupos-contatos', 'Grupos_Contatos');

  // ── TAGS ─────────────────────────────────────────────────────────────────
  await goto(page, '/tags', 'Tags');
  const btnNovaTag = page.locator('button:has-text("Nova Tag"), button:has-text("+ Nova")').first();
  if (await btnNovaTag.isVisible().catch(() => false)) {
    await btnNovaTag.click().catch(() => {});
    await page.waitForTimeout(800);
    await page.locator('input[placeholder*="tag"], input[placeholder*="nome"]').first().fill('tag-teste').catch(() => {});
    await trySave(page, 'Tags_Nova');
    await closeModal(page);
  }

  // ── CATEGORIAS ────────────────────────────────────────────────────────────
  await goto(page, '/categorias', 'Categorias');

  // ── SEGMENTOS ─────────────────────────────────────────────────────────────
  await goto(page, '/segmentos', 'Segmentos');

  // ── RESPOSTAS RÁPIDAS ────────────────────────────────────────────────────
  await goto(page, '/respostas-rapidas', 'Respostas_Rapidas');
  const btnNovaRR = page.locator('button:has-text("Nova Resposta"), button:has-text("+ Nova")').first();
  if (await btnNovaRR.isVisible().catch(() => false)) {
    await btnNovaRR.click().catch(() => {});
    await page.waitForTimeout(800);
    await page.locator('input[placeholder*="atalho"], input[placeholder*="título"]').first().fill('/saudacao').catch(() => {});
    await page.locator('textarea').first().fill('Olá! Como posso ajudar?').catch(() => {});
    await trySave(page, 'Respostas_Rapidas_Nova');
    await closeModal(page);
  }

  // ── CHAT INTERNO (enviar msg) ─────────────────────────────────────────────
  // já feito acima

  // ── BOTS ─────────────────────────────────────────────────────────────────
  await goto(page, '/bots', 'Bots');

  // ── AGENTE IA ────────────────────────────────────────────────────────────
  await goto(page, '/agente-ia', 'Agente_IA');
  await trySave(page, 'Agente_IA');

  // ── AVALIAÇÕES ───────────────────────────────────────────────────────────
  await goto(page, '/avaliacoes', 'Avaliacoes');

  // ── RELATÓRIOS ───────────────────────────────────────────────────────────
  await goto(page, '/relatorios', 'Relatorios');

  // ── SLA ──────────────────────────────────────────────────────────────────
  await goto(page, '/sla', 'SLA');

  // ── HSM TEMPLATES ────────────────────────────────────────────────────────
  await goto(page, '/hsm-templates', 'HSM_Templates');

  // ── METAS ────────────────────────────────────────────────────────────────
  await goto(page, '/metas', 'Metas');

  // ── SUPERVISOR ───────────────────────────────────────────────────────────
  await goto(page, '/supervisor', 'Supervisor');

  // ── CONFIGURAÇÕES ────────────────────────────────────────────────────────
  await goto(page, '/configuracoes', 'Configuracoes');
  await page.waitForTimeout(1000);
  await shot(page, 'configuracoes_antes');
  await trySave(page, 'Configuracoes');

  // ── CONEXÕES ─────────────────────────────────────────────────────────────
  await goto(page, '/conexoes', 'Conexoes');

  // ── CAMPANHAS ────────────────────────────────────────────────────────────
  await goto(page, '/campanhas', 'Campanhas');

  // ── HORÁRIOS AGENTES ─────────────────────────────────────────────────────
  await goto(page, '/horarios-agentes', 'Horarios_Agentes');
  await trySave(page, 'Horarios_Agentes');

  // ── DISTRIBUIÇÃO AUTO ────────────────────────────────────────────────────
  await goto(page, '/distribuicao-automatica', 'Distribuicao_Auto');
  await trySave(page, 'Distribuicao_Auto');

  // ── USUÁRIOS ─────────────────────────────────────────────────────────────
  await goto(page, '/usuarios', 'Usuarios');

  await browser.close();

  // ── RELATÓRIO FINAL ───────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESULTADO FINAL\n');

  // Saves
  const savesOk  = SAVES.filter(s => s.ok);
  const savesErr = SAVES.filter(s => s.err);
  const savesSem = SAVES.filter(s => !s.ok && !s.err);
  console.log(`💾 Salvamentos: ${savesOk.length} ✅ ok  |  ${savesErr.length} ❌ erro  |  ${savesSem.length} ⚪ sem toast`);
  if (savesErr.length) {
    console.log('   Erros ao salvar:');
    savesErr.forEach(s => console.log(`   ❌ ${s.page} — "${s.btn}"`));
  }
  if (savesSem.length) {
    console.log('   Sem toast (verificar manualmente):');
    savesSem.forEach(s => console.log(`   ⚪ ${s.page} — "${s.btn}"`));
  }

  // Erros HTTP
  const criticos = ERROS.filter(e => !e.includes('401') && !e.includes('400'));
  if (criticos.length === 0) {
    console.log('\n✅ Nenhum erro HTTP crítico!');
  } else {
    console.log(`\n🔴 Erros HTTP (${criticos.length}):`);
    [...new Set(criticos)].forEach(e => console.log('  ', e));
  }

  // Erros JS
  const jsErros = ERROS.filter(e => e.startsWith('JS:'));
  if (jsErros.length) {
    console.log(`\n🟡 Erros JS (${jsErros.length}):`);
    [...new Set(jsErros)].slice(0, 10).forEach(e => console.log('  ', e));
  }

  console.log('\n📁 Screenshots: screenshots/agent/');
  console.log('='.repeat(70));
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
