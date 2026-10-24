// Tap a term in the Computed variable dialog (Oct 2026, layer 3 of the
// formula-help mockup): every function called in the formula is a chip
// under the preview's summary; tapping it opens a popover with the
// definition, the missing-value rule, the function's value on THIS
// table (an aggregate's constant with the count it saw; a row-wise
// call in the unfolded row, with the trace's reason), and a link to
// its reference entry. Esc is its own layer, outside clicks and edits
// close it, and the dialog with the popover open passes axe.
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
await page.evaluate(() => {
    window.PS_SHELL.loadTable('term', ['score', 'age', 'grp'],
        [['61', '34', 'Control'], ['55', '29', 'control'], ['68', '', 'Treatment'],
         ['58', '41', 'Treatment'], ['64', '37', 'Control']],
        { score: 'continuous', age: 'continuous', grp: 'nominal' });
});
await page.waitForTimeout(300);
const openDialog = async () => {
    await page.evaluate(() => window.PS_SHELL.runCommand('data-compute'));
    await page.waitForTimeout(300);
};
await openDialog();
const state = () => page.evaluate(() => {
    const pop = document.getElementById('ps-fterm-pop');
    const chips = Array.from(document.querySelectorAll('#ps-formula-preview .ps-fterm'));
    return {
        chips: chips.map(c => c.textContent),
        expanded: chips.filter(c => c.getAttribute('aria-expanded') === 'true').map(c => c.textContent),
        row: !!document.querySelector('#ps-formula-preview .ps-fterm-row'),
        popHidden: pop ? pop.hidden : null,
        popLabel: pop ? pop.getAttribute('aria-label') : null,
        head: pop && pop.querySelector('.ps-fterm-head code') ? pop.querySelector('.ps-fterm-head code').textContent : null,
        what: pop && pop.querySelector('.ps-fterm-what') ? pop.querySelector('.ps-fterm-what').textContent : null,
        miss: pop && pop.querySelector('.ps-fterm-miss') ? pop.querySelector('.ps-fterm-miss').textContent : null,
        data: pop && pop.querySelector('.ps-fterm-box') ? pop.querySelector('.ps-fterm-box').textContent.replace(/^On your data/, '') : null,
        href: pop && pop.querySelector('a[data-guide-link]') ? pop.querySelector('a[data-guide-link]').getAttribute('href') : null,
        inView: pop && !pop.hidden ? (() => { const r = pop.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })() : null,
        dialogOpen: document.getElementById('ps-formula-dialog').style.display === 'flex',
        focused: document.activeElement ? (document.activeElement.className + '|' + document.activeElement.textContent) : null,
    };
});
async function type(f) { await page.fill('#ps-formula-input', f); await page.waitForTimeout(150); }
async function tap(name) { await page.click('#ps-formula-preview .ps-fterm[data-fn="' + name + '"]'); await page.waitForTimeout(120); }

console.log('case 1: one chip per function called, in order, labels excluded');
await type('IF(score > VMEAN(score), 1, 0)');
let s = await state();
ok(s.chips.join(',') === 'IF,VMEAN' && s.popHidden === true, `chips IF, VMEAN (${s.chips})`);
await type('score + 1');
s = await state();
ok(!s.row, 'a formula with no call shows no chip row');
await type('IF(grp == "MEAN(", 1, 0)');
s = await state();
ok(s.chips.join(',') === 'IF', `a function name inside a label is not a chip (${s.chips})`);

console.log('case 2: tapping an aggregate shows its one value with the count it saw');
await type('IF(score > VMEAN(score), 1, 0)');
await tap('VMEAN');
s = await state();
ok(s.popHidden === false && s.head === 'VMEAN(column)' && s.expanded.join(',') === 'VMEAN',
   `the popover opens for VMEAN and the chip reads expanded (${s.head})`);
ok(s.what === 'The mean of the whole column, repeated on every row.' &&
   s.miss === 'Missing values: Skips missing cells; missing when the column has no values.',
   `definition and missing rule (${s.what} / ${s.miss})`);
ok(s.data === 'VMEAN(score) = 61.2, over 5 values in the column, the same on every row.',
   `the value on this table, with the count (${s.data})`);
ok(s.href === '../docs/user-guide.html#fn-vmean' && s.popLabel === 'VMEAN: definition and its value on your data' && s.inView,
   `links to its reference entry, labelled, inside the viewport (${s.href})`);

console.log('case 3: a row-wise function reads the unfolded row, or row 1');
await tap('IF');
s = await state();
ok(s.expanded.join(',') === 'IF' && s.head === 'IF(test, then, else)' &&
   s.data === 'In row 1, IF(score > VMEAN(score), 1, 0) = 0 (the test is false, so the else branch). Unfold another row below to see it there.',
   `IF reads row 1 with the trace's reason (${s.data})`);
await tap('IF');
s = await state();
ok(s.popHidden === true && s.expanded.length === 0 && /ps-fterm\|IF/.test(s.focused || ''),
   'tapping the open chip again closes the popover and keeps focus on the chip');
await type('MEAN(score, age)');
await page.click('.ps-fprev-pick[data-fprev-row="2"]');
await page.waitForTimeout(120);
await tap('MEAN');
s = await state();
ok(s.data === 'In row 3, MEAN(score, age) = missing (missing because age is missing).',
   `with row 3 unfolded the chip reads that row (${s.data})`);

console.log('case 4: a function in a branch the row did not take');
await type('IF(score > 60, LEN(grp), ABS(score))');
await page.click('.ps-fprev-pick[data-fprev-row="1"]');
await page.waitForTimeout(120);
await tap('LEN');
s = await state();
ok(s.data === 'Not evaluated in row 2: the branch it sits in was not taken there.',
   `a row-wise call in the untaken branch says so (${s.data})`);
await type('IF(score > 60, VMEAN(score), VMEDIAN(score))');
await tap('VMEAN');
s = await state();
ok(s.data === 'VMEAN(score) = 61.2, over 5 values in the column, the same on every row.',
   `an aggregate in the untaken branch still has its one value (${s.data})`);

console.log('case 5: Escape is its own layer; outside clicks and edits close it');
await tap('VMEDIAN');
await page.keyboard.press('Escape');
await page.waitForTimeout(120);
s = await state();
ok(s.popHidden === true && s.dialogOpen && /ps-fterm\|VMEDIAN/.test(s.focused || ''),
   'one Escape closes the popover, keeps the dialog, and focus returns to the chip');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
s = await state();
ok(!s.dialogOpen, 'the next Escape closes the dialog');
await openDialog();
await type('ROUND(score / 7, 1)');
await tap('ROUND');
await page.click('#ps-formula-title');
await page.waitForTimeout(120);
s = await state();
ok(s.popHidden === true && s.dialogOpen, 'a click elsewhere in the dialog closes the popover');
await tap('ROUND');
await type('ROUND(score / 7, 2)');
s = await state();
ok(s.popHidden === true && s.chips.join(',') === 'ROUND', 'editing the formula closes it and rebuilds the chips');
await tap('ROUND');
await page.click('#ps-fterm-pop .ps-fterm-close');
await page.waitForTimeout(100);
s = await state();
ok(s.popHidden === true && /ps-fterm\|ROUND/.test(s.focused || ''), 'the Close button closes it and refocuses the chip');

console.log('case 6: the dialog with the popover open passes the accessibility audit');
const axe = axePath();
if (!axe) console.log('  --  axe-core not found beside playwright; audit skipped');
else {
    await page.addScriptTag({ path: axe });
    await tap('ROUND');
    const res = await page.evaluate(async () => {
        const r = await window.axe.run({ include: [['#ps-formula-dialog'], ['#ps-fterm-pop']] }, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '));
    });
    s = await state();
    ok(s.popHidden === false, 'the popover is on screen for the audit');
    ok(res.length === 0, 'zero axe violations across the dialog and the popover' + (res.length ? ': ' + res.join(' | ') : ''));
}
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
ok(errors.length === 0, 'zero page errors (' + errors.join('; ') + ')');

await browser.close();
console.log(failures ? `FORMULA TERM CHECK: ${failures} FAILURE(S)` : 'FORMULA TERM CHECK PASS');
process.exit(failures ? 1 : 0);
