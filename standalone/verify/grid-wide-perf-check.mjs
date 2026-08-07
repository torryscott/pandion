// The 40-column grid, measured rather than felt.
//
// gridApplySelection used to make two full passes over every rendered td on
// EVERY selection change. Pass one unconditionally stripped six classes plus a
// seventh plus an attribute from every cell in the 140-row window, touched or
// not. Pass two re-read two attributes per cell and ran an indexOf over the
// column list once per cell. At 40 columns that is 5,600 cells, and
// gridSetSelection calls the painter twice for a plain cursor move, so ONE
// ArrowDown cost 78,702 DOM mutations to move a highlight by one cell. The row
// axis was innocent. 2,000 rows and 20,000 rows measured identically, to the
// digit, because the window is the same 140 rows either way. Drag-select had a
// second cost on top, repainting the whole block on every pointermove even
// when the pointer had not left the cell it was already in.
//
// So this probe measures. It builds a 40-column fixture, drives real key and
// pointer input, and counts with a MutationObserver. The mutation counts are
// deterministic, so they carry the assertions; the millisecond figures are
// printed for the record and held only against ceilings far above what this
// machine needs, so a slow box reports rather than fails.
//
// Measured on this machine, 20,000 rows x 40 columns, medians, before to
// after, both from this same harness.
//
//   ArrowDown                  32.7 ms -> 4.4 ms     78,702 mutations -> 10
//   drag-select, per move      24.3 ms -> 7.5 ms     39,791 mutations -> 505
//   12 moves inside one cell                        485,760 mutations -> 0
//   Enter to commit an edit      471 ms -> 434 ms    (a full grid re-render,
//                                                     which nothing here touches)
//
// The correctness half matters as much as the speed. Clearing only the cells
// last painted is only safe if the bookkeeping is exact, so the cases below
// shrink a selection, dissolve one, swap between kinds, and check that not one
// stale highlight is left behind.
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
function note(msg) { console.log('  --  ' + msg); }

await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);

const ROWS = Number(process.env.PS_PERF_ROWS || 20000);
const COLS = 40;

// The fixture. Forty numeric columns is the shape that made the grid
// unusable; the row count is the one the original measurement used.
await page.evaluate(async ([nRows, nCols]) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const header = [];
    for (let c = 0; c < nCols; c++)
        header.push('c' + String(c + 1).padStart(2, '0'));
    const rows = [];
    for (let i = 0; i < nRows; i++) {
        const row = [];
        for (let c = 0; c < nCols; c++) row.push(String((i * 7 + c) % 101));
        rows.push(row);
    }
    window.PS_SHELL.loadTable('wide', header, rows);
    await sleep(1500);
    window.PS_SHELL.setWorkspace('data');
    await sleep(400);
}, [ROWS, COLS]);
await page.waitForTimeout(800);

const shape = await page.evaluate(() => ({
    cols: window.PS_SHELL.visibleColumns().length,
    tds: document.querySelectorAll('#ps-datagrid td[data-gc]').length
}));
ok(shape.cols === COLS, `the fixture has ${COLS} visible columns`);
ok(shape.tds > 3000,
   `and the window renders ${shape.tds} cells, the load the painter carries`);
note(`fixture: ${ROWS} rows x ${COLS} columns, ${shape.tds} rendered cells`);

// A MutationObserver over the whole grid, armed and read from the page.
await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    window.__psMut = 0;
    window.__psMutLast = 0;
    window.__psObs = new MutationObserver(recs => {
        window.__psMut += recs.length;
        window.__psMutLast = performance.now();
    });
    window.__psObs.observe(grid, { subtree: true, childList: true,
        attributes: true, characterData: true });
    window.__psMutReset = () => {
        window.__psObs.takeRecords();
        window.__psMut = 0;
        window.__psMutLast = performance.now();
    };
    window.__psMutRead = () => {
        window.__psMut += window.__psObs.takeRecords().length;
        return window.__psMut;
    };
});

function median(xs) {
    const s = xs.slice().sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2]
        : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// Time the gesture INSIDE the page, not across the driver. A capture-phase
// listener stamps the start, a bubble-phase one runs after the app's own
// handler, and a frame callback reads the clock once a forced reflow has
// made the browser pay for the style and layout the paint just dirtied. A
// driver round trip measures the driver; this measures the app. The
// listeners are installed after boot so the app's handlers, registered
// first, always run before the closing stamp.
async function armTiming(page, type) {
    await page.evaluate(kind => {
        window.__psMs = window.__psMs || {};
        window.__psMs[kind] = [];
        window.__psArmed = window.__psArmed || {};
        if (window.__psArmed[kind]) return;   // one pair of listeners, ever
        window.__psArmed[kind] = true;
        document.addEventListener(kind, () => {
            window.__psT0 = performance.now();
        }, true);
        document.addEventListener(kind, () => {
            const t0 = window.__psT0;
            requestAnimationFrame(() => {
                document.body.offsetHeight;   // pay for style and layout now
                window.__psMs[kind].push(performance.now() - t0);
            });
        }, false);
    }, type);
}
const readTiming = (page, type) =>
    page.evaluate(kind => window.__psMs[kind].slice(), type);

// Seat a cursor the way a user does, with one click on a real cell.
const first = await page.evaluate(() => {
    const cells = document.querySelectorAll('#ps-datagrid td[data-gc]');
    const r = cells[0].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(first.x, first.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(300);
ok(await page.evaluate(() => !!window.PS_SHELL.gridSelection()),
   'a click seats a cursor in the wide grid');

// ---- 1. ArrowDown, the primary navigation gesture ----------------------
await armTiming(page, 'keydown');
for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);   // one press at a time, never a queue
}
const pressMs = await readTiming(page, 'keydown');
const arrowMs = median(pressMs);
note(`ArrowDown: ${arrowMs.toFixed(1)} ms median over ${pressMs.length} presses ` +
     `(min ${Math.min(...pressMs).toFixed(1)}, max ${Math.max(...pressMs).toFixed(1)})`);

await page.evaluate(() => window.__psMutReset());
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(120);
const arrowMut = await page.evaluate(() => window.__psMutRead());
note(`ArrowDown: ${arrowMut} DOM mutations`);
// The disarmed painter costs 78,704 here. A cursor move touches one cell
// leaving and one cell arriving, so anything in the thousands means the
// unconditional scrub is back.
ok(arrowMut < 1500,
   `one ArrowDown costs ${arrowMut} DOM mutations, not tens of thousands`);
// The millisecond ceilings are deliberately loose. The mutation counts are
// deterministic and carry the claim; these catch a catastrophe without
// failing on a busy box, the house rule perf-check already follows.
ok(arrowMs < 150,
   `and lands in ${arrowMs.toFixed(1)} ms, inside the 150 ms ceiling`);

// ---- 2. Drag-select, the gesture that was a second behind the pointer ---
// The far corner must sit well inside the grid box. Within 24px of an edge
// the drag arms its Excel-style auto-scroll, which re-renders the whole
// window every frame and would drown out what this case is measuring.
const dragGeom = await page.evaluate(() => {
    const box = document.getElementById('ps-datagrid').getBoundingClientRect();
    const cells = document.querySelectorAll('#ps-datagrid td[data-gc]');
    const a = cells[0].getBoundingClientRect();
    let far = null;
    for (const c of cells) {
        const r = c.getBoundingClientRect();
        if (r.x > a.x + 120 && r.y > a.y + 120 &&
            r.right < box.right - 90 && r.bottom < box.bottom - 90) far = r;
    }
    const b = far || cells[cells.length - 1].getBoundingClientRect();
    return { x0: a.x + a.width / 2, y0: a.y + a.height / 2,
             x1: b.x + b.width / 2, y1: b.y + b.height / 2 };
});
await page.mouse.move(dragGeom.x0, dragGeom.y0);
await page.mouse.down();
await page.waitForTimeout(80);
await armTiming(page, 'pointermove');
await page.evaluate(() => window.__psMutReset());
const STEPS = 10;
for (let s = 1; s <= STEPS; s++) {
    const x = dragGeom.x0 + (dragGeom.x1 - dragGeom.x0) * s / STEPS;
    const y = dragGeom.y0 + (dragGeom.y1 - dragGeom.y0) * s / STEPS;
    await page.mouse.move(x, y);
    await page.waitForTimeout(200);
}
const dragMut = await page.evaluate(() => window.__psMutRead());
const moveMs = await readTiming(page, 'pointermove');

// Still mid-drag. A pointer wandering INSIDE one cell changes nothing, and a
// painter that repaints anyway is doing the most expensive work in the app
// for no reason. Twelve small moves that never leave the cell must cost
// nothing at all.
await page.evaluate(() => window.__psMutReset());
for (let s = 0; s < 12; s++)
    await page.mouse.move(dragGeom.x1 + (s % 3) - 1, dragGeom.y1 + (s % 2));
await page.waitForTimeout(150);
const idleMut = await page.evaluate(() => window.__psMutRead());
ok(idleMut === 0,
   `twelve pointer moves inside one cell repaint nothing (${idleMut} mutations)`);

await page.mouse.up();
await page.waitForTimeout(250);
const dragMs = median(moveMs);
const perMove = Math.round(dragMut / STEPS);
note(`drag-select: ${dragMs.toFixed(1)} ms median per pointer move, ` +
     `${perMove} DOM mutations per move`);
ok(perMove < 4000,
   `a drag-select pointer move costs ${perMove} DOM mutations, ` +
   `not one full scrub of the window per pixel`);
ok(dragMs < 250,
   `and the highlight keeps up at ${dragMs.toFixed(1)} ms per move`);

const dragSel = await page.evaluate(() => {
    const on = Array.from(document.querySelectorAll(
        '#ps-datagrid td.ps-grid-selected'));
    const rows = new Set(on.map(n => n.getAttribute('data-gr')));
    const cols = new Set(on.map(n => n.getAttribute('data-gc')));
    return { rows: rows.size, cols: cols.size, painted: on.length };
});
ok(dragSel.rows > 1 && dragSel.cols > 1,
   `the drag really selected a block (${dragSel.rows} x ${dragSel.cols})`);
note(`drag block: ${dragSel.rows} rows x ${dragSel.cols} columns, ` +
     `${dragSel.painted} cells painted`);

// ---- 3. Enter to commit an edit ----------------------------------------
await page.evaluate(() => {
    const c = window.PS_SHELL.visibleColumns();
    window.PS_SHELL.setGridSelection(c[0], 3, c[0], 3, 'cells');
});
await page.waitForTimeout(250);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.keyboard.type('77');
// The editor stops Enter from propagating, so the listener pair cannot see
// this one. Measure instead how long the grid keeps changing after the press.
// Mutation counts say nothing useful here, because replacing the table's
// innerHTML is a single record however many cells it rebuilds.
await page.evaluate(() => window.__psMutReset());
const commitT0 = Date.now();
await page.keyboard.press('Enter');
const QUIET = 200;
await page.waitForFunction(
    q => window.__psMut > 0 && performance.now() - window.__psMutLast > q,
    QUIET, { timeout: 20000 });
const commitMs = Date.now() - commitT0 - QUIET;
await page.waitForTimeout(400);
note(`Enter to commit a cell edit: about ${commitMs} ms until the grid stops ` +
     `changing (a full re-render, a path this change does not touch)`);

// ---- 4. Correctness. Tracked clearing must leave nothing behind. --------
// A shrinking selection is the case that breaks a painter which only clears
// what it remembers, so shrink hard and count.
async function painted() {
    return page.evaluate(() => ({
        sel: document.querySelectorAll('#ps-datagrid td.ps-grid-selected').length,
        aria: document.querySelectorAll(
            '#ps-datagrid td[aria-selected="true"]').length,
        top: document.querySelectorAll('#ps-datagrid td.ps-grid-sel-top').length,
        bottom: document.querySelectorAll(
            '#ps-datagrid td.ps-grid-sel-bottom').length,
        left: document.querySelectorAll('#ps-datagrid td.ps-grid-sel-left').length,
        right: document.querySelectorAll(
            '#ps-datagrid td.ps-grid-sel-right').length,
        focus: document.querySelectorAll(
            '#ps-datagrid td.ps-grid-sel-focus').length,
        axis: document.querySelectorAll(
            '#ps-datagrid .ps-grid-axis-selected').length,
        linked: document.querySelectorAll('#ps-datagrid td.ps-grid-linked').length
    }));
}
async function select(c0, r0, c1, r1, kind) {
    await page.evaluate(([a, b, c, d, k]) => {
        const cols = window.PS_SHELL.visibleColumns();
        window.PS_SHELL.setGridSelection(cols[a], b, cols[c], d, k);
    }, [c0, r0, c1, r1, kind]);
    await page.waitForTimeout(160);
}

await select(2, 2, 21, 11, 'cells');
let p = await painted();
ok(p.sel === 20 * 10 && p.aria === p.sel,
   `a 10 x 20 block paints exactly ${p.sel} cells and marks each aria-selected`);
ok(p.top === 20 && p.bottom === 20 && p.left === 10 && p.right === 10,
   'and draws one edge run per side');

await select(5, 4, 6, 5, 'cells');
p = await painted();
ok(p.sel === 4 && p.aria === 4,
   `shrinking to a 2 x 2 leaves exactly 4 painted cells (${p.sel} found)`);
ok(p.top === 2 && p.bottom === 2 && p.left === 2 && p.right === 2 &&
   p.focus === 1,
   'and exactly one edge run per side with a single focus ring');

// Whole-column selection lights its header, and switching kinds does not
// leave the old head lit.
await select(3, 0, 3, ROWS - 1, 'column');
p = await painted();
ok(p.axis === 1, `a column selection lights exactly one header (${p.axis})`);
await select(9, 0, 9, ROWS - 1, 'column');
p = await painted();
ok(p.axis === 1, 'and moving to another column leaves only the new one lit');
await select(4, 4, 4, 4, 'cells');
p = await painted();
ok(p.axis === 0, 'and dropping back to a cell clears the header entirely');
ok(p.sel === 1 && p.focus === 1,
   'with a single painted cell carrying the focus ring');

// Escape, from a real click so the grid actually owns the keyboard.
await page.mouse.move(first.x, first.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(250);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
p = await painted();
ok(p.sel === 0 && p.aria === 0 && p.focus === 0 && p.axis === 0,
   'Escape clears every painted cell and every axis head');
ok(await page.evaluate(() => !document.getElementById('ps-datagrid')
        .hasAttribute('aria-activedescendant')),
   'and drops aria-activedescendant with it');

// The discontiguous Cmd/Ctrl+click column set still paints both bands, each
// with its own left and right edge.
await page.evaluate(() => {
    const cols = window.PS_SHELL.visibleColumns();
    window.PS_SHELL.setGridSelection(cols[1], 0, cols[1], 5, 'column');
    window.PS_SHELL.toggleColumnSelection(cols[7]);
});
await page.waitForTimeout(200);
const disc = await page.evaluate(() => ({
    set: window.PS_SHELL.selectedColumns(),
    names: Array.from(new Set(Array.from(document.querySelectorAll(
        '#ps-datagrid td.ps-grid-selected')).map(n => n.getAttribute('data-gc')))),
    left: document.querySelectorAll('#ps-datagrid td.ps-grid-sel-left').length,
    right: document.querySelectorAll('#ps-datagrid td.ps-grid-sel-right').length,
    sel: document.querySelectorAll('#ps-datagrid td.ps-grid-selected').length,
    axis: document.querySelectorAll('#ps-datagrid th.ps-grid-axis-selected').length
}));
ok(disc.set.length === 2 && disc.names.length === 2,
   `the discontiguous set paints exactly its two columns (${disc.names})`);
ok(disc.left === disc.sel && disc.right === disc.sel,
   'each band carries its own left and right edge');
ok(disc.axis === 2, 'and both headers are lit');

// Dissolving the set back to a single cell leaves nothing of it behind.
await select(0, 0, 0, 0, 'cells');
p = await painted();
ok(p.sel === 1 && p.axis === 0 && p.left === 1 && p.right === 1,
   'dissolving the set repaints down to one cell with no stale band');

// ---- 5. The control, ordinary data untouched ---------------------------
// A five-column table is the shape that was always fast. The change must not
// alter what it paints, only what it costs.
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 400; i++)
        rows.push(['g' + (i % 3), String(i % 40), String(i % 7),
                   's' + (i % 5), 'n' + i]);
    window.PS_SHELL.loadTable('narrow', ['grp', 'score', 'hours', 'site', 'note'],
                              rows);
    await sleep(600);
    window.PS_SHELL.setWorkspace('data');
    await sleep(300);
});
await page.waitForTimeout(500);
await select(0, 0, 3, 9, 'cells');
p = await painted();
ok(p.sel === 40 && p.aria === 40,
   `the narrow control still paints its full 10 x 4 block (${p.sel} cells)`);
ok(p.top === 4 && p.bottom === 4 && p.left === 10 && p.right === 10 &&
   p.focus === 1,
   'with the same edges and focus ring it always had');

const stats = await page.evaluate(() =>
    (document.getElementById('ps-grid-stats') || {}).textContent || '');
ok(/Count\s*40/.test(stats.replace(/\s+/g, ' ')),
   `the stats strip still reads the block ("${stats.replace(/\s+/g, ' ').trim()}")`);

ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
console.log('grid-wide-perf-check: PASS');
await browser.close();
