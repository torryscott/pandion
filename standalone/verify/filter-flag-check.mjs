// "Make this a 0/1 column" (Oct 2026, step 2 of the filter follow-ups): the
// popover's conditions become a computed variable through the Computed
// variable dialog, prefilled with IF(<the whole filter>, 1, 0) and a name
// like included. 1 where a row passes, 0 where it fails, missing where a
// value the rule needs is missing; the filter itself is untouched.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp']
            .filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function axePath() {
    for (const base of [process.env.GB2_NODE_BASE, '/private/tmp', '/tmp'].filter(Boolean)) {
        const p = path.join(base, 'node_modules', 'axe-core', 'axe.min.js');
        if (fs.existsSync(p)) return p;
    }
    return null;
}
let failures = 0;
function ok(cond, msg) {
    if (cond) console.log('  ok  ' + msg);
    else { console.log(' FAIL ' + msg); failures++; }
}
const { chromium } = loadPlaywright();
const root = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + path.join(root, 'standalone', 'index.html'));
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1200);
}
async function load() {
    await page.evaluate(() => {
        window.PS_SHELL.loadTable('flag', ['condition', 'score', 'age', 'first quiz'],
            [['Control', '61', '34', '7'], ['Control', '55', '29', '8'], ['Control', '68', '', '5'],
             ['Low dose', '58', '41', '9'], ['Low dose', '64', '37', '6'], ['High dose', '52', '23', '4'],
             ['High dose', '59', '', '7'], ['High dose', '66', '31', '8']],
            { condition: 'nominal', score: 'continuous', age: 'continuous', 'first quiz': 'continuous' });
        window.PS_SHELL.setWorkspace('data');
    });
    await page.waitForTimeout(300);
}
await load();
async function openPopover() { await page.click('#ps-data-filter-btn'); await page.waitForTimeout(250); }
async function setRow(idx, col, op, value, value2) {
    await page.selectOption(`#ps-filtermenu select[data-filter-col="${idx}"]`, col);
    await page.waitForTimeout(120);
    if (op) { await page.selectOption(`#ps-filtermenu select[data-filter-op="${idx}"]`, op); await page.waitForTimeout(120); }
    if (value !== undefined) {
        const sel = `#ps-filtermenu [data-filter-value="${idx}"]`;
        const tag = await page.evaluate(s => (document.querySelector(s) || {}).tagName, sel);
        if (tag === 'SELECT') await page.selectOption(sel, value); else await page.fill(sel, value);
        await page.waitForTimeout(150);
    }
    if (value2 !== undefined) { await page.fill(`#ps-filtermenu [data-filter-value2="${idx}"]`, value2); await page.waitForTimeout(150); }
}
async function addRow() { await page.click('#ps-filtermenu button:has-text("Add condition")'); await page.waitForTimeout(200); }
const state = () => page.evaluate(() => ({
    popOpen: document.getElementById('ps-filtermenu').style.display === 'block',
    flagDisabled: (document.querySelector('#ps-filtermenu [data-filter-flag]') || {}).disabled,
    dialogOpen: document.getElementById('ps-formula-dialog').style.display === 'flex',
    name: document.getElementById('ps-formula-name').value,
    formula: document.getElementById('ps-formula-input').value,
    msg: document.getElementById('ps-formula-msg').textContent,
    previewCells: document.querySelectorAll('#ps-formula-preview td.ps-fprev-res').length,
    filters: JSON.stringify((window.PS_SHELL.project.table.filters || []).map(f => [f.col, f.op, f.value])),
    filterBtn: document.getElementById('ps-data-filter-btn').textContent.trim(),
}));
async function flag() { await page.click('#ps-filtermenu [data-filter-flag]'); await page.waitForTimeout(300); }

console.log('case 1: the button opens the dialog prefilled, and the saved column is the rule as data');
await openPopover();
let s = await state();
ok(s.flagDisabled === true, 'with no complete condition the button is disabled');
await setRow(0, 'age', 'ge', '30');
await addRow();
await setRow(1, 'condition', 'ne', 'Control');
s = await state();
ok(s.flagDisabled === false, 'two complete conditions enable it');
await flag();
s = await state();
ok(!s.popOpen && s.dialogOpen, 'the popover closes and the Computed variable dialog opens');
ok(s.name === 'included' && s.formula === 'IF(age >= 30 AND condition != "Control", 1, 0)',
   `prefilled with the rule as one formula (${s.name}: ${s.formula})`);
ok(s.msg === '' && s.previewCells > 0, 'the formula compiles and previews');
await page.click('#ps-formula-save');
await page.waitForTimeout(600);
const col = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { there: t.order.indexOf('included') !== -1, typed: t.columns.included, type: t.types.included, formula: t.computed.included };
});
ok(col.there && JSON.stringify(col.typed) === '[0,0,null,1,1,0,null,1]' && col.type === 'continuous',
   `included holds 1, 0 and missing where age is blank (${JSON.stringify(col.typed)})`);
ok(s.filters === '[]' && s.filterBtn === 'Filter', 'the unapplied draft was not applied as a filter');

console.log('case 2: every operator has a formula spelling, and names with spaces are backticked');
const cases = [
    [['score', 'between', '55', '65'], 'IF(score >= 55 AND score <= 65, 1, 0)'],
    [['score', 'outside', '65', '55'], 'IF((score < 55 OR score > 65), 1, 0)'],
    [['age', 'nul'], 'IF(ISMISSING(age), 1, 0)'],
    [['age', 'nnul'], 'IF(NOT ISMISSING(age), 1, 0)'],
    [['first quiz', 'ge', '7'], 'IF(`first quiz` >= 7, 1, 0)'],
    [['condition', 'eq', 'Low dose'], 'IF(condition == "Low dose", 1, 0)'],
];
for (const [row, expect] of cases) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await openPopover();
    await setRow(0, row[0], row[1], row[2], row[3]);
    await flag();
    s = await state();
    ok(s.dialogOpen && s.formula === expect && s.msg === '',
       `${row.join(' ')} -> ${s.formula}${s.msg ? ' (' + s.msg + ')' : ''}`);
}
await page.keyboard.press('Escape'); await page.waitForTimeout(150);

console.log('case 3: a formula row joins in brackets, and the next name stays unique');
await openPopover();
await setRow(0, 'score', 'ge', '50');
await addRow();
await page.selectOption('#ps-filtermenu select[data-filter-col="1"]', '__formula__');
await page.waitForTimeout(200);
await page.fill('#ps-filtermenu input[data-filter-formula="1"]', 'age > 30 OR condition == "Control"');
await page.waitForTimeout(200);
await flag();
s = await state();
ok(s.formula === 'IF(score >= 50 AND (age > 30 OR condition == "Control"), 1, 0)' && s.msg === '',
   `the formula condition is bracketed so AND does not swallow its OR (${s.formula})`);
ok(s.name !== 'included' && /^included/.test(s.name), `a second flag gets a fresh name (${s.name})`);
await page.keyboard.press('Escape'); await page.waitForTimeout(150);

console.log('case 4: an applied filter stays applied');
await openPopover();
await setRow(0, 'age', 'ge', '30');
await page.click('#ps-filtermenu [data-filter-apply]');
await page.waitForTimeout(400);
await openPopover();
await flag();
s = await state();
ok(s.dialogOpen && s.formula === 'IF(age >= 30, 1, 0)' && s.filters === '[["age","ge",30]]' && /Filter · 4 of 8/.test(s.filterBtn),
   `the dialog opens on the applied rule and the filter is untouched (${s.filterBtn}; ${s.filters})`);
await page.keyboard.press('Escape'); await page.waitForTimeout(150);

console.log('case 5: the popover with the button passes the accessibility audit');
const axe = axePath();
if (!axe) console.log('  --  axe-core not found beside playwright; audit skipped');
else {
    await page.addScriptTag({ path: axe });
    await openPopover();
    const res = await page.evaluate(async () => {
        const r = await window.axe.run(document.getElementById('ps-filtermenu'), {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '));
    });
    ok(res.length === 0, 'zero axe violations in the popover' + (res.length ? ': ' + res.join(' | ') : ''));
    await page.keyboard.press('Escape');
}
ok(errors.length === 0, 'zero page errors (' + errors.join('; ') + ')');

await browser.close();
console.log(failures ? `FILTER FLAG CHECK: ${failures} FAILURE(S)` : 'FILTER FLAG CHECK PASS');
process.exit(failures ? 1 : 0);
