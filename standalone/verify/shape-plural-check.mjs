// One row is "1 row", on every surface that reports a dataset's shape.
//
// The singular branch was written inline at five places in ps-shell.js and
// MISSING at eight others, so a one-row import read "1 rows x 2 columns"
// in the command bar while the grid's own selection readout, one line
// below the grid's shape line, correctly said "1 row". The disagreement
// was visible inside a single rendered footer.
//
// The eight now share shapeText(), so the next surface that reports a
// shape cannot get it wrong. This pins the singular on the four a user
// actually reads, and pins that the plural still works.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1700);

const paste = async (text) => {
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button'))
            .find(x => /^\s*Open\s*$/.test(x.textContent) &&
                       x.getBoundingClientRect().width > 0);
        b.click();
    });
    await page.waitForTimeout(500);
    await page.fill('#ps-paste', text);
    await page.click('#ps-paste-use');
    await page.waitForTimeout(700);
    const preview = await page.evaluate(() =>
        (document.querySelector('.ps-import-summary') || {}).textContent || '');
    await page.click('button:has-text("Import data")');
    await page.waitForTimeout(1700);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(900);
    const rest = await page.evaluate(() => ({
        commandBar: (document.getElementById('ps-datainfo') || {}).textContent || '',
        statusCtx: (document.getElementById('ps-status-context') || {}).textContent || '',
        gridShape: (document.querySelector('.ps-grid-shape') || {}).textContent || ''
    }));
    return Object.assign({ preview }, rest);
};

console.log('case 1: one row, one column');
const one = await paste('group\nA\n');
for (const [where, text] of Object.entries(one)) {
    ok(/\b1 row\b/.test(text) && !/\b1 rows\b/.test(text),
       `${where} says "1 row" ("${text.trim()}")`);
    ok(/\b1 column\b/.test(text) && !/\b1 columns\b/.test(text),
       `${where} says "1 column"`);
}

console.log('case 2: the plural still works');
const many = await paste('group,score\nA,1\nB,2\nC,3\n');
for (const [where, text] of Object.entries(many)) {
    ok(/\b3 rows\b/.test(text) && /\b2 columns\b/.test(text),
       `${where} says "3 rows" and "2 columns" ("${text.trim()}")`);
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SHAPE PLURAL: PASS');
await browser.close();
