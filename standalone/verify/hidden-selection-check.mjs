// A hidden column was inside every range operation and outside every pixel of
// the highlight.
//
// gridSelectionRect indexed t.order, the FULL column list, while the grid
// renders gridVisibleColumns. Hide C, click B2, shift-click E2, and the app
// paints three cells, says "1 row x 4 columns, 4 cells selected", and then
// acts on four. Measured on a table whose every cell is self-identifying:
//
//   Cmd+C                  three cells lit, clipboard "B2 C2 D2 E2"
//   Fill with focused      three cells change, C2 overwritten
//   Clear / Delete         three cells blank, C2 destroyed
//   Paste four values      one vanishes into C, the other three land shifted
//   Exclude                menu says 4, C2 excluded from every statistic
//
// All of it silent, in a column that is by definition not on screen. Undo does
// reverse it, but undo only helps someone who knows something went wrong.
//
// The rule this pins is the one the codebase already chose for discontiguous
// column selections: under-select rather than span a gap. B to E across a
// hidden C is three columns, and what you see is what is acted on.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);

// Six columns, every cell self-identifying, so a stray write names itself.
async function fixture(hide) {
    await page.evaluate(h => {
        const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
        const rows = [];
        for (let r = 1; r <= 6; r++) rows.push(cols.map(c => c + r));
        window.PS_SHELL.loadTable('tiny', cols, rows);
        window.PS_SHELL.showAllColumns();
        (h || []).forEach(c => window.PS_SHELL.hideColumn(c));
    }, hide);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(250);
}
const rowOf = c => page.evaluate(cc =>
    window.PS_SHELL.project.table.raw[cc].slice(), c);
async function selectB2toE2() {
    // (anchorCol, anchorRow, focusCol, focusRow, kind) - positional.
    await page.evaluate(() =>
        window.PS_SHELL.setGridSelection('B', 1, 'E', 1, 'cells'));
    await page.waitForTimeout(250);
}

console.log('case 1: the readout counts what is painted');
await fixture(['C']);
await selectB2toE2();
const painted = await page.evaluate(() => document.querySelectorAll(
    '#ps-datagrid td.ps-grid-selected').length);
const summary = await page.evaluate(() => {
    const n = document.getElementById('ps-grid-selection-status');
    return n ? n.textContent : '';
});
ok(painted === 3, 'three cells are painted, got ' + painted);
ok(/3 columns/.test(summary) && /3 cells/.test(summary),
   'and the readout says three, got ' + JSON.stringify(summary));

console.log('case 2: copy carries only the visible columns');
const copied = await page.evaluate(() => window.PS_SHELL.selectionText());
ok(copied.trim() === 'B2\tD2\tE2',
   'clipboard holds the visible cells only, got ' + JSON.stringify(copied));

console.log('case 3: clearing does not destroy the hidden column');
await page.evaluate(() => window.PS_SHELL.clearSelection());
await page.waitForTimeout(600);
ok((await rowOf('C'))[1] === 'C2',
   'C2 survives, got ' + JSON.stringify((await rowOf('C'))[1]));
ok((await rowOf('B'))[1] === '' && (await rowOf('E'))[1] === '',
   'and the visible cells did clear');

console.log('case 4: paste lands where it looks like it lands');
await fixture(['C']);
await selectB2toE2();
await page.evaluate(() => window.PS_SHELL.pasteMatrix([['P1', 'P2', 'P3']]));
await page.waitForTimeout(700);
const got = {};
for (const c of ['A', 'B', 'C', 'D', 'E', 'F']) got[c] = (await rowOf(c))[1];
ok(got.B === 'P1' && got.D === 'P2' && got.E === 'P3',
   'three values land in the three visible columns, got ' + JSON.stringify(got));
ok(got.C === 'C2', 'and nothing was written into the hidden one, got ' + got.C);

console.log('case 5: exclusion follows the same rule');
await fixture(['C']);
await selectB2toE2();
await page.evaluate(() => window.PS_SHELL.runCommand('data-exclude'));
await page.waitForTimeout(700);
const exc = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.project.table.excluded || {}));
// Both halves, or an exclusion that simply did not run would pass this.
ok(/"B"/.test(exc) && /"D"/.test(exc) && /"E"/.test(exc),
   'the three visible cells ARE excluded, got ' + exc);
ok(!/"C"/.test(exc),
   'and the hidden column is not, got ' + exc);

console.log('case 6: two hidden columns, and the adjacent-looking pair');
await fixture(['C', 'D']);
await selectB2toE2();
const painted2 = await page.evaluate(() => document.querySelectorAll(
    '#ps-datagrid td.ps-grid-selected').length);
const summary2 = await page.evaluate(() =>
    document.getElementById('ps-grid-selection-status').textContent);
ok(painted2 === 2, 'two cells painted, got ' + painted2);
ok(/2 columns/.test(summary2),
   'and the readout agrees, got ' + JSON.stringify(summary2));
ok((await page.evaluate(() => window.PS_SHELL.selectionText())).trim() === 'B2\tE2',
   'copy holds the two it painted');

console.log('case 6b: the header lighting and the stats strip agree with it');
// Two consumers the first pass MISSED. Both still asked t.order where a column
// sat and compared that against c0 and c1, which index the VISIBLE columns
// now, so with a column hidden the lit headers and the Count, Sum and Average
// described a different set of columns than the highlight did. The stats one
// put numbers from an invisible column into a total the user was reading.
await fixture(['C']);
await page.evaluate(() => {
    const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
    const rows = [];
    // C carries values a thousand times larger, so if it leaks into a total
    // the total says so out loud.
    for (let r = 1; r <= 6; r++)
        rows.push(cols.map(c => c === 'C' ? String(r * 1000) : String(r)));
    window.PS_SHELL.loadTable('tiny', cols, rows);
    window.PS_SHELL.showAllColumns();
    window.PS_SHELL.hideColumn('C');
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(250);
await page.evaluate(() =>
    window.PS_SHELL.setGridSelection('B', 0, 'E', 5, 'column'));
await page.waitForTimeout(400);
const lit = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-datagrid th.ps-grid-axis-selected'))
    .map(t => t.getAttribute('data-grid-col')));
ok(JSON.stringify(lit) === JSON.stringify(['B', 'D', 'E']),
   'the lit headers are the visible columns in the selection, got ' +
   JSON.stringify(lit));
const stats = await page.evaluate(() =>
    (document.getElementById('ps-grid-stats') || {}).innerText || '');
ok(/SUM\s*63\b/.test(stats.replace(/\n+/g, ' ')),
   'the total is B plus D plus E and not the hidden column, got ' +
   JSON.stringify(stats.replace(/\n+/g, ' ')));
ok(!/6000/.test(stats),
   'and no value from the hidden column reaches the strip, got ' +
   JSON.stringify(stats.replace(/\n+/g, ' ')));

console.log('case 7: with nothing hidden everything is exactly as before');
await fixture([]);
await selectB2toE2();
const painted3 = await page.evaluate(() => document.querySelectorAll(
    '#ps-datagrid td.ps-grid-selected').length);
ok(painted3 === 4, 'four cells painted, got ' + painted3);
ok((await page.evaluate(() => window.PS_SHELL.selectionText())).trim() ===
   'B2\tC2\tD2\tE2', 'and copy carries all four');

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('HIDDEN SELECTION CHECK: ALL GREEN');
await browser.close();
