// The curve shape's reshape handle (Oct 2 2026, Torry's report: "one of the
// handles went out of the chart area, and then I couldn't grab it ... those
// handles look pretty far away from the curve"). The diamond used to sit at
// the quadratic's control point, which is twice as far from the chord as the
// curve's own peak; on a tall curve that put it above the chart, over the
// toolbar, where it could be seen and not grabbed. It now sits ON the curve,
// and the canvas (which already grows to hold a shape) therefore holds it.
// Found alongside: once the canvas had grown upward, every dragged shape
// handle landed that far below the pointer.
// Control: on the tree before the change, case 1 fails (the handle is far
// off the curve), case 2 fails (the handle is outside the chart) and case 5
// fails (the dragged end lands below the pointer).
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
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}
const SVG = 'svg[data-role="gb2-chart-svg"]';

// Everything below is in the chart's own (logical) pixels; frame() converts.
const frame = () => page.evaluate(sel => {
    const svg = document.querySelector(sel);
    const r = svg.getBoundingClientRect();
    const w = Number(svg.getAttribute('width')), h = Number(svg.getAttribute('height'));
    return { left: r.left, top: r.top, s: r.width / w, w, h };
}, SVG);
async function inject(anns) {
    await page.evaluate(json => window.__gb2_setOption('annotationsJson', json),
        JSON.stringify(anns));
    await page.waitForTimeout(2600);
}
const curve = (id, x, y, x2, y2, curvature) => ({
    id, kind: 'curve', x, y, x2, y2, curvature, curvatureLong: 0,
    color: '#222222', strokeWidth: 2, lineOpacity: 1, arrowHeadStyle: 'none',
    arrowEnd: 'end', arrowHeadSize: 1, hasFill: false, zOrder: 'front'
});
// The drawn curve, read back from its own path: endpoints, control, middle.
const geom = id => page.evaluate(([sel, i]) => {
    const g = document.querySelector(sel + ' [data-ann-id="' + i + '"]');
    if (!g) return null;
    const p = Array.from(g.querySelectorAll('path'))
        .map(x => x.getAttribute('d') || '').find(d => /Q/.test(d));
    const n = (p || '').match(/-?\d+(\.\d+)?(e-?\d+)?/g).map(Number);
    const [x1, y1, cx, cy, x2, y2] = n;
    const mid = { x: ((x1 + x2) / 2 + cx) / 2, y: ((y1 + y2) / 2 + cy) / 2 };
    // Screen positions through the path's own matrix, which carries the
    // shift the canvas applies once a shape pokes above its top edge.
    const m = g.querySelector('path').getScreenCTM();
    const S = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    return { x1, y1, cx, cy, x2, y2, mid,
             midS: S(mid.x, mid.y), startS: S(x1, y1), endS: S(x2, y2), ctrlS: S(cx, cy),
             shift: m.f - document.querySelector(sel).getBoundingClientRect().top };
}, [SVG, id]);
// The control handle: its centre in logical pixels, and whether a click at
// that point would actually land on it.
const handle = which => page.evaluate(([sel, w]) => {
    const svg = document.querySelector(sel);
    const h = svg.querySelector('[data-role="shape-handle"][data-which="' + w + '"]');
    if (!h) return null;
    // Opening a panel can scroll the chart pane; bring the handle back
    // into the window before asking what a click there would hit.
    try { h.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
    const sr = svg.getBoundingClientRect(), r = h.getBoundingClientRect();
    const s = sr.width / Number(svg.getAttribute('width'));
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { x: cx, y: cy, px: cx, py: cy, top: (cy - sr.top) / s,
             grabbable: hit === h,
             inside: cx > sr.left && cx < sr.right && cy > sr.top && cy < sr.bottom };
}, [SVG, which]);
async function selectCurve(id) {
    // Clear any selection first and measure after: closing a panel can
    // re-fit or scroll the chart.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    // A point on the stroke near (not at) the middle, so the click lands on
    // the curve and not on a handle. Through the path's own matrix, because
    // a grown canvas shifts the chart down inside the svg.
    const pt = await page.evaluate(([sel, i]) => {
        const p = document.querySelector(sel + ' [data-ann-id="' + i + '"] path');
        try { p.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
        const q = p.getPointAtLength(p.getTotalLength() * 0.3), m = p.getScreenCTM();
        return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
    }, [SVG, id]);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(500);
}
const near = (a, b, tol) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

const f0 = await frame();
const cy0 = Math.round(f0.h * 0.62), xa = Math.round(f0.w * 0.25), xb = Math.round(f0.w * 0.7);
const chord = xb - xa;

console.log('case 1: the handle sits on the curve, not out at the control point');
await inject([curve('cv1', xa, cy0, xb, cy0, -0.5)]);
let g = await geom('cv1');
ok(g && Math.abs(g.cy - (cy0 - 0.5 * chord)) < 1, 'setup: the curve drew (control at y ' + (g && g.cy) + ')');
await selectCurve('cv1');
let h = await handle('control');
g = await geom('cv1');
ok(h, 'selecting the curve shows its reshape handle');
ok(near(h, g.midS, 1.5),
   'the handle is on the middle of the curve (' + h.x.toFixed(1) + ',' + h.y.toFixed(1) +
   ' vs ' + g.midS.x.toFixed(1) + ',' + g.midS.y.toFixed(1) + ')');
ok(Math.abs(h.y - g.ctrlS.y) > chord * 0.2, 'which is well inside where the control point is');

console.log('case 2: a tall curve keeps a handle you can grab');
// Control point far above the canvas; the curve itself still peaks on it.
const tall = Math.min(1, (cy0 + 60) / chord);
await inject([curve('cv2', xa, cy0, xb, cy0, -tall)]);
g = await geom('cv2');
ok(g.cy < 0, 'setup: the control point is above the canvas (y ' + g.cy.toFixed(0) + ')');
await selectCurve('cv2');
h = await handle('control');
ok(h && h.inside, 'the handle is inside the chart (' + (h && h.top.toFixed(0)) + ' px below its top edge)');
ok(h.grabbable, 'and a click at it lands on it');

console.log('case 3: dragging the handle pulls the curve through the pointer');
const target = { x: h.px + 40, y: h.py + 70 };
await page.mouse.move(h.px, h.py);
await page.mouse.down();
await page.mouse.move(h.px + 20, h.py + 30, { steps: 4 });
await page.mouse.move(target.x, target.y, { steps: 6 });
const mid = await geom('cv2');
const live = await page.evaluate(sel => {
    const r = document.querySelector(sel + ' [data-role="shape-handle"][data-which="control"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, SVG);
ok(near(mid.midS, target, 2),
   'mid-drag the curve passes through the pointer (' + mid.midS.x.toFixed(1) + ',' + mid.midS.y.toFixed(1) + ')');
ok(near(live, mid.midS, 2), 'and the handle rides the curve');
const want = mid.mid;
await page.mouse.up();
await page.waitForTimeout(2600);
g = await geom('cv2');
ok(near(g.mid, want, 1), 'the shape holds after release and the echo');

console.log('case 4: a curve pulled above the chart still has a handle you can grab');
// A chord near the top, so the curve itself can be dragged past the edge.
await inject([curve('cv4', xa, 110, xb, 110, -0.15)]);
await selectCurve('cv4');
h = await handle('control');
let f = await frame();
await page.mouse.move(h.px, h.py);
await page.mouse.down();
await page.mouse.move(h.px, f.top + 20, { steps: 5 });
await page.mouse.move(h.px + 6, f.top - 45, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(2600);
g = await geom('cv4');
ok(g.mid.y < 0, 'setup: the middle of the curve is now above the old top edge (y ' + g.mid.y.toFixed(0) + ')');
ok(g.shift > 1, 'and the canvas grew to hold it (chart shifted down ' + g.shift.toFixed(0) + ' px)');
await selectCurve('cv4');
h = await handle('control');
g = await geom('cv4');
ok(h && h.inside && h.grabbable, 'the handle is inside the chart and a click lands on it');
ok(near(h, g.midS, 1.5), 'and it is on the curve');

console.log('case 5: with the canvas grown, a dragged handle stays under the pointer');
const st = await handle('start');
ok(st && st.grabbable, 'setup: the start handle is reachable');
const to = { x: st.px + 12, y: st.py + 34 };
await page.mouse.move(st.px, st.py);
await page.mouse.down();
await page.mouse.move(st.px + 6, st.py + 15, { steps: 3 });
await page.mouse.move(to.x, to.y, { steps: 4 });
g = await geom('cv4');
// An endpoint drag snaps to nearby chart geometry, so allow the snap
// distance; the bug this guards put the end a full canvas-shift away.
ok(near(g.startS, to, 9) && g.shift > 20,
   'the end of the curve is at the pointer, give or take a snap (' + g.startS.x.toFixed(1) + ',' + g.startS.y.toFixed(1) +
   ' vs ' + to.x.toFixed(1) + ',' + to.y.toFixed(1) + ')');
await page.mouse.up();
await page.waitForTimeout(600);

console.log('case 6: the rotate handle keeps clear of the curve handle');
// A shallow curve bowing toward the side the rotate handle used to take:
// its middle is about 22 px off the chord, exactly where that handle sat.
await inject([curve('cv6', xa, cy0, xb, cy0, -44 / chord)]);
await selectCurve('cv6');
h = await handle('control');
const rotH = () => page.evaluate(sel => {
    const r = document.querySelector(sel + ' [data-role="shape-rotate-handle"]');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    return { x, y, grabbable: document.elementFromPoint(x, y) === r };
}, SVG);
let rh = await rotH();
ok(h && h.grabbable, 'the curve handle can be grabbed');
ok(rh && rh.grabbable && Math.hypot(rh.x - h.x, rh.y - h.y) > 30,
   'and the rotate handle is on the other side of the line (' +
   (rh && Math.hypot(rh.x - h.x, rh.y - h.y).toFixed(0)) + ' px away)');
g = await geom('cv6');
const cen = { x: (g.startS.x + g.endS.x) / 2, y: (g.startS.y + g.endS.y) / 2 };
// Swing it a quarter turn: from below the centre to its right.
await page.mouse.move(rh.x, rh.y);
await page.mouse.down();
await page.mouse.move(cen.x + 16, cen.y + 16, { steps: 4 });
await page.mouse.move(cen.x + 22, cen.y, { steps: 4 });
rh = await page.evaluate(sel => {
    const b = document.querySelector(sel + ' [data-role="shape-rotate-handle"]').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, SVG);
g = await geom('cv6');
ok(near(rh, { x: cen.x + 22, y: cen.y }, 2), 'dragged, it stays under the pointer');
ok(Math.abs(g.startS.x - g.endS.x) < 2 && Math.abs(Math.abs(g.startS.y - g.endS.y) - chord) < 2,
   'and the curve turned a quarter turn with it');
await page.mouse.up();
await page.waitForTimeout(600);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CURVE HANDLE CHECK PASS');
await browser.close();
