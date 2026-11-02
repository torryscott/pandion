// Find matches column names too (Torry, Nov 2 2026: "it'd be really nice
// to be able to search for the names of these different variables or
// columns in the data workspace"). Before this, the Data workspace's Find
// walked the cells only, and nothing in the app could locate a column by
// name while the grid was on screen.
//
// The contracts:
//   1. a column name that contains the query is a match, counted in the
//      "n of N" readout ahead of the cells (table order, the way the grid
//      reads), and the readout says "column name" while one is current,
//   2. stepping onto a name selects the WHOLE column (the header-click
//      selection, kind "column"), scrolling the grid sideways to it when
//      it is outside the built column window; stepping past the names
//      lands on cells exactly as before,
//   3. Replace changes cells only: Replace on a name says so and touches
//      nothing, All skips the names and reports the cells it changed, and
//      a query matching only names reports that too,
//   4. a query that matches no name behaves byte-for-byte as it did.
// Every expected count is recomputed here from the raw table, never read
// back from the feature under test.
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
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1200);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);

// Independent expectation: names and cells that contain q, in the order
// the feature promises (names first, then cells row by row).
const expected = q => page.evaluate(q => {
    const t = window.PS_SHELL.project.table, needle = q.toLowerCase();
    const names = t.order.filter(c => String(c).toLowerCase().includes(needle));
    let cells = 0;
    const n = t.caseIds.length;
    for (let r = 0; r < n; r++)
        for (const c of t.order) {
            const v = t.raw[c][r];
            if (String(v == null ? '' : v).toLowerCase().includes(needle)) cells++;
        }
    return { names, cells, rows: n };
}, q);
const state = () => page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const active = grid.querySelector('th.ps-grid-col-active');
    const selTds = Array.from(grid.querySelectorAll('td.ps-grid-selected[data-gc]'));
    return {
        count: document.getElementById('ps-data-find-count').textContent,
        btn: document.getElementById('ps-data-find-btn').textContent.trim(),
        sel: window.PS_SHELL.gridSelection(),
        activeHead: active ? active.getAttribute('data-grid-col') : null,
        selCols: Array.from(new Set(selTds.map(td => td.getAttribute('data-gc')))),
        selRows: selTds.length,
        focused: document.activeElement && document.activeElement.id,
    };
});
const lastToast = () => page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item');
    return items.length ? items[items.length - 1].textContent.trim() : '';
});
const findQuery = async q => {
    await page.fill('#ps-data-find', q);
    await page.waitForTimeout(450);
};

await page.click('#ps-data-find-btn');
await page.waitForTimeout(200);

console.log('case 1: on the welcome sample, names count in the readout');
// A name every dataset here has in common is not guaranteed, so take the
// second column's own name as the query: at least that name matches.
const sampleName = await page.evaluate(() => window.PS_SHELL.project.table.order[1]);
await findQuery(sampleName);
let exp = await expected(sampleName);
let st = await state();
ok(exp.names.length >= 1, `the query "${sampleName}" matches at least its own column name`);
ok(st.count === `1 of ${exp.names.length + exp.cells} · column name`,
   `readout counts names and cells together and names the kind ("${st.count}"; ` +
   `${exp.names.length} name(s) + ${exp.cells} cell(s))`);
ok(st.btn === `Find · 1 of ${exp.names.length + exp.cells}`,
   `the command-bar button keeps the bare count ("${st.btn}")`);
ok(st.sel && st.sel.kind === 'column' && st.sel.focusCol === exp.names[0] &&
   st.sel.anchorRow === 0 && st.sel.focusRow === exp.rows - 1,
   `the first match selects the whole column ${JSON.stringify(st.sel)}`);
ok(st.activeHead === exp.names[0], `its header is the active one (${st.activeHead})`);
ok(st.selCols.length === 1 && st.selCols[0] === exp.names[0] && st.selRows > 0,
   `only that column's cells paint selected (${st.selRows} cells)`);
ok(st.focused === 'ps-data-find', 'and the cursor stays in the Find box');

console.log('case 2: a controlled table - order, stepping, and the cell fallback');
await page.evaluate(() => {
    window.PS_SHELL.loadTable('findcols',
        ['id', 'dose', 'site', 'score', 'site_note'],
        [['1', 'low', 'West', '3', 'West wing'],
         ['2', 'high', 'East', '5', 'site ok'],
         ['3', 'low', 'West', '4', '']]);
});
await page.waitForTimeout(900);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);
if (!await page.evaluate(() => document.getElementById('ps-findpop').style.display === 'block')) {
    await page.click('#ps-data-find-btn');
    await page.waitForTimeout(200);
}
await findQuery('site');
exp = await expected('site');
ok(exp.names.join(',') === 'site,site_note' && exp.cells === 1,
   'the fixture has two name matches and one cell match for "site"');
st = await state();
ok(st.count === '1 of 3 · column name' && st.sel.kind === 'column' &&
   st.sel.focusCol === 'site',
   `first match is the column "site" ("${st.count}")`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
st = await state();
ok(st.count === '2 of 3 · column name' && st.sel.kind === 'column' &&
   st.sel.focusCol === 'site_note',
   `Enter steps to the next name, "site_note" ("${st.count}")`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
st = await state();
ok(st.count === '3 of 3' && st.sel.kind === 'cells' &&
   st.sel.focusCol === 'site_note' && st.sel.focusRow === 1 && st.selRows === 1,
   `past the names, the step lands on the one cell, with no suffix ("${st.count}")`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
st = await state();
ok(st.count === '1 of 3 · column name' && st.sel.kind === 'column',
   'and wraps back to the first name');
await page.keyboard.press('Shift+Enter');
await page.waitForTimeout(300);
st = await state();
ok(st.count === '3 of 3' && st.sel.kind === 'cells', 'Shift+Enter walks backwards across the seam');

console.log('case 3: Replace is cell-only');
await findQuery('site');                      // back on the name "site"
await page.click('#ps-data-replace-toggle');
await page.waitForTimeout(150);
// The replacement must not contain the needle, or the changed cell
// still matches and the re-count below cannot drop it.
await page.fill('#ps-data-replace', 'place');
await page.evaluate(() => { const w = document.getElementById('ps-data-replace-whole'); if (w.checked) w.click(); });
await page.click('#ps-data-replace-one');
await page.waitForTimeout(400);
let toast = await lastToast();
let names = await page.evaluate(() => window.PS_SHELL.project.table.order.join(','));
ok(/column name/.test(toast) && names === 'id,dose,site,score,site_note',
   `Replace on a name says so and renames nothing ("${toast}")`);
await page.click('#ps-data-replace-all');
await page.waitForTimeout(500);
toast = await lastToast();
const after = await page.evaluate(() => ({
    names: window.PS_SHELL.project.table.order.join(','),
    note1: window.PS_SHELL.project.table.raw.site_note[1],
}));
ok(/^Replaced 1 value in 1 column/.test(toast) && after.names === 'id,dose,site,score,site_note' &&
   after.note1 === 'place ok',
   `All changes the one cell and skips both names ("${toast}", cell now "${after.note1}")`);
st = await state();
ok(st.count === '1 of 2 · column name', `the readout re-counts to the two names ("${st.count}")`);
await page.evaluate(() => window.PS_SHELL.dataUndo());
await page.waitForTimeout(400);
ok(await page.evaluate(() => window.PS_SHELL.project.table.raw.site_note[1]) === 'site ok',
   'undo puts the cell back');
await findQuery('dose');
await page.click('#ps-data-replace-all');
await page.waitForTimeout(400);
toast = await lastToast();
ok(/Only column names match/.test(toast),
   `All with nothing but names says so ("${toast}")`);
await page.evaluate(() => { const w = document.getElementById('ps-data-replace-whole'); if (!w.checked) w.click(); });

console.log('case 4: a query with no name match behaves as before');
await findQuery('West');
exp = await expected('West');
st = await state();
ok(exp.names.length === 0 && exp.cells === 3, 'fixture: "West" is in three cells and no name');
ok(st.count === '1 of 3' && st.sel.kind === 'cells' && st.sel.focusCol === 'site' &&
   st.sel.focusRow === 0 && st.selRows === 1,
   `cells only: plain count, single-cell selection ("${st.count}", ${JSON.stringify(st.sel)})`);

console.log('case 5: a wide table - the name is built and scrolled into view');
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const header = [];
    for (let c = 0; c < 80; c++) header.push('c' + String(c + 1).padStart(3, '0'));
    const body = [];
    for (let i = 0; i < 30; i++) {
        const row = [];
        for (let c = 0; c < 80; c++) row.push(String((i * 7 + c) % 101));
        body.push(row);
    }
    window.PS_SHELL.loadTable('wide', header, body);
    await sleep(900);
    window.PS_SHELL.setWorkspace('data');
    await sleep(500);
});
await page.waitForTimeout(500);
if (!await page.evaluate(() => document.getElementById('ps-findpop').style.display === 'block')) {
    await page.click('#ps-data-find-btn');
    await page.waitForTimeout(200);
}
// The column window keeps every HEADER and builds only the body cells
// near the viewport (grid-column-window-check), so the premise to pin is
// that c070's cells do not exist yet, not its header.
const bodyCells = name => page.evaluate(name => Array.from(
    document.querySelectorAll('#ps-datagrid td[data-gc]'))
    .filter(td => td.getAttribute('data-gc') === name)
    .map(td => td.classList.contains('ps-grid-selected')), name);
const before = await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const row = Array.from(grid.querySelectorAll('tbody tr'))
        .find(tr => tr.querySelector('td[data-gc]'));
    return { rowCells: row ? row.querySelectorAll('td[data-gc]').length : 0,
             scrollLeft: grid.scrollLeft };
});
ok(before.rowCells > 0 && before.rowCells < 80 && (await bodyCells('c070')).length === 0 &&
   before.scrollLeft === 0,
   `the column window leaves c070's cells unbuilt at rest (${before.rowCells} of 80 cells per row)`);
await findQuery('c07');
exp = await expected('c07');
ok(exp.names.length === 10 && exp.cells === 0, 'fixture: "c07" names ten columns and no cell');
const inView = name => page.evaluate(name => {
    const grid = document.getElementById('ps-datagrid');
    const th = Array.from(grid.querySelectorAll('th[data-grid-col]'))
        .find(x => x.getAttribute('data-grid-col') === name);
    if (!th) return { built: false };
    const r = th.getBoundingClientRect(), g = grid.getBoundingClientRect();
    const gutter = grid.querySelector('.ps-grid-rownum');
    const left = g.left + (gutter ? gutter.getBoundingClientRect().width : 0);
    return { built: true, inView: r.left >= left - 1 && r.right <= g.right + 1,
             scrollLeft: grid.scrollLeft, selKind: window.PS_SHELL.gridSelection().kind,
             focusCol: window.PS_SHELL.gridSelection().focusCol };
}, name);
let v = await inView('c070');
st = await state();
ok(st.count === '1 of 10 · column name', `readout ("${st.count}")`);
ok(v.built && v.inView && v.scrollLeft > 0 && v.selKind === 'column' && v.focusCol === 'c070',
   `c070 is on screen and selected as a column ${JSON.stringify(v)}`);
const c070 = await bodyCells('c070');
ok(c070.length > 0 && c070.every(Boolean),
   `and its cells are built and painted selected (${c070.length} cells)`);
await page.keyboard.press('Shift+Enter');
await page.waitForTimeout(400);
v = await inView('c079');
ok(v.built && v.inView && v.focusCol === 'c079',
   `Shift+Enter wraps to c079, also brought into view ${JSON.stringify(v)}`);
await page.evaluate(() => window.PS_SHELL.dataUndo());

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FIND COLUMNS CHECK PASS');
await browser.close();
