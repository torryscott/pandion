// Three places the app made a defensible choice and never said so. In each
// case the CHOICE is kept and only the silence is fixed, which is why none of
// these changes a number or a behaviour.
//
// A. Under a live row filter three surfaces report three different bases and
//    none of them says which. The variable panel and the status bar describe
//    the FULL table while the chart describes the kept rows, and the filter
//    popover's own copy says failing rows "leave every chart and statistic".
//    One session read Mean 72.4 and Max 91 off the panel while the filtered
//    truth was 67.56 and 79, and had to compute it by hand to know which
//    surface to believe. The basis stays as it is, because the
//    computed-variable filter seam is already pinned to the full table on
//    purpose (a z-score must not shift when rows are hidden), so the panel
//    says which table it is describing instead.
//
// D. Hiding a column is view state, deliberately outside the project file. A
//    saved project reopened with every column visible and nothing had ever
//    said it would. On an eighteen column jamovi file the arrangement is the
//    whole reason to hide.
//
// F. Replacing the project by importing data offers it back in a toast that
//    expires in about six seconds, and the toolbar Undo does not cover it, so
//    the toast read as the only route. It is not. The replaced project was
//    autosaved before it was replaced and is sitting in Recent projects, and
//    the toast now says so, but only when that is actually true.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

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

const basis = () => page.evaluate(() => {
    const n = document.getElementById('ps-variable-basis');
    return n && n.offsetParent !== null ? n.textContent : '';
});
const pick = async c => {
    await page.evaluate(cc => window.PS_SHELL.selectVariable(cc), c);
    await page.waitForTimeout(400);
};

console.log('A: the panel says which table it is describing, but only when it matters');
await pick('score');
ok((await basis()) === '',
   'with no filter there is one answer, so nothing is said, got ' +
   JSON.stringify(await basis()));
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'score', op: 'lt', value: 80 }]));
await page.waitForTimeout(900);
await pick('score');
const b1 = await basis();
ok(/every row/.test(b1),
   'under a filter it names its own basis, got ' + JSON.stringify(b1));
ok(/18 of 24/.test(b1),
   'and names the other one so the two can be told apart, got ' +
   JSON.stringify(b1));
// The numbers themselves must NOT have moved. The decision was to label the
// basis, not to change it.
const stat = name => page.evaluate(n => {
    const el = document.getElementById('ps-variable-stats');
    const lines = (el ? el.innerText : '').split('\n');
    const i = lines.findIndex(l => l.trim() === n);
    return i < 0 ? '' : (lines[i + 1] || '').trim();
}, name);
ok((await stat('Rows')) === '24',
   'the panel still describes all 24 rows, got ' + (await stat('Rows')));
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(900);
await pick('score');
ok((await basis()) === '', 'and it goes away with the filter');

console.log('D: hiding says it is for looking, not for keeping');
await page.evaluate(() => {
    window.PS_SHELL.showAllColumns();
    window.PS_SHELL.hideColumn('hours');
});
await page.waitForTimeout(600);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);
await page.click('#ps-data-hidden-columns');
await page.waitForTimeout(500);
const panel = await page.evaluate(() =>
    (document.getElementById('ps-columnview-menu') || {}).innerText || '');
ok(/not saved with the project/i.test(panel),
   'the restore panel discloses it, got ' + JSON.stringify(panel.slice(0, 200)));
ok(/hours/.test(panel), 'while still offering the column back, got ' +
   JSON.stringify(panel.slice(0, 200)));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.showAllColumns());
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);
await page.click('#ps-data-hidden-columns');
await page.waitForTimeout(500);
ok(!/not saved with the project/i.test(await page.evaluate(() =>
    (document.getElementById('ps-columnview-menu') || {}).innerText || '')),
   'and says nothing when nothing is hidden');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('F: the offer names a route that outlives the toast');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-repl-'));
const csv = path.join(tmp, 'newdata.csv');
fs.writeFileSync(csv, 'a,b\n1,2\n3,4\n5,6\n');
// captureReplacedProject deliberately stays quiet on a project with no work in
// it, so there has to be some.
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    t.raw.score[0] = '999';
    t.edited = true;
    window.PS_SHELL.retypeTable();
});
await page.waitForTimeout(1000);
await page.evaluate(() => window.PS_SHELL.openLoader());
await page.waitForTimeout(300);
await page.setInputFiles('#ps-file', csv);
await page.waitForTimeout(800);
await page.click('button:has-text("Import data")');
await page.waitForTimeout(1400);
const toast = await page.evaluate(() => Array.from(
    document.querySelectorAll('.ps-toast, [class*="toast"]'))
    .map(n => n.innerText).join(' | '));
ok(/was not saved to a file/.test(toast),
   'the offer still fires, got ' + JSON.stringify(toast.slice(0, 160)));
ok(/Recent projects/.test(toast),
   'and names the durable route, got ' + JSON.stringify(toast.slice(0, 200)));
// The claim has to be true, so the project really is restorable from there.
const rec = await page.evaluate(() => window.PS_SHELL.recentProjects()
    .map(r => ({ name: r.name, restorable: !!r.snapshot })));
ok(rec.some(r => /Dose response/.test(r.name) && r.restorable),
   'and the replaced project really is restorable from Recents, got ' +
   JSON.stringify(rec));

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('DATA DISCLOSURE CHECK: ALL GREEN');
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
