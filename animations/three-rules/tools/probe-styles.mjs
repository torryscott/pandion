// Dump exact styles/attributes of app UI parts for the replica.
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
await page.waitForFunction(() => {
  const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
  return s && s.querySelectorAll('[data-bar-cat]').length > 2;
}, null, { timeout: 20000 });
await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' }));
await page.waitForTimeout(1800);
const dump = await page.evaluate(() => {
  const out = {};
  const cs = (el, props) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; for (const p of props) o[p] = s.getPropertyValue(p); const r = el.getBoundingClientRect(); o._rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; return o; };
  const P = ['font-family','font-size','font-weight','color','background-color','border','border-radius','padding','box-shadow','letter-spacing'];
  const svg = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
  out.svgRect = svg.getBoundingClientRect().toJSON();
  out.svgViewBox = svg.getAttribute('viewBox'); out.svgW = svg.getAttribute('width'); out.svgH = svg.getAttribute('height');
  // chart texts
  out.texts = [...svg.querySelectorAll('text')].slice(0, 40).map(t => ({ txt: t.textContent, x: t.getAttribute('x'), y: t.getAttribute('y'), fs: t.getAttribute('font-size') || getComputedStyle(t).fontSize, fw: getComputedStyle(t).fontWeight, ff: getComputedStyle(t).fontFamily, fill: t.getAttribute('fill') || getComputedStyle(t).fill, tr: t.getAttribute('transform'), anchor: t.getAttribute('text-anchor') }));
  out.bars = [...svg.querySelectorAll('[data-bar-cat]')].slice(0, 12).map(b => ({ tag: b.tagName, cat: b.getAttribute('data-bar-cat'), grp: b.getAttribute('data-bar-group'), d: (b.getAttribute('d') || '').slice(0, 120), x: b.getAttribute('x'), y: b.getAttribute('y'), w: b.getAttribute('width'), h: b.getAttribute('height'), fill: b.getAttribute('fill'), stroke: b.getAttribute('stroke'), sw: b.getAttribute('stroke-width'), bb: (() => { try { const q = b.getBBox(); return [q.x, q.y, q.width, q.height].map(v => +v.toFixed(1)); } catch (e) { return null; } })() }));
  out.lines = [...svg.querySelectorAll('line')].slice(0, 30).map(l => ({ role: l.getAttribute('data-role'), x1: l.getAttribute('x1'), y1: l.getAttribute('y1'), x2: l.getAttribute('x2'), y2: l.getAttribute('y2'), stroke: l.getAttribute('stroke'), sw: l.getAttribute('stroke-width') }));
  out.roles = [...new Set([...svg.querySelectorAll('[data-role]')].map(e => e.getAttribute('data-role')))];
  const eb = svg.querySelector('[data-role="error-bar"]');
  out.errorbar = eb ? eb.outerHTML.slice(0, 600) : null;
  const leg = svg.querySelector('[data-role="legend-swatch"]');
  out.legendSwatch = leg ? leg.outerHTML.slice(0, 300) : null;
  // toolbar
  const addBtn = [...document.querySelectorAll('button')].find(b => /Add/.test(b.textContent) && b.offsetParent && b.closest('#psroot'));
  out.addBtn = cs(addBtn, P);
  out.addBtnHtml = addBtn ? addBtn.outerHTML.slice(0, 400) : null;
  const strip = addBtn ? addBtn.parentElement : null;
  out.strip = cs(strip, P);
  out.strip2 = cs(strip && strip.parentElement, P);
  const barBtn = [...document.querySelectorAll('#psroot button')].find(b => /^\s*Bar/.test(b.textContent) && b.offsetParent);
  out.barBtn = cs(barBtn, P);
  const card = document.querySelector('#psroot [data-role="chart-card"]');
  out.card = cs(card, P);
  out.body = cs(document.body, P);
  return out;
});
console.log(JSON.stringify(dump, null, 1));
// click an East bar and dump indicator
const bar = await page.evaluate(() => { const el = document.querySelector('#psroot svg[data-role="gb2-chart-svg"] [data-bar-cat]'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; });
await page.mouse.click(bar.x, bar.y);
await page.waitForTimeout(1200);
const ind = await page.evaluate(() => {
  const svg = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
  const g = [...svg.querySelectorAll('g')].filter(x => /indicator/i.test(x.getAttribute('data-role') || '') || /indicator/i.test(x.getAttribute('class') || ''));
  const els = [...svg.querySelectorAll('[data-role^="sel-halo"], rect[stroke-dasharray], path[stroke-dasharray]')].slice(0, 10).map(e => e.outerHTML.slice(0, 400));
  const panel = document.querySelector('#psroot [data-role="inspector-panel"]') || [...document.querySelectorAll('#psroot div')].find(d => /Bars - East/.test(d.textContent) && d.offsetHeight < 600 && d.offsetHeight > 200);
  const P = ['font-family','font-size','font-weight','color','background-color','border','border-radius','padding','box-shadow','letter-spacing'];
  const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); const o = {}; for (const p of P) o[p] = s.getPropertyValue(p); const r = el.getBoundingClientRect(); o._rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; return o; };
  const find = (re, root) => [...(root || document).querySelectorAll('#psroot *')].filter(e => e.children.length === 0 && re.test((e.textContent || '').trim()) && e.offsetParent);
  const res = { groups: g.map(x => x.getAttribute('data-role') || x.getAttribute('class')), halos: els };
  const kick = find(/^Bar chart$/i)[0]; res.kicker = cs(kick);
  const title = find(/^Bars - East$/)[0]; res.title = cs(title);
  const tab = find(/^Bars$/)[0]; res.tab = cs(tab); res.tabParent = cs(tab && tab.parentElement);
  const chip = find(/^Color$/)[0]; res.chip = cs(chip); res.chipParent = cs(chip && chip.closest('button'));
  const pat = find(/^Pattern$/)[0]; res.chipPattern = cs(pat && pat.closest('button'));
  const usep = find(/^Use palette$/)[0]; res.usePalette = cs(usep);
  const sw = [...document.querySelectorAll('#psroot button[data-field]')].filter(b => b.offsetParent && b.offsetWidth < 40 && b.offsetWidth > 10).slice(0, 14).map(b => ({ f: b.getAttribute('data-field'), style: b.getAttribute('style'), r: (() => { const q = b.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)]; })() }));
  res.swatches = sw;
  if (kick) { let p = kick; for (let i = 0; i < 4; i++) { p = p.parentElement; } res.panelHead = cs(kick.parentElement.parentElement); res.panelOuter = cs(p); }
  return res;
});
console.log(JSON.stringify(ind, null, 1));
await browser.close();
