// Punch list t3-59: no provenance or reproducibility surface.
//
// jamovi analyses appear in syntax mode as reproducible R calls. Here the
// project file was opaque JSON, an exported figure carried no statement of
// what produced it, and Diagnostics described the APPLICATION (version,
// snapshot size, render milliseconds) rather than the chart. The facts all
// existed already: roles, summary function, error-bar type, the filter
// disclosure string, the exclusion count, the per-module missing note.
//
// The risk with a feature like this is fabrication: a statement that sounds
// authoritative and is wrong. So the assertions below are mostly about NOT
// claiming things - no summary function on a chart that has none, no filter
// line when nothing is filtered, and a row count that changes when a filter
// is applied.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);

const prov = () => page.evaluate(() => {
    const rows = window.PS_SHELL.chartProvenance();
    const map = {};
    rows.forEach(r => { map[r[0]] = r[1]; });
    return { rows, map, sentence: window.PS_SHELL.provenanceSentence() };
});

console.log('case 1: it names what actually drew the chart');
const p1 = await prov();
ok(p1.map.Analysis === 'Compare Groups',
   `the analysis (${p1.map.Analysis})`);
ok(/condition/.test(JSON.stringify(p1.map)) && /score/.test(JSON.stringify(p1.map)),
   `the variables in their roles (${JSON.stringify(p1.rows.slice(1, 3))})`);
ok(p1.map.Summary === 'Mean',
   `the summary function, which decides what a bar's height means ` +
   `(${p1.map.Summary})`);
ok(/error/i.test(Object.keys(p1.map).join('|')),
   `and the error-bar type, which decides what a whisker means ` +
   `(${p1.map['Error bars']})`);
ok(/Pandion Plots \d/.test(p1.map['Drawn with'] || ''),
   `plus the version that drew it (${p1.map['Drawn with']})`);

console.log('case 2: it does not claim what the module does not have');
const p2 = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('freqplotbuilder');
    await s(400);
    window.PS_SHELL.setRoles('freqplotbuilder', { var: 'condition' });
    await s(900);
    const map = {};
    window.PS_SHELL.chartProvenance().forEach(r => { map[r[0]] = r[1]; });
    return map;
});
ok(p2.Analysis === 'Frequencies', `setup: a Frequencies chart (${p2.Analysis})`);
ok(!('Summary' in p2) && !('Error bars' in p2),
   `no summary function and no error-bar type are claimed, because a count ` +
   `chart has neither (${JSON.stringify(Object.keys(p2))})`);
ok(p2.Statistic === 'Count',
   `but the statistic it DOES have is named (${p2.Statistic})`);
// The real fabrication risk, and the reason the module guards exist:
// widget.R ships corrMethod and freqStat with defaults in EVERY module's
// payload, so a provenance block that just reported what it found would tell
// a Compare Groups reader their bar chart used Pearson correlation.
const p2b = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('plotbuilder');
    await s(400);
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    await s(900);
    const map = {};
    window.PS_SHELL.chartProvenance().forEach(r => { map[r[0]] = r[1]; });
    return { map, tplHasCorr:
        typeof window.PS_TEMPLATES.plotbuilder.payload.corrMethod === 'string',
        tplHasFreq:
        typeof window.PS_TEMPLATES.plotbuilder.payload.freqStat === 'string' };
});
ok(p2b.tplHasCorr && p2b.tplHasFreq,
   'setup: a Compare Groups payload really does carry corrMethod and ' +
   'freqStat defaults, so this is a live trap and not a hypothetical');
ok(!('Correlation' in p2b.map),
   `and a bar chart does not claim a correlation method ` +
   `(${JSON.stringify(Object.keys(p2b.map))})`);
ok(!('Statistic' in p2b.map),
   'nor a frequency statistic');

console.log('case 3: it reports the data as it actually stands');
const p3 = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('plotbuilder');
    await s(400);
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    await s(800);
    const before = {};
    window.PS_SHELL.chartProvenance().forEach(r => { before[r[0]] = r[1]; });
    window.PS_SHELL.setFilters([{ col: 'score', op: 'gt', value: 55 }]);
    await s(1100);
    const after = {};
    window.PS_SHELL.chartProvenance().forEach(r => { after[r[0]] = r[1]; });
    return { before, after };
});
ok(!('Filter' in p3.before),
   'an unfiltered chart carries no filter line, rather than "Filter: none"');
ok(/^\d+$/.test(p3.before.Rows),
   `and a plain row count (${p3.before.Rows})`);
ok(/score/.test(p3.after.Filter || ''),
   `applying a filter states it (${p3.after.Filter})`);
ok(/of \d+/.test(p3.after.Rows) && p3.after.Rows !== p3.before.Rows,
   `and the row count changes to say how many are actually drawn ` +
   `(${p3.before.Rows} -> ${p3.after.Rows})`);
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(900);

console.log('case 4: it reaches an exported figure through the caption');
const cap = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('chart');
    await s(400);
    window.PS_SHELL.runCommand('export');
    await s(700);
    const box = document.getElementById('ps-export-caption');
    box.value = 'Figure 1.';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await s(200);
    document.getElementById('ps-export-provenance').click();
    await s(400);
    const once = box.value;
    document.getElementById('ps-export-provenance').click();
    await s(400);
    return { once, twice: box.value,
             stored: (window.PS_SHELL.chart() || {}).caption };
});
ok(/^Figure 1\./.test(cap.once),
   `the user's own caption is kept, not replaced (${JSON.stringify(
       cap.once.slice(0, 40))})`);
ok(/Analysis: Compare Groups/.test(cap.once) && /Summary: Mean/.test(cap.once),
   `and the provenance is appended under it (${JSON.stringify(
       cap.once.slice(10, 90))})`);
ok(cap.twice === cap.once,
   'a second click does not stack a second copy');
ok(cap.stored === cap.once,
   'and it is stored on the document, so it survives to the export');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 5: Diagnostics describes the chart, not only the app');
const diag = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('diagnostics');
    await s(600);
    return document.getElementById('ps-diagnostics-grid').innerText;
});
ok(/This chart: Analysis/.test(diag),
   'the chart rows are there');
ok(/Compare Groups/.test(diag) && /Mean/.test(diag),
   'carrying the same facts');
ok(/Pandion Plots/.test(diag) && /Browser/.test(diag),
   'alongside the application rows, which were all it used to report');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PROVENANCE CHECK PASS');
await browser.close();
