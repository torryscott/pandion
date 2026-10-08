// One edited cell costs one cell (Oct 5 2026, the 12,570 by 1,010 survey
// file). A cell edit used to retype every column in the table and remember
// the whole table for undo: 5.6 seconds per edit on that file, and three
// 85-million-character snapshots held in memory. It now retypes the edited
// column (plus computed columns, which may read it) and remembers the cell.
// What must not change: everything derived from the edited column is as
// fresh as before, and undo and redo put back exactly what a whole-table
// snapshot would have.
// Control: on main, case 1 fails (other columns are rebuilt) and case 5
// fails (the whole table is serialized for one edit).
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
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
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
await page.waitForTimeout(600);
const T = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { raw: t.raw.score.slice(0, 4), typed: t.columns.score.slice(0, 4),
             levels: (t.levels.condition || []).slice(), edited: !!t.edited,
             audit: t.typeAudit.score ? { numeric: t.typeAudit.score.numeric, bad: t.typeAudit.score.bad } : null };
});
const cellPoint = (col, row) => page.evaluate(([c, r]) => {
    const td = Array.from(document.querySelectorAll('#ps-datagrid td[data-gc]'))
        .find(x => x.getAttribute('data-gc') === c && Number(x.getAttribute('data-gr')) === r);
    const b = td.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}, [col, row]);
async function edit(col, row, text) {
    const pt = await cellPoint(col, row);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(150);
    await page.keyboard.type(text);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(350);
}
const undo = async () => { await page.keyboard.press(MOD + '+z'); await page.waitForTimeout(450); };
const redo = async () => { await page.keyboard.press(MOD + '+Shift+z'); await page.waitForTimeout(450); };

console.log('case 1: an edit retypes its own column and leaves the others alone');
await page.evaluate(() => { const t = window.PS_SHELL.project.table; window.__hoursBefore = t.columns.hours; window.__condBefore = t.columns.condition; });
const before = await T();
await edit('score', 1, '88');
let now = await T();
ok(now.raw[1] === '88' && now.typed[1] === 88, 'the edited value is stored and typed (' + now.raw[1] + ' / ' + now.typed[1] + ')');
ok(await page.evaluate(() => { const t = window.PS_SHELL.project.table; return t.columns.hours === window.__hoursBefore && t.columns.condition === window.__condBefore; }),
   'the other columns were not rebuilt');

console.log('case 2: undo and redo put back exactly the cell');
await undo();
now = await T();
ok(now.raw[1] === before.raw[1] && now.typed[1] === before.typed[1] && now.edited === before.edited,
   'undo restores the value, its typed form and the edited flag (' + now.raw[1] + ')');
await redo();
now = await T();
ok(now.raw[1] === '88' && now.typed[1] === 88 && now.edited === true, 'redo puts the edit back');
await undo();

console.log('case 3: a value the column cannot read is audited, and undo clears the finding');
await edit('score', 2, 'sixty');
now = await T();
ok(now.raw[2] === 'sixty' && now.typed[2] === null && now.audit && now.audit.bad === 1,
   'the text is kept, reads as missing, and the audit counts it (' + JSON.stringify(now.audit) + ')');
await undo();
now = await T();
ok(now.raw[2] === before.raw[2] && now.audit.bad === 0, 'undo restores the number and the audit is clean again');

console.log('case 4: levels, a formula and a filter that read the column all follow');
await edit('condition', 0, 'Brand new level');
now = await T();
ok(now.levels.indexOf('Brand new level') !== -1, 'a new category joins the level list');
await undo();
now = await T();
ok(now.levels.indexOf('Brand new level') === -1 && now.levels.join() === before.levels.join(), 'and undo takes it out again');
const made = await page.evaluate(() => window.PS_SHELL.saveComputedColumn('double_score', 'score * 2'));
ok(!made || !made.error, 'setup: a computed column reads score' + (made && made.error ? ' (' + made.error + ')' : ''));
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.setFilters([{ col: 'score', op: 'gt', value: '1000' }]));
await page.waitForTimeout(400);
const kept0 = await page.evaluate(() => { const m = window.PS_SHELL.project.table.filterMask; return m ? m.filter(Boolean).length : -1; });
await edit('score', 3, '5000');
let dep = await page.evaluate(() => { const t = window.PS_SHELL.project.table; return { dbl: t.columns.double_score[3], kept: t.filterMask ? t.filterMask.filter(Boolean).length : -1 }; });
ok(dep.dbl === 10000, 'the computed column recalculates from the edit (' + dep.dbl + ')');
ok(dep.kept !== kept0, 'and the filter on that column is evaluated again (' + kept0 + ' -> ' + dep.kept + ')');
await undo();
dep = await page.evaluate(() => { const t = window.PS_SHELL.project.table; return { dbl: t.columns.double_score[3], kept: t.filterMask ? t.filterMask.filter(Boolean).length : -1, raw: t.raw.score[3] }; });
ok(dep.raw === before.raw[3] && dep.dbl === Number(before.raw[3]) * 2 && dep.kept === kept0,
   'undo restores the value, the computed column and the filter (' + JSON.stringify(dep) + ')');
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(300);

console.log('case 5: an edit never serializes the whole table');
await page.evaluate(async () => {
    const cols = []; for (let c = 0; c < 200; c++) cols.push('v' + c);
    const rows = [];
    for (let r = 0; r < 3000; r++) { const row = new Array(200); for (let c = 0; c < 200; c++) row[c] = String((r * 7 + c * 13) % 97); rows.push(row); }
    window.PS_SHELL.loadTable('wide', cols, rows, null, null);
    await new Promise(r => setTimeout(r, 900));
    window.__bigJson = 0;
    const str = JSON.stringify;
    // The undo snapshot, told apart from the autosave by its first key: this
    // table fits in browser storage, so the autosave serializing the project
    // is expected and is not what this case is about.
    JSON.stringify = function () { const out = str.apply(this, arguments); if (typeof out === 'string' && out.length > 2000000 && out.slice(0, 9) === '{"order":') window.__bigJson++; return out; };
});
await page.waitForTimeout(600);
await edit('v2', 1, '55');
await edit('v3', 2, '56');
ok(await page.evaluate(() => window.PS_SHELL.project.table.raw.v2[1] === '55' && window.PS_SHELL.project.table.raw.v3[2] === '56'), 'setup: two edits landed in a 600,000-cell table');
ok(await page.evaluate(() => window.__bigJson) === 0, 'neither built a whole-table undo snapshot (' + await page.evaluate(() => window.__bigJson) + ')');
await undo(); await undo();
ok(await page.evaluate(() => window.PS_SHELL.project.table.raw.v2[1] !== '55' && window.PS_SHELL.project.table.raw.v3[2] !== '56'), 'and both still undo');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
if (failed) { console.log('CELL EDIT SCOPE CHECK: ' + failed + ' failing'); await browser.close(); process.exit(1); }
console.log('CELL EDIT SCOPE CHECK PASS');
await browser.close();
