// Punch list t3-46 and t3-58b: the clipboard the app already had, and the
// headers it left off.
//
//   t3-46  Edit had Undo/Redo, Copy as image, the document commands, Reset and
//          Preferences: no Cut, Copy, Paste, Select all or Find - while the
//          grid implemented TSV copy and delimiter-sniffing matrix paste
//          underneath. Worse, commandEnabled disabled the menu's ONLY clipboard
//          entry whenever the workspace was Data, so the one place a clipboard
//          genuinely worked was the one place the menu said it did not.
//   t3-58b grid copy emitted headerless TSV even when the selection spanned
//          whole columns, which is the exact case where the header is wanted.
//          GRID_SELECTION_KIND already knew which case it was.
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
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(700);

console.log('case 1: whole columns carry their names (t3-58b)');
const tsv = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setGridSelection('score', 0, 'score', 2, 'column');
    await sleep(300);
    const column = window.PS_SHELL.gridSelectionTextForTest();
    window.PS_SHELL.setGridSelection('score', 0, 'score', 2, 'cells');
    await sleep(300);
    const cells = window.PS_SHELL.gridSelectionTextForTest();
    window.PS_SHELL.setGridSelection('condition', 0, 'score', 1, 'all');
    await sleep(300);
    const all = window.PS_SHELL.gridSelectionTextForTest();
    return { column, cells, all };
});
ok(tsv.column.split('\n')[0] === 'score',
   `a whole-column copy leads with the variable name ` +
   `(${JSON.stringify(tsv.column.split('\n')[0])})`);
ok(tsv.all.split('\n')[0] === 'condition\tscore',
   `so does select-all (${JSON.stringify(tsv.all.split('\n')[0])})`);
ok(tsv.cells.split('\n')[0] === '61',
   `but a rectangle INSIDE the data does not, because a header row pasted ` +
   `there would land in someone's numbers (${JSON.stringify(
       tsv.cells.split('\n')[0])})`);

console.log('case 2: Edit names the clipboard that was already running');
const menu = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setGridSelection('score', 0, 'score', 2, 'cells');
    await sleep(200);
    document.querySelector('[data-ps-menu="edit"]').click();
    await sleep(300);
    const m = document.getElementById('ps-appmenu');
    const items = Array.from(m.querySelectorAll('button')).map(b => ({
        label: b.textContent, off: b.disabled }));
    document.querySelector('[data-ps-menu="edit"]').click();
    return items;
});
for (const want of ['Cut', 'Copy', 'Paste', 'Select all', 'Find in data']) {
    const hit = menu.filter(i => i.label.indexOf(want) === 0)[0];
    ok(!!hit, `Edit offers ${want}`);
    ok(hit && !hit.off,
       `and it is ENABLED in the Data workspace, where it works ` +
       `(${want}${hit && hit.off ? ' [disabled]' : ''})`);
}

console.log('case 3: the commands drive the paths the keyboard already used');
const acted = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // The browser's clipboard permission model is not what is under test; the
    // TSV parse and the matrix apply are, so readText is stubbed.
    navigator.clipboard.readText = () => Promise.resolve('61\n55\n68');
    window.PS_SHELL.setGridSelection('hours', 0, 'hours', 0, 'cells');
    await sleep(300);
    window.PS_SHELL.runCommand('paste-cells');
    await sleep(900);
    const pasted = window.PS_SHELL.project.table.raw.hours.slice(0, 3);
    window.PS_SHELL.runCommand('select-all-cells');
    await sleep(400);
    const sel = window.PS_SHELL.gridSelection();
    const t = window.PS_SHELL.project.table;
    return { pasted, kind: sel && sel.kind,
             spans: sel && sel.focusRow === t.caseIds.length - 1 };
});
ok(acted.pasted.join(',') === '61,55,68',
   `Paste parses the TSV and writes the cells (${JSON.stringify(acted.pasted)})`);
ok(acted.kind === 'all' && acted.spans,
   `Select all selects the whole table (${acted.kind})`);

// Undo covers it, because these go through the same paths the keyboard does
// rather than a second implementation.
const undone = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.dataUndo();
    await sleep(600);
    return window.PS_SHELL.project.table.raw.hours.slice(0, 3);
});
ok(undone.join(',') !== '61,55,68',
   `and one undo takes the paste back (${JSON.stringify(undone)})`);

console.log('case 4: Find opens the search the app already had');
const find = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-data-find').blur();
    window.PS_SHELL.runCommand('find-data');
    await sleep(400);
    return { focused: document.activeElement.id,
             workspace: window.PS_SHELL.workspace() };
});
ok(find.focused === 'ps-data-find' && find.workspace === 'data',
   `Find in data puts the cursor in the search box (${find.focused})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CLIPBOARD CHECK PASS');
await browser.close();
