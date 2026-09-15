// The docked color picker across an echo (Sep 14 2026, Torry: "switch to
// a new bar, grab the HSV marker at once, and about a second later it is
// ripped from my mouse and put back where it was; wait a few seconds and
// it is fine").
//
// Two halves. (1) SHELL: the previous bar's color commits when its picker
// closes at the switch, and the engine flushes that 1.5s later; the engine
// defers the flush while a pointer is down inside its host, but the docked
// panel lives in the controls column, so a drag on the docked picker did
// not count, the flush fired mid-drag, and the echo rebuilt the panel under
// the pointer (capture lost, drag over). Echoes now hold while a pointer is
// down on the chart or the docked panel and replay 120ms after release.
// (2) ENGINE: the picker commits its color only when it closes, so ANY
// render while it is open rebuilt the panel from data that never saw the
// picked color and put the old one back; with the panel under the chart
// the same sequence lost the color 1.5s after release, silently. The
// render entry now commits an open picker in place through a window hook,
// so the picked color rides the render and the flush persists it.
//
// Cases (chromium and webkit; webkit skipped with exit 2 when absent):
//   1. 1366x620, panel beside: recolor bar A on its pad, release, click bar
//      B within 300ms, drag B's pad for 3s straight through the flush, then
//      release. The pad element survives the drag, the fill follows every
//      step, no render lands while the pointer is down, and 4s after the
//      release the store holds BOTH colors, the chart shows B's, and the
//      picker is still open.
//   2. 1470x1000, panel under the chart: the same sequence (the engine's
//      own deferral covers the drag here; the color used to revert at the
//      post-release flush).
//   3. 1470x1000, panel under the chart: pick a color on one bar, keep the
//      picker open, then commit an unrelated option (corner radius) so an
//      echo lands with the picker open. The picked color must survive
//      that render and reach the store.
// CONTROL (main): case 1 fails with the pad replaced ~1.2s into the drag
// and the fill back to the original; cases 2 and 3 fail on the store and
// the fill after the echo.
//
// Usage: node standalone/verify/picker-hold-check.mjs

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
const pw = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

let failures = 0;
function ok(cond, label) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label); failures++; }
}

async function open(browser, w, h, dock) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.__errors = errors;
    await page.addInitScript(d => {
        try {
            localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1');
            localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: d }));
        } catch (e) { /* private mode */ }
    }, dock);
    await page.goto(PAGE);
    await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(1800);
    }
    try {
        const got = page.locator('button', { hasText: 'Got it' }).first();
        if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
    } catch { /* no toast */ }
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart');
        PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1500);
        // render calls are counted, so a render during a drag is visible
        const gb = window.GraphBuilder2, orig = gb.render;
        window.__renders = 0;
        gb.render = function () { window.__renders++; return orig.apply(this, arguments); };
    });
    return page;
}
// The two series' first bars (different fills), by DOM order.
async function twoBars(page) {
    return page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.graphbuilder2-host svg[data-role="gb2-chart-svg"] [data-bar-cat]')).filter(e => e.getBoundingClientRect().width > 4);
        const f0 = els[0].getAttribute('fill');
        const other = els.find(e => e.getAttribute('fill') && e.getAttribute('fill') !== f0) || els[1];
        const pt = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, fill: el.getAttribute('fill'), group: el.getAttribute('data-bar-group') || el.getAttribute('data-group') || '' }; };
        return { a: pt(other), b: pt(els[0]) };
    });
}
const fillOfB = page => page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.graphbuilder2-host svg[data-role="gb2-chart-svg"] [data-bar-cat]')).filter(e => e.getBoundingClientRect().width > 4);
    return els[0].getAttribute('fill');
});
async function padRect(page) {
    await page.waitForFunction(() => { const e = document.querySelector('[data-role="color-picker"] [data-role="sv"]'); return !!(e && e.offsetParent && e.getBoundingClientRect().height > 40); }, null, { timeout: 4000 });
    return page.evaluate(() => { const e = document.querySelector('[data-role="color-picker"] [data-role="sv"]'); const r = e.getBoundingClientRect(); e.__padMark = (window.__padSeq = (window.__padSeq || 0) + 1); return { x: r.left, y: r.top, w: r.width, h: r.height, mark: e.__padMark }; });
}
// Press on the pad, drag right in 30 steps over ~3s, sampling per step.
async function dragPad(page, pad) {
    const x0 = pad.x + pad.w * 0.2, y0 = pad.y + pad.h * 0.3;
    await page.mouse.move(x0, y0); await page.mouse.down();
    const r0 = await page.evaluate(() => window.__renders);
    const out = { replacedAt: null, fills: [], rendersDuring: 0 };
    for (let i = 1; i <= 30; i++) {
        await page.mouse.move(x0 + i * (pad.w * 0.02), y0, { steps: 2 });
        await page.waitForTimeout(100);
        const st = await page.evaluate(mark => { const e = document.querySelector('[data-role="color-picker"] [data-role="sv"]'); return { same: !!(e && e.__padMark === mark), renders: window.__renders }; }, pad.mark);
        out.fills.push(await fillOfB(page));
        if (!st.same && out.replacedAt == null) out.replacedAt = i;
        out.rendersDuring = st.renders - r0;
    }
    await page.mouse.up();
    return out;
}
const storeColors = page => page.evaluate(() => {
    const spec = PS_SHELL.optionStore().chartSpec || '';
    try { const o = JSON.parse(spec); return (o.groupColors || []).map(g => g.original + '=' + g.color); } catch (e) { return ['unparsed:' + spec.slice(0, 40)]; }
});
const pickerOpen = page => page.evaluate(() => { const p = document.querySelector('[data-role="color-picker"]'); return !!(p && p.offsetParent); });

async function switchSequence(page, tag) {
    const { a, b } = await twoBars(page);
    // bar A: select, recolor on the pad, release
    await page.mouse.click(a.x, a.y);
    const padA = await padRect(page);
    await page.waitForTimeout(500);
    await page.mouse.move(padA.x + padA.w * 0.6, padA.y + padA.h * 0.5); await page.mouse.down();
    await page.mouse.move(padA.x + padA.w * 0.8, padA.y + padA.h * 0.5, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    // bar B: switch and grab at once
    await page.mouse.click(b.x, b.y);
    const padB = await padRect(page);
    await page.waitForTimeout(200);
    const f0 = await fillOfB(page);
    const d = await dragPad(page, padB);
    const distinct = Array.from(new Set(d.fills));
    ok(d.replacedAt == null, tag + ': the pad under the pointer survived the whole drag' + (d.replacedAt != null ? ' (replaced at step ' + d.replacedAt + ')' : ''));
    ok(distinct.length >= 10 && d.fills[d.fills.length - 1] !== f0, tag + ': the bar followed the drag (' + distinct.length + ' distinct fills, last ' + d.fills[d.fills.length - 1] + ')');
    ok(d.rendersDuring === 0, tag + ': no render landed while the pointer was down (' + d.rendersDuring + ')');
    const dragged = d.fills[d.fills.length - 1];
    await page.waitForTimeout(4000);
    const after = await fillOfB(page);
    const store = await storeColors(page);
    ok(after === dragged, tag + ': 4s after release the bar still shows the dragged color (' + after + ' vs ' + dragged + ')');
    ok(store.length === 2 && store.some(s => s.endsWith('=' + dragged)), tag + ': the store holds the colors of both bars (' + store.join(', ') + ')');
    ok(await pickerOpen(page), tag + ': the picker is still open');
}

async function engineRun(name, launcher) {
    let browser;
    try { browser = await launcher.launch(); }
    catch (e) {
        if (name === 'webkit') { console.error('webkit unavailable: ' + e.message.split('\n')[0]); process.exit(2); }
        throw e;
    }
    console.log('== ' + name);
    {
        const page = await open(browser, 1366, 620, 'auto');
        ok(!!(await page.evaluate(() => document.querySelector('#ps-engine-dock-slot'))), '[' + name + '] dock slot present');
        await switchSequence(page, '[' + name + ' beside]');
        ok(!!(await page.evaluate(() => document.querySelector('#ps-engine-dock-slot .gb2-panel'))), '[' + name + ' beside] the panel was docked beside the chart');
        ok(page.__errors.length === 0, '[' + name + ' beside] no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
        await page.close();
    }
    {
        const page = await open(browser, 1470, 1000, 'below');
        await switchSequence(page, '[' + name + ' below]');
        ok(page.__errors.length === 0, '[' + name + ' below] no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
        await page.close();
    }
    {
        const page = await open(browser, 1470, 1000, 'below');
        const { b } = await twoBars(page);
        await page.mouse.click(b.x, b.y);
        const pad = await padRect(page);
        await page.waitForTimeout(500);
        const f0 = await fillOfB(page);
        await page.mouse.move(pad.x + pad.w * 0.7, pad.y + pad.h * 0.4); await page.mouse.down();
        await page.mouse.move(pad.x + pad.w * 0.9, pad.y + pad.h * 0.4, { steps: 5 }); await page.mouse.up();
        await page.waitForTimeout(300);
        const picked = await fillOfB(page);
        ok(picked !== f0, '[' + name + ' echo] a color was picked (' + f0 + ' -> ' + picked + ')');
        // an unrelated commit brings an echo while the picker is open
        await page.evaluate(() => window.setOption('barCornerRadius', 12));
        // the echo lands ~120ms later; the entry commit it triggers flushes
        // 1.5s after that
        await page.waitForTimeout(2600);
        const after = await fillOfB(page);
        const store = await storeColors(page);
        ok(after === picked, '[' + name + ' echo] the picked color survived the echo render (' + after + ')');
        ok(store.some(s => s.endsWith('=' + picked)), '[' + name + ' echo] the picked color reached the store (' + store.join(', ') + ')');
        ok(await pickerOpen(page), '[' + name + ' echo] the picker is still open');
        ok(page.__errors.length === 0, '[' + name + ' echo] no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
        await page.close();
    }
    await browser.close();
}
await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
console.log(failures ? 'picker-hold: FAIL (' + failures + ')' : 'picker-hold: PASS');
process.exit(failures ? 1 : 0);
