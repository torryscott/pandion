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
// Torry's terminology ruling (Jul 28 2026): "variable" speaks about data
// MEANING (chart roles, types); "column" is grid mechanics. A status line
// describing the grid's shape is mechanics.
ok(/24 rows/.test(data.ctx) && /4 columns/.test(data.ctx),
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

console.log('case 5: it counts the right thing and spells the plural');
// Two wrong readings of the same line. The plural was noun + "s", so every
// grouped frequency chart said "2 categorys". And Distribution ships ONE
// payload cell per group with the raw values inside it, because the engine
// bins client-side, so bars.length is the number of distributions drawn and
// never the number of bins. A fourteen-bar histogram reported "1 bin".
// Cases 3 and 4 work in the grid, so the selection slot is reporting cells.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(1200);
async function statusFor(mod, roles, opts) {
    await page.evaluate(async o => {
        const w = ms => new Promise(r => setTimeout(r, ms));
        const S = window.PS_SHELL;
        S.setModule(o.mod); await w(600);
        S.setRoles(o.mod, o.roles); await w(1400);
    }, { mod: mod, roles: roles });
    await page.waitForTimeout(1600);
    if (opts && opts.count) {
        const n = await page.evaluate(sel =>
            document.querySelectorAll(
                '.graphbuilder2-host ' + sel).length, opts.count);
        return { text: (await bar()).sel, drawn: n };
    }
    return { text: (await bar()).sel, drawn: null };
}
const freqBar = await statusFor('freqplotbuilder', { var: 'condition' });
ok(!/categorys/.test(freqBar.text),
   `a frequency chart does not say "categorys" ("${freqBar.text}")`);
ok(/\d+ categor(y|ies)\b/.test(freqBar.text),
   `it counts categories ("${freqBar.text}")`);
const histBar = await statusFor('distplotbuilder', { var: 'score' },
                                { count: '[data-role="dist-hist-bar"]' });
ok(histBar.drawn > 1,
   'the histogram really draws several bars (' + histBar.drawn + ')');
ok(!/\bbins?\b/.test(histBar.text),
   `and the status bar does not claim a bin count it does not have ` +
   `("${histBar.text}")`);
ok(/1 distribution\b/.test(histBar.text),
   `it reports what the payload actually carries ("${histBar.text}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('STATUS BAR CHECK PASS');
await browser.close();
