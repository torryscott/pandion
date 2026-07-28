// Punch list item 10: import failures blame the wrong thing.
//
// parseTableText returned a bare null for several genuinely different
// failures, all surfaced as one sentence about the delimiter and first-row
// settings; readPickedFile sniffed only .xlsx and .omv, so a dropped PNG was
// read as text and previewed as binary noise with type dropdowns over it; no
// FileReader had an onerror; and every "could not read" message was WIPED on
// the way in, because it was set before openLoader() reset the preview.
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
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(200);
}

// Drop a file on the document exactly as the app's own handler receives it.
async function drop(name, bytes, type) {
    await page.evaluate(async ({ name, bytes, type }) => {
        const file = new File([new Uint8Array(bytes)], name,
            { type: type || 'application/octet-stream' });
        const dt = new DataTransfer();
        dt.items.add(file);
        document.dispatchEvent(new DragEvent('drop',
            { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { name, bytes, type });
    await page.waitForTimeout(500);
}
const bytesOf = s => Array.from(s).map(c => c.charCodeAt(0));
const msg = () => page.evaluate(() =>
    document.getElementById('ps-loader-msg').textContent.trim());
const previewShown = () => page.evaluate(() => {
    const p = document.getElementById('ps-import-preview');
    return p.style.display !== 'none' && p.querySelectorAll('td').length > 0;
});
async function reset() {
    await page.evaluate(() => {
        document.getElementById('ps-loader').style.display = 'none';
        document.getElementById('ps-loader-msg').textContent = '';
    });
}

// ---- 1. a binary is refused by name, not previewed as noise ----
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
             0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 1, 0, 0, 0, 1, 0, 8, 6, 0, 0, 0];
await drop('logo.png', png.concat(png, png, png), 'image/png');
let m = await msg();
if (!/PNG image/i.test(m) || !/not a data file/i.test(m))
    throw new Error('a dropped PNG did not say what it was: "' + m + '"');
if (await previewShown())
    throw new Error('a dropped PNG still rendered an import preview');
console.log('  ok  a dropped image is named and refused, not previewed as noise');
await reset();

// ---- 2. an unlabelled binary is caught by content ----
const noise = [];
for (let i = 0; i < 900; i++) noise.push((i * 37) % 256);
await drop('mystery', noise, '');
m = await msg();
if (!/does not look like text data/i.test(m))
    throw new Error('an extensionless binary was not caught by content: "' + m + '"');
if (await previewShown())
    throw new Error('an extensionless binary still rendered an import preview');
console.log('  ok  a binary with no useful extension is caught by its contents');
await reset();

// ---- 3. the three parse failures say three different things ----
const cases = [
    ['empty.csv', '\n\n   \n\n', /nothing to read/i, 'a file with no content'],
    ['headeronly.csv', 'age,score,group\n', /First row/i, 'a header with no data'],
    ['oneline.csv', 'justonevalue\n', /delimiter/i, 'a single lone value']
];
const seen = new Set();
for (const [name, text, expect, label] of cases) {
    await drop(name, bytesOf(text), 'text/csv');
    m = await msg();
    if (!expect.test(m))
        throw new Error(label + ' reported "' + m + '"');
    if (/delimiter and first-row settings/.test(m))
        throw new Error(label + ' still fell back to the generic message');
    seen.add(m);
    await reset();
}
if (seen.size !== 3)
    throw new Error('the three parse failures did not produce three messages: ' +
                    JSON.stringify([...seen]));
console.log('  ok  the distinct parse failures each explain themselves');

// ---- 4. a damaged project file is not blamed on the delimiter ----
// Both halves: one that still LOOKS like JSON, and one truncated so badly it
// no longer opens with a brace - the second is the only case the file-name
// guard covers, and testing only the first passes with that guard removed.
for (const [name, body, label] of [
    ['study.pand', '{"kind":"something-else","project":', 'a .pand with wrong contents'],
    ['study2.pand', 'ct":{"charts":[]}},"formatVersion":2}', 'a truncated .pand']
]) {
    await drop(name, bytesOf(body), 'application/json');
    m = await msg();
    if (!/Pandion project/i.test(m) || /delimiter/i.test(m))
        throw new Error(label + ' was blamed on the CSV settings: "' + m + '"');
    await reset();
}
console.log('  ok  a damaged project file is reported as a project file');

// ---- 5. a real .omv failure actually reaches the screen ----
// (the message used to be set and then wiped by openLoader's reset)
await drop('broken.omv', bytesOf('not a zip at all'), '');
m = await msg();
if (!/\.omv/i.test(m))
    throw new Error('an unreadable .omv left the loader blank: "' + m + '"');
console.log('  ok  an unreadable .omv says so instead of opening a blank loader');
await reset();

// ---- 6. a good CSV is untouched by any of this ----
await drop('scores.csv', bytesOf('group,score\na,1\nb,2\nc,3\n'), 'text/csv');
if (!(await previewShown()))
    throw new Error('a valid CSV no longer previews');
if (await msg())
    throw new Error('a valid CSV reported an error: "' + (await msg()) + '"');
const cols = await page.evaluate(() =>
    document.querySelectorAll('#ps-import-preview th').length);
if (cols !== 2)
    throw new Error('the valid CSV preview shows ' + cols + ' columns, expected 2');
console.log('  ok  a valid CSV still previews exactly as before');

// ---- B19 / B20: the import discloses what it changed about the file ----
const summary = () => page.evaluate(() => {
    const el = document.querySelector('#ps-import-preview .ps-import-summary');
    return el ? el.textContent : '';
});
const headers = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-import-preview th')).map(
        n => n.firstChild ? n.firstChild.textContent : ''));

await reset();
await drop('spacers.csv', bytesOf(
    'group,score\na,1\n\n\nb,2\n   \nc,3\n'), 'text/csv');
let sm = await summary();
if (!/3 rows/.test(sm))
    throw new Error('the blank rows were not excluded from the count: "' + sm + '"');
if (!/blank rows skipped/i.test(sm))
    throw new Error('blank rows were dropped with no disclosure: "' + sm + '"');
console.log('  ok  skipped blank rows are counted and disclosed');
await reset();

await drop('dupes.csv', bytesOf('score,,score,\n1,a,2,b\n3,c,4,d\n'), 'text/csv');
const hs = await headers();
if (hs.join('|') !== 'score|V2|score_2|V4')
    throw new Error('the preview shows pre-rename names: ' + JSON.stringify(hs));
sm = await summary();
if (!/had no name/i.test(sm) || !/made unique/i.test(sm))
    throw new Error('renamed columns were not disclosed: "' + sm + '"');
if (!/score \u2192 score_2/.test(sm))
    throw new Error('the disclosure does not say what became what: "' + sm + '"');
console.log('  ok  blank and duplicate column names are shown and explained');

// The names the preview promised are the names the table actually gets.
await page.click('#ps-import-use');
await page.waitForTimeout(500);
const tableCols = await page.evaluate(() => window.PS_SHELL.project.table.order);
if (tableCols.join('|') !== 'score|V2|score_2|V4')
    throw new Error('the imported table disagrees with its own preview: ' +
                    JSON.stringify(tableCols));
console.log('  ok  the imported table carries exactly the previewed names');

// B19's worse half: .omv and .xlsx key types and levels by the ORIGINAL
// field name while the lookup used the DEDUPED one, so a duplicate-named
// jamovi factor arrived with an inferred type and first-seen levels. The
// values here would infer CONTINUOUS, so an inferred type is distinguishable
// from the declared one.
const typed = await page.evaluate(() => {
    window.PS_SHELL.loadTable('dupe types', ['score', 'score'],
        [['1', '5'], ['2', '7'], ['3', '9']],
        { score: 'nominal' }, { score: ['5', '7', '9'] });
    const t = window.PS_SHELL.project.table;
    return { order: t.order, types: t.types,
             levels: t.declaredLevels && t.declaredLevels['score_2'] };
});
if (typed.order.join('|') !== 'score|score_2')
    throw new Error('setup: the duplicate name was not deduped: ' +
                    JSON.stringify(typed.order));
if (typed.types.score_2 !== 'nominal')
    throw new Error('a declared type keyed by the original name was lost on ' +
                    'the deduped column (got ' + typed.types.score_2 + ')');
if (!typed.levels || typed.levels.join('|') !== '5|7|9')
    throw new Error('declared levels were lost on the deduped column: ' +
                    JSON.stringify(typed.levels));
console.log('  ok  declared types and levels survive a deduped column name');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('IMPORT ERRORS CHECK PASS');
await browser.close();
