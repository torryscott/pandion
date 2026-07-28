// Punch list 37: the status bar and grid footer carried instructions where
// every comparable application puts instrumentation.
//
// The chart workspace's selection slot was the literal constant "Click a chart
// element to edit". The context slot restated the highlighted navigator item
// ("Chart workspace"), and then the render path overwrote it a beat later with
// how many milliseconds the last draw took. The document slot said the same
// thing as the app bar's save chip in different words. And the grid footer was
// a permanent four-sentence how-to, where Excel, Sheets and Numbers all put
// Sum / Average / Count - with ps-stat.js already loaded and unused there.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1700);

const bar = () => page.evaluate(() => ({
    ctx: document.getElementById('ps-status-context').textContent.trim(),
    sel: document.getElementById('ps-status-selection').textContent.trim(),
    doc: document.getElementById('ps-status-document').textContent.trim(),
    ctxTip: document.getElementById('ps-status-context')
        .getAttribute('data-tip')
}));

console.log('case 1: the chart workspace reports the chart');
const chart = await bar();
ok(!/Click a chart element/.test(chart.sel),
   `the selection slot is not a standing instruction ("${chart.sel}")`);
ok(/case/.test(chart.sel),
   `it reports how much data is drawn ("${chart.sel}")`);
ok(!/^Chart workspace$/.test(chart.ctx),
   `the context slot does not restate the navigator ("${chart.ctx}")`);
ok(/Compare Groups/.test(chart.ctx) && /condition/.test(chart.ctx),
   `it names the analysis and what is plotted ("${chart.ctx}")`);
// The render time is real information for one person; it belonged in a tooltip
// rather than overwriting the description after every single draw.
ok(!/\bms\b/.test(chart.ctx) && /ms/.test(chart.ctxTip || ''),
   `and the render time moved to the tooltip ("${chart.ctxTip}")`);
ok(!/autosave on/i.test(chart.doc) && /ago|just now|pending/i.test(chart.doc),
   `the document slot says WHEN rather than repeating the app bar's chip ` +
   `("${chart.doc}")`);

console.log('case 2: the data workspace reports the data');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(800);
const data = await bar();
ok(/24 rows/.test(data.ctx) && /4 variables/.test(data.ctx),
   `the context slot reports the dataset, not the workspace name ` +
   `("${data.ctx}")`);

console.log('case 3: the grid footer is Sum / Average / Count');
const foot = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setGridSelection('score', 0, 'score', 5, 'cells');
    await sleep(500);
    const f = document.getElementById('ps-gridfoot');
    return { text: f.innerText.replace(/\n/g, ' '),
             stats: Array.from(f.querySelectorAll('.ps-gridstat b'))
                 .map(b => b.textContent) };
});
ok(!/Click to edit; drag across cells/.test(foot.text),
   'the permanent four-sentence how-to is gone');
// textContent, not innerText: the uppercase is a CSS text-transform, so the
// DOM still holds the authored capitalisation.
ok(foot.stats.map(x => x.toUpperCase()).join(',') === 'COUNT,SUM,AVERAGE,MIN,MAX',
   `and the numbers a spreadsheet puts there are in its place ` +
   `(${JSON.stringify(foot.stats)})`);
// The dose-response scores in rows 1-6: 61 55 68 58 64 52.
ok(/SUM\s*358/.test(foot.text.replace(/\s+/g, ' ')) ||
   /358/.test(foot.text),
   `computed from the real cells, not approximated ("${foot.text.slice(0, 90)}")`);

console.log('case 4: it says what it did NOT count');
const mixed = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setGridSelection('condition', 0, 'score', 3, 'cells');
    await sleep(500);
    return document.getElementById('ps-gridfoot').innerText.replace(/\n/g, ' ');
});
ok(/not counted/.test(mixed),
   `a selection spanning text and numbers discloses what was skipped, rather ` +
   `than averaging over fewer cells than the count implies ` +
   `("${mixed.slice(0, 100)}")`);

const none = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setGridSelection('condition', 0, 'condition', 3, 'cells');
    await sleep(500);
    return document.getElementById('ps-gridfoot').innerText.replace(/\n/g, ' ');
});
ok(/nothing numeric/.test(none),
   `and a text-only selection says so instead of showing a sum of nothing ` +
   `("${none.slice(0, 80)}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('STATUS BAR CHECK PASS');
await browser.close();
