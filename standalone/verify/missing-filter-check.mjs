// You could not ask which rows were incomplete.
//
// Find matches no blanks (the em dash as it appears in the cell, "-", "NA" and
// "blank" all returned no matches). The filter operator list was = and the
// five order comparisons, with no "is missing", and the level dropdown for a
// categorical offered no missing entry. The Missing count in the variable
// panel is text, not a link. The only route that worked was Data then Sort
// rows ascending, which parks blanks at the bottom one column at a time and
// permanently reorders every row in the dataset to answer a read-only
// question.
//
// At 24 rows you can look. At the 300 rows this app invites you to paste, you
// cannot, and there was nothing else.
//
// These two operators take no value, which is the whole reason they need
// their own path: five separate places tested a filter for completeness by
// asking whether its value was non-empty, and the evaluator discards missing
// rows BEFORE reading the operator at all.
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

// Twenty rows, four of them with no score, two with no site.
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 20; i++)
        rows.push([i % 2 ? 'A' : 'B',
                   (i % 5 === 0) ? '' : String(50 + i),
                   (i === 3 || i === 11) ? '' : (i % 2 ? 'East' : 'West')]);
    window.PS_SHELL.loadTable('gaps', ['group', 'score', 'site'], rows);
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(250);
const kept = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return t.filteredView ? t.filteredView.raw[t.order[0]].length
                          : t.raw[t.order[0]].length;
});
const note = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return window.PS_SHELL.filterSummaryForTest
        ? window.PS_SHELL.filterSummaryForTest()
        : (t.filters || []).map(f => f.col + ' ' + f.op + ' ' + f.value).join(' and ');
});

console.log('case 1: the operator exists and finds the incomplete rows');
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'score', op: 'nul', value: '' }]));
await page.waitForTimeout(800);
ok((await kept()) === 4,
   'four rows have no score and four are kept, got ' + (await kept()));

console.log('case 2: and its complement finds the rest');
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'score', op: 'nnul', value: '' }]));
await page.waitForTimeout(800);
ok((await kept()) === 16,
   'sixteen rows have a score, got ' + (await kept()));

console.log('case 3: a missing row kept by is-missing is not reported as dropped for missingness');
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'score', op: 'nul', value: '' }]));
await page.waitForTimeout(800);
ok((await page.evaluate(() =>
    window.PS_SHELL.project.table.filterMissingDrops)) === 0,
   'the missing-drop disclosure stays at zero, got ' +
   (await page.evaluate(() => window.PS_SHELL.project.table.filterMissingDrops)));

console.log('case 4: it combines with an ordinary condition');
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'site', op: 'nul', value: '' },
     { col: 'group', op: 'eq', value: 'A' }]));
await page.waitForTimeout(800);
// Rows 3 and 11 have no site, and both indexes are odd, so both are group A.
ok((await kept()) === 2,
   'both site-less rows are in group A and both are kept, got ' + (await kept()));
// The complement of that same pair, to prove the AND is really combining.
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'site', op: 'nul', value: '' },
     { col: 'group', op: 'eq', value: 'B' }]));
await page.waitForTimeout(800);
ok((await kept()) === 0,
   'and no group B row is missing a site, got ' + (await kept()));

console.log('case 5: the disclosure reads as English, with no dangling value');
const txt = await page.evaluate(() => {
    const el = document.querySelector('[data-filter-chip], .ps-filter-chip') ||
        document.getElementById('ps-data-filter-btn');
    return (el ? el.textContent : '') + ' | ' +
        (window.PS_SHELL.project.table.filters || [])
            .map(f => f.col + '/' + f.op).join(',');
});
ok(/nul/.test(txt), 'the condition is stored, got ' + JSON.stringify(txt.slice(0, 90)));
// A chart has to exist, or chartNote is empty and this whole case passes for
// the wrong reason.
await page.evaluate(() => {
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'group', yvar: 'score' });
    window.PS_SHELL.setFilters([{ col: 'score', op: 'nul', value: '' }]);
});
await page.waitForTimeout(1200);
const chartNote = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return (p && p.chartNote) || '';
});
ok(/is missing/.test(chartNote),
   'the chart carries the condition in words, got ' +
   JSON.stringify(chartNote.slice(0, 160)));
ok(!/is missing\s*""/.test(chartNote) && !/is missing\s+and/.test(chartNote.replace(/is missing\b(?!\s*")/, 'X')),
   'and not with a dangling empty value after it, got ' +
   JSON.stringify(chartNote.slice(0, 160)));

console.log('case 6: an ordinary filter is untouched');
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'score', op: 'gt', value: 60 }]));
await page.waitForTimeout(800);
const n6 = await kept();
ok(n6 > 0 && n6 < 20,
   'a value filter still works and still drops the missing rows, got ' + n6);
ok((await page.evaluate(() =>
    window.PS_SHELL.project.table.filterMissingDrops)) === 4,
   'and still discloses the four it dropped for missingness, got ' +
   (await page.evaluate(() => window.PS_SHELL.project.table.filterMissingDrops)));

console.log('case 7: the popover offers them and hides the value box');
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(500);
await page.click("#ps-data-filter-btn");
await page.waitForTimeout(500);
const opts = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-filtermenu select'))
    .flatMap(s => Array.from(s.options).map(o => o.textContent.trim())));
ok(opts.some(o => /is missing/.test(o)),
   'is missing is on the operator list, got ' + JSON.stringify(opts.slice(0, 12)));
const hid = await page.evaluate(() => {
    const sels = document.querySelectorAll('#ps-filtermenu select');
    const opSel = Array.from(sels).find(s =>
        Array.from(s.options).some(o => /is missing/.test(o.textContent)));
    opSel.value = 'nul';
    opSel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
});
await page.waitForTimeout(400);
ok(hid && !(await page.evaluate(() => {
        const v = document.querySelector('#ps-filtermenu [data-filter-value]');
        return !!(v && v.offsetParent !== null);
   })), 'and the value box goes away, because it takes no value');

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('MISSING FILTER CHECK: ALL GREEN');
await browser.close();
