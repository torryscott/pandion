import { chromium } from 'playwright';
const PORT = process.argv[2] || '8862';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try { sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {}
  try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForFunction(() => document.querySelectorAll('#psroot svg[data-role="gb2-chart-svg"] [data-bar-cat]').length > 2, null, { timeout: 20000 });
await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' }));
await page.waitForTimeout(1800);
const r = await page.evaluate(() => {
  const svg = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
  const pick = (sel) => [...svg.querySelectorAll(sel)].map(e => e.outerHTML.slice(0, 260));
  const legendG = svg.querySelector('[data-role="legend-bg"]');
  return {
    yaxis: pick('[data-role="y-axis-line"]'), xaxis: pick('[data-role="x-axis-line"]'),
    yticks: pick('[data-role="y-tick"]').slice(0, 3), xticks: pick('[data-role="x-tick"]').slice(0, 3),
    xcat: pick('[data-role="x-cat-label"]').slice(0, 2),
    legendBg: legendG ? legendG.outerHTML.slice(0, 300) : null,
    legendParent: legendG ? legendG.parentElement.outerHTML.slice(0, 300) : null,
    grid: pick('[data-role="grid"]').slice(0, 2),
    resize: pick('[data-role="resize-handle"]').slice(0, 1),
  };
});
console.log(JSON.stringify(r, null, 1));
// header/rail/setup texts with sizes
const ui = await page.evaluate(() => {
  const out = [];
  const walk = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.offsetParent && (e.textContent || '').trim().length && !e.closest('svg'));
  for (const e of walk) {
    const r = e.getBoundingClientRect(); if (r.width === 0) continue;
    const s = getComputedStyle(e);
    out.push([e.textContent.trim().slice(0, 40), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), s.fontSize, s.fontWeight, s.color, s.letterSpacing, s.textTransform]);
  }
  return out;
});
for (const u of ui) console.log(u.join(' | '));
// backgrounds of major regions
const bg = await page.evaluate(() => {
  const res = [];
  for (const e of document.querySelectorAll('body *')) {
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (r.width > 150 && r.height > 20 && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && !e.closest('svg'))
      res.push([e.tagName, (e.id || '') + '.' + (e.className && e.className.baseVal === undefined ? e.className : ''), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), s.backgroundColor, s.borderBottom, s.borderRight, s.borderLeft, s.borderTop, s.borderRadius].join(' | '));
  }
  return res.slice(0, 80);
});
console.log('--- BG'); for (const b of bg) console.log(b);
await browser.close();
