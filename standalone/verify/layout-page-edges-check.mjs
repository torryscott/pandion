// Page edges (Nov 2026, Torry's ask: "handles on the very edge of the
// layout, to pull it in to the size of your graphs").
//
// Grips on the layout page's own edges and corners, and the rail's Fit page
// to content button. Dragging a grip moves THAT EDGE ONLY: the items keep
// their size and place (a left or top edge re-bases them so nothing moves on
// the paper, and the stage pins its far edge so nothing moves on screen
// either), the edge stops at the outermost item, snaps to the item plus the
// margin, caps at the page maximum, and one Undo takes the whole thing back.
// The presets, typed sizes and the orientation flip keep scaling the figure.
//
// PS_EXPECT_BROKEN=1 is the control: pointed at a page without the feature
// (PS_PAGE=<a pre-fix checkout>/standalone/index.html) it asserts the grips
// and the button are ABSENT and exits 0.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const EXPECT_BROKEN = process.env.PS_EXPECT_BROKEN === '1';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(200);
}

let passed = 0;
function ok(cond, msg, detail) {
    if (!cond) throw new Error(msg + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)));
    passed++;
    console.log('  ok  ' + msg);
}
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

await page.evaluate(() => { window.PS_SHELL.showLayoutGallery(); });
await page.waitForTimeout(150);
await page.click('[data-layout-template="single"]');
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(400);
// A second item of another kind (the Single template places one chart):
// a panel letter above the panel, as the multi-panel templates make them.
await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    l.items.push({ id: 'i99', kind: 'text', text: 'A', fontSize: 20, bold: true, x: 57, y: 6 });
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(150);

if (EXPECT_BROKEN) {
    const grips = await page.locator('#ps-lpage-edges [data-edge]').count();
    const fit = await page.locator('#ps-lpage-fit').count();
    if (grips || fit) throw new Error('control: this page already has page-edge grips or the Fit button');
    console.log('  ok  control: the pre-fix page has no page-edge grips and no Fit page to content button');
    await browser.close();
    process.exit(0);
}

const state = () => page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    const cv = document.getElementById('ps-lcanvas');
    const m = /scale\(([\d.]+)\)/.exec(cv.style.transform || '');
    const st = document.getElementById('ps-lstage').getBoundingClientRect();
    const chartEl = cv.querySelector('.ps-litem[data-kind="chart"]');
    const cr = chartEl ? chartEl.getBoundingClientRect() : null;
    return {
        page: { w: l.page.w, h: l.page.h, margin: l.page.margin, preset: l.page.preset },
        items: l.items.map(i => ({ id: i.id, kind: i.kind, x: i.x, y: i.y, w: i.w, h: i.h })),
        zoom: m ? Number(m[1]) : 1,
        content: window.PS_SHELL.layoutContentBounds(),
        depth: window.PS_SHELL.layoutHistoryDepth(),
        stage: { left: st.left, right: st.right, top: st.top, bottom: st.bottom,
                 width: st.width, height: st.height },
        chartRect: cr ? { left: cr.left, top: cr.top, width: cr.width, height: cr.height } : null,
        fields: { w: document.getElementById('ps-lpage-w').value,
                  h: document.getElementById('ps-lpage-h').value,
                  preset: document.getElementById('ps-lpage').value },
        status: document.getElementById('ps-status-context').textContent,
        selection: window.PS_SHELL.layoutSelection().slice(),
        marquee: !!cv.querySelector('.ps-lmarquee'),
        toast: (document.getElementById('ps-toast') || {}).textContent || ''
    };
});
const sameItems = (a, b) => a.length === b.length && a.every((it, i) =>
    it.id === b[i].id && near(it.x, b[i].x, 0.01) && near(it.y, b[i].y, 0.01) &&
    near(it.w || 0, b[i].w || 0, 0.01) && near(it.h || 0, b[i].h || 0, 0.01));
const shifted = (a, b, dx, dy) => a.length === b.length && a.every((it, i) =>
    it.id === b[i].id && near(b[i].x, it.x + dx, 0.01) && near(b[i].y, it.y + dy, 0.01) &&
    near(it.w || 0, b[i].w || 0, 0.01) && near(it.h || 0, b[i].h || 0, 0.01));
async function grip(edge) {
    const loc = page.locator(`#ps-lpage-edges [data-edge="${edge}"]`);
    // A page grown past the viewport scrolls; the grip has to be on screen
    // for its box to mean anything (a no-op while everything fits).
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) throw new Error('grip ' + edge + ' has no box');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function drag(edge, dx, dy, opts = {}) {
    const g = await grip(edge);
    // Absolute targets keep a "far" drag inside the window; the engine's
    // floors and caps, not the window edge, are what stop the page.
    if (opts.toX != null) dx = opts.toX - g.x;
    if (opts.toY != null) dy = opts.toY - g.y;
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++)
        await page.mouse.move(g.x + dx * i / steps, g.y + dy * i / steps);
    let mid = null;
    if (opts.mid) mid = await opts.mid();
    if (!opts.hold) {
        await page.mouse.up();
        await page.waitForTimeout(320);   // the settle glide is 180 ms
    }
    return mid;
}

// ---- 0. structure ----
const s0 = await state();
ok(s0.items.length >= 2 && s0.content, 'setup: the Single template placed a chart and its label');
ok(await page.locator('#ps-lstage > #ps-lpage-edges [data-edge]').count() === 8,
   'eight grips live in the stage beside the canvas, not inside it');
ok(await page.locator('#ps-lcanvas [data-edge]').count() === 0,
   'no grip is inside the scaled canvas (a hit zone must not scale with the zoom)');
ok(await page.locator('#ps-lpage-edges').getAttribute('aria-hidden') === 'true',
   'the grips are pointer chrome, hidden from assistive technology like the item handle');
ok(await page.locator('#ps-inspector-layout #ps-lpage-fit').count() === 1,
   'the rail\'s Page section carries Fit page to content');
ok(near(s0.stage.width, Math.ceil(s0.page.w * s0.zoom), 1) &&
   near(s0.stage.height, Math.ceil(s0.page.h * s0.zoom), 1),
   'the stage box is the page at the view zoom, so the grips sit on the page\'s own edges', s0.stage);
{
    const inside = await page.evaluate(() => {
        const st = document.getElementById('ps-lstage').getBoundingClientRect();
        const pts = [[1, 1], [st.width - 1, 1], [1, st.height - 1], [st.width / 2, 1], [1, st.height / 2]];
        return pts.map(([x, y]) => {
            const el = document.elementFromPoint(st.left + x, st.top + y);
            return el && el.closest('[data-edge]') ? 'grip' : 'page';
        });
    });
    ok(inside.every(v => v === 'page'),
       'one pixel inside any edge or corner the page itself is what the pointer finds: the grips hang entirely outside, so a rubber band from the very corner is never caught', inside);
}
for (const [edge, cursor] of [['e', 'ew-resize'], ['n', 'ns-resize'], ['se', 'nwse-resize'], ['ne', 'nesw-resize']]) {
    const c = await page.evaluate(ed => getComputedStyle(
        document.querySelector(`#ps-lpage-edges [data-edge="${ed}"]`)).cursor, edge);
    ok(c === cursor, `the ${edge} grip shows the ${cursor} cursor`, c);
}

// ---- 1. the right edge moves alone ----
// The Single template's chart reaches to 58 px of the right edge, so the
// first move is OUTWARD (no floor, no snap in the way); the way back in is
// then a plain travel too.
let before = await state();
await drag('e', 200, 0);
let after = await state();
{
    const expectW = before.page.w + Math.round(200 / before.zoom);
    ok(near(after.page.w, expectW, 1) && after.page.h === before.page.h,
       'dragging the right edge out moves that edge by the pointer\'s travel at the view zoom',
       { before: before.page, after: after.page, zoom: before.zoom });
    ok(sameItems(before.items, after.items),
       'every item keeps its size and its place (the figure is not rescaled)');
    ok(after.page.preset === 'custom' && after.fields.preset === 'custom',
       'the preset reads Custom afterward');
    ok(after.depth === before.depth + 1, 'the drag is one history step');
    ok(after.fields.w === String(Number((after.page.w / 96).toFixed(2))),
       'the rail\'s W field shows the new width in the current unit', after.fields);
    ok(after.status.indexOf(after.fields.w) !== -1,
       'the status bar page size follows', after.status);
    ok(near(after.stage.width, Math.ceil(after.page.w * after.zoom), 1),
       'the stage re-sized to the new page at the (re-fitted) zoom', after.stage);
    ok(after.stage.right <= 1500 && after.stage.left >= 0,
       'the page settled back inside the viewport after release');
}
before = await state();
await drag('e', -100, 0);
after = await state();
ok(near(after.page.w, before.page.w - Math.round(100 / before.zoom), 1) && sameItems(before.items, after.items),
   'dragging it back in shrinks the page by the travel, items still untouched',
   { before: before.page, after: after.page });

// ---- 2. the left edge: re-based items, pinned far edge, nothing moves on screen ----
before = await state();
await drag('w', -150, 0);
after = await state();
ok(near(after.page.w, before.page.w + Math.round(150 / before.zoom), 1) &&
   shifted(before.items, after.items, after.page.w - before.page.w, 0),
   'dragging the left edge outward grows the page and re-bases every item rightward by the growth',
   { before: before.page, after: after.page });
before = await state();
const mid = await drag('w', 100, 0, { mid: state });
after = await state();
{
    const s = Math.round(100 / before.zoom);
    ok(near(mid.stage.right, before.stage.right, 1) && near(mid.stage.left, before.stage.left + 100, 1.5),
       'mid-drag the page\'s right edge stays put and the left edge follows the pointer',
       { before: before.stage, mid: mid.stage });
    ok(mid.chartRect && near(mid.chartRect.left, before.chartRect.left, 1) &&
       near(mid.chartRect.top, before.chartRect.top, 1) &&
       near(mid.chartRect.width, before.chartRect.width, 1),
       'mid-drag the chart panel does not move or resize on screen',
       { before: before.chartRect, mid: mid.chartRect });
    ok(near(after.page.w, before.page.w - s, 1) && after.page.h === before.page.h,
       'the width lost the pointer\'s travel', { before: before.page, after: after.page });
    ok(shifted(before.items, after.items, -(before.page.w - after.page.w), 0),
       'every item re-based by exactly the amount the left edge moved, so the figure is where it was on the paper');
    ok(after.depth === before.depth + 1, 'one history step for the left-edge drag');
}

// ---- 3. the top edge re-bases y ----
before = await state();
await drag('n', 0, -100);
after = await state();
ok(near(after.page.h, before.page.h + Math.round(100 / before.zoom), 1) &&
   shifted(before.items, after.items, 0, after.page.h - before.page.h),
   'dragging the top edge upward grows the page and re-bases the items downward',
   { before: before.page, after: after.page });
before = await state();
await drag('n', 0, 60);
after = await state();
ok(near(after.page.h, before.page.h - Math.round(60 / before.zoom), 1) && after.page.w === before.page.w,
   'dragging the top edge down shortens the page by the travel', { before: before.page, after: after.page });
ok(shifted(before.items, after.items, 0, -(before.page.h - after.page.h)),
   'items re-based upward by the same amount, keeping their place on the paper');

// ---- 4. the content floor: an edge never crops an item ----
before = await state();
await drag('e', 0, 0, { toX: 5 });
after = await state();
ok(after.page.w === Math.ceil(before.content.right),
   'pulled far past the items, the right edge stops exactly at the outermost item',
   { w: after.page.w, contentRight: before.content.right });
ok(sameItems(before.items, after.items), 'the items are untouched by the stop');
before = await state();
await drag('s', 0, 0, { toY: 5 });
after = await state();
ok(after.page.h === Math.ceil(before.content.bottom),
   'the bottom edge stops at the lowest item', { h: after.page.h, contentBottom: before.content.bottom });
before = await state();
await drag('w', 0, 0, { toX: 1495 });
after = await state();
{
    const minX = Math.min(...after.items.map(i => i.x));
    ok(minX >= 0 && minX < 1 && near(after.page.w, before.page.w - Math.floor(before.content.x), 0),
       'the left edge stops at the leftmost item, which lands at x 0', { minX, page: after.page });
}
before = await state();
await drag('n', 0, 0, { toY: 955 });
after = await state();
{
    const minY = Math.min(...after.items.map(i => i.y));
    ok(minY >= 0 && minY < 1, 'the top edge stops at the topmost item', { minY });
}

// ---- 5. undo walks the drags back, items and page together ----
{
    const s5 = await state();
    await page.click('#ps-lcanvas', { position: { x: 2, y: 2 } });
    await page.keyboard.press(`${MOD}+z`);
    await page.waitForTimeout(250);
    const u1 = await state();
    ok(u1.page.h > s5.page.h && shifted(s5.items, u1.items, 0, u1.page.h - s5.page.h),
       'Cmd/Ctrl+Z restores the page height and the items\' positions in one step',
       { before: s5.page, after: u1.page });
    for (let i = 0; i < 16; i++) { await page.keyboard.press(`${MOD}+z`); await page.waitForTimeout(120); }
    const u2 = await state();
    ok(u2.page.w === s0.page.w && u2.page.h === s0.page.h && sameItems(s0.items, u2.items),
       'undoing every drag returns the original page and arrangement exactly', { page: u2.page });
    for (let i = 0; i < 2; i++) { await page.keyboard.press(`${MOD}+Shift+z`); await page.waitForTimeout(120); }
    const r1 = await state();
    ok(r1.page.w !== s0.page.w, 'redo re-applies a drag', { page: r1.page });
    for (let i = 0; i < 2; i++) { await page.keyboard.press(`${MOD}+z`); await page.waitForTimeout(120); }
}

// ---- 6. snap to the item plus the margin ----
before = await state();
{
    const target = before.content.right + before.page.margin;
    const dxScreen = (target - before.page.w) * before.zoom + 3;   // 3 px short of exact
    await drag('e', dxScreen, 0);
    after = await state();
    ok(near(after.page.w, Math.round(target), 1),
       'released within a few pixels of the item plus the margin, the right edge snaps to it',
       { w: after.page.w, target, margin: before.page.margin });
    ok(near(after.page.w - after.content.right, after.page.margin, 1),
       'so the gap beyond the outermost item is exactly the margin');
    await page.keyboard.press(`${MOD}+z`); await page.waitForTimeout(200);
}
before = await state();
{
    const targetS = before.content.x - before.page.margin;   // the left edge lands at content.x - margin
    await drag('w', targetS * before.zoom - 3, 0);
    after = await state();
    ok(near(after.content.x, after.page.margin, 1),
       'the left edge snaps too: the leftmost item then sits exactly one margin in',
       { contentX: after.content.x, margin: after.page.margin });
    await page.keyboard.press(`${MOD}+z`); await page.waitForTimeout(200);
}

// ---- 7. Escape mid-drag puts everything back, no history ----
before = await state();
await drag('e', -150, 0, { hold: true });
{
    const live = await state();
    ok(live.page.w < before.page.w, 'mid-drag the page is already narrower (the preview is live)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const esc = await state();
    ok(esc.page.w === before.page.w && esc.page.h === before.page.h && sameItems(before.items, esc.items),
       'Escape restores the page and the items', { before: before.page, after: esc.page });
    ok(esc.depth === before.depth, 'a cancelled drag leaves no history entry');
    await page.mouse.move(400, 400);
    await page.mouse.move(300, 420);
    const moved = await state();
    ok(moved.page.w === before.page.w, 'after Escape the pointer no longer drives the page');
    await page.mouse.up();
    await page.waitForTimeout(100);
    ok((await state()).depth === before.depth, 'the stale release lands nothing');
}

// ---- 8. a press that never travels is not a resize ----
{
    const id = s0.items[0].id;
    await page.evaluate(i => window.PS_SHELL.selectLayoutItems([i]), id);
    await page.waitForTimeout(60);
    const pre = await state();
    const g = await grip('s');
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(150);
    const post = await state();
    ok(post.page.w === pre.page.w && post.page.h === pre.page.h && post.depth === pre.depth,
       'a click on a grip changes nothing and lands no history');
    ok(!post.marquee && post.selection.join() === pre.selection.join() && post.selection.indexOf(id) !== -1,
       'the click starts no marquee and keeps the selection');
}

// ---- 9. growth, and the page maximum ----
before = await state();
await drag('e', 200, 0);
after = await state();
ok(near(after.page.w, before.page.w + Math.round(200 / before.zoom), 1),
   'dragging the right edge outward grows the page', { before: before.page, after: after.page });
ok(sameItems(before.items, after.items), 'growth moves no item');
let growDrags = 1;
for (let i = 0; i < 20 && (await state()).page.w < 4000; i++) { await drag('e', 0, 0, { toX: 1495 }); growDrags++; }
after = await state();
ok(after.page.w === 4000, 'the right edge stops at the 4000 px page maximum', after.page);
for (let i = 0; i < 20 && (await state()).page.h < 4000; i++) { await drag('s', 0, 0, { toY: 955 }); growDrags++; }
after = await state();
ok(after.page.h === 4000, 'the bottom edge stops at the maximum too', after.page);
for (let i = 0; i < growDrags; i++) { await page.keyboard.press(`${MOD}+z`); await page.waitForTimeout(150); }
after = await state();
ok(after.page.w === before.page.w && after.page.h === before.page.h && sameItems(before.items, after.items),
   'undoing each growth drag takes the page back to where it started');
before = await state();
await drag('n', 0, -150);
after = await state();
ok(near(after.page.h, before.page.h + Math.round(150 / before.zoom), 1) &&
   shifted(before.items, after.items, 0, after.page.h - before.page.h),
   'dragging the top edge upward grows the page and re-bases the items downward by the growth',
   { before: before.page, after: after.page });
// Left in place on purpose: an undo here would leave a redo entry, and the
// next case counts history depth (undo + redo), which a fresh snapshot
// would then leave unchanged by clearing the redo as it pushes.

// ---- 10. Fit page to content ----
before = await state();
await page.click('#ps-lpage-fit');
await page.waitForTimeout(350);
after = await state();
{
    const m = before.page.margin;
    ok(near(after.page.w, Math.round(before.content.w + 2 * m), 1) &&
       near(after.page.h, Math.round(before.content.h + 2 * m), 1),
       'Fit page to content trims the page to the items plus the margin on every side',
       { before: before.page, content: before.content, after: after.page });
    ok(near(after.content.x, m, 1) && near(after.content.y, m, 1),
       'the content sits one margin in from the top-left', after.content);
    ok(after.items.every((it, i) => near(it.x - after.items[0].x, before.items[i].x - before.items[0].x, 0.01) &&
                                     near(it.y - after.items[0].y, before.items[i].y - before.items[0].y, 0.01)) &&
       sameItems(before.items.map(i => ({ ...i, x: 0, y: 0 })), after.items.map(i => ({ ...i, x: 0, y: 0 }))),
       'items keep their sizes and their arrangement');
    ok(after.depth === before.depth + 1 && after.page.preset === 'custom', 'the fit is one history step and reads Custom');
    const svg = (await page.evaluate(async () => (await window.PS_SHELL.exportSource('shown')).svg));
    const w = /\bwidth="([\d.]+)"/.exec(svg), h = /\bheight="([\d.]+)"/.exec(svg);
    ok(w && h && Number(w[1]) === after.page.w && Number(h[1]) === after.page.h,
       'the export follows the trimmed page, so the figure ships with no white band',
       { svgW: w && w[1], svgH: h && h[1], page: after.page });
    const depth = after.depth;
    await page.click('#ps-lpage-fit');
    await page.waitForTimeout(250);
    const again = await state();
    ok(again.depth === depth && again.page.w === after.page.w && again.page.h === after.page.h,
       'a second Fit is a no-op with no history entry');
    ok(/already fits/.test(again.toast), 'and it says so', again.toast);
    await page.keyboard.press(`${MOD}+z`); await page.waitForTimeout(250);
    const undone = await state();
    ok(undone.page.w === before.page.w && undone.page.h === before.page.h && sameItems(before.items, undone.items),
       'Undo takes the fit back, page and items together');
}

// ---- 11. an empty page: the minimum size, and nothing to fit to ----
{
    await page.evaluate(() => {
        const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
        window.PS_SHELL.selectLayoutItems(l.items.map(i => i.id));
    });
    await page.waitForTimeout(60);
    await page.click('#ps-lviewport', { position: { x: 4, y: 4 } });
    await page.evaluate(() => {
        const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
        window.PS_SHELL.selectLayoutItems(l.items.map(i => i.id));
    });
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    const empty = await state();
    ok(empty.items.length === 0, 'setup: the page is empty');
    await drag('e', -5000, 0);
    await drag('s', 0, -5000);
    after = await state();
    ok(after.page.w === 320 && after.page.h === 240,
       'with nothing on the page the edges stop at the 320 by 240 minimum', after.page);
    const d0 = after.depth;
    await page.click('#ps-lpage-fit');
    await page.waitForTimeout(200);
    after = await state();
    ok(after.depth === d0 && after.page.w === 320 && /nothing on the page|fits to what is on it/i.test(after.toast),
       'Fit on an empty page changes nothing and says why', after.toast);
}

ok(errors.length === 0, 'no page errors', errors);
await browser.close();
console.log(`layout-page-edges: PASS (${passed} checks)`);
