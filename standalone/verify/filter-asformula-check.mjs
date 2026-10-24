// "As one formula" (Oct 2026, step 3 of the filter follow-ups): under the
// filter popover's conditions, the clicked rows are mirrored as the
// expression the formula language would write, with Copy and an explicit
// "Use as a formula row" that replaces the rows with one editable formula
// row keeping the same rows. The mirror shows only while there is a clicked
// condition to mirror, and refuses to convert a comparison the filter is
// not applying (an order test on a text column).
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
// The clipboard is stubbed: a file:// page has no clipboard permission in
// headless Chromium, and the point is what the button hands it.
await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
        writeText: t => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
});
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + path.join(root, 'standalone', 'index.html'));
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1200);
}
await page.evaluate(() => {
    window.PS_SHELL.loadTable('asf', ['condition', 'score', 'age', 'code'],
        [['Control', '61', '34', '10'], ['Control', '55', '29', '9'], ['Control', '68', '', '8'],
         ['Low dose', '58', '41', '11'], ['Low dose', '64', '37', '7'], ['High dose', '52', '23', '12'],
         ['High dose', '59', '', '6'], ['High dose', '66', '31', '5']],
        { condition: 'nominal', score: 'continuous', age: 'continuous', code: 'nominal' });
    window.PS_SHELL.setWorkspace('data');
});
await page.waitForTimeout(300);
async function openPopover() { await page.click('#ps-data-filter-btn'); await page.waitForTimeout(250); }
async function setRow(idx, col, op, value) {
    await page.selectOption(`#ps-filtermenu select[data-filter-col="${idx}"]`, col);
    await page.waitForTimeout(120);
    if (op) { await page.selectOption(`#ps-filtermenu select[data-filter-op="${idx}"]`, op); await page.waitForTimeout(120); }
    if (value !== undefined) {
        const sel = `#ps-filtermenu [data-filter-value="${idx}"]`;
        const tag = await page.evaluate(s => (document.querySelector(s) || {}).tagName, sel);
        if (tag === 'SELECT') await page.selectOption(sel, value); else await page.fill(sel, value);
        await page.waitForTimeout(150);
    }
}
async function addRow() { await page.click('#ps-filtermenu button:has-text("Add condition")'); await page.waitForTimeout(200); }
const state = () => page.evaluate(() => {
    const m = document.getElementById('ps-filtermenu');
    const code = m.querySelector('[data-filter-asformula-text]');
    const use = m.querySelector('[data-filter-asf-use]');
    const note = m.querySelector('.ps-filter-asf-note');
    return {
        mirror: code ? code.textContent : null,
        useDisabled: use ? use.disabled : null,
        note: note ? note.textContent : null,
        count: (m.querySelector('[data-filter-count]') || {}).textContent || '',
        rows: Array.from(m.querySelectorAll('.ps-filter-row')).length,
        formulaRow: (m.querySelector('input[data-filter-formula="0"]') || {}).value || null,
        copied: window.__copied || null,
        filters: JSON.stringify((window.PS_SHELL.project.table.filters || []).map(f => f.op === 'formula' ? ['formula', f.formula] : [f.col, f.op, f.value])),
        filterBtn: document.getElementById('ps-data-filter-btn').textContent.trim(),
        focusedFormula: document.activeElement && document.activeElement.getAttribute('data-filter-formula'),
    };
});

console.log('case 1: the clicked rows are mirrored as one formula, live, and Copy hands it to the clipboard');
await openPopover();
let s = await state();
ok(s.mirror === null, 'no mirror while no condition is complete');
await setRow(0, 'age', 'ge', '30');
s = await state();
ok(s.mirror === 'age >= 30', `one condition mirrors as itself (${s.mirror})`);
await addRow();
await setRow(1, 'condition', 'ne', 'Control');
s = await state();
ok(s.mirror === 'age >= 30 AND condition != "Control"' && s.useDisabled === false && s.note === null,
   `two conditions join with AND (${s.mirror})`);
await page.click('#ps-filtermenu [data-filter-asf-copy]');
await page.waitForTimeout(150);
s = await state();
ok(s.copied === 'age >= 30 AND condition != "Control"', `Copy writes the formula (${s.copied})`);

console.log('case 2: Use as a formula row replaces the rows and keeps the same rows');
const countBefore = s.count;
await page.click('#ps-filtermenu [data-filter-asf-use]');
await page.waitForTimeout(250);
s = await state();
ok(s.rows === 1 && s.formulaRow === 'age >= 30 AND condition != "Control"',
   `one formula row carrying the expression (${s.rows} row; ${s.formulaRow})`);
ok(s.count === countBefore, `the live count is unchanged (${s.count})`);
ok(s.mirror === null, 'a formula-only draft shows no mirror (it is already text)');
ok(s.focusedFormula === '0', 'focus lands in the formula row for editing');
await page.click('#ps-filtermenu [data-filter-apply]');
await page.waitForTimeout(400);
s = await state();
ok(s.filters === '[["formula","age >= 30 AND condition != \\"Control\\""]]' && /Filter · 3 of 8/.test(s.filterBtn),
   `Apply keeps the formula filter and the same 3 of 8 rows (${s.filterBtn})`);

console.log('case 3: a mixed draft brackets the formula row; a comparison the filter is not applying refuses to convert');
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(200);
await openPopover();
await setRow(0, 'score', 'ge', '55');
await addRow();
await page.selectOption('#ps-filtermenu select[data-filter-col="1"]', '__formula__');
await page.waitForTimeout(200);
await page.fill('#ps-filtermenu input[data-filter-formula="1"]', 'age > 30 OR condition == "Control"');
await page.waitForTimeout(200);
s = await state();
ok(s.mirror === 'score >= 55 AND (age > 30 OR condition == "Control")', `the formula row joins in brackets (${s.mirror})`);
// code is a Nominal column of digits: an order test on it is pass-through in the filter.
await page.evaluate(() => window.PS_SHELL.setFilters([{ col: 'code', op: 'gt', value: '8' }]));
await page.waitForTimeout(200);
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
await openPopover();
s = await state();
ok(s.mirror === 'code > "8"' && s.useDisabled === true && /code > "8" needs numbers/.test(s.note || ''),
   `the mirror still shows it but conversion is refused with the reason (${s.note})`);
await page.keyboard.press('Escape'); await page.waitForTimeout(150);

console.log('case 4: the popover with the mirror passes the accessibility audit');
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(200);
const axe = axePath();
if (!axe) console.log('  --  axe-core not found beside playwright; audit skipped');
else {
    await page.addScriptTag({ path: axe });
    await openPopover();
    await setRow(0, 'age', 'ge', '30');
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
console.log(failures ? `FILTER AS-FORMULA CHECK: ${failures} FAILURE(S)` : 'FILTER AS-FORMULA CHECK PASS');
process.exit(failures ? 1 : 0);
