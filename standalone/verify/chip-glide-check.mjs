// A chip dropped at a new position in a Chart setup list glides the chart
// into the new order (Oct 8 2026, Torry: make the swap as dynamic as the
// chart's own drags). The engine exposes one host hook per list role
// (__gb2_applyCategoryOrder, __gb2_applyCorrVarOrder,
// __gb2_applyLikertItemOrder) that runs the same capture, redraw and
// glide its Order tab and surface drags use; the app's drop calls it
// instead of re-rendering. What must hold:
//   - right after the drop the moved element is in flight: strictly
//     between where it was and where it ends up
//   - it settles at the new position, the chips and the engine's order
//     agree, and the echo re-render keeps the order
//   - a drop that keeps the order moves nothing
// Control: without the hooks the app re-renders the chart on the drop and
// the element is already at its final position when sampled.
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
const SOFT = process.env.PS_SOFT === '1';
let failed = 0;
function ok(cond, msg) {
    if (!cond) {
        if (!SOFT) throw new Error(msg);
        failed++; console.log('  FAIL  ' + msg); return;
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
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1500);
}
const w = ms => page.waitForTimeout(ms);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push([String(10 + i), String(14 + (i * 7) % 9), String(18 + (i * 5) % 11), String(1 + (i % 5)), String(1 + ((i * 3) % 5)), String(1 + ((i * 2) % 5))]);
    window.PS_SHELL.loadTable('glide', ['t1', 't2', 't3', 'q1', 'q2', 'q3'], rows, null, null);
    await s(800);
});
const setup = (mod, roles) => page.evaluate(async ([mod, roles]) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule(mod); await s(400);
    window.PS_SHELL.setRoles(mod, roles); await s(1600);
}, [mod, roles]);
const chips = (mod, role) => page.evaluate(([m, r]) => window.PS_SHELL.chart().roles[m][r].slice(), [mod, role]);
const specOrder = (mod, key) => page.evaluate(([m, k]) => {
    const o = window.PS_SHELL.chart().options[m] || {};
    let spec = {}; try { spec = o.chartSpec ? JSON.parse(o.chartSpec) : {}; } catch (e) {}
    return spec[k] || o[k] || null;
}, [mod, key]);
// Where a named element sits now (screen px), by a selector on the chart.
const posOf = (sel, axis) => page.evaluate(([sel, axis]) => {
    const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
    const el = svg && svg.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    return axis === 'x' ? r.x + r.width / 2 : r.y + r.height / 2;
}, [sel, axis]);
// The drop as the browser delivers it, then an immediate sample of the
// moved element's position (same task as the drop's own handlers, before
// any frame paints).
async function dropChipAndSample(roleKey, col, targetCol, before, sel, axis) {
    return page.evaluate(([rk, c, tc, bf, sel, axis]) => {
        const card = document.querySelector('[data-role-key="' + rk + '"]');
        const chip = card.querySelector('.ps-slot-chip[data-col="' + c + '"]');
        const tgt = card.querySelector('.ps-slot-chip[data-col="' + tc + '"]');
        const drop = card.querySelector('.ps-slot-drop');
        const r = tgt.getBoundingClientRect();
        const px = bf ? r.left + 4 : r.right - 4, py = (r.top + r.bottom) / 2;
        const dt = new DataTransfer();
        chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
        drop.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: px, clientY: py }));
        drop.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: px, clientY: py }));
        chip.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true, cancelable: true }));
        return new Promise(resolve => setTimeout(() => {
            const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
            const el = svg && svg.querySelector(sel); if (!el) return resolve(null);
            const rr = el.getBoundingClientRect();
            resolve(axis === 'x' ? rr.x + rr.width / 2 : rr.y + rr.height / 2);
        }, 90));
    }, [roleKey, col, targetCol, before, sel, axis]);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const between = (v, a, b) => v != null && v > Math.min(a, b) + 2 && v < Math.max(a, b) - 2;

async function glideCase(label, mod, roleKey, orderKey, cols, sel, axis, drawn) {
    console.log(label);
    const [A, B, C] = cols;
    const roles = {}; roles[roleKey] = cols;
    await setup(mod, roles);
    ok(same(await drawn(), cols), 'setup: the chart draws ' + cols.join(', '));
    const was = await posOf(sel(C), axis);
    const target = await posOf(sel(A), axis);
    const mid = await dropChipAndSample(roleKey, C, A, true, sel(C), axis);
    ok(between(mid, was, target), C + ' is in flight 90 ms after the drop (' + [was, mid, target].map(v => v == null ? 'none' : v.toFixed(0)).join(' -> ') + ')');
    await w(700);
    const now = await posOf(sel(C), axis);
    ok(now != null && Math.abs(now - target) < 3, 'and settles where ' + A + ' was (' + (now == null ? 'none' : now.toFixed(0)) + ')');
    ok(same(await drawn(), [C, A, B]) && same(await chips(mod, roleKey), [C, A, B]), 'the chart and the chips read ' + (await drawn()).join(', '));
    await w(2300);
    ok(same(await specOrder(mod, orderKey), [C, A, B]), 'the engine committed ' + orderKey + ' ' + C + ', ' + A + ', ' + B);
    ok(same(await drawn(), [C, A, B]) && same(await chips(mod, roleKey), [C, A, B]), 'the echo re-render kept both sides at ' + [C, A, B].join(', '));
    // A drop that lands the chip where it already is: B after A in
    // C, A, B. (Dropping a chip on its own half is not that: the list
    // excludes the dragged chip and picks the nearest other one, which
    // on a wrapped list can be a chip on the row above.)
    const beforeSame = await posOf(sel(B), axis);
    const midSame = await dropChipAndSample(roleKey, B, A, false, sel(B), axis);
    ok(same(await chips(mod, roleKey), [C, A, B]) && midSame != null && Math.abs(midSame - beforeSame) < 1, 'a drop that keeps the order moves nothing');
}
const drawnRM = () => page.evaluate(() => {
    const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
    return Array.from(svg.querySelectorAll('[data-role="x-cat-label"]'))
        .map(t => ({ c: t.getAttribute('data-bar-cat'), x: t.getBoundingClientRect().x }))
        .sort((a, b) => a.x - b.x).map(t => t.c);
});
const drawnCorr = () => page.evaluate(() => {
    const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
    return Array.from(svg.querySelectorAll('[data-role="corr-var-label"][data-axis="row"]'))
        .map(t => ({ v: t.getAttribute('data-var'), y: t.getBoundingClientRect().y }))
        .sort((a, b) => a.y - b.y).map(t => t.v);
});
const drawnLikert = () => page.evaluate(() => {
    const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
    const seen = {}; const rows = [];
    Array.from(svg.querySelectorAll('[data-role="likert-seg"]')).forEach(s => {
        const it = s.getAttribute('data-item'); if (seen[it]) return; seen[it] = 1;
        rows.push({ it, y: s.getBoundingClientRect().y });
    });
    return rows.sort((a, b) => a.y - b.y).map(r => r.it);
});
await glideCase('case 1: Repeated Measures occasions glide when their chips are reordered',
    'rmplotbuilder', 'measures', 'categoryOrder', ['t1', 't2', 't3'],
    c => '[data-bar-cat="' + c + '"]:not([data-role])', 'x', drawnRM);
await glideCase('case 2: correlation variables glide the matrix rows',
    'corrplotbuilder', 'vars', 'corrVarOrder', ['t1', 't2', 't3'],
    c => '[data-role="corr-var-label-g"][data-var="' + c + '"][data-axis="row"]', 'y', drawnCorr);
await glideCase('case 3: Likert items glide their rows',
    'likertplotbuilder', 'items', 'likertItemOrder', ['q1', 'q2', 'q3'],
    c => '[data-role="likert-seg"][data-item="' + c + '"][data-level="1"]', 'y', drawnLikert);

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();
if (failed) { console.log('\nchip-glide-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nchip-glide-check: all cases passed');
