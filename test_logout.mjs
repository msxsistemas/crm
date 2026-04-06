import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const ss = async (name) => page.screenshot({ path: `C:/Users/Michael/Desktop/${name}.png` });

// Capture all console logs
const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => logs.push(`[PAGEERROR] ${err.message}`));

// Capture network requests
const requests = [];
page.on('request', req => {
  if (req.url().includes('api.msxzap')) requests.push(`REQ ${req.method()} ${req.url().replace('https://api.msxzap.pro','')}`);
});
page.on('response', res => {
  if (res.url().includes('api.msxzap')) requests.push(`RES ${res.status()} ${res.url().replace('https://api.msxzap.pro','')}`);
});

await page.goto('https://msxzap.pro', { waitUntil: 'networkidle' });
if (page.url().includes('/login')) {
  await page.fill('input[type="email"]', 'planostreaming25@gmail.com');
  await page.fill('input[type="password"]', '87066690');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
}

console.log('URL pré-logout:', page.url());
requests.length = 0;
logs.length = 0;

// Click the logout button (→ arrow icon)
const sidebarBtns = await page.locator('aside button').all();
console.log('Botões sidebar:', sidebarBtns.length);
// Try clicking last button
const lastBtn = sidebarBtns[sidebarBtns.length - 1];
await lastBtn.click();

await page.waitForTimeout(4000);
await ss('logout_result');

console.log('\n=== NETWORK após Sair ===');
for (const r of requests) console.log(r);

console.log('\n=== CONSOLE LOGS ===');
for (const l of logs) console.log(l);

console.log('\nURL final:', page.url());

await browser.close();
