// Chart setup list roles (Repeated Measures occasions, Likert items, matrix
// variables) keep the order their chips were dropped in, and that order is
// the chart's. A chip dropped over another chip in the same list used to do
// nothing (the drop only appended a NEW column); it now lands beside that
// chip, before or after by the pointer's half, with a marker during the
// drag. Oct 4 2026, from a colleague's ask to reorder variables by dragging.
// Control: on main, case 1 fails because the order does not change.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}
// Three numeric columns as Repeated Measures occasions: their order IS the
// order of the occasions on the chart. The sample has two, so load a small
// table of three.
const cols = ['t1', 't2', 't3'];
await page.evaluate(async cs => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push([String(10 + i), String(14 + (i * 7) % 9), String(18 + (i * 5) % 11)]);
    window.PS_SHELL.loadTable('order', cs, rows, null, null);
    await w(800);
}, cols);
ok(await page.evaluate(cs => cs.every(c => window.PS_SHELL.project.table.types[c] === 'continuous'), cols),
   'setup: three numeric columns (' + cols.join(', ') + ')');
await page.evaluate(async cs => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.setModule('rmplotbuilder'); await w(500);
    S.setRoles('rmplotbuilder', { measures: cs }); await w(1400);
}, cols);
await page.waitForTimeout(800);
const order = () => page.evaluate(() => window.PS_SHELL.chart().roles.rmplotbuilder.measures.slice());
const chipRect = col => page.evaluate(c => {
    const chip = document.querySelector('[data-role-key="measures"] .ps-slot-chip[data-col="' + c + '"]');
    const r = chip.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}, col);
// The drag, as the browser would deliver it: dragstart on the chip, dragover
// on the list at the pointer, then drop at the same point.
async function dragChip(col, x, y, opts) {
    return page.evaluate(([c, px, py, o]) => {
        const chip = document.querySelector('[data-role-key="measures"] .ps-slot-chip[data-col="' + c + '"]');
        const drop = document.querySelector('[data-role-key="measures"] .ps-slot-drop');
        const dt = new DataTransfer();
        chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
        drop.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: px, clientY: py }));
        const marked = Array.from(drop.querySelectorAll('[data-insert]'))
            .map(m => m.getAttribute('data-col') + ':' + m.getAttribute('data-insert'));
        if (o && o.leave) {
            drop.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true, cancelable: true }));
            chip.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true, cancelable: true }));
            return { marked, after: Array.from(drop.querySelectorAll('[data-insert]')).length };
        }
        drop.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: px, clientY: py }));
        chip.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true, cancelable: true }));
        return { marked };
    }, [col, x, y, opts || null]);
}
const [A, B, C] = cols;
ok(JSON.stringify(await order()) === JSON.stringify([A, B, C]), 'setup: the occasions read ' + [A, B, C].join(', '));

console.log('case 1: dropping the last chip on the left half of the first moves it to the front');
let r = await chipRect(A);
let res = await dragChip(C, r.left + 4, (r.top + r.bottom) / 2);
ok(res.marked.join() === A + ':before', 'while dragging, the first chip shows a marker on its left (' + res.marked.join() + ')');
await page.waitForTimeout(900);
ok(JSON.stringify(await order()) === JSON.stringify([C, A, B]),
   'the list reads ' + (await order()).join(', '));
const drawn = await page.evaluate(() => {
    const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
    return Array.from(svg.querySelectorAll('text')).map(t => t.textContent.trim());
});
ok(drawn.indexOf(C) >= 0 && drawn.indexOf(C) < drawn.indexOf(A), 'and the chart draws ' + C + ' before ' + A);

console.log('case 2: the right half of a chip lands after it, and a drop on open space appends');
r = await chipRect(B);
res = await dragChip(C, r.right - 4, (r.top + r.bottom) / 2);
ok(res.marked.join() === B + ':after', 'the marker sits on the right of ' + B);
await page.waitForTimeout(900);
ok(JSON.stringify(await order()) === JSON.stringify([A, B, C]), 'the list reads ' + (await order()).join(', '));
const dropRect = await page.evaluate(() => {
    const r = document.querySelector('[data-role-key="measures"] .ps-slot-drop').getBoundingClientRect();
    return { right: r.right, bottom: r.bottom };
});
res = await dragChip(A, dropRect.right - 2, dropRect.bottom - 2);
await page.waitForTimeout(900);
ok(JSON.stringify(await order()) === JSON.stringify([B, C, A]),
   'a drop on the open space at the end appends (' + (await order()).join(', ') + ')');

console.log('case 3: leaving the list clears the marker; a chip dropped on itself stays put');
r = await chipRect(B);
res = await dragChip(C, r.left + 4, (r.top + r.bottom) / 2, { leave: true });
ok(res.marked.length === 1 && res.after === 0, 'the marker shows during the drag and clears on leave');
r = await chipRect(C);
await dragChip(C, (r.left + r.right) / 2, (r.top + r.bottom) / 2);
await page.waitForTimeout(900);
ok(JSON.stringify(await order()) === JSON.stringify([B, C, A]), 'the order is unchanged (' + (await order()).join(', ') + ')');

console.log('case 4: the list does not move under the pointer, and crossing onto a chip does not blink');
// Torry's report (Oct 2026): hovering a dragged chip made the zone grow and
// every chip shift, and the highlight blinked at each chip boundary. The
// zone's drag highlight must be layout-neutral, and a dragleave whose
// destination is one of the zone's own chips must change nothing.
const zoneRect = () => page.evaluate(() => {
    const r = document.querySelector('[data-role-key="measures"] .ps-slot-drop').getBoundingClientRect();
    return { w: r.width, h: r.height, top: r.top, left: r.left };
});
const before = { zone: await zoneRect(), chip: await chipRect(B) };
const mid = await page.evaluate(([c, target]) => {
    const chip = document.querySelector('[data-role-key="measures"] .ps-slot-chip[data-col="' + c + '"]');
    const over = document.querySelector('[data-role-key="measures"] .ps-slot-chip[data-col="' + target + '"]');
    const drop = document.querySelector('[data-role-key="measures"] .ps-slot-drop');
    const dt = new DataTransfer();
    const r = over.getBoundingClientRect();
    chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
    drop.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 4, clientY: (r.top + r.bottom) / 2 }));
    const lit = drop.classList.contains('ps-droptarget');
    const z = drop.getBoundingClientRect(), cr = over.getBoundingClientRect();
    const zone = { w: z.width, h: z.height, top: z.top, left: z.left };
    const chipNow = { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom };
    // The pointer crosses from the zone's padding onto a chip: the zone
    // gets a dragleave whose relatedTarget is that chip.
    drop.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true, cancelable: true, relatedTarget: over }));
    const stillLit = drop.classList.contains('ps-droptarget');
    const stillMarked = drop.querySelectorAll('[data-insert]').length;
    // And then really leaves the zone.
    drop.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true, cancelable: true, relatedTarget: document.body }));
    const cleared = !drop.classList.contains('ps-droptarget') && drop.querySelectorAll('[data-insert]').length === 0;
    chip.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return { lit, zone, chipNow, stillLit, stillMarked, cleared };
}, [C, B]);
const same = (a, b) => Math.abs(a - b) < 0.6;
ok(mid.lit, 'the zone is highlighted while the chip is over it');
ok(same(mid.zone.w, before.zone.w) && same(mid.zone.h, before.zone.h) && same(mid.zone.top, before.zone.top) && same(mid.zone.left, before.zone.left),
   'and it keeps its size and place (' + before.zone.w.toFixed(1) + 'x' + before.zone.h.toFixed(1) + ' before, ' + mid.zone.w.toFixed(1) + 'x' + mid.zone.h.toFixed(1) + ' during)');
ok(same(mid.chipNow.left, before.chip.left) && same(mid.chipNow.top, before.chip.top) && same(mid.chipNow.right, before.chip.right),
   'the chip under the pointer does not move');
ok(mid.stillLit && mid.stillMarked === 1, 'crossing onto a chip keeps the highlight and the marker');
ok(mid.cleared, 'leaving the zone for real clears both');

// No Undo case: role edits (adding, removing, reordering a chip) have never
// been part of an undo history in this app, so there is nothing to assert.

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('ROLE CHIP ORDER CHECK PASS');
await browser.close();
