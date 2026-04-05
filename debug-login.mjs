import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Michael/AppData/Roaming/npm/node_modules/playwright/index.js');
import { mkdirSync } from 'fs';

mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch({ headless: false, slowMo: 200 });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', m => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

console.log('Navigating to /login...');
await page.goto('https://msxzap.pro/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'screenshots/debug-login.png' });
console.log('URL:', page.url());
console.log('Title:', await page.title());
const html = await page.content();
console.log('HTML length:', html.length);
console.log('Has email input:', html.includes('type="email"') || html.includes("type='email'"));
console.log('First 500 chars:', html.substring(0, 500));

await browser.close();
