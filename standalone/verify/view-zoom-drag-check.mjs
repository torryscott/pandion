// View zoom vs drag (Sep 2026): the standalone shell scales the chart
// with a CSS zoom on the engine host, and that splits pixels into two
// spaces. Pointer clientX/clientY and every getBoundingClientRect are
// VISUAL px, while an SVG user coordinate, or a px length written onto
// a chart-surface element, is LOGICAL and paints at value times the
// zoom. A site that measures a pointer delta and then applies it as a
// logical length therefore travels the zoom factor too far: the thing
// being dragged outruns the cursor at 150 percent and lags it at 50,
// and the error grows with the distance dragged.
//
// At 100 / 150 / 50 percent view zoom this pins that the thing under
// the cursor tracks the cursor 1:1 in VISUAL pixels:
//   1. an axis-title text drag,
//   2. the legend drag,
//   3. a reference-line drag (the annotation gesture),
//   4. all three after RELEASE, since a live preview that divides
//      while its commit path does not would settle back off by the
//      factor the moment the commit lands,
//   5. the scatter hover tooltip, checked at a point near the chart's
//      left edge AND at one far from it, because that error is linear
//      in the distance from the edge the position is measured against,
//   6. the no-zoom path itself: at 100 percent every ratio must still
//      be 1.0, so a fix that broke jamovi's shape (where the factor is
//      exactly 1 and dividing is a byte no-op) cannot pass here.
//
// Travel is always measured against the chart svg's own top-left. The
// panel an annotation drag opens scrolls the workspace pane, and only
// a relative measurement survives that.
//
// CONTROL (unfixed engine): every 150 and 50 percent row fails, with
// travel ratios of exactly 1.500 and 0.500 instead of 1.0, and the
// tooltip lands hundreds of pixels from the point it describes. Only
// the 100 percent rows pass.
//
// Usage: node standalone/verify/view-zoom-drag-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname,
               '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

let failures = 0;
function ok(cond, label) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label); failures++; }
}
// 1:1 tracking, with room for the text drag's 4px alignment-guide snap
// and for sub-pixel layout rounding. The bug is a whole factor, so it
// clears this by an order of magnitude.
const TOL = 0.06;
const ZOOMS = ['1', '1.5', '0.5'];
const TITLE_TEXT = 'condition';
// The 150 percent chart plus its right-hand legend has to stay inside
// the workspace pane: a legend clipped by the pane cannot be pressed,
// and elementFromPoint would hand the press to the rail behind it.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => {
    // The click-to-edit coach toast covers the chart on first run.
    try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); }
    catch (e) { /* private mode: the toast is dismissed below instead */ }
});
await page.goto(PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}
try {
    const got = page.locator('button', { hasText: 'Got it' }).first();
    if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
} catch { /* no toast to dismiss */ }

// One reading of everything the gestures need. Positions come back
// relative to the chart svg's top-left so a pane scroll cancels out,
// and each press point is the point the ENGINE will really receive:
// elementFromPoint decides, not the centre of a rect, because a legend
// swatch sits in front of the legend body and a bar sits in front of a
// back-layer reference line.
const snap = () => page.evaluate(titleText => {
    let svg = null, area = 0;
    for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
        const b = s.getBoundingClientRect();
        if (b.width * b.height > area) { area = b.width * b.height; svg = s; }
    }
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const rel = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
    };
    const pressOn = (el, want) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const fys = [0.5, 0.32, 0.68, 0.16, 0.84];
        for (let i = 0; i < fys.length; i++) {
            for (let fx = 0.06; fx <= 0.95; fx += 0.03) {
                const x = r.left + r.width * fx;
                const y = r.top + r.height * fys[i];
                const hit = document.elementFromPoint(x, y);
                if (!hit) continue;
                const role = hit.getAttribute && hit.getAttribute('data-role');
                if (want ? role === want : hit === el) return { x: x, y: y };
            }
        }
        return null;
    };
    const host = document.querySelector('.graphbuilder2-host');
    const title = [...svg.querySelectorAll('text')]
        .find(t => (t.textContent || '').trim() === titleText) || null;
    const legendBg = svg.querySelector('[data-role="legend-bg"]');
    const refLine = svg.querySelector('[data-role="refline-line"]');
    const refHit = svg.querySelector('[data-role="refline-hit"]');
    const tipEl = document.querySelector('[data-role="xy-tooltip"]');
    const tipR = (tipEl && tipEl.style.display !== 'none')
        ? tipEl.getBoundingClientRect() : null;
    const points = [...svg.querySelectorAll('[data-role="xy-point"]')]
        .map(p => {
            const r = p.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2,
                     off: r.left + r.width / 2 - sr.left };
        })
        .sort((a, b) => a.cx - b.cx);
    return {
        scale: svg.getScreenCTM().a,
        hostZoom: host ? host.style.zoom : null,
        title: rel(title), titlePress: pressOn(title, null),
        legend: rel(legendBg), legendPress: pressOn(legendBg, 'legend-bg'),
        ref: rel(refLine), refPress: pressOn(refHit, 'refline-hit'),
        tip: tipR ? { l: tipR.left, t: tipR.top, r: tipR.right, b: tipR.bottom } : null,
        points: points
    };
}, TITLE_TEXT);

// Park the cursor off the chart before a baseline reading: a mark left
// under the resting pointer gets a real hover, and hover chrome moves
// geometry.
async function park() {
    await page.mouse.move(14, 14);
    await page.waitForTimeout(150);
}
// A real gesture. page.mouse works in VISUAL viewport pixels, which is
// exactly the space the user's cursor lives in.
async function drag(from, dx, dy) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 6 });
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
    await page.waitForTimeout(180);
}
// Every commit is debounced. A reset still sitting in the queue when
// the next gesture starts would flush mid-drag and undo it, so wait on
// the engine's own pending-option queue rather than guessing a delay.
async function drain() {
    await page.waitForFunction(() => {
        const p = window.__gb2_pendingOpts;
        return !p || Object.keys(p).length === 0;
    }, null, { timeout: 9000 })
        .catch(() => { /* a queue that never drains shows up as a bad ratio */ });
    await page.waitForTimeout(300);
}
// The re-render that follows a commit moves the DOM, so poll until two
// readings agree instead of guessing a delay. pick(snapshot) returns
// the [x, y] being watched.
async function settle(pick) {
    const deadline = Date.now() + 6000;
    let prev = null;
    while (Date.now() < deadline) {
        await page.waitForTimeout(220);
        const cur = pick(await snap());
        if (!cur) continue;
        if (prev && Math.abs(cur[0] - prev[0]) < 0.3
                 && Math.abs(cur[1] - prev[1]) < 0.3) return cur;
        prev = cur;
    }
    return prev;
}
// Drive the zoom the way the user does: the chart tab's own Zoom
// select. Wait for the host to actually carry the requested zoom
// rather than sleeping, so the probe can never measure a chart that
// quietly failed to scale.
async function setZoom(z) {
    await page.selectOption('#ps-chart-zoom', z);
    await page.waitForFunction(want => {
        const h = document.querySelector('.graphbuilder2-host');
        if (!h) return false;
        // The shell clears the property outright at 1, since a zoom of
        // exactly 1 is no zoom at all.
        return Number(h.style.zoom === '' ? '1' : h.style.zoom) === Number(want);
    }, z, { timeout: 6000 });
    await page.waitForTimeout(500);
}
const ratio = (travel, commanded) => travel / commanded;
const fmt = n => (Math.round(n * 1000) / 1000).toFixed(3);

// ------------------------------------------------------------ setup
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    PS_SHELL.setWorkspace('chart');
    PS_SHELL.setModule('plotbuilder');
    PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score', groupVar: 'site' });
    await s(1500);
});
// A reference line, added through the real "+" menu. Its creation-time
// JSON is the baseline every iteration is restored to, so each zoom
// drags from the same logical position.
await page.click('button[aria-label="Add to chart"]');
await page.waitForTimeout(350);
await page.click('[data-role="add-ann-menu"] [data-kind="refLine"]');
await page.waitForTimeout(1600);
const refBaseline = await page.evaluate(
    () => window.PS_SHELL.optionStore().annotationsJson);
ok(typeof refBaseline === 'string' && refBaseline.indexOf('refLine') >= 0,
   'a reference line was added through the "+" menu');

const zoom1Ratios = [];

for (const z of ZOOMS) {
    console.log('zoom ' + Math.round(Number(z) * 100) + '%');
    await setZoom(z);
    await park();
    const S = Number(z);
    const base = await snap();
    ok(base && Math.abs(base.scale - S) < 0.01,
       `the chart really is at ${z}x (svg screen scale ` +
       `${base ? fmt(base.scale) : 'no chart'})`);
    ok(z === '1'
        ? (base.hostZoom === '' || Number(base.hostZoom) === 1)
        : Number(base.hostZoom) === S,
       `the engine host carries style.zoom ${JSON.stringify(base.hostZoom)}`);

    // ---- case 1: an editable text (the x-axis title) tracks the cursor
    {
        const DX = 160, DY = -110;
        ok(!!base.titlePress, 'the axis title is pressable');
        if (base.titlePress) {
            await drag(base.titlePress, DX, DY);
            const mid = await snap();
            const rx = ratio(mid.title.x - base.title.x, DX);
            const ry = ratio(mid.title.y - base.title.y, DY);
            ok(Math.abs(rx - 1) < TOL && Math.abs(ry - 1) < TOL,
               `text drag tracks the cursor 1:1 (x ${fmt(rx)}, y ${fmt(ry)})`);
            if (z === '1') zoom1Ratios.push(rx, ry);
            await page.mouse.up();
            // ---- case 4a: the commit leaves it where the cursor did
            await drain();
            const rest = await settle(s => s && s.title
                ? [s.title.x, s.title.y] : null);
            const kx = ratio(rest[0] - base.title.x, DX);
            const ky = ratio(rest[1] - base.title.y, DY);
            ok(Math.abs(kx - 1) < TOL && Math.abs(ky - 1) < TOL,
               `the text stays put once the commit lands ` +
               `(x ${fmt(kx)}, y ${fmt(ky)})`);
            if (z === '1') zoom1Ratios.push(kx, ky);
        }
        await page.evaluate(() => window.__gb2_setOption('textOffsets', []));
        await drain();
    }

    // ---- case 2: the legend tracks the cursor
    {
        const DX = -90, DY = 80;
        await park();
        const b = await snap();
        ok(!!b.legendPress, 'the legend body is pressable');
        if (b.legendPress) {
            await drag(b.legendPress, DX, DY);
            const mid = await snap();
            const rx = ratio(mid.legend.x - b.legend.x, DX);
            const ry = ratio(mid.legend.y - b.legend.y, DY);
            ok(Math.abs(rx - 1) < TOL && Math.abs(ry - 1) < TOL,
               `legend drag tracks the cursor 1:1 (x ${fmt(rx)}, y ${fmt(ry)})`);
            if (z === '1') zoom1Ratios.push(rx, ry);
            await page.mouse.up();
            // ---- case 4b
            await drain();
            const rest = await settle(s => s && s.legend
                ? [s.legend.x, s.legend.y] : null);
            const kx = ratio(rest[0] - b.legend.x, DX);
            const ky = ratio(rest[1] - b.legend.y, DY);
            ok(Math.abs(kx - 1) < TOL && Math.abs(ky - 1) < TOL,
               `the legend stays put once the commit lands ` +
               `(x ${fmt(kx)}, y ${fmt(ky)})`);
            if (z === '1') zoom1Ratios.push(kx, ky);
        }
        await page.evaluate(() => {
            window.__gb2_setOption('legendOffsetX', 0);
            window.__gb2_setOption('legendOffsetY', 0);
        });
        await drain();
    }

    // ---- case 3: the reference line tracks the cursor
    {
        const DY = -80;
        await park();
        const b = await snap();
        ok(!!b.refPress, 'the reference line is pressable');
        if (b.refPress) {
            await drag(b.refPress, 0, DY);
            const mid = await snap();
            const ry = ratio(mid.ref.y - b.ref.y, DY);
            ok(Math.abs(ry - 1) < TOL,
               `reference-line drag tracks the cursor 1:1 (y ${fmt(ry)})`);
            if (z === '1') zoom1Ratios.push(ry);
            await page.mouse.up();
            // ---- case 4c
            await drain();
            const rest = await settle(s => s && s.ref ? [s.ref.x, s.ref.y] : null);
            const ky = ratio(rest[1] - b.ref.y, DY);
            ok(Math.abs(ky - 1) < TOL,
               `the reference line stays put once the commit lands ` +
               `(y ${fmt(ky)})`);
            if (z === '1') zoom1Ratios.push(ky);
        }
        await page.evaluate(j => window.__gb2_setOption('annotationsJson', j),
                            refBaseline);
        await drain();
    }
}

// ---- case 5: the scatter hover tooltip sits on the point it describes
// The annotations go first: a reference line drawn across the cloud
// would take the hover that belongs to a point.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.__gb2_setOption('annotationsJson', '[]');
    await s(400);
    PS_SHELL.setModule('xyplotbuilder');
    PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
    await s(1600);
});
// Distance from the hovered point to the tooltip's RECT, zero inside
// it. Measuring to the rect rather than to its corner survives the
// flip the tooltip performs near the chart's right edge.
function gapTo(pt, r) {
    const dx = Math.max(r.l - pt.cx, pt.cx - r.r, 0);
    const dy = Math.max(r.t - pt.cy, pt.cy - r.b, 0);
    return Math.hypot(dx, dy);
}
const TIP_GAP = 30;
for (const z of ZOOMS) {
    console.log('tooltip at ' + Math.round(Number(z) * 100) + '%');
    await setZoom(z);
    await park();
    const s0 = await snap();
    ok(s0.points.length >= 4,
       `the scatter drew ${s0.points.length} points at ${z}x`);
    // Near the chart's left edge and far from it: the error this pins
    // is linear in that distance, so a near-edge point alone would
    // barely move while a far one is out by hundreds of pixels.
    const targets = [['near the left edge', s0.points[0]],
                     ['far from it', s0.points[s0.points.length - 1]]];
    const gaps = [];
    for (const [where, pt] of targets) {
        await park();
        await page.mouse.move(pt.cx, pt.cy);
        await page.waitForTimeout(300);
        const s1 = await snap();
        ok(!!s1.tip, `a tooltip appears for the point ${where}`);
        if (s1.tip) {
            const g = gapTo(pt, s1.tip);
            gaps.push(g);
            ok(g <= TIP_GAP,
               `the tooltip sits on its point ${where} ` +
               `(${Math.round(pt.off)}px in, gap ${g.toFixed(1)}px)`);
        }
    }
    // The tooltip's own offset from the cursor is a constant, so the
    // gap must not depend on how far across the chart the point sits.
    // A drift that grows with the distance IS the visual-vs-logical
    // error, and this reads it without depending on that constant.
    if (gaps.length === 2) {
        ok(Math.abs(gaps[1] - gaps[0]) <= 12,
           `the tooltip's gap does not grow with the distance across ` +
           `the chart (near ${gaps[0].toFixed(1)}px, far ${gaps[1].toFixed(1)}px)`);
    }
}
await park();

// ---- case 6: the no-zoom path is untouched
// jamovi applies no CSS zoom, so its factor is exactly 1 and every
// divide is a byte no-op. If a fix regressed that shape, the 100
// percent ratios collected above would have drifted off 1.0.
ok(zoom1Ratios.length >= 9,
   `collected ${zoom1Ratios.length} tracking ratios at 100 percent`);
{
    const worst = zoom1Ratios.reduce(
        (w, r) => Math.abs(r - 1) > Math.abs(w - 1) ? r : w, 1);
    ok(Math.abs(worst - 1) < TOL,
       `every 100 percent gesture still tracks 1:1 (worst ${fmt(worst)})`);
}

ok(errors.length === 0,
   'zero page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(failures === 0
    ? 'VIEW ZOOM DRAG PASS'
    : 'VIEW ZOOM DRAG: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
