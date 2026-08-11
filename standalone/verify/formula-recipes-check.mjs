// The computed-variable BUILDER (Aug 2026, Torry: "if someone wanted to
// make a new computed variable that was the average of two existing
// columns, I could see someone really struggling with that" - then,
// after three field rounds: "remove the quick transforms and the
// combined columns, and just have the functions be the main deal").
//
// ONE guided surface. The functions browser arrives OPEN, leads with a
// Common recipes group carrying the patterns that are not single
// functions (z-score, Center, Difference, Percent change,
// Reverse-score, Recode), and clicking any argument-taking entry opens
// its picker in a separate band below the panel. The law throughout:
// every completion INSERTS AT THE CURSOR in the visible formula box
// (which is what lets clicks compose with typing), an insert into an
// EMPTY box also names the variable, and hand-editing the box retires
// an open picker.
//
// This probe also owns the MIGRATION contract: a version-3 project
// whose formulas were written under the old vocabulary (MEAN as the
// column aggregate) must load with its formulas rewritten to the
// V-forms and its NUMBERS unchanged.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
// a numeric picker but MUST appear in Recode's.
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
    argsOpen: !!document.querySelector('.ps-fn-args'),
    res: Array.from(document.querySelectorAll(
        '#ps-formula-preview td.ps-fprev-res')).map(n => n.textContent)
}));
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
const twoSelects = (a, b) => page.evaluate((v) => {
    const sels = document.querySelectorAll('.ps-fn-args select');
    sels[0].value = v[0];
    sels[0].dispatchEvent(new Event('change', { bubbles: true }));
    sels[1].value = v[1];
    sels[1].dispatchEvent(new Event('change', { bubbles: true }));
}, [a, b]);

console.log('case 1: one guided surface, open on arrival');
await page.evaluate(() =>
    window.PS_SHELL.openFormulaDialog('pre', null));
await page.waitForTimeout(500);
const arrival = await page.evaluate(() => ({
    rowsGone: !document.getElementById('ps-formula-templates') &&
        !document.getElementById('ps-formula-combine'),
    panelOpen: !document.getElementById('ps-fn-panel').hidden,
    groups: Array.from(document.querySelectorAll('.ps-fn-group'))
        .map(g => g.textContent)
}));
ok(arrival.rowsGone,
   'the quick-transform and Combine-columns rows are gone');
ok(arrival.panelOpen,
   'the browser arrives OPEN: the only guided surface does not hide ' +
   'behind a closed toggle');
ok(arrival.groups[0] === 'Common recipes' && arrival.groups.length === 7,
   'Common recipes leads its seven groups: ' + arrival.groups.join(' | '));
// Still collapsible, and reopenable.
await page.click('#ps-fn-toggle');
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       document.getElementById('ps-fn-panel').hidden),
   'the toggle still collapses it');
await page.click('#ps-fn-toggle');
await page.waitForTimeout(200);

console.log('case 2: the scale score, end to end through MEAN');
await clickRow('MEAN(');
await page.waitForTimeout(250);
await page.evaluate(() => {
    Array.from(document.querySelectorAll('.ps-fn-args [data-fn-col]'))
        .filter(b => ['q1', 'q2', 'q3']
            .indexOf(b.getAttribute('data-fn-col')) !== -1)
        .forEach(b => b.click());
});
await page.click('.ps-fn-args .ps-fpk-miss input');
await clearBox();
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(300);
let st = await read();
ok(st.formula === 'MEAN(q1, q2, q3, ignore_missing = 1)',
   'chips + the missing-data checkbox write the full call: ' + st.formula);
ok(st.name === 'avg_q1_q2_q3',
   'an insert into an EMPTY box names the variable: ' + st.name);
ok(String(st.res) === '4,1.5,4.33333',
   'the preview scores the hand-computed values, hole handled: ' + st.res);
const savedName = st.name;
await page.click('#ps-formula-save');
await page.waitForTimeout(700);
const saved = await page.evaluate((nm) => {
    const t = window.PS_SHELL.project.table;
    return { formula: t.computed[nm], vals: t.columns[nm],
             err: t.computedErrors ? t.computedErrors[nm] : null };
}, savedName);
ok(!saved.err && Math.abs(saved.vals[0] - 4) < 1e-9 &&
   Math.abs(saved.vals[1] - 1.5) < 1e-9 &&
   Math.abs(saved.vals[2] - 13 / 3) < 1e-9,
   'and the saved column computes the hand-checked scale scores');

console.log('case 3: the z-score recipe, with the source column leading');
await page.evaluate(() =>
    window.PS_SHELL.openFormulaDialog('pre', null));
await page.waitForTimeout(500);
await clickRow('z-score');
await page.waitForTimeout(250);
ok(await page.evaluate(() => {
       const a = document.querySelector('.ps-fn-args');
       const panel = document.getElementById('ps-fn-panel');
       return a && !panel.contains(a) &&
           a.classList.contains('ps-formula-picker');
   }),
   'the recipe picker is the separate band below the panel');
ok(await page.evaluate(() =>
       document.querySelectorAll('.ps-fn-args option')[1].value === 'pre'),
   'the column this dialog was opened FROM leads the pool');
await page.selectOption('.ps-fn-args select', 'pre');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === '(pre - VMEAN(pre)) / VSD(pre)' && st.name === 'pre_z',
   'one pick writes the whole pattern, V-forms visible, and names it: ' +
   st.formula);

console.log('case 4: Difference and Percent change');
await clearBox();
await clickRow('Difference');
await page.waitForTimeout(250);
await twoSelects('post', 'pre');
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === 'post - pre' && st.name === 'post_change' &&
   String(st.res) === '4,3,3',
   'Difference writes after minus before with the right values: ' +
   st.formula);
await clearBox();
await clickRow('Percent change');
await page.waitForTimeout(250);
await twoSelects('post', 'pre');
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === '(post - pre) / pre * 100' && st.name === 'post_pctchange',
   'Percent change writes the full expression, denominator visible: ' +
   st.formula);

console.log('case 5: Reverse-score reads its scale from the data');
await clearBox();
await clickRow('Reverse-score');
await page.waitForTimeout(250);
await page.selectOption('.ps-fn-args select', 'q1');
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       document.querySelector('.ps-fn-args input[type="number"]')
           .value === '5'),
   'q1 runs to 5, so the scale maximum seeds itself');
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === '6 - q1' && st.name === 'q1_reversed' &&
   String(st.res) === '2,4,1',
   'the item flips around max + 1, exactly: ' + st.formula);

console.log('case 6: Recode expands the label-by-label IF chain');
await clearBox();
await clickRow('Recode');
await page.waitForTimeout(250);
ok(await page.evaluate(() =>
       Array.from(document.querySelectorAll('.ps-fn-args option'))
           .some(o => o.value === 'person')),
   'Recode offers the CATEGORY columns the numeric pickers exclude');
await page.selectOption('.ps-fn-args select', 'person');
await page.waitForTimeout(250);
st = await read();
ok(/^IF\(person == "a", "a", IF\(person == "b", "b", /.test(st.formula) &&
   st.name === 'person_recoded',
   'each label maps to itself, ready to edit: ' + st.formula.slice(0, 48));

console.log('case 7: the box stays the truth');
await page.evaluate(() => {
    const b = document.getElementById('ps-formula-input');
    b.value = 'pre + '; b.focus();
    b.selectionStart = b.selectionEnd = b.value.length;
    document.getElementById('ps-formula-name').value = 'my_name';
});
await clickRow('VMEAN');
await page.waitForTimeout(200);
await page.selectOption('.ps-fn-args select', 'pre');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === 'pre + VMEAN(pre)' && st.name === 'my_name',
   'an insert into EXISTING text is a fragment: it composes at the ' +
   'cursor and never touches the name');
await clickRow('Center');
await page.waitForTimeout(200);
ok((await read()).argsOpen, 'a picker is open');
await page.focus('#ps-formula-input');
await page.keyboard.type(' + 1');
await page.waitForTimeout(250);
ok(!(await read()).argsOpen,
   'hand-editing the box retires it: the choices no longer describe ' +
   'the text');

console.log('case 8: the function pickers, by argument shape');
await clearBox();
await clickRow('VMEAN');
await page.waitForTimeout(250);
await page.selectOption('.ps-fn-args select', 'pre');
await page.waitForTimeout(250);
st = await read();
ok(st.formula === 'VMEAN(pre)' && st.name === 'pre_vmean' && !st.argsOpen,
   'one column-shaped hole: picking IS completing, and it names the ' +
   'variable: ' + st.formula);
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
   'COALESCE chips wear order badges: first ticked wins first');
await clearBox();
await page.click('.ps-fn-args .ps-fn-insert');
await page.waitForTimeout(200);
st = await read();
ok(st.formula === 'COALESCE(post, pre)' && st.name === 'post_filled',
   'and the call keeps the tick order: ' + st.formula);
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
st = await read();
ok(st.formula === 'IF(' && !st.argsOpen,
   'IF stays a plain opener: a condition cannot be completed by a ' +
   'column click');
const counts = await page.evaluate(() => ({
    buttons: document.querySelectorAll(
        '#ps-fn-panel button.ps-fn-row').length,
    opRow: document.querySelectorAll('#ps-fn-panel div.ps-fn-row').length
}));
ok(counts.buttons === 34 && counts.opRow === 1,
   '6 recipes + 28 functions are clickable, the operators row informs ' +
   'only (' + counts.buttons + ' + ' + counts.opRow + ')');
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
