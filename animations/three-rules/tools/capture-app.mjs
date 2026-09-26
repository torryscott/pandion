// Capture reference screenshots of the live app (website/app) for the
// animation's UI replica. usage: node tools/capture-app.mjs [port]
import { chromium } from 'playwright';
import fs from 'node:fs';
const PORT = process.argv[2] || '8862';
import { fileURLToPath } from 'node:url';
const OUT = fileURLToPath(new URL('../reference/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try { sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {}
  try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForFunction(() => {
  const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
  return s && s.getBoundingClientRect().width > 100 && s.querySelectorAll('[data-bar-cat],[data-role]').length > 10;
}, null, { timeout: 20000 });
await page.waitForTimeout(800);
const info = await page.evaluate(() => Object.keys(window.PS_SHELL));
console.log('PS_SHELL keys', info.join(','));
await page.screenshot({ path: OUT + 'app-default.png' });
try {
  await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' }));
  await page.waitForTimeout(1800);
} catch (e) { problems.push('setRoles: ' + e.message); }
await page.screenshot({ path: OUT + 'app-grouped.png' });
const card = await page.evaluate(() => {
  const c = document.querySelector('#psroot [data-role="chart-card"]');
  const b = c.getBoundingClientRect();
  return { x: b.left, y: b.top, width: b.width, height: Math.min(b.height, 900 - b.top) };
});
await page.screenshot({ path: OUT + 'card-grouped.png', clip: card });
// click the first bar
const bar = await page.evaluate(() => {
  const el = document.querySelector('#psroot svg[data-role="gb2-chart-svg"] [data-bar-cat]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
});
await page.mouse.click(bar.x, bar.y);
await page.waitForTimeout(1200);
await page.mouse.move(2, 898);
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + 'app-barclick.png' });
await page.screenshot({ path: OUT + 'app-barclick-full.png', fullPage: true });
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
// open the add menu
const addBtn = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[title="Add to chart"], button[aria-label="Add to chart"]')].find(e => e.offsetParent !== null);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (addBtn) {
  await page.mouse.click(addBtn.x, addBtn.y);
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + 'app-addmenu.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} else problems.push('no add button');
// click the legend
const leg = await page.evaluate(() => {
  const el = document.querySelector('#psroot svg[data-role="gb2-chart-svg"] [data-role="legend-swatch"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (leg) {
  await page.mouse.click(leg.x, leg.y);
  await page.waitForTimeout(1000);
  await page.mouse.move(2, 898);
  await page.screenshot({ path: OUT + 'app-legendclick.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
// click the y title
const yt = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#psroot svg[data-role="gb2-chart-svg"] text')];
  const el = els.find(e => /score/i.test(e.textContent) && e.getAttribute('transform') && /rotate/.test(e.getAttribute('transform')));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (yt) {
  await page.mouse.click(yt.x, yt.y);
  await page.waitForTimeout(1000);
  await page.mouse.move(2, 898);
  await page.screenshot({ path: OUT + 'app-ytitle.png', fullPage: true });
}
console.log('problems:', problems);
await browser.close();
