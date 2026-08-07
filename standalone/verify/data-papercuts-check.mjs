// Six small things, each found by driving the app, gathered because they are
// individually too small to argue about and collectively the difference
// between an app that feels finished and one that does not.
//
//  1. An excluded value was counted as Missing AND Excluded, so a reader went
//     looking for a blank cell that does not exist.
//  2. "Used in 4 roles" counted assignments in analyses the user had never
//     opened, because every chart stores a role set per MODULE. The number is
//     read right before someone deletes a column.
//  3. After Add row the grid footer said 25 rows and the status bar four
//     pixels below said 24, and stayed there until an unrelated workspace
//     switch healed it.
//  4. Restore all exclusions reversed every exclusion the user had made, in
//     one click, and said nothing, while every smaller action toasts.
//  5. A cancelled export picker and a dead button were pixel-identical.
//  6. Find never scrolled sideways. At 40 columns every match it walked to was
//     off screen to the right while the counter advanced.
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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
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

const stat = name => page.evaluate(n => {
    const el = document.getElementById('ps-variable-stats');
    if (!el) return '';
    const lines = el.innerText.split('\n');
    const i = lines.findIndex(l => l.trim() === n);
    return i < 0 ? '' : (lines[i + 1] || '').trim();
}, name);
const toasts = () => page.evaluate(() => Array.from(
    document.querySelectorAll('.ps-toast, [class*="toast"]'))
    .map(n => n.innerText).join(' | '));
// Never remove the toast nodes. They live in a stack the app owns, and
// deleting them takes the container with them, so the next toast has nowhere
// to render and the probe reads silence that is its own doing.
let toastMark = '';
const markToasts = async () => { toastMark = await toasts(); };
const newToasts = async () => {
    const now = await toasts();
    return now.startsWith(toastMark) ? now.slice(toastMark.length) : now;
};

console.log('case 1: an excluded value is not also counted as missing');
await page.evaluate(() => window.PS_SHELL.selectVariable('score'));
await page.waitForTimeout(400);
ok((await stat('Missing')) === '0' && (await stat('Excluded')) === '0',
   'clean to begin with');
await page.evaluate(() => window.PS_SHELL.setExcluded('score', 2, true));
await page.waitForTimeout(800);
ok((await stat('Excluded')) === '1', 'the exclusion registers, got ' + (await stat('Excluded')));
ok((await stat('Missing')) === '0',
   'and Missing stays at zero, because no cell is blank, got ' +
   (await stat('Missing')));
ok((await stat('Valid')) === '23',
   'while Valid drops, which is the part that was already right, got ' +
   (await stat('Valid')));

console.log('case 2: a genuinely blank cell still counts as missing');
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    t.raw.score[5] = '';
    window.PS_SHELL.retypeTable();
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.selectVariable('score'));
await page.waitForTimeout(400);
ok((await stat('Missing')) === '1',
   'one blank, counted once, got ' + (await stat('Missing')));
ok((await stat('Excluded')) === '1',
   'and the exclusion is still reported separately, got ' + (await stat('Excluded')));

console.log('case 3: Used in counts only the analysis in use');
await page.evaluate(() => {
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    // A role set for an analysis the user has never opened.
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'score', yvar: 'hours' });
    window.PS_SHELL.setModule('plotbuilder');
});
await page.waitForTimeout(1000);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.evaluate(() => window.PS_SHELL.selectVariable('score'));
await page.waitForTimeout(400);
ok((await stat('Used in')) === '1 role',
   'score is on one visible chart, so it reads 1 role, got ' +
   JSON.stringify(await stat('Used in')));

console.log('case 4: Add row leaves the two row counts agreeing');
const rowCounts = async () => page.evaluate(() => ({
    foot: (document.getElementById('ps-gridfoot') || {}).innerText || '',
    bar: (document.getElementById('ps-status-context') || {}).textContent || ''
}));
const rows0 = await page.evaluate(() =>
    window.PS_SHELL.project.table.raw.score.length);
// The real control, because a command id that does not exist would leave both
// counts trivially agreeing at the old number.
await page.click('#ps-data-addrow');
await page.waitForTimeout(900);
ok((await page.evaluate(() =>
    window.PS_SHELL.project.table.raw.score.length)) === rows0 + 1,
   'a row really was added');
const rc = await rowCounts();
const nFoot = (rc.foot.match(/(\d[\d,]*)\s*rows?/) || [])[1];
const nBar = (rc.bar.match(/(\d[\d,]*)\s*rows?/) || [])[1];
ok(nFoot && nBar && nFoot.replace(/,/g, '') === nBar.replace(/,/g, ''),
   'footer and status bar agree, got ' + JSON.stringify(rc));
ok(Number(nFoot.replace(/,/g, '')) === rows0 + 1,
   'and both show the NEW count, got ' + nFoot);

console.log('case 5: restoring every exclusion says so');
await markToasts();
await page.evaluate(() => window.PS_SHELL.runCommand('data-restore-excl'));
await page.waitForTimeout(700);
const t5 = await newToasts();
ok(/Restored/.test(t5) && /1/.test(t5),
   'it reports what it undid, got ' + JSON.stringify(t5.slice(0, 120)));
ok(/Cmd\/Ctrl\+Z/.test(t5), 'and carries the way back, got ' + JSON.stringify(t5.slice(0, 120)));

console.log('case 6: a cancelled export is distinguishable from a dead button');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);
await markToasts();
await page.evaluate(() => {
    window.__pickerHits = 0;
    window.showSaveFilePicker = function () {
        window.__pickerHits++;
        const e = new Error('cancelled');
        e.name = 'AbortError';
        return Promise.reject(e);
    };
});
await page.evaluate(() => window.PS_SHELL.runCommand('export-data'));
await page.waitForTimeout(1200);
// Counted, because an assertion on the toast alone cannot tell "we said
// nothing" from "the export never ran".
ok((await page.evaluate(() => window.__pickerHits)) === 1,
   'the export actually reached the save picker, got ' +
   (await page.evaluate(() => window.__pickerHits)));
const t6 = await newToasts();
ok(/cancel/i.test(t6),
   'and a cancelled picker says so, got ' + JSON.stringify(t6.slice(0, 120)));

console.log('case 7: Find scrolls sideways to a match it cannot otherwise show');
await page.evaluate(() => {
    const cols = [], rows = [];
    for (let c = 0; c < 30; c++) cols.push('col' + c);
    for (let r = 0; r < 12; r++)
        rows.push(cols.map((c, i) => (r === 4 && i === 27) ? 'NEEDLE' : c + '_' + r));
    window.PS_SHELL.loadTable('wide', cols, rows);
});
await page.waitForTimeout(900);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);
const before = await page.evaluate(() => {
    const g = document.getElementById('ps-datagrid');
    return { left: g.scrollLeft, scrollable: g.scrollWidth > g.clientWidth + 1 };
});
ok(before.scrollable, 'the fixture is genuinely wider than the pane');
ok(before.left === 0, 'and starts at the left edge');
await page.evaluate(() => window.PS_SHELL.gridRevealFound({ col: 'col27', row: 4 }));
await page.waitForTimeout(900);
const after = await page.evaluate(() => {
    const g = document.getElementById('ps-datagrid');
    const cells = g.querySelectorAll('td[data-gc="col27"]');
    const cell = Array.from(cells).find(c => c.getAttribute('data-gr') === '4');
    if (!cell) return { left: g.scrollLeft, onScreen: false };
    const cr = cell.getBoundingClientRect(), gr = g.getBoundingClientRect();
    return { left: g.scrollLeft,
             onScreen: cr.left >= gr.left - 1 && cr.right <= gr.right + 1 };
});
ok(after.left > 0, 'the grid scrolled sideways, got scrollLeft ' + after.left);
ok(after.onScreen, 'and the match is actually on screen');

console.log('case 8: an in-view match does not jolt sideways');
await page.evaluate(() => {
    const g = document.getElementById('ps-datagrid');
    g.scrollLeft = 0;
});
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.gridRevealFound({ col: 'col1', row: 2 }));
await page.waitForTimeout(700);
ok((await page.evaluate(() =>
    document.getElementById('ps-datagrid').scrollLeft)) === 0,
   'a column already in view leaves the horizontal position alone');

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('DATA PAPERCUTS CHECK: ALL GREEN');
await browser.close();
