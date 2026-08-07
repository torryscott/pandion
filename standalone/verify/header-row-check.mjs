// A real export puts a title and a generated-on line above the header row,
// and the import dialog had no way to say so. "First row" offers exactly two
// answers, Variable names and Data values, and parseTableText took row one or
// nothing at all, so a file with two preamble lines imported as five columns
// called "Wellbeing pilot study - export", V2, V3, V4 and V5, with the real
// names sitting in the table as a data row. There is no promote-row-to-header
// command anywhere, so the only way out was to leave the app, edit the file
// and come back.
//
// The evidence was already being computed and thrown away. The preview warns
// "2 variables hold text in otherwise numeric columns, e.g. score in row 2",
// and the text it names IS the misplaced header. This probe pins that the app
// says so, offers the row it found, and stays quiet on an ordinary file.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-header-'));
const messy = path.join(tmp, 'messy.csv');
fs.writeFileSync(messy,
    'Wellbeing pilot study - export\n' +
    'Generated 03/06/2026 by LabTracker v2.1\n' +
    '\n' +
    'participant,group,visit_date,score,minutes\n' +
    ['P001,Control,2026-06-03,61,31.5',
     'P002,Control,2026-06-04,55,28.0',
     'P003,Low dose,2026-06-05,70,33.2',
     'P004,Low dose,2026-06-06,74,29.9',
     'P005,High dose,2026-06-07,82,44.1',
     'P006,High dose,2026-06-08,88,41.8'].join('\n') + '\n');
const clean = path.join(tmp, 'clean.csv');
fs.writeFileSync(clean,
    'participant,group,score\nP001,Control,61\nP002,Low dose,70\nP003,High dose,82\n');
const alltext = path.join(tmp, 'alltext.csv');
fs.writeFileSync(alltext,
    'who,where,what\nana,east,red\nbo,west,blue\ncy,east,green\ndi,west,red\n');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-open');
    await page.waitForTimeout(400);
}
const previewText = () => page.evaluate(() =>
    (document.getElementById('ps-import-preview') || {}).innerText || '');
const headerNames = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-import-preview thead th'))
    .map(th => th.childNodes[0] ? String(th.childNodes[0].textContent).trim() : ''));
async function pick(file) {
    await page.evaluate(() => { window.PS_SHELL.openLoader(); });
    await page.waitForTimeout(250);
    await page.setInputFiles('#ps-file', file);
    await page.waitForTimeout(800);
}

console.log('case 1: the misplaced header is found and named');
await pick(messy);
ok((await headerNames())[0] === 'Wellbeing pilot study - export',
   'without the offer the first column is still named after the title line');
const notice = await page.evaluate(() => {
    const n = document.querySelector('[data-role="header-guess"]');
    return n ? n.innerText : '';
});
ok(/participant/.test(notice),
   'the notice quotes the row it found, got ' + JSON.stringify(notice));
ok(/minutes/.test(notice) || /…/.test(notice) || /and \d+ more/.test(notice),
   'the notice shows enough of the row to recognise it, got ' + JSON.stringify(notice));
const btn = await page.evaluate(() =>
    !!document.querySelector('[data-role="header-guess"] button[data-header-use]'));
ok(btn, 'a one-click action is offered');

console.log('case 2: taking the offer re-reads the file');
await page.click('[data-role="header-guess"] button[data-header-use]');
await page.waitForTimeout(700);
const names = await headerNames();
ok(JSON.stringify(names) ===
   JSON.stringify(['participant', 'group', 'visit_date', 'score', 'minutes']),
   'the columns take the real names, got ' + JSON.stringify(names));
ok(/6 rows/.test(await previewText()),
   'the preamble rows are gone from the count, got ' +
   JSON.stringify((await previewText()).slice(0, 90)));
ok(!/text in an otherwise numeric/.test(await previewText()),
   'the text-in-numeric warning the misplaced header caused has cleared');

console.log('case 3: the import carries it through');
await page.click('#ps-import-use');
await page.waitForTimeout(1100);
const table = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { order: t.order.slice(), rows: t.raw[t.order[0]].length,
             types: t.order.map(c => t.types[c]) };
});
ok(JSON.stringify(table.order) ===
   JSON.stringify(['participant', 'group', 'visit_date', 'score', 'minutes']),
   'the imported table carries the previewed names, got ' + JSON.stringify(table.order));
ok(table.rows === 6, 'six data rows, got ' + table.rows);
ok(table.types[3] === 'continuous' && table.types[4] === 'continuous',
   'score and minutes type as measurements, got ' + JSON.stringify(table.types));

console.log('case 4: an ordinary file is left alone');
await pick(clean);
ok((await page.evaluate(() =>
       !!document.querySelector('[data-role="header-guess"]'))) === false,
   'a header already on row one produces no notice');
ok(JSON.stringify(await headerNames()) ===
   JSON.stringify(['participant', 'group', 'score']),
   'and reads exactly as before');

console.log('case 5: an all-text table is left alone');
await pick(alltext);
ok((await page.evaluate(() =>
       !!document.querySelector('[data-role="header-guess"]'))) === false,
   'every row being text is not evidence of a misplaced header');

console.log('case 6: the offer stands down when the user says there is no header');
await pick(messy);
ok(await page.evaluate(() =>
       !!document.querySelector('[data-role="header-guess"]')),
   'the notice is there to begin with');
await page.selectOption('#ps-import-header', 'no');
await page.waitForTimeout(700);
ok((await page.evaluate(() =>
       !!document.querySelector('[data-role="header-guess"]'))) === false,
   'reading the first row as data withdraws the offer');

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('HEADER ROW CHECK: ALL GREEN');
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
