// Real-browser check for ROW FILTERS (Tier 1): AND-combined dataset
// conditions; failing rows stay VISIBLE in the grid (dimmed) but leave
// every chart; builders consume a row-subset view so counts, levels,
// and missing notes stay truthful; disclosure rides the chart note and
// the command-bar chip; filters are undoable and persist through
// reload and .pand round trips.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

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
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(600);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1000);

// Baseline: 24 rows, 3 bars.
const before = await page.evaluate(() => ({
    bars: window.PS_SHELL.buildPayload().bars.length,
    n: window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0)
}));
if (before.n !== 24) throw new Error('baseline wrong: ' + JSON.stringify(before));

// ---- build "score >= 60 AND site = East" through the REAL popover
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(500);
await page.click('#ps-data-filter-btn');
await page.waitForTimeout(300);
await page.selectOption('#ps-filtermenu [data-filter-col="0"]', 'score');
await page.waitForTimeout(150);
await page.selectOption('#ps-filtermenu [data-filter-op="0"]', 'ge');
await page.fill('#ps-filtermenu input[data-filter-value="0"]', '60');
await page.waitForTimeout(200);
await page.click('#ps-filtermenu >> text=+ Add condition');
await page.waitForTimeout(200);
await page.selectOption('#ps-filtermenu [data-filter-col="1"]', 'site');
await page.waitForTimeout(150);
await page.selectOption('#ps-filtermenu select[data-filter-value="1"]', 'East');
await page.waitForTimeout(250);
const previewCount = await page.evaluate(() =>
    (document.querySelector('[data-filter-count]') || {}).textContent);
if (!/showing \d+ of 24 rows/.test(previewCount || ''))
    throw new Error('no live preview count: ' + previewCount);
console.log('  ok  the popover builds conditions with a live row-count preview');
await page.click('[data-filter-apply]');
await page.waitForTimeout(700);

// ---- grid dims the failing rows but keeps them visible
const grid = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const dimmed = document.querySelectorAll(
        '#ps-datagrid td.ps-grid-row-filtered').length;
    const rows = document.querySelectorAll('#ps-datagrid tbody tr').length;
    const kept = t.filterMask.filter(x => !x).length;
    return { dimmed, rows, kept, total: t.filterMask.length,
             chip: document.getElementById('ps-data-filter-btn').textContent };
});
if (grid.rows !== 24 || grid.dimmed === 0)
    throw new Error('rows must stay visible and dim: ' + JSON.stringify(grid));
if (grid.kept + (grid.dimmed / 4) !== 24)   // 4 data columns per row
    throw new Error('dim count mismatch: ' + JSON.stringify(grid));
if (!new RegExp('Filter · ' + grid.kept + ' of 24').test(grid.chip))
    throw new Error('command-bar chip wrong: ' + grid.chip);
console.log('  ok  failing rows stay in the grid, dimmed, with a live chip (' +
            grid.kept + ' of 24 kept)');

// ---- charts consume only the kept rows, with disclosure
await page.click('[data-ps-workspace="chart"]');
await page.waitForTimeout(700);
const filtered = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return {
        n: p.bars.reduce((a, b) => a + b.n, 0),
        // B7. The disclosure used to ride payload.missingNote, which the
        // engine renders as a DISMISSIBLE HTML pill outside the svg, so no
        // export, snapshot or copy ever carried it. It now lives in
        // chartNote, inside the figure - so this checks the stronger thing:
        // the sentence is really drawn in the svg the exporter serializes.
        note: p.chartNote,
        inSvg: (function () {
            var svgs = Array.prototype.slice.call(
                document.querySelectorAll('#psroot svg'));
            svgs.sort(function (x, y) {
                return (y.clientWidth * y.clientHeight) -
                       (x.clientWidth * x.clientHeight);
            });
            if (!svgs[0]) return '';
            return Array.prototype.map.call(svgs[0].querySelectorAll('text'),
                function (t) { return t.textContent; }).join(' ');
        })(),
        allEast: p.bars.every(b => b.n > 0)
    };
});
const expectKept = grid.kept;
if (filtered.n !== expectKept)
    throw new Error('chart n must equal kept rows: ' + JSON.stringify(filtered) +
                    ' vs kept ' + expectKept);
if (!/Filter: score ≥ 60 and site = "East" · showing \d+ of 24 rows/
    .test(filtered.note || ''))
    throw new Error('chart filter disclosure wrong: ' + filtered.note);
if (!/Filter: score/.test(filtered.inSvg || ''))
    throw new Error('the filter disclosure is not drawn inside the svg, so no ' +
                    'export or snapshot would carry it: ' + filtered.inSvg);
console.log('  ok  charts use only kept rows and disclose the filter IN the ' +
            'figure (' + filtered.note + ')');

// ---- undo restores the unfiltered state; redo reapplies
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(400);
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(500);
const undone = await page.evaluate(() => ({
    filters: (window.PS_SHELL.project.table.filters || []).length,
    n: window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0)
}));
if (undone.filters !== 0 || undone.n !== 24)
    throw new Error('undo did not clear the filter: ' + JSON.stringify(undone));
await page.keyboard.press('ControlOrMeta+Shift+z');
await page.waitForTimeout(500);
if ((await page.evaluate(() =>
    window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0))) !== expectKept)
    throw new Error('redo did not reapply the filter');
console.log('  ok  filters ride the Data undo/redo history');

// ---- persists through reload
await page.reload();
await page.waitForTimeout(900);
const reloaded = await page.evaluate(() => ({
    filters: (window.PS_SHELL.project.table.filters || []).length,
    n: window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0)
}));
if (reloaded.filters !== 2 || reloaded.n !== expectKept)
    throw new Error('filter lost on reload: ' + JSON.stringify(reloaded));
console.log('  ok  filters survive a reload');

// ---- rides .pand into a fresh session
const fileText = await page.evaluate(() => window.PS_SHELL.projectFileText());
const tmp = '/tmp/ps-row-filters.pand';
fs.writeFileSync(tmp, fileText);
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(PAGE);
await page2.waitForTimeout(500);
await page2.click('#ps-welcome-new');
await page2.waitForTimeout(250);
await page2.setInputFiles('#ps-file', tmp);
await page2.waitForTimeout(900);
const pand = await page2.evaluate(() => ({
    filters: (window.PS_SHELL.project.table.filters || []).length,
    n: window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0)
}));
if (pand.filters !== 2 || pand.n !== expectKept)
    throw new Error('.pand did not carry the filter: ' + JSON.stringify(pand));
console.log('  ok  filters ride .pand project files');
await ctx2.close();

// ---- renaming the filtered variable follows; deleting it drops the condition
await page.evaluate(() => {
    const shell = window.PS_SHELL;
    shell.project.table.filters = [{ col: 'score', op: 'ge', value: 60 }];
});
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(400);
const renamed = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    // through the real rename path used by the inspector
    window.PS_SHELL.selectVariable && window.PS_SHELL.selectVariable('score');
    const before = JSON.stringify(t.filters);
    return { before };
});
await page.evaluate(() => {
    // rename via the inspector field path
    const input = document.getElementById('ps-variable-name');
    input.value = 'points';
    input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
const afterRename = await page.evaluate(() => ({
    cols: window.PS_SHELL.project.table.order.indexOf('points') !== -1,
    filterCol: (window.PS_SHELL.project.table.filters[0] || {}).col
}));
if (afterRename.cols && afterRename.filterCol !== 'points')
    throw new Error('rename did not follow into the filter: ' +
                    JSON.stringify(afterRename));
console.log('  ok  renaming a variable follows into its filter condition');
await page.evaluate(() => window.PS_SHELL.deleteVariable('points'));
await page.waitForTimeout(400);
const afterDelete = await page.evaluate(() => ({
    filters: window.PS_SHELL.project.table.filters.length,
    mask: window.PS_SHELL.project.table.filterMask
}));
if (afterDelete.filters !== 0 || afterDelete.mask !== null)
    throw new Error('delete did not drop the condition: ' +
                    JSON.stringify(afterDelete));
console.log('  ok  deleting a variable drops its filter condition');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('ROW FILTERS CHECK: ALL GREEN');
