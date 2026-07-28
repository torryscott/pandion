// Punch list item 11: the data grid has no arrow-key navigation and no Cmd+A.
//
// The grid keydown handler covered Escape and Delete only. Arrows did nothing
// with a range selected, and the only motion in the whole grid was Enter/Tab
// from INSIDE an open editor - so a student who had used any spreadsheet
// found the primary gesture dead. GRID_SELECTION already carried
// anchorCol/anchorRow/focusCol/focusRow, so the model was there and only the
// keys were missing.
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
await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(400);
}
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(600);

const sel = () => page.evaluate(() => window.PS_SHELL.gridSelection());
// Click a real cell to establish a starting point, the way a user would.
const first = await page.evaluate(() => {
    const cells = document.querySelectorAll('#ps-datagrid td[data-gc]');
    const r = cells[0].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
// Torry's decision (Jul 26 2026): a single click SELECTS. Editing is the
// deliberate second act - double-click, Enter, F2, or type. Before that, a
// click opened the editor and nothing ever left a cell merely current, which
// is the real reason arrow navigation had no way in.
async function seat(pt) {
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
}
await seat(first);
const start = await sel();
ok(start && start.focusRow === 0,
   `a single click seats a cursor, it does not open an editor ` +
   `(${JSON.stringify(start)})`);
ok(!(await page.evaluate(() =>
        !!document.querySelector('#ps-datagrid .ps-grid-cellinput'))),
   'and no editor is open after a single click');

// Editing is still reachable by mouse: double-click.
await page.mouse.click(first.x, first.y, { clickCount: 2 });
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
        !!document.querySelector('#ps-datagrid .ps-grid-cellinput')),
   'double-click opens the editor');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok((await sel()) !== null,
   'and cancelling the edit leaves the cursor where it was');

// ---- arrows move ----
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);
let s = await sel();
ok(s.focusRow === 2,
   `ArrowDown moves the focused cell (row ${s.focusRow})`);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
s = await sel();
ok(s.focusCol !== start.focusCol,
   `ArrowRight moves across columns (${start.focusCol} -> ${s.focusCol})`);
ok(s.anchorRow === s.focusRow && s.anchorCol === s.focusCol,
   'a plain arrow moves the whole selection, it does not extend it');

// ---- shift extends ----
await page.keyboard.press('Shift+ArrowDown');
await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(200);
const ext = await sel();
ok(ext.anchorRow === 2 && ext.focusRow === 4,
   `Shift+Arrow extends from the anchor (${ext.anchorRow}..${ext.focusRow})`);

// ---- the edges ----
await page.keyboard.press(`${MOD}+ArrowDown`);
await page.waitForTimeout(250);
const bottom = await sel();
const rows = await page.evaluate(() => window.PS_SHELL.project.table.caseIds.length);
ok(bottom.focusRow === rows - 1,
   `Cmd/Ctrl+Arrow jumps to the last row (${bottom.focusRow} of ${rows - 1})`);
await page.keyboard.press(`${MOD}+ArrowUp`);
await page.waitForTimeout(250);
ok((await sel()).focusRow === 0, 'and back to the first');

// ---- select all ----
await page.keyboard.press(`${MOD}+a`);
await page.waitForTimeout(250);
const all = await sel();
const cols = await page.evaluate(() =>
    window.PS_SHELL.project.table.order.length);
ok(all.focusRow === rows - 1 && all.anchorRow === 0,
   `Cmd/Ctrl+A selects every row (${all.anchorRow}..${all.focusRow} of ${rows})`);
ok(all.kind === 'all',
   `and it is a real select-all, not a range that happens to match ` +
   `(kind ${all.kind}, ${cols} columns)`);

// ---- typing over a cell starts an edit with that character ----
await seat(first);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(150);
await page.keyboard.type('7');
await page.waitForTimeout(300);
const editing = await page.evaluate(() => {
    const inp = document.querySelector('#ps-datagrid .ps-grid-cellinput');
    return inp ? { open: true, value: inp.value } : { open: false };
});
ok(editing.open && editing.value === '7',
   `typing over a selected cell opens the editor seeded with the keystroke ` +
   `(${JSON.stringify(editing)})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ---- Enter opens the editor without replacing the value ----
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const enterEdit = await page.evaluate(() => {
    const inp = document.querySelector('#ps-datagrid .ps-grid-cellinput');
    return inp ? inp.value : null;
});
ok(enterEdit !== null && enterEdit !== '',
   `Enter opens the editor on the existing value ("${enterEdit}")`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ---- navigation reaches rows outside the rendered window ----
// The grid is windowed, so a far row has no <td> until it is scrolled to.
await page.keyboard.press(`${MOD}+ArrowDown`);
await page.waitForTimeout(400);
const reached = await page.evaluate(() => {
    const s = window.PS_SHELL.gridSelection();
    const td = document.querySelector(
        '#ps-datagrid td[data-gc][data-gr="' + s.focusRow + '"]');
    return { row: s.focusRow, rendered: !!td,
             onScreen: td ? td.getBoundingClientRect().height > 0 : false };
});
ok(reached.rendered && reached.onScreen,
   `the far row is built and scrolled into view, not merely selected ` +
   `(row ${reached.row})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('GRID KEYS CHECK PASS');
await browser.close();
