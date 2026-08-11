// The computed-variable BUILDER (Aug 2026, Torry: "if someone wanted to
// make a new computed variable that was the average of two existing
// columns, I could see someone really struggling with that").
//
// Two halves, one law. The Combine-columns recipes (Average, Sum,
// Difference, Percent change, Reverse-score) open an inline picker and
// WRITE the formula into the visible box as choices are made; the
// functions browser replaces the uppercase reference wall. The law is
// that the box is the truth: pickers only ever write it, hand-editing
// it dismisses them, and there is no second grammar to maintain.
//
// This probe also owns the MIGRATION contract: a version-3 project
// whose formulas were written under the old vocabulary (MEAN as the
// column aggregate) must load with its formulas rewritten to the
// V-forms and its NUMBERS unchanged. Under the new engine an
// unmigrated MEAN(score) is an arity error, so a broken migration
// blanks the column - which is exactly what the control run proves
// this probe catches.
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
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
// A battery a student would actually score: three 1-5 items (q2 has a
// hole), a pre/post pair, and a label column that must never appear in
// a numeric picker.
await page.evaluate(() => {
    window.PS_SHELL.loadTable('recipes',
        ['person', 'q1', 'q2', 'q3', 'pre', 'post'],
        [['a', '4', '3', '5', '10', '14'],
         ['b', '2', '', '1', '15', '18'],
         ['c', '5', '4', '4', '9', '12']],
        { person: 'nominal', q1: 'continuous', q2: 'continuous',
          q3: 'continuous', pre: 'continuous', post: 'continuous' });
    window.PS_SHELL.setWorkspace('data');
});
await page.waitForTimeout(500);

const read = () => page.evaluate(() => ({
    formula: document.getElementById('ps-formula-input').value,
    name: document.getElementById('ps-formula-name').value,
    pickerOpen: !document.getElementById('ps-formula-picker').hidden,
    res: Array.from(document.querySelectorAll(
        '#ps-formula-preview td.ps-fprev-res')).map(n => n.textContent),
    heads: Array.from(document.querySelectorAll(
        '#ps-formula-preview th')).map(n => n.textContent)
}));

console.log('case 1: Average writes MEAN into the visible box');
await page.evaluate(() => window.PS_SHELL.runCommand('data-compute'));
await page.waitForTimeout(500);
await page.click('[data-formula-recipe="avg"]');
await page.waitForTimeout(300);
let st = await read();
ok(st.formula === 'MEAN(q1, q2)' && st.pickerOpen,
   'clicking Average opens the picker and writes MEAN of the first two ' +
   'numeric columns: ' + st.formula);
ok(st.heads.length === 3 && st.heads[0] === 'q1' && st.heads[1] === 'q2',
   'the preview shows the INPUT columns beside the result, so row-by-row ' +
   'is visible');
const chipCols = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-fpk-col]'))
        .map(b => b.getAttribute('data-fpk-col')));
ok(String(chipCols) === 'q1,q2,q3,pre,post',
   'the chips offer every numeric column and never the label column');

console.log('case 2: ticking a third column grows the formula');
await page.click('[data-fpk-col="q3"]');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === 'MEAN(q1, q2, q3)',
   'the formula follows the ticks: ' + st.formula);
// Hand-computed from the fixture: row a (4+3+5)/3=4, row b has a hole
// in q2 so it is missing, row c (5+4+4)/3=4.33...
ok(String(st.res) === '4,—,4.33333',
   'the preview values are exact, and the hole in q2 visibly costs row ' +
   'b its score: ' + st.res);

console.log('case 3: the missing-data decision is visible and disclosed');
await page.click('#ps-fpk-miss');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === 'MEAN(q1, q2, q3, ignore_missing = 1)',
   'ticking the box writes the jamovi named argument: ' + st.formula);
ok(String(st.res) === '4,1.5,4.33333',
   'and row b is now scored from the items it has ((2+1)/2 = 1.5)');
const hint = await page.evaluate(() =>
    document.querySelector('.ps-fpk-hint').textContent);
ok(/Say so in your write-up/.test(hint),
   'the hint states the choice just made and nudges the disclosure');

console.log('case 4: the saved column carries the recipe numbers');
const savedName = st.name;
await page.click('#ps-formula-save');
await page.waitForTimeout(700);
const saved = await page.evaluate((nm) => {
    const t = window.PS_SHELL.project.table;
    return { formula: t.computed[nm], vals: t.columns[nm],
             err: t.computedErrors ? t.computedErrors[nm] : null };
}, savedName);
ok(!saved.err && saved.formula === 'MEAN(q1, q2, q3, ignore_missing = 1)',
   'the stored formula is exactly what the box showed');
ok(Math.abs(saved.vals[0] - 4) < 1e-9 &&
   Math.abs(saved.vals[1] - 1.5) < 1e-9 &&
   Math.abs(saved.vals[2] - 13 / 3) < 1e-9,
   'and the column computes the hand-checked scale scores');

console.log('case 5: Difference and Percent change ride two selects');
await page.evaluate(() => window.PS_SHELL.runCommand('data-compute'));
await page.waitForTimeout(500);
await page.click('[data-formula-recipe="diff"]');
await page.waitForTimeout(300);
// The selects default to the first two numerics; point them at the
// pre/post pair the way a user would.
await page.evaluate(() => {
    const sels = document.querySelectorAll('.ps-fpk-row select');
    sels[0].value = 'post';
    sels[0].dispatchEvent(new Event('change', { bubbles: true }));
    sels[1].value = 'pre';
    sels[1].dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(250);
st = await read();
ok(st.formula === 'post - pre' && st.name === 'post_change',
   'Difference writes after minus before and names the column: ' +
   st.formula);
ok(String(st.res) === '4,3,3', 'with the right change scores');
await page.click('[data-formula-recipe="pct"]');
await page.waitForTimeout(300);
st = await read();
ok(/\) \/ \w+ \* 100$/.test(st.formula),
   'Percent change writes the full expression, denominator visible: ' +
   st.formula);

console.log('case 6: Reverse-score seeds its scale from the data');
await page.click('[data-formula-recipe="rev"]');
await page.waitForTimeout(300);
// q1 runs 2..5, so the observed max seeds 5 and the formula flips
// around 6.
st = await read();
ok(st.formula === '6 - q1' && st.name === 'q1_reversed',
   'the item flips around observed max + 1: ' + st.formula);
ok(String(st.res) === '2,4,1', 'reversal is exact (4,2,5 -> 2,4,1)');

console.log('case 7: hand-editing the box dismisses the picker');
await page.focus('#ps-formula-input');
await page.keyboard.type(' + 1');
await page.waitForTimeout(250);
st = await read();
ok(!st.pickerOpen, 'typing in the box closes the picker: the box is the ' +
   'truth and the choices no longer describe it');
ok(await page.evaluate(() =>
       Array.from(document.querySelectorAll('[data-formula-recipe]'))
           .every(b => b.getAttribute('aria-pressed') === 'false')),
   'and no recipe pill still claims the formula');

console.log('case 8: the functions browser inserts at the cursor');
await page.click('#ps-fn-toggle');
await page.waitForTimeout(250);
const fnPanel = await page.evaluate(() => {
    const panel = document.getElementById('ps-fn-panel');
    return {
        open: !panel.hidden,
        text: panel.textContent.replace(/\s+/g, ' '),
        buttons: panel.querySelectorAll('button.ps-fn-row').length,
        opRow: panel.querySelector('div.ps-fn-row') ? 1 : 0
    };
});
ok(fnPanel.open, 'the Functions toggle opens the browser');
for (const name of ['MEAN', 'VMEAN', 'VSD', 'VMEDIAN', 'VSUM', 'BIN',
                    'COALESCE', 'CONTAINS'])
    ok(fnPanel.text.indexOf(name) !== -1,
       'the browser names ' + name + ' with a plain sentence');
ok(fnPanel.buttons === 28 && fnPanel.opRow === 1,
   '28 insertable functions plus the operators row, which informs but ' +
   'does not insert');
const clickRow = (prefix) => page.evaluate((pfx) => {
    const rows = Array.from(document.querySelectorAll('button.ps-fn-row'));
    rows.find(r => r.querySelector('code').textContent
        .indexOf(pfx) === 0).click();
}, prefix);
const clearBox = () => page.evaluate(() => {
    const b = document.getElementById('ps-formula-input');
    b.value = ''; b.focus();
    b.selectionStart = b.selectionEnd = 0;
});

console.log('case 8b: click a function, point it at a column, done');
await clearBox();
await clickRow('VMEAN');
await page.waitForTimeout(250);
ok(await page.evaluate(() =>
       !!document.querySelector('.ps-fn-args select')),
   'clicking VMEAN expands an inline column picker in its row');
await page.selectOption('.ps-fn-args select', 'pre');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === 'VMEAN(pre)' &&
   await page.evaluate(() => !document.querySelector('.ps-fn-args')),
   'picking the column completes the call and the picker collapses: ' +
   st.formula);

console.log('case 8c: inserts land at the cursor, so clicks compose');
await page.evaluate(() => {
    const b = document.getElementById('ps-formula-input');
    b.value = 'post - '; b.focus();
    b.selectionStart = b.selectionEnd = b.value.length;
});
await clickRow('VMEAN');
await page.waitForTimeout(200);
await page.selectOption('.ps-fn-args select', 'post');
await page.waitForTimeout(250);
ok((await read()).formula === 'post - VMEAN(post)',
   'a typed fragment plus a picked call build a centering formula');

console.log('case 8d: the MEAN row carries the chips and the checkbox');
await clickRow('MEAN(');
await page.waitForTimeout(250);
await page.evaluate(() => {
    Array.from(document.querySelectorAll('.ps-fn-args [data-fn-col]'))
        .filter(b => ['q1', 'q3'].indexOf(b.getAttribute('data-fn-col')) !== -1)
        .forEach(b => b.click());
});
await page.click('.ps-fn-args .ps-fpk-miss input');
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       document.querySelector('.ps-fn-args .ps-fn-insert').textContent ===
       'Insert MEAN(q1, q3, ignore_missing = 1)'),
   'the Insert button PREVIEWS the exact call it will write');
await clearBox();
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(250);
ok((await read()).formula === 'MEAN(q1, q3, ignore_missing = 1)',
   'and writes exactly that');

console.log('case 8e: COALESCE ticks in order, because order is meaning');
await clickRow('COALESCE');
await page.waitForTimeout(250);
await page.evaluate(() => {
    const chips = Array.from(
        document.querySelectorAll('.ps-fn-args [data-fn-col]'));
    chips.find(b => b.getAttribute('data-fn-col') === 'post').click();
    chips.find(b => b.getAttribute('data-fn-col') === 'pre').click();
});
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       Array.from(document.querySelectorAll('.ps-fn-args [data-fn-col]'))
           .filter(b => b.getAttribute('aria-pressed') === 'true')
           .map(b => b.getAttribute('data-fn-col') + ':' +
               b.querySelector('.ps-fpk-ord').textContent)
           .sort().join(',') === 'post:1,pre:2'),
   'the chips wear order badges: first ticked wins first');
await clearBox();
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(200);
ok((await read()).formula === 'COALESCE(post, pre)',
   'and the call keeps the tick order');

console.log('case 8f: column + one extra field, and the IF boundary');
await clickRow('BIN');
await page.waitForTimeout(200);
await page.selectOption('.ps-fn-args select', 'q1');
await clearBox();
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(200);
ok((await read()).formula === 'BIN(q1, 4)',
   'BIN takes its column and its group count from the picker');
await clickRow('LOWER');
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       Array.from(document.querySelectorAll('.ps-fn-args option'))
           .some(o => o.value === 'person')),
   'a text function offers EVERY column, not just the numeric ones');
await clearBox();
await clickRow('IF(');
await page.waitForTimeout(200);
ok((await read()).formula === 'IF(' &&
   await page.evaluate(() => !document.querySelector('.ps-fn-args')),
   'IF stays a plain opener: a condition cannot be completed by a ' +
   'column click');
await page.click('#ps-formula-close');
await page.waitForTimeout(300);

console.log('case 9: a version-3 project migrates its formulas on load');
// Seeded BEFORE boot: a saved z-score in the old vocabulary, where
// MEAN/SD were the column aggregates. The rewrite must keep the
// NUMBERS: mean 30, Bessel SD sqrt(700).
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
const errors2 = [];
page2.on('pageerror', e => errors2.push(String(e)));
await page2.addInitScript((snap) => {
    window.localStorage.setItem('psstandalone.project.v2',
        JSON.stringify(snap));
}, {
    version: 3, id: 'pmig', name: 'Migration fixture',
    table: {
        name: 'mig', order: ['score', 'score_z'],
        raw: { score: ['10', '20', '60'], score_z: ['', '', ''] },
        types: { score: 'continuous', score_z: 'continuous' },
        computed: { score_z: '(score - MEAN(score)) / SD(score)' }
    },
    charts: [], activeChart: null,
    ui: { dataOpen: true, workspace: 'data' }
});
await page2.goto(PAGE);
await page2.waitForTimeout(1600);
const mig = await page2.evaluate(async () => {
    const cont = document.getElementById('ps-welcome-continue');
    if (cont && cont.offsetParent) cont.click();
    await new Promise(r => setTimeout(r, 1200));
    const t = window.PS_SHELL.project.table;
    return { formula: t.computed && t.computed.score_z,
             vals: t.columns.score_z,
             err: t.computedErrors ? t.computedErrors.score_z : null };
});
ok(mig.formula === '(score - VMEAN(score)) / VSD(score)',
   'the old-vocabulary formula is rewritten to its V-forms on load');
const sd = Math.sqrt(700);
ok(!mig.err && mig.vals &&
   Math.abs(mig.vals[0] - (10 - 30) / sd) < 1e-9 &&
   Math.abs(mig.vals[2] - (60 - 30) / sd) < 1e-9,
   'and the z-scores are numerically identical to what the old engine ' +
   'computed');
ok(errors2.length === 0, 'the migrated project loads with zero page errors');
await ctx2.close();

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FORMULA RECIPES CHECK PASS');
await browser.close();
