// When a shape or label pokes above the top of a chart, the canvas grows and
// the whole chart sits further down inside it (the engine's _topGrow shift).
// Anything that turns a pointer position into chart coordinates from the
// canvas's top edge, or draws chart coordinates straight onto the canvas,
// then has to allow for that shift. Oct 2 2026 sweep (Torry: "sweep those
// other drags too") after the curve-handle report found a dragged handle
// landing 68 px below the pointer in that state.
// Control: on the tree before the sweep every case fails by about the size
// of the shift (case 1 lands the handle a shift below the pointer).
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
// PS_SOFT=1 keeps going past a failure, which is how the control run shows
// that EVERY case is red on the tree before the sweep, not only the first.
const SOFT = process.env.PS_SOFT === '1';
let failed = 0;
function ok(cond, msg) {
    if (!cond) {
        if (!SOFT) throw new Error(msg);
        failed++;
        console.log('  FAIL  ' + msg);
        return;
    }
    console.log('  ok  ' + msg);
}
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}
try {
    const got = page.locator('button', { hasText: 'Got it' }).first();
    if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
} catch {}
const SVG = 'svg[data-role="gb2-chart-svg"]';
async function inject(anns) {
    await page.evaluate(json => window.__gb2_setOption('annotationsJson', json),
        JSON.stringify(anns));
    await page.waitForTimeout(2600);
}
// How far down the chart sits inside its canvas.
const shift = () => page.evaluate(sel => {
    const g = document.querySelector(sel + ' [data-role="chart-shift"]');
    const m = /translate\(\s*0\s*,\s*(-?[\d.]+)/.exec((g && g.getAttribute('transform')) || '');
    return m ? Number(m[1]) : 0;
}, SVG);
const center = sel => page.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) return null;
    try { e.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (x) {}
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2,
             top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}, sel);
// The line that makes the canvas grow: its end is 60 px above the top edge.
const grower = { id: 'up', kind: 'line', x: 60, y: 120, x2: 110, y2: -60,
                 color: '#222222', strokeWidth: 2, lineOpacity: 1, zOrder: 'front' };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('case 1: a reference line\'s end handle stays under the pointer');
const size = await page.evaluate(sel => {
    const s = document.querySelector(sel);
    return { w: Number(s.getAttribute('width')), h: Number(s.getAttribute('height')) };
}, SVG);
await inject([grower,
    { id: 'rl', kind: 'refLine', orientation: 'vertical', x: Math.round(size.w * 0.55),
      y: Math.round(size.h * 0.5), lineStyle: 'dashed', lineColor: '#000000', lineWidth: 1,
      text: '', fontSize: 11, zOrder: 'front' }]);
const sh = await shift();
ok(sh > 20, 'setup: the canvas grew and the chart sits ' + sh.toFixed(0) + ' px down');
let line = await center(SVG + ' [data-ann-id="rl"]');
ok(line, 'setup: the reference line drew');
await page.mouse.click(line.x, line.y);
await page.waitForTimeout(500);
let hs = await center(SVG + ' [data-role="refline-handle"][data-handle="start"]');
ok(hs, 'selecting it shows its end handles');
await page.mouse.move(hs.x, hs.y);
await page.mouse.down();
await page.mouse.move(hs.x, hs.y + 20, { steps: 3 });
await page.mouse.move(hs.x, hs.y + 60, { steps: 4 });
const live = await page.evaluate(sel => {
    const h = document.querySelector(sel + ' [data-role="refline-handle"][data-handle="start"]');
    const l = document.querySelector(sel + ' [data-ann-id="rl"] line');
    const hr = h ? h.getBoundingClientRect() : null, lr = l ? l.getBoundingClientRect() : null;
    return { handleY: hr ? hr.top + hr.height / 2 : null, lineTop: lr ? lr.top : null };
}, SVG);
await page.mouse.up();
await page.waitForTimeout(600);
ok(near(live.lineTop, hs.y + 60, 4),
   'mid-drag the line ends at the pointer (' + (live.lineTop && live.lineTop.toFixed(1)) +
   ' vs ' + (hs.y + 60).toFixed(1) + ')');

console.log('case 2: a text note turns to follow its rotate handle');
await page.keyboard.press('Escape');
await inject([grower,
    { id: 'tx', kind: 'text', x: Math.round(size.w * 0.5), y: 170, text: 'Note',
      fontSize: 16, color: '#222222', rotation: 0, zOrder: 'front' }]);
let tx = await center(SVG + ' [data-ann-id="tx"]');
ok(tx, 'setup: the note drew');
await page.mouse.click(tx.x, tx.y);
await page.waitForTimeout(500);
let rot = await center(SVG + ' [data-role="ann-rot-handle"]');
ok(rot, 'selecting it shows the rotate handle');
const reach = Math.max(24, Math.abs(tx.y - rot.y));
await page.mouse.move(rot.x, rot.y);
await page.mouse.down();
await page.mouse.move(tx.x + reach * 0.7, tx.y - reach * 0.7, { steps: 4 });
await page.mouse.move(tx.x + reach, tx.y, { steps: 4 });
const angle = await page.evaluate(sel => {
    // Whichever node carries the live rotate transform: the note's own
    // element or the text inside it.
    const g = document.querySelector(sel + ' [data-ann-id="tx"]');
    const nodes = g ? [g].concat(Array.from(g.querySelectorAll('*'))) : [];
    for (const n of nodes) {
        const m = /rotate\(\s*(-?[\d.]+)/.exec(n.getAttribute('transform') || '');
        if (m) return Number(m[1]);
    }
    return null;
}, SVG);
await page.mouse.up();
await page.waitForTimeout(600);
// The note turns about its text anchor (the baseline), a few px below the
// centre this aims from, so "a quarter turn" is 90 give or take a dozen.
// The bug this guards read the pointer a whole shift low: about 150.
ok(angle !== null && near(angle, 90, 14),
   'pointer to its right gives about a quarter turn (' + angle + ' degrees)');

console.log('case 3: the gap seam is drawn on the bars it belongs to');
await page.keyboard.press('Escape');
await inject([grower]);
const bars = await page.evaluate(sel => {
    const seen = {};
    for (const b of document.querySelectorAll(sel + ' path[data-bar-cat]')) {
        const c = b.getAttribute('data-bar-cat');
        if (!seen[c]) seen[c] = b.getBoundingClientRect();
    }
    const r = Object.values(seen).sort((a, b) => a.left - b.left);
    return r.length < 2 ? null : {
        x: (r[0].right + r[1].left) / 2, y: (r[1].top + r[1].bottom) / 2,
        top: Math.min(r[0].top, r[1].top), bottom: r[1].bottom };
}, SVG);
ok(bars, 'setup: two bars with a gap between them');
await page.mouse.move(bars.x - 200, bars.y - 10);
await page.mouse.move(bars.x, bars.y, { steps: 3 });
await page.waitForTimeout(700);
const seam = await page.evaluate(() => {
    const g = document.querySelector('[data-role="gap-seam-chrome"]');
    if (!g) return null;
    const l = g.querySelector('line') || g.querySelector('rect');
    const r = (l || g).getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
});
ok(seam, 'hovering the gap arms the seam');
ok(seam.bottom >= bars.bottom - 12,
   'and the seam reaches down to the foot of the bars (' + seam.bottom.toFixed(0) +
   ' vs ' + bars.bottom.toFixed(0) + ')');
await page.mouse.move(bars.x - 300, bars.y - 200);
await page.waitForTimeout(300);

console.log('case 4: the Statistics panel rings the bar its row describes');
const statsBtn = page.locator('#psroot button[aria-label="Statistics"]');
ok(await statsBtn.count() === 1, 'setup: the Statistics control exists');
await statsBtn.click();
await page.waitForTimeout(900);
const ring = await page.evaluate(async sel => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const tab = document.querySelector('[data-st-tab="desc"]');
    if (tab) { tab.click(); await s(500); }
    const row = Array.from(document.querySelectorAll('[data-st-pane="desc"] tr[data-link]'))
        .find(r => r.offsetParent !== null);
    if (!row) return { err: 'no linkable row' };
    const cell = JSON.parse(row.getAttribute('data-link'))[0];
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await s(250);
    const rg = document.querySelector(sel + ' [data-role="stats-link-halo"] [data-st-ring]');
    const bar = Array.from(document.querySelectorAll(sel + ' path[data-bar-cat]'))
        .find(b => b.getAttribute('data-bar-cat') === cell[0] &&
                   (b.getAttribute('data-bar-group') || '') === (cell[1] || ''))
        || Array.from(document.querySelectorAll(sel + ' path[data-bar-cat]'))
        .find(b => b.getAttribute('data-bar-cat') === cell[0]);
    if (!rg || !bar) return { err: 'ring ' + !!rg + ' bar ' + !!bar };
    const a = rg.getBoundingClientRect(), b = bar.getBoundingClientRect();
    return { ringTop: a.top, ringBottom: a.bottom, barTop: b.top, barBottom: b.bottom };
}, SVG);
ok(!ring.err, 'setup: a row and its ring (' + (ring.err || 'found') + ')');
ok(ring.ringBottom >= ring.barBottom - 2 && ring.ringTop <= ring.barTop + 2,
   'the ring encloses the bar (ring ' + ring.ringTop.toFixed(0) + ' to ' + ring.ringBottom.toFixed(0) +
   ', bar ' + ring.barTop.toFixed(0) + ' to ' + ring.barBottom.toFixed(0) + ')');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('case 5: a pie turns by the angle it is dragged');
await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.setModule('freqplotbuilder'); await w(500);
    S.optionStore().graphType = 'pie';
    S.setRoles('freqplotbuilder', { var: 'condition' }); await w(1400);
});
await page.waitForTimeout(1200);
const pieSize = await page.evaluate(sel => {
    const s = document.querySelector(sel);
    return { w: Number(s.getAttribute('width')) };
}, SVG);
await inject([{ id: 'up2', kind: 'line', x: 40, y: 90, x2: 80, y2: -60,
                color: '#222222', strokeWidth: 2, lineOpacity: 1, zOrder: 'front' }]);
ok(await shift() > 20, 'setup: the pie\'s canvas grew too');
const pie = await page.evaluate(sel => {
    const g = document.querySelector(sel + ' [data-role="freq-pie-outline-all"]');
    const h = document.querySelector(sel + ' [data-role="freq-pie-rotate-handle"]');
    if (!g || !h) return null;
    const r = g.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    // The seam's own direction from the centre, read from its line.
    const m = h.getScreenCTM();
    const x2 = Number(h.getAttribute('x2')), y2 = Number(h.getAttribute('y2'));
    const ex = m.a * x2 + m.c * y2 + m.e, ey = m.b * x2 + m.d * y2 + m.f;
    return { cx, cy, R, a0: Math.atan2(ey - cy, ex - cx) };
}, SVG);
ok(pie && pie.R > 40, 'setup: the pie and a seam to grab');
const start0 = await page.evaluate(() => {
    try { return Number(JSON.parse(window.PS_SHELL.buildPayload().chartSpec).pieStartAngle) || 0; }
    catch (e) { return 0; }
});
const at = a => ({ x: pie.cx + Math.cos(a) * pie.R * 0.7, y: pie.cy + Math.sin(a) * pie.R * 0.7 });
const TURN = 40 * Math.PI / 180;
let p0 = at(pie.a0);
await page.mouse.move(p0.x, p0.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
    const p = at(pie.a0 + TURN * i / 8);
    await page.mouse.move(p.x, p.y);
}
await page.mouse.up();
await page.waitForTimeout(2600);
const start1 = await page.evaluate(() => {
    try { return Number(JSON.parse(window.PS_SHELL.buildPayload().chartSpec).pieStartAngle) || 0; }
    catch (e) { return 0; }
});
let turned = ((start1 - start0) % 360 + 360) % 360;
if (turned > 180) turned -= 360;
ok(near(turned, 40, 3), 'a 40 degree drag turned the pie ' + turned.toFixed(1) + ' degrees');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
if (failed) { console.log('GROWN CANVAS CHECK: ' + failed + ' failing'); await browser.close(); process.exit(1); }
console.log('GROWN CANVAS CHECK PASS');
await browser.close();
