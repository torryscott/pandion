// Real-browser check for EXCEL .XLSX IMPORT (Tier 1): the dependency-
// free OOXML parser (shared/inline/rich-text strings, formula caches,
// booleans, error cells, date serials via builtin AND custom number
// formats), the multi-sheet bar in the typed import preview, and the
// full route into the project table + a live chart.
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
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const FIXTURE = path.resolve(new URL('.', import.meta.url).pathname,
    'fixtures', 'import-fixture.xlsx');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(600);
await page.click('#ps-welcome-new');
await page.waitForTimeout(300);
await page.setInputFiles('#ps-file', FIXTURE);
await page.waitForTimeout(900);

// ---- the typed preview opened on sheet 1 with a sheet bar
const preview = await page.evaluate(() => {
    const root = document.getElementById('ps-import-preview');
    const sheets = Array.from(root.querySelectorAll('.ps-import-sheet'))
        .map(b => ({ name: b.textContent.trim(),
                     active: b.classList.contains('ps-import-sheet-active') }));
    const headers = Array.from(root.querySelectorAll('thead th'))
        .map(th => th.childNodes[0] ? th.childNodes[0].textContent : '');
    const types = Array.from(root.querySelectorAll('[data-import-type]'))
        .map(s => s.value);
    const firstRow = Array.from(root.querySelectorAll('tbody tr'))[0];
    return { sheets, headers, types,
             row1: firstRow ? Array.from(firstRow.children).map(td => td.textContent) : null,
             summary: (root.querySelector('.ps-import-summary') || {}).textContent };
});
if (JSON.stringify(preview.sheets.map(s => s.name)) !== '["study","extra"]' ||
    !preview.sheets[0].active)
    throw new Error('sheet bar wrong (empty sheet must be dropped): ' +
                    JSON.stringify(preview.sheets));
console.log('  ok  multi-sheet workbook shows a sheet bar (empty sheet dropped)');
if (JSON.stringify(preview.headers) !== '["group","score","visit","done","note"]')
    throw new Error('headers wrong: ' + JSON.stringify(preview.headers));
if (preview.types[0] !== 'nominal' || preview.types[1] !== 'continuous')
    throw new Error('type inference wrong: ' + JSON.stringify(preview.types));
if (JSON.stringify(preview.row1) !==
    '["Control","61.5","2023-07-01","TRUE","fine"]')
    throw new Error('first row wrong: ' + JSON.stringify(preview.row1));
console.log('  ok  strings, numbers, booleans, and builtin-format dates decode');

// ---- import and check the table end to end
await page.click('#ps-import-use');
await page.waitForTimeout(900);
const table = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return {
        name: t.name, order: t.order,
        rows: t.raw.group.length,
        score3: t.raw.score[2],          // missing cell (absent <c>)
        score4: t.raw.score[3],          // formula cache 62.5
        visit2: t.raw.visit[1],          // custom numFmt date
        visit4: t.raw.visit[3],          // fractional serial -> time kept
        note2: t.raw.note[1],            // tab + quote + newline survived
        note3: t.raw.note[2],            // rich-text shared string
        note4: t.raw.note[3]             // error cell -> missing
    };
});
if (table.rows !== 4 || table.score3 !== '' || table.score4 !== '62.5')
    throw new Error('missing/formula cells wrong: ' + JSON.stringify(table));
if (table.visit2 !== '2023-07-02' || table.visit4 !== '2023-07-04 12:00:00')
    throw new Error('date decoding wrong: ' + JSON.stringify(table));
if (table.note2 !== 'has\ttab and "quote"\nline2')
    throw new Error('TSV quoting lost cell content: ' + JSON.stringify(table.note2));
if (table.note3 !== 'rich text' || table.note4 !== '')
    throw new Error('rich-text / error cells wrong: ' + JSON.stringify(table));
console.log('  ok  imported table keeps formulas-as-values, dates, rich text, and quoting');

// ---- the imported data drives a chart
await page.evaluate(() => {
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'group', yvar: 'score' });
    window.PS_SHELL.setModule('plotbuilder');
});
await page.waitForTimeout(600);
const chart = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return { cells: p.bars.length, cats: p.xCategories };
});
if (chart.cells !== 2 ||
    JSON.stringify(chart.cats) !== '["Control","Treatment"]')
    throw new Error('imported xlsx did not draw: ' + JSON.stringify(chart));
console.log('  ok  the imported workbook draws a chart end to end');

// ---- switching sheets re-previews the other sheet
await page.click('#ps-welcome-new').catch(() => {});
await page.evaluate(() => window.PS_SHELL.showCommandPalette && null);
await page.click('#ps-load');
await page.waitForTimeout(250);
await page.setInputFiles('#ps-file', FIXTURE);
await page.waitForTimeout(900);
await page.click('.ps-import-sheet >> nth=1');
await page.waitForTimeout(400);
const sheet2 = await page.evaluate(() => {
    const root = document.getElementById('ps-import-preview');
    return {
        headers: Array.from(root.querySelectorAll('thead th'))
            .map(th => th.childNodes[0] ? th.childNodes[0].textContent : ''),
        active: Array.from(root.querySelectorAll('.ps-import-sheet'))
            .map(b => b.classList.contains('ps-import-sheet-active'))
    };
});
if (JSON.stringify(sheet2.headers) !== '["id","v"]' ||
    JSON.stringify(sheet2.active) !== '[false,true]')
    throw new Error('sheet switch failed: ' + JSON.stringify(sheet2));
console.log('  ok  the sheet bar switches the preview between worksheets');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('XLSX IMPORT CHECK: ALL GREEN');
