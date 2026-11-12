// An untyped column takes its type from the first data that lands in it.
//
// THE BUG (found by a first-use walkthrough, Nov 2026). An instructor opened
// a blank data sheet and typed quiz scores down a column. The column stayed
// Nominal, because an empty column infers Nominal and typing never re-read
// the type. Every value slot in Chart setup then said "none eligible", with
// a message that named neither the column nor the cure. Numbers pasted into
// an empty column met the same fate.
//
// The contracts:
//   1. numbers typed down a blank column make it Continuous, and a chart
//      takes it,
//   2. text typed into an existing Continuous column still goes missing with
//      its reason (a column with other data is never re-read),
//   3. correcting the only value in a column re-reads it,
//   4. undo takes the type back with the value, and redo brings it forward,
//   5. numbers pasted into an empty column, or into a column the paste
//      creates, make it Continuous,
//   6. clearing a column's only value makes it untyped again.
// Guards that must hold before and after: text typed first stays Nominal,
// a type set by hand is never re-read, and an imported column that is
// cleared keeps its type (only a column this rule typed is re-read; text
// pasted over an imported Continuous column is void-honesty-check's case).
//
// CONTROL: PS_EXPECT_BROKEN=1 with PS_PAGE aimed at a page built before the
// change must find every numbered case red, or the probe proves nothing.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const EXPECT_BROKEN = process.env.PS_EXPECT_BROKEN === '1';
let failed = 0;
let currentCase = '';
const caseRed = {};
function ok(cond, msg) {
    if (cond) { console.log('  ok  ' + msg); return; }
    failed++;
    console.log('  FAIL ' + msg);
}
// A check the change is responsible for. Normally it must hold. Under the
// control it is only recorded: every numbered case has to show at least one
// of these failing against the pre-change page.
function key(cond, msg) {
    if (!EXPECT_BROKEN) { ok(cond, msg); return; }
    if (!cond) caseRed[currentCase] = true;
    console.log('  ' + (cond ? 'held' : 'red ') + ' ' + msg);
}
function startCase(name, title, guard) {
    currentCase = name;
    if (!guard) caseRed[name] = false;
    console.log(name + ': ' + title);
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
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
const w = ms => page.waitForTimeout(ms);

// The blank data sheet, by the route a first-time user takes.
await page.click('#ps-welcome-new');
await w(1200);
const table = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const out = { order: t.order.slice(), types: {}, cols: {}, raw: {} };
    for (const c of t.order) {
        out.types[c] = t.types[c];
        out.cols[c] = (t.columns[c] || []).slice(0, 6);
        out.raw[c] = (t.raw[c] || []).slice(0, 6);
    }
    return out;
});
// Real keys into a real cell: click it, type, Enter commits and moves down.
const typeDown = async (col, row, values) => {
    const td = page.locator(`#ps-datagrid td[data-gc="${col}"][data-gr="${row}"]`);
    await td.scrollIntoViewIfNeeded();
    const b = await td.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await w(150);
    for (const v of values) {
        await page.keyboard.type(v, { delay: 10 });
        await page.keyboard.press('Enter');
        await w(250);
    }
    // What the last commit announced, read before Escape closes the editor
    // that Enter opened on the next row (cancelling says something else).
    const said = await page.evaluate(() =>
        document.getElementById('ps-grid-edit-status').textContent);
    await page.keyboard.press('Escape');
    await w(250);
    return said;
};
const newColumn = async () => {
    const before = (await table()).order;
    await page.evaluate((after) => window.PS_SHELL.insertVariable(after, false), before[before.length - 1]);
    await w(500);
    const after = (await table()).order;
    return after.find(c => !before.includes(c));
};

ok(JSON.stringify((await table()).order) === '["A","B","C"]', 'the blank sheet opens with columns A, B and C');
ok((await table()).types.A === 'nominal', 'an empty column shows as Nominal, the type of no data');

startCase('case 1', 'numbers typed down a blank column make it Continuous');
await typeDown('A', 0, ['14', '16', '11']);
let t = await table();
key(t.types.A === 'continuous', `the column is Continuous after the first values (it is ${t.types.A})`);
key(JSON.stringify(t.cols.A.slice(0, 3)) === '[14,16,11]',
    `and it holds numbers (${JSON.stringify(t.cols.A.slice(0, 3))})`);
const chartTakesIt = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('distplotbuilder'); await s(300);
    window.PS_SHELL.setRoles('distplotbuilder', { var: 'A' }); await s(900);
    const p = window.PS_SHELL.buildPayload();
    const roles = window.PS_SHELL.chart().roles.distplotbuilder || {};
    return { role: roles.var || null,
             n: p && p.bars && p.bars[0] ? (p.bars[0].values || []).length : 0 };
});
key(chartTakesIt.role === 'A' && chartTakesIt.n === 3,
    `a Distribution chart accepts it and plots its 3 values (${JSON.stringify(chartTakesIt)})`);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await w(600);

startCase('case 2', 'a column with other data is never re-read');
await typeDown('A', 3, ['abc']);
t = await table();
key(t.types.A === 'continuous', `text typed under the numbers leaves the column Continuous (it is ${t.types.A})`);
key(t.cols.A[3] === null && t.raw.A[3] === 'abc',
    `and that cell is missing while its text is kept (${JSON.stringify(t.cols.A[3])}, "${t.raw.A[3]}")`);

startCase('case 3', 'correcting the only value in a column re-reads it');
const said = await typeDown('C', 0, ['7']);
t = await table();
key(t.types.C === 'continuous', `a single number makes the column Continuous (it is ${t.types.C})`);
key(/C is now Continuous\./.test(said),
    `and the edit announcement says so for screen readers ("${said}")`);
await typeDown('C', 0, ['seven']);
t = await table();
ok(t.types.C === 'nominal' && t.cols.C[0] === 'seven',
   `typing a word over it makes the column Nominal, the word kept as data (${t.types.C}, ${JSON.stringify(t.cols.C[0])})`);

startCase('case 4', 'undo takes the type back with the value, redo brings it forward');
const u = await newColumn();
await typeDown(u, 0, ['5']);
key((await table()).types[u] === 'continuous', 'the new column is Continuous after its first number');
await page.evaluate(() => window.PS_SHELL.dataUndo());
await w(500);
t = await table();
ok(t.raw[u][0] === '' && t.types[u] === 'nominal',
   `undo empties the cell and the column is untyped again (${JSON.stringify(t.raw[u][0])}, ${t.types[u]})`);
await page.evaluate(() => window.PS_SHELL.dataRedo());
await w(500);
t = await table();
key(t.raw[u][0] === '5' && t.types[u] === 'continuous',
    `redo restores the value and the Continuous type (${JSON.stringify(t.raw[u][0])}, ${t.types[u]})`);

startCase('case 5', 'numbers pasted into an empty column make it Continuous');
const p1 = await newColumn();
await page.evaluate((c) => {
    window.PS_SHELL.setGridSelection(c, 0, c, 0, 'cells');
    window.PS_SHELL.pasteMatrix([['1.5'], ['2.5'], ['3.5']]);
}, p1);
await w(600);
t = await table();
key(t.types[p1] === 'continuous' && t.cols[p1][1] === 2.5,
    `the pasted column is Continuous and holds numbers (${t.types[p1]}, ${JSON.stringify(t.cols[p1].slice(0, 3))})`);
const beforeWide = t.order;
await page.evaluate((c) => {
    window.PS_SHELL.setGridSelection(c, 4, c, 4, 'cells');
    window.PS_SHELL.pasteMatrix([['x', '9'], ['y', '8']]);
}, beforeWide[beforeWide.length - 1]);
await w(600);
t = await table();
const made = t.order.find(c => !beforeWide.includes(c));
key(!!made && t.types[made] === 'continuous',
    `a column the paste created for numbers is Continuous (${made}: ${made ? t.types[made] : 'none'})`);

startCase('case 6', "clearing a column's only value makes it untyped again");
const c6 = await newColumn();
await typeDown(c6, 0, ['14']);
key((await table()).types[c6] === 'continuous', 'the column is Continuous after its one number');
const cell = page.locator(`#ps-datagrid td[data-gc="${c6}"][data-gr="0"]`);
await cell.click({ button: 'right' });
await w(300);
await page.click('#ps-cellmenu-clear');
await w(600);
t = await table();
ok(t.raw[c6][0] === '' && t.types[c6] === 'nominal',
   `clearing it leaves the column untyped (${t.types[c6]})`);
await typeDown(c6, 0, ['Section A']);
t = await table();
ok(t.types[c6] === 'nominal' && t.cols[c6][0] === 'Section A',
   `so a name typed next is kept as data, not lost in a Continuous column (${JSON.stringify(t.cols[c6][0])})`);

startCase('guard 1', 'text typed first stays Nominal, whatever follows', true);
await typeDown('B', 0, ['red', '3', '4']);
t = await table();
ok(t.types.B === 'nominal' && t.cols.B[1] === '3',
   `the column is Nominal and its later numbers are labels (${t.types.B}, ${JSON.stringify(t.cols.B.slice(0, 3))})`);

startCase('guard 2', 'a type set by hand is never re-read', true);
const h1 = await newColumn();
await page.evaluate((c) => window.PS_SHELL.setColType(c, 'nominal'), h1);
await w(300);
await typeDown(h1, 0, ['1', '2']);
ok((await table()).types[h1] === 'nominal',
   'a column set to Nominal by hand stays Nominal when numbers are typed (codes are a choice)');
const h2 = await newColumn();
await page.evaluate((c) => window.PS_SHELL.setColType(c, 'ordinal'), h2);
await w(300);
await typeDown(h2, 0, ['3', '1']);
ok((await table()).types[h2] === 'ordinal', 'and a column set to Ordinal stays Ordinal');

startCase('guard 3', 'an imported column that is cleared keeps its type', true);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('kept', ['g', 'v'], [['a', '1'], ['b', '2'], ['c', '3']], null, null);
    await s(700);
    window.PS_SHELL.setWorkspace('data'); await s(400);
    window.PS_SHELL.setGridSelection('v', 0, 'v', 2, 'cells'); await s(200);
});
ok((await table()).types.v === 'continuous', 'the loaded numbers are Continuous');
await page.locator('#ps-datagrid td[data-gc="v"][data-gr="1"]').click({ button: 'right' });
await w(300);
await page.click('#ps-cellmenu-clear');
await w(600);
t = await table();
ok(t.raw.v.join('') === '' && t.types.v === 'continuous',
   `all three cells are cleared and the column is still Continuous (${JSON.stringify(t.raw.v)}, ${t.types.v})`);

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();

if (EXPECT_BROKEN) {
    const held = Object.keys(caseRed).filter(k => !caseRed[k]);
    if (failed || held.length) {
        console.log('\nfirst-data-type-check control: NOT red where expected' +
            (held.length ? ' (' + held.join(', ') + ' held on the pre-change page)' : '') +
            (failed ? ' (' + failed + ' other check(s) failed)' : ''));
        process.exit(1);
    }
    console.log('\nfirst-data-type-check control: every numbered case is red on the pre-change page');
    process.exit(0);
}
if (failed) { console.log('\nfirst-data-type-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nfirst-data-type-check: all cases passed');
