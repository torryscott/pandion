// A numeric missing-value CODE is a silently wrong number.
//
// The audit that decides a column's measure type (numericAudit) reports the
// values that could not be read as numbers, and the variable advice card
// offers to treat those as missing. A sentinel like -99 reads as a number
// perfectly well, so it passes every gate: bad === 0, numeric === true, the
// column types Continuous, and the value is averaged. On a 24-row column of
// minutes with two rows coded -99 the app printed a mean of 36.3 where the
// truth was 48.5, a 25 percent error, with nothing anywhere saying so.
//
// The evidence was already on screen and unconnected. The inspector shows
// "Min -99" two rows above "Mean 36.3", and the per-column missing field
// underneath both carries the placeholder "such as -99 for an age". This
// probe pins the connection: the app notices the code, names it, offers the
// one-click fix that the placeholder was describing, and stays silent on
// legitimate extremes.
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

// A column of minutes, three groups, with two rows coded -99 for "not
// recorded". Every value parses as a number, so nothing in the type audit
// has anything to report.
async function loadSentinel() {
    await page.evaluate(() => {
        const rows = [], groups = ['Control', 'Low dose', 'High dose'];
        for (let g = 0; g < 3; g++)
            for (let i = 0; i < 8; i++)
                rows.push([groups[g], String(30 + g * 15 + i)]);
        rows[3][1] = '-99';
        rows[19][1] = '-99';
        window.PS_SHELL.loadTable('codes', ['condition', 'minutes'], rows);
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.PS_SHELL.selectVariable('minutes'));
    await page.waitForTimeout(400);
}
const adviceText = () => page.evaluate(() => {
    const s = document.getElementById('ps-variable-advice-section');
    if (!s || s.style.display === 'none') return '';
    return (document.getElementById('ps-variable-advice') || {}).innerText || '';
});
const adviceActs = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-variable-advice [data-advice]'))
    .map(b => b.getAttribute('data-advice') + '|' + b.textContent.trim()));
const meanOf = col => page.evaluate(c => {
    const v = (window.PS_SHELL.project.table.columns[c] || [])
        .filter(x => typeof x === 'number' && isFinite(x));
    return Math.round(v.reduce((a, b) => a + b, 0) / v.length * 1000) / 1000;
}, col);

console.log('case 1: the code is noticed and named');
await loadSentinel();
ok((await meanOf('minutes')) === 36.25,
   'before the fix the mean carries the code (36.25)');
const txt = await adviceText();
ok(/-99/.test(txt),
   'the advice names the code itself, not just "some values": ' +
   JSON.stringify(txt.slice(0, 200)));
ok(/2 /.test(txt) || /two/i.test(txt),
   'the advice says how many rows carry it: ' + JSON.stringify(txt.slice(0, 200)));
const acts = await adviceActs();
ok(acts.some(a => a.startsWith('advice-code-missing')),
   'a one-click "treat as missing" action is offered, got ' + JSON.stringify(acts));

console.log('case 2: the one-click fix corrects the number');
await page.evaluate(() => {
    document.querySelector('#ps-variable-advice [data-advice="advice-code-missing"]').click();
});
await page.waitForTimeout(700);
ok((await meanOf('minutes')) === 48.545,
   'after the fix the mean is the complete-case mean (48.545), got ' +
   (await meanOf('minutes')));
const perCol = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return JSON.stringify((t.missingTokensByCol || {}).minutes || null);
});
ok(perCol === '["-99"]',
   'the code is written to the PER-COLUMN list, not the dataset one, got ' + perCol);
const dsList = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.project.table.missingTokens));
ok(!/-99/.test(dsList),
   'the dataset-wide list is left alone, got ' + dsList);
ok((await adviceText()) === '' || !/-99/.test(await adviceText()),
   'the advice stands down once the code is handled');

console.log('case 3: one undo puts it back');
await page.keyboard.press(
    (process.platform === 'darwin' ? 'Meta' : 'Control') + '+z');
await page.waitForTimeout(700);
ok((await meanOf('minutes')) === 36.25,
   'undo restores the previous state, got ' + (await meanOf('minutes')));

console.log('case 4: legitimate extremes stay silent');
// 99 inside a 55..91 score range is a plausible score, not a code.
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 24; i++) rows.push(['g', String(55 + (i % 37))]);
    rows[5][1] = '99';
    window.PS_SHELL.loadTable('plain', ['g', 'score'], rows);
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.selectVariable('score'));
await page.waitForTimeout(400);
ok(!/99/.test(await adviceText()),
   'a 99 that sits inside the data is not called a code, got ' +
   JSON.stringify((await adviceText()).slice(0, 160)));

// A temperature column with real negatives must never be touched.
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 24; i++) rows.push(['g', String(-20 + i * 2)]);
    window.PS_SHELL.loadTable('temps', ['g', 'degrees'], rows);
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.selectVariable('degrees'));
await page.waitForTimeout(400);
ok((await adviceText()) === '',
   'real negative measurements are not flagged, got ' +
   JSON.stringify(await adviceText()));

// The shipped example datasets must be silent, or the card is noise.
// Every shipped example, by the ids the app actually reports. Hard-coding a
// guessed list and skipping the misses would have covered one dataset and
// reported three.
const exampleIds = await page.evaluate(() =>
    window.PS_SHELL.examples().map(e => e.id));
ok(exampleIds.length >= 3,
   'all shipped examples are under test, got ' + JSON.stringify(exampleIds));
for (const ex of exampleIds) {
    await page.evaluate(id => window.PS_SHELL.loadSample(id), ex);
    await page.waitForTimeout(900);
    // Loading an example lands in Charts, and the advice card lives on the
    // Data inspector; without this every assertion below would read a hidden
    // panel and pass for the wrong reason.
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(300);
    const cols = await page.evaluate(() => window.PS_SHELL.project.table.order.slice());
    for (const c of cols) {
        await page.evaluate(cc => window.PS_SHELL.selectVariable(cc), c);
        await page.waitForTimeout(180);
        const a = await adviceText();
        ok(!/looks like a missing-value code/.test(a),
           'example ' + ex + ' column ' + c + ' is not flagged');
    }
}

console.log('case 5: several codes in one column are handled together');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 24; i++) rows.push(['g', String(30 + i)]);
    rows[2][1] = '-99';
    rows[7][1] = '-88';
    window.PS_SHELL.loadTable('two', ['g', 'v'], rows);
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.selectVariable('v'));
await page.waitForTimeout(400);
const t2 = await adviceText();
ok(/-99/.test(t2) && /-88/.test(t2),
   'both codes are named, got ' + JSON.stringify(t2.slice(0, 200)));

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('MISSING CODES CHECK: ALL GREEN');
await browser.close();
