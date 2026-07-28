// Torry's report, Jul 27 2026: select several columns, right-click one of
// them, Hide column - and only the right-clicked column hid. The context
// menu carried a single target (COLUMN_MENU / ROW_MENU) and ignored the
// selection entirely, on every selection-scoped command.
//
// The rule, which is the desktop convention everywhere: a right-click on a
// target INSIDE a multi-selection acts on the WHOLE selection; a
// right-click OUTSIDE it acts on the clicked target alone. Fixed for the
// four commands where scope changes the outcome: hide columns, delete
// variables, exclude rows, delete rows. Multi-target deletes are ONE undo
// step, and the floors hold (at least one visible column, at least one row).
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
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('wide',
        ['a', 'b', 'c', 'd', 'e'],
        [['1', '2', '3', '4', '5'],
         ['6', '7', '8', '9', '10'],
         ['11', '12', '13', '14', '15'],
         ['16', '17', '18', '19', '20']]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
});
const headerCount = () => page.evaluate(() =>
    document.querySelectorAll('th[data-grid-col]').length);

console.log('case 1: hide acts on the whole column selection');
ok(await headerCount() === 5, `setup: five columns rendered`);
await page.evaluate(() =>
    window.PS_SHELL.setGridSelection('b', 0, 'd', 3, 'column'));
await page.waitForTimeout(200);
// The REAL gesture: right-click the MIDDLE selected header.
await page.click('th[data-grid-col="c"]', { button: 'right' });
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       document.getElementById('ps-columnmenu').style.display !== 'none'),
   'right-click on a header opens the column menu');
await page.click('#ps-columnmenu-hide');
await page.waitForTimeout(500);
const afterHide = await page.evaluate(() => ({
    heads: Array.from(document.querySelectorAll('th[data-grid-col]'))
        .map(h => h.getAttribute('data-grid-col')),
    toast: document.getElementById('ps-toast').innerText
}));
ok(JSON.stringify(afterHide.heads) === JSON.stringify(['a', 'e']),
   `all three selected columns hide, not just the right-clicked one ` +
   `(${JSON.stringify(afterHide.heads)})`);
ok(/Hidden 3 columns/.test(afterHide.toast),
   `and the toast counts them ("${afterHide.toast.replace(/\n/g, ' ')
       .slice(0, 60)}")`);

console.log('case 2: outside the selection, only the clicked column acts');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    for (const c of ['b', 'c', 'd']) window.PS_SHELL.showColumn ?
        window.PS_SHELL.showColumn(c) : null;
    await s(200);
});
// If no exposed restore, rebuild the table for a clean slate.
if (await headerCount() !== 5) {
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.loadTable('wide2',
            ['a', 'b', 'c', 'd', 'e'],
            [['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '10']]);
        await s(900);
        window.PS_SHELL.setWorkspace('data');
        await s(400);
    });
}
ok(await headerCount() === 5, 'setup: five columns visible again');
await page.evaluate(() =>
    window.PS_SHELL.setGridSelection('a', 0, 'b', 1, 'column'));
await page.waitForTimeout(200);
await page.click('th[data-grid-col="e"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-columnmenu-hide');
await page.waitForTimeout(500);
ok(JSON.stringify(await page.evaluate(() =>
       Array.from(document.querySelectorAll('th[data-grid-col]'))
           .map(h => h.getAttribute('data-grid-col')))) ===
   JSON.stringify(['a', 'b', 'c', 'd']),
   'a right-click OUTSIDE the selection hides only the clicked column');

console.log('case 3: multi-delete is the whole selection and ONE undo step');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('del',
        ['p', 'q', 'r', 's'],
        [['1', '2', '3', '4'], ['5', '6', '7', '8']]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    window.PS_SHELL.setGridSelection('q', 0, 'r', 1, 'column');
});
await page.waitForTimeout(200);
await page.click('th[data-grid-col="q"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-columnmenu-delete');
await page.waitForTimeout(700);
const afterDel = await page.evaluate(() => ({
    order: JSON.stringify(window.PS_SHELL.project.table.order),
    toast: document.getElementById('ps-toast').innerText
}));
ok(afterDel.order === JSON.stringify(['p', 's']),
   `both selected variables are deleted (${afterDel.order})`);
ok(/Deleted 2 variables/.test(afterDel.toast),
   `and the offer names the count ("${afterDel.toast.replace(/\n/g, ' ')
       .slice(0, 60)}")`);
await page.evaluate(() => window.PS_SHELL.dataUndo());
await page.waitForTimeout(700);
ok(await page.evaluate(() =>
       JSON.stringify(window.PS_SHELL.project.table.order)) ===
   JSON.stringify(['p', 'q', 'r', 's']),
   'and ONE undo restores both, because a multi-delete is one step');

console.log('case 4: row exclusion follows the row selection');
await page.evaluate(() =>
    window.PS_SHELL.setGridSelection('p', 0, 's', 1, 'row'));
await page.waitForTimeout(200);
await page.click('td.ps-grid-rownum[data-grid-row="0"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-rowmenu-toggle');
await page.waitForTimeout(600);
const excl = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return Object.keys(t.excludedRows || {}).length;
});
ok(excl === 2,
   `both selected rows take the clicked row's exclusion state (${excl})`);

console.log('case 5: row delete follows the selection, floor holds');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('rows', ['x'],
        [['1'], ['2'], ['3'], ['4'], ['5']]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    window.PS_SHELL.setGridSelection('x', 1, 'x', 3, 'row');
});
await page.waitForTimeout(200);
await page.click('td.ps-grid-rownum[data-grid-row="2"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-rowmenu-delete');
await page.waitForTimeout(700);
const rowsLeft = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.project.table.raw.x));
ok(rowsLeft === JSON.stringify(['1', '5']),
   `the three selected rows are deleted together (${rowsLeft})`);
await page.evaluate(() => window.PS_SHELL.dataUndo());
await page.waitForTimeout(700);
ok(await page.evaluate(() =>
       window.PS_SHELL.project.table.raw.x.length) === 5,
   'and one undo restores all three rows');
// The floor: selecting every row must refuse, not empty the table.
await page.evaluate(() =>
    window.PS_SHELL.setGridSelection('x', 0, 'x', 4, 'row'));
await page.waitForTimeout(200);
await page.click('td.ps-grid-rownum[data-grid-row="2"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-rowmenu-delete');
await page.waitForTimeout(600);
ok(await page.evaluate(() =>
       window.PS_SHELL.project.table.raw.x.length) === 5,
   'deleting EVERY row is refused: a dataset keeps at least one row');

console.log('case 6: Cmd/Ctrl+E toggles exclusion on the selection');
// Torry's ask, Jul 27 2026. The chord reuses the cell menu's semantics:
// exclude everything selected; press again on an all-excluded selection
// and everything comes back.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('ex', ['v', 'w'],
        [['1', '2'], ['3', '4'], ['5', '6']]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    window.PS_SHELL.setGridSelection('v', 0, 'w', 1, 'cells');
});
await page.waitForTimeout(200);
const countExcluded = () => page.evaluate(() => {
    const ex = window.PS_SHELL.project.table.excluded || {};
    let n = 0;
    for (const c of Object.keys(ex))
        for (const r of Object.keys(ex[c])) if (ex[c][r]) n++;
    return n;
});
await page.keyboard.press('Control+e');
await page.waitForTimeout(700);
ok(await countExcluded() === 4,
   'Cmd/Ctrl+E excludes every selected value (4 of 4)');
await page.keyboard.press('Control+e');
await page.waitForTimeout(700);
ok(await countExcluded() === 0,
   'a second press on the all-excluded selection includes them back');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SELECTION MENUS CHECK PASS');
await browser.close();
