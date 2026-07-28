// Punch list items 12, 13, 15, 16.
//
// 13: three paths replaced the whole project with no prompt (the start
// centre's sample button, a file drop, adoptProject/adoptOMV) - click "try
// the sample" out of curiosity with six charts open and they were gone.
// 15: the recovery ladder switched itself off one rung at a time in silence.
// 16: two tabs wrote the same fixed keys with last-write-wins and no notice.
// 12: right-click gave a proper menu on some of the app and "View page
// source" on the rest.
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
const undoBtns = () => page.evaluate(() =>
    document.querySelectorAll('#ps-toast .ps-toast-action button').length);
// Clearing the NODE is not enough: the toast stack is a model that any later
// render rebuilds from, so a "cleared" offer reappears. Take each offer's own
// dismissal path instead, by letting them expire.
const clearToasts = async () => {
    const n = await undoBtns();
    if (n) await page.waitForTimeout(6300);
    await page.evaluate(() => {
        document.getElementById('ps-toast').innerHTML = '';
        document.getElementById('ps-toast').className = '';
    });
};

// ---- 13: replacing unsaved work is offered back, on every path ----
await page.evaluate(() => {
    window.PS_SHELL.project.name = 'My six-chart analysis';
    window.PS_SHELL.addChart('plotbuilder');
});
await page.waitForTimeout(700);
await clearToasts();
await page.evaluate(() => window.PS_SHELL.showWelcome());
await page.waitForTimeout(300);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(700);
ok(await page.evaluate(() => window.PS_SHELL.project.name) !== 'My six-chart analysis',
   'setup: the sample button really did replace the project');
ok(await undoBtns() === 1,
   'the start centre sample offers the replaced project back');
await page.click('#ps-toast .ps-toast-action button');
await page.waitForTimeout(800);
ok(await page.evaluate(() => window.PS_SHELL.project.name) === 'My six-chart analysis',
   'and taking it restores the project that was replaced');

await clearToasts();
const dropCsv = async () => page.evaluate(() => {
    const rows = ['a,b'];
    for (let i = 0; i < 20; i++) rows.push(`${i % 3},${i}`);
    const file = new File([rows.join('\n')], 'other.csv', { type: 'text/csv' });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new DragEvent('drop',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await dropCsv();
await page.waitForTimeout(700);
await page.click('#ps-import-use');
await page.waitForTimeout(900);
ok(await undoBtns() === 1,
   'a dropped data file offers the replaced project back too');
await clearToasts();

// A project WITH a file copy must NOT nag: there is something to go back to.
await page.evaluate(() => { window.PS_SHELL.markSavedForTest(); });
await page.evaluate(() => window.PS_SHELL.showWelcome());
await page.waitForTimeout(250);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(700);
ok(await undoBtns() === 0,
   'a project already saved to a file is replaced without an offer');

// ---- 15: the recovery ladder reports itself ----
const ladder = await page.evaluate(() => {
    window.PS_SHELL.showDiagnostics();
    return document.getElementById('ps-diagnostics-grid').textContent;
});
ok(/Recovery ladder/.test(ladder),
   'Diagnostics reports the state of the recovery ladder');
ok(/recents on|recents SKIPPED/.test(ladder),
   `and says whether each rung is active ("${(ladder.match(
       /Recovery ladder[^A-Z]*/) || [''])[0].slice(0, 70)}")`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const budget = await page.evaluate(() => window.__gb2_bundleBytes);
ok(budget === 3600000,
   `the engine's undo budget is declared, handing ~1.7 MB back to the ` +
   `ladder (${budget})`);

// A project too large for a rung says so instead of silently dropping it.
await clearToasts();
const warned = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const t = window.PS_SHELL.project.table;
    const big = [];
    for (let i = 0; i < 30000; i++) big.push('value-' + i + '-padding-padding');
    t.raw[t.order[0]] = big;
    for (let c = 1; c < t.order.length; c++) t.raw[t.order[c]] = big.slice();
    t.caseIds = big.map((_, i) => 'case-' + i);
    window.PS_SHELL.retypeTable();
    await sleep(900);
    return document.getElementById('ps-toast').textContent;
});
ok(/too large for the local/i.test(warned),
   `a project that outgrows a rung says so ("${warned.slice(0, 80)}")`);

// ---- 16: a competing tab is noticed ----
await clearToasts();
const tabWarn = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // A storage event is what a second tab's write looks like from here.
    const snap = JSON.stringify({ id: window.PS_SHELL.project.id, table: {} });
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'psstandalone.project.v2', newValue: snap
    }));
    await sleep(300);
    // Read the pills individually: the stack can hold an unrelated toast, and
    // testing the concatenated text reports whichever one happens to be first.
    return Array.from(document.querySelectorAll('#ps-toast .ps-toast-item'))
        .map(n => n.textContent).filter(t => /another tab/i.test(t))[0] || '';
});
ok(/another tab/i.test(tabWarn),
   `a second tab writing the same project is noticed ("${tabWarn.slice(0, 80)}")`);

// ---- 12: right-click gives an app menu where it used to give the browser's ----
await clearToasts();
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(600);
async function rightClick(sel) {
    const box = await page.locator(sel).first().boundingBox();
    await page.mouse.move(box.x + Math.min(20, box.width / 2),
                          box.y + Math.min(20, box.height / 2));
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(250);
    return page.evaluate(() => {
        const m = document.getElementById('ps-contextmenu');
        return { open: m.style.display !== 'none' && m.style.display !== '',
                 items: Array.from(m.querySelectorAll('button'))
                     .map(b => b.textContent) };
    });
}
// Target the engine host itself. An earlier version right-clicked near the
// corner of #ps-workcard, landed on the document tab strip, and passed on the
// NAVIGATOR's menu - "an app menu appeared" is not the assertion, "the chart
// menu appeared" is.
const onChart = await rightClick('.graphbuilder2-host');
ok(onChart.open && onChart.items.some(t => /Copy as image/i.test(t)) &&
   onChart.items.some(t => /Export/i.test(t)),
   `right-click on the chart gives the CHART menu ` +
   `(${JSON.stringify(onChart.items)})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// The layout canvas: the case the report calls sharpest, where an item gave a
// menu and 10px away gave "View page source".
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout();
    await sleep(400);
});
await page.waitForTimeout(700);
const onCanvas = await rightClick('#ps-lcanvas');
ok(onCanvas.open && onCanvas.items.some(t => /Add chart/i.test(t)),
   `right-click on EMPTY layout canvas offers layout commands ` +
   `(${JSON.stringify(onCanvas.items)})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// and a text field keeps the browser's own menu, which is the better one
const inField = await page.evaluate(() => {
    const inp = document.querySelector('#ps-inspector-docname');
    if (!inp) return { skipped: true };
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    return { skipped: false, prevented: ev.defaultPrevented };
});
ok(inField.skipped || !inField.prevented,
   'a text field keeps the browser menu, which is genuinely better there');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SAFETY CHECK PASS');
await browser.close();
