(function () {
  'use strict';

  var API_BASE = 'https://api.msxzap.pro';

  // Get token from the script tag's data-token attribute
  var scripts = document.querySelectorAll('script[data-token]');
  var currentScript = scripts[scripts.length - 1];
  var TOKEN = currentScript ? currentScript.getAttribute('data-token') : null;

  if (!TOKEN) {
    console.warn('[ChatWidget] data-token attribute not found on script tag.');
    return;
  }

  var widgetConfig = null;
  var panelOpen = false;

  // ── Styles ────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#cw-btn{position:fixed;bottom:24px;right:24px;z-index:99999;width:56px;height:56px;border-radius:50%;',
    'border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:transform 0.2s,box-shadow 0.2s;}',
    '#cw-btn:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,0.3);}',
    '#cw-panel{position:fixed;bottom:90px;right:24px;z-index:99998;width:350px;max-height:520px;',
    'background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);',
    'display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;}',
    '#cw-panel.open{display:flex;}',
    '#cw-header{padding:16px 18px;color:#fff;display:flex;align-items:center;gap:10px;}',
    '#cw-header h3{margin:0;font-size:15px;font-weight:600;}',
    '#cw-header p{margin:4px 0 0;font-size:12px;opacity:0.85;}',
    '#cw-close{margin-left:auto;background:none;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;padding:2px 6px;border-radius:6px;}',
    '#cw-close:hover{background:rgba(255,255,255,0.2);}',
    '#cw-body{padding:16px;overflow-y:auto;flex:1;}',
    '#cw-body input,#cw-body textarea{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #e2e8f0;',
    'border-radius:8px;font-size:13px;margin-bottom:10px;outline:none;font-family:inherit;}',
    '#cw-body input:focus,#cw-body textarea:focus{border-color:#25D366;box-shadow:0 0 0 2px rgba(37,211,102,0.15);}',
    '#cw-body textarea{resize:vertical;min-height:80px;}',
    '#cw-body label{font-size:12px;font-weight:500;color:#64748b;display:block;margin-bottom:4px;}',
    '#cw-submit{width:100%;padding:10px;border:none;border-radius:8px;color:#fff;font-size:14px;',
    'font-weight:600;cursor:pointer;transition:opacity 0.2s;}',
    '#cw-submit:hover{opacity:0.88;}',
    '#cw-submit:disabled{opacity:0.5;cursor:not-allowed;}',
    '#cw-success{text-align:center;padding:24px 16px;}',
    '#cw-success .cw-check{font-size:40px;margin-bottom:12px;}',
    '#cw-success p{font-size:14px;color:#374151;margin:0;}',
    '#cw-loading{display:none;text-align:center;padding:32px 16px;color:#64748b;font-size:13px;}',
  ].join('');
  document.head.appendChild(style);

  // ── Button ────────────────────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'cw-btn';
  btn.title = 'Falar conosco';
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  document.body.appendChild(btn);

  // ── Panel ─────────────────────────────────────────────────────────────────
  var panel = document.createElement('div');
  panel.id = 'cw-panel';
  panel.innerHTML = [
    '<div id="cw-header">',
    '  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    '  <div><h3 id="cw-title">Chat</h3><p id="cw-greeting">Como posso ajudar?</p></div>',
    '  <button id="cw-close" title="Fechar">&times;</button>',
    '</div>',
    '<div id="cw-loading">Carregando...</div>',
    '<div id="cw-body" style="display:none">',
    '  <div id="cw-form">',
    '    <label for="cw-name">Seu nome</label>',
    '    <input id="cw-name" type="text" placeholder="Ex: João Silva" />',
    '    <label for="cw-phone">WhatsApp (com DDD)</label>',
    '    <input id="cw-phone" type="tel" placeholder="Ex: 5511999990000" />',
    '    <div id="cw-email-wrap" style="display:none">',
    '      <label for="cw-email">E-mail</label>',
    '      <input id="cw-email" type="email" placeholder="seu@email.com" />',
    '    </div>',
    '    <label for="cw-msg">Como posso ajudar?</label>',
    '    <textarea id="cw-msg" placeholder="Descreva sua dúvida ou mensagem..."></textarea>',
    '    <button id="cw-submit">Iniciar conversa</button>',
    '  </div>',
    '  <div id="cw-success" style="display:none">',
    '    <div class="cw-check">✅</div>',
    '    <p>Mensagem enviada! Em breve entraremos em contato.</p>',
    '  </div>',
    '</div>',
  ].join('');
  document.body.appendChild(panel);

  // ── Load config ───────────────────────────────────────────────────────────
  function loadConfig() {
    var loadingEl = document.getElementById('cw-loading');
    var bodyEl = document.getElementById('cw-body');
    if (loadingEl) loadingEl.style.display = 'block';
    if (bodyEl) bodyEl.style.display = 'none';

    fetch(API_BASE + '/widget/' + TOKEN + '/config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        widgetConfig = cfg;
        applyConfig(cfg);
        if (loadingEl) loadingEl.style.display = 'none';
        if (bodyEl) bodyEl.style.display = 'block';
      })
      .catch(function () {
        if (loadingEl) loadingEl.textContent = 'Erro ao carregar chat. Tente mais tarde.';
      });
  }

  function applyConfig(cfg) {
    var color = cfg.color || '#25D366';

    btn.style.backgroundColor = color;
    var header = document.getElementById('cw-header');
    if (header) header.style.backgroundColor = color;

    var submit = document.getElementById('cw-submit');
    if (submit) submit.style.backgroundColor = color;

    var titleEl = document.getElementById('cw-title');
    if (titleEl) titleEl.textContent = cfg.name || 'Chat';

    var greetEl = document.getElementById('cw-greeting');
    if (greetEl) greetEl.textContent = cfg.greeting || 'Como posso ajudar?';

    var emailWrap = document.getElementById('cw-email-wrap');
    if (emailWrap) emailWrap.style.display = cfg.collect_email ? 'block' : 'none';
  }

  // ── Events ────────────────────────────────────────────────────────────────
  btn.addEventListener('click', function () {
    panelOpen = !panelOpen;
    if (panelOpen) {
      panel.classList.add('open');
      if (!widgetConfig) loadConfig();
    } else {
      panel.classList.remove('open');
    }
  });

  var closeBtn = document.getElementById('cw-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      panelOpen = false;
      panel.classList.remove('open');
    });
  }

  var submitBtn = document.getElementById('cw-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', function () {
      var name = (document.getElementById('cw-name') || {}).value || '';
      var phone = (document.getElementById('cw-phone') || {}).value || '';
      var email = (document.getElementById('cw-email') || {}).value || '';
      var message = (document.getElementById('cw-msg') || {}).value || '';

      if (!phone.trim()) {
        alert('Por favor, informe seu WhatsApp.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      var body = { name: name, phone: phone.replace(/\D/g, ''), message: message };
      if (widgetConfig && widgetConfig.collect_email && email) body.email = email;

      fetch(API_BASE + '/widget/' + TOKEN + '/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          var formEl = document.getElementById('cw-form');
          var successEl = document.getElementById('cw-success');
          if (formEl) formEl.style.display = 'none';
          if (successEl) successEl.style.display = 'block';
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Iniciar conversa';
          alert('Erro ao enviar mensagem. Tente novamente.');
        });
    });
  }
})();
