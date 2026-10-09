// The Chart setup list roles and the chart's drawn order are one fact seen
// from two sides (Torry, Oct 8 2026). Dragging a marker on the chart
// commits the engine's own order (categoryOrder, likertItemOrder,
// corrVarOrder), which the engine applies OVER the shipped order, so after
// one chart drag the cards could no longer reorder the chart. What must
// hold now, for Repeated Measures occasions, matrix variables and Likert
// items:
//   - a drag on the chart surface reorders the chips to match
//   - a chip dropped at a new position reorders the chart, also AFTER a
//     chart drag has happened (the reported bug)
//   - the echo re-render keeps the drawn order
// Control: on main, the chips never follow the chart, and after the chart
// drag the chip drop changes the list but not the chart.
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
// Three numeric occasions and three 1..5 items.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push([String(10 + i), String(14 + (i * 7) % 9), String(18 + (i * 5) % 11), String(1 + (i % 5)), String(1 + ((i * 3) % 5)), String(1 + ((i * 2) % 5))]);
    window.PS_SHELL.loadTable('order', ['t1', 't2', 't3', 'q1', 'q2', 'q3'], rows, null, null);
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
// Drawn orders, read from the chart itself.
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
const centerOf = (sel) => page.evaluate((sel) => {
    const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
    const el = svg.querySelector(sel); const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, sel);
// A real pointer drag on the chart surface: press, cross the engine's
// 5px threshold, travel to the target in steps, release.
async function dragOnChart(from, to) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await w(120);
    await page.mouse.up();
}
// The chip drop, as the browser delivers it (the chip-order probe's recipe).
async function dropChip(roleKey, col, targetCol, before) {
    return page.evaluate(([rk, c, tc, bf]) => {
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
        return true;
    }, [roleKey, col, targetCol, before]);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('case 1: Repeated Measures, a marker dragged on the chart reorders the occasion chips');
await setup('rmplotbuilder', { measures: ['t1', 't2', 't3'] });
ok(same(await drawnRM(), ['t1', 't2', 't3']) && same(await chips('rmplotbuilder', 'measures'), ['t1', 't2', 't3']), 'setup: chart and chips read t1, t2, t3 on a ' + (await page.evaluate(() => window.PS_SHELL.buildPayload().graphType)) + ' chart');
let from = await centerOf('[data-bar-cat="t3"]:not([data-role])');
let to = await centerOf('[data-bar-cat="t1"]:not([data-role])');
await dragOnChart(from, { x: to.x - 40, y: from.y });
await w(600);
ok(same(await drawnRM(), ['t3', 't1', 't2']), 'the chart draws t3, t1, t2 right after the drag (' + (await drawnRM()).join(', ') + ')');
await w(2400);
ok(same(await specOrder('rmplotbuilder', 'categoryOrder'), ['t3', 't1', 't2']), 'the engine committed categoryOrder t3, t1, t2');
ok(same(await chips('rmplotbuilder', 'measures'), ['t3', 't1', 't2']), 'the occasion chips now read ' + (await chips('rmplotbuilder', 'measures')).join(', '));
ok(same(await drawnRM(), ['t3', 't1', 't2']), 'and the echo re-render kept the drawn order');

console.log('case 2: after that drag, dropping a chip still reorders the chart (the reported bug)');
await dropChip('measures', 't2', 't3', true);
await w(1500);
ok(same(await chips('rmplotbuilder', 'measures'), ['t2', 't3', 't1']), 'the chips read ' + (await chips('rmplotbuilder', 'measures')).join(', '));
ok(same(await drawnRM(), ['t2', 't3', 't1']), 'the chart follows the chips: ' + (await drawnRM()).join(', '));
ok(!(await specOrder('rmplotbuilder', 'categoryOrder')), 'the engine\'s own categoryOrder was released (the chips define the order now)');
await w(2200);
ok(same(await drawnRM(), ['t2', 't3', 't1']) && same(await chips('rmplotbuilder', 'measures'), ['t2', 't3', 't1']), 'both sides still agree after the echo');

console.log('case 3: the same two ways on a correlation matrix');
await setup('corrplotbuilder', { vars: ['t1', 't2', 't3'] });
ok(same(await drawnCorr(), ['t1', 't2', 't3']), 'setup: rows read t1, t2, t3');
from = await centerOf('[data-role="corr-cell"][data-a="t3"][data-b="t1"]');
to = await centerOf('[data-role="corr-cell"][data-a="t1"][data-b="t1"]');
await page.mouse.move(from.x, from.y); await page.mouse.down();
await page.mouse.move(from.x, from.y - 8, { steps: 2 });
await page.mouse.move(from.x, to.y - 40, { steps: 14 }); await w(120); await page.mouse.up();
await w(600);
ok(same(await drawnCorr(), ['t3', 't1', 't2']), 'a cell dragged up moves its variable first: ' + (await drawnCorr()).join(', '));
await w(2400);
ok(same(await chips('corrplotbuilder', 'vars'), ['t3', 't1', 't2']), 'the variable chips follow: ' + (await chips('corrplotbuilder', 'vars')).join(', '));
await dropChip('vars', 't2', 't3', true);
await w(1500);
ok(same(await chips('corrplotbuilder', 'vars'), ['t2', 't3', 't1']) && same(await drawnCorr(), ['t2', 't3', 't1']), 'a chip drop after the matrix drag reorders the matrix: ' + (await drawnCorr()).join(', '));

console.log('case 4: and on a Likert battery');
await setup('likertplotbuilder', { items: ['q1', 'q2', 'q3'] });
ok(same(await drawnLikert(), ['q1', 'q2', 'q3']), 'setup: rows read q1, q2, q3');
from = await centerOf('[data-role="likert-seg"][data-item="q3"][data-level="1"]');
to = await centerOf('[data-role="likert-seg"][data-item="q1"][data-level="1"]');
await page.mouse.move(from.x, from.y); await page.mouse.down();
await page.mouse.move(from.x, from.y - 8, { steps: 2 });
await page.mouse.move(from.x, to.y - 40, { steps: 14 }); await w(120); await page.mouse.up();
await w(600);
ok(same(await drawnLikert(), ['q3', 'q1', 'q2']), 'a row dragged up moves its item first: ' + (await drawnLikert()).join(', '));
await w(2400);
ok(same(await chips('likertplotbuilder', 'items'), ['q3', 'q1', 'q2']), 'the item chips follow: ' + (await chips('likertplotbuilder', 'items')).join(', '));
await dropChip('items', 'q2', 'q3', true);
await w(1500);
ok(same(await chips('likertplotbuilder', 'items'), ['q2', 'q3', 'q1']) && same(await drawnLikert(), ['q2', 'q3', 'q1']), 'a chip drop after the row drag reorders the chart: ' + (await drawnLikert()).join(', '));

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();
if (failed) { console.log('\nchip-chart-order-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nchip-chart-order-check: all cases passed');
