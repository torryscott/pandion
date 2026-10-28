// Help inside the filter popover's formula row (Oct 2026, step 4 of the
// filter follow-ups): the Computed variable dialog's signature card
// follows the caret into any function in a formula condition, an unknown
// name is offered the functions the search would find, and the stranded
// note's fixes are buttons that rewrite the row and re-evaluate the draft.
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
    window.PS_SHELL.loadTable('fhelp', ['condition', 'score', 'age'],
        [['Control', '61', '34'], ['Control', '55', '29'], ['Control', '68', ''],
         ['Low dose', '58', '41'], ['Low dose', '64', '37'], ['High dose', '52', '23'],
         ['High dose', '59', ''], ['High dose', '66', '31']],
        { condition: 'nominal', score: 'continuous', age: 'continuous' });
    window.PS_SHELL.setWorkspace('data');
});
await page.waitForTimeout(300);
async function openPopover() { await page.click('#ps-data-filter-btn'); await page.waitForTimeout(250); }
async function formulaRow(idx) {
    await page.selectOption(`#ps-filtermenu select[data-filter-col="${idx}"]`, '__formula__');
    await page.waitForTimeout(200);
}
async function typeFormula(idx, text, caret) {
    await page.fill(`#ps-filtermenu input[data-filter-formula="${idx}"]`, text);
    await page.evaluate(({ idx, caret }) => {
        const i = document.querySelector(`#ps-filtermenu input[data-filter-formula="${idx}"]`);
        i.focus(); i.setSelectionRange(caret, caret); i.dispatchEvent(new Event('keyup'));
    }, { idx, caret });
    await page.waitForTimeout(120);
}
const state = (idx = 0) => page.evaluate((idx) => {
    const m = document.getElementById('ps-filtermenu');
    const card = m.querySelector(`[data-filter-fsig="${idx}"]`);
    const cur = card ? card.querySelector('.ps-fsig-cur') : null;
    const row = m.querySelector(`input[data-filter-formula="${idx}"]`);
    const stranded = row ? row.closest('.ps-filter-row').querySelector('.ps-filter-stranded') : null;
    return {
        hidden: card ? card.hidden : null,
        sig: card && card.querySelector('.ps-fsig-sig') ? card.querySelector('.ps-fsig-sig').textContent : null,
        cur: cur ? cur.textContent : null,
        what: card && card.querySelector('.ps-fsig-what') ? card.querySelector('.ps-fsig-what').textContent : null,
        href: card && card.querySelector('a[data-guide-link]') ? card.querySelector('a[data-guide-link]').getAttribute('href') : null,
        uses: card ? Array.from(card.querySelectorAll('.ps-fsig-use')).map(b => b.textContent) : [],
        formula: row ? row.value : null,
        stranded: stranded ? stranded.textContent : null,
        fixes: stranded ? Array.from(stranded.querySelectorAll('.ps-fmsg-fix')).map(b => b.textContent) : [],
        count: (m.querySelector('[data-filter-count]') || {}).textContent || '',
        cards: m.querySelectorAll('[data-filter-fsig]').length,
    };
}, idx);

console.log('case 1: the card follows the caret inside a formula condition');
await openPopover();
await formulaRow(0);
await typeFormula(0, 'MEAN(score, age) > 40', 5);
let s = await state();
ok(!s.hidden && s.sig === 'MEAN(a, b, ...)' && s.cur === 'a' && s.href === '../docs/user-guide.html#fn-mean',
   `inside MEAN( the card shows with a highlighted and the reference link (${s.sig} / ${s.cur})`);
ok(s.what === 'The average of several columns, row by row. A scale score.', `the sentence is the browser's (${s.what})`);
await typeFormula(0, 'MEAN(score, age) > 40', 12);
s = await state();
ok(s.cur === 'b', `after the comma b is highlighted (${s.cur})`);
await typeFormula(0, 'MEAN(score, age) > 40', 21);
s = await state();
ok(s.hidden === true, 'outside the call the card hides');
ok(/showing 5 of 8 rows \(1 fails a condition, 2 left out because age is missing\)/.test(s.count), `the condition still evaluates live (${s.count})`);

console.log('case 2: an unknown name is offered the search\'s candidates, and Use rewrites the row');
await typeFormula(0, 'AVERAGE(score, age) > 40', 8);
s = await state();
ok(!s.hidden && /AVERAGE\(\) is not a function here/.test(s.what || '') && s.uses.join(',') === 'Use MEAN,Use VMEAN',
   `AVERAGE is refused with MEAN and VMEAN offered (${s.uses})`);
ok(/not being applied/.test(s.stranded || ''), `the stranded note says the condition is not applied (${(s.stranded || '').slice(0, 60)})`);
await page.click('#ps-filtermenu [data-filter-fsig="0"] .ps-fsig-use');
await page.waitForTimeout(200);
s = await state();
ok(s.formula === 'MEAN(score, age) > 40' && s.stranded === null && /showing 5 of 8 rows/.test(s.count),
   `Use MEAN rewrites the row, the note clears and the count re-evaluates (${s.formula}; ${s.count})`);

console.log('case 3: the stranded note carries the fixes as buttons');
await typeFormula(0, 'MEAN(score) > 60', 16);
s = await state();
ok(s.fixes.join(',') === 'Use VMEAN(score)' && /cannot be used/.test(s.stranded || ''),
   `a one-column MEAN offers the V-form (${s.fixes})`);
await page.click('#ps-filtermenu .ps-filter-stranded .ps-fmsg-fix');
await page.waitForTimeout(200);
s = await state();
ok(s.formula === 'VMEAN(score) > 60' && s.stranded === null && /showing 8 of 8 rows/.test(s.count),
   `the button applies it and the condition takes effect (${s.formula}; ${s.count})`);
await typeFormula(0, 'Score > 60', 10);
s = await state();
ok(s.fixes.join(',') === 'Use score', `a mis-cased variable offers the real name (${s.fixes})`);
await page.click('#ps-filtermenu .ps-filter-stranded .ps-fmsg-fix');
await page.waitForTimeout(200);
s = await state();
ok(s.formula === 'score > 60' && /showing 4 of 8 rows/.test(s.count), `and the row is fixed (${s.formula}; ${s.count})`);
await typeFormula(0, 'condition', 9);
s = await state();
ok(s.fixes.length === 0 && /gives text/.test(s.stranded || ''), 'a text-valued formula explains itself with no fix button');

console.log('case 4: two formula rows carry their own cards');
await page.click('#ps-filtermenu button:has-text("Add formula")');
await page.waitForTimeout(200);
await typeFormula(0, 'score > 50', 10);
await typeFormula(1, 'ISMISSING(age)', 10);
s = await state(1);
const s0 = await state(0);
ok(s.cards === 2 && !s.hidden && s.sig === 'ISMISSING(x)' && s0.hidden === true,
   `the second row's card shows ISMISSING while the first stays hidden (${s.sig})`);

console.log('case 5: the popover with a card and a fix button passes the accessibility audit');
const axe = axePath();
if (!axe) console.log('  --  axe-core not found beside playwright; audit skipped');
else {
    await page.addScriptTag({ path: axe });
    await typeFormula(0, 'MEAN(score) > 60', 5);
    const res = await page.evaluate(async () => {
        const r = await window.axe.run(document.getElementById('ps-filtermenu'), {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '));
    });
    s = await state(0);
    ok(!s.hidden && s.fixes.length === 1, 'the card and a fix button are on screen for the audit');
    ok(res.length === 0, 'zero axe violations in the popover' + (res.length ? ': ' + res.join(' | ') : ''));
}
await page.keyboard.press('Escape');
ok(errors.length === 0, 'zero page errors (' + errors.join('; ') + ')');

await browser.close();
console.log(failures ? `FILTER HELP CHECK: ${failures} FAILURE(S)` : 'FILTER HELP CHECK PASS');
process.exit(failures ? 1 : 0);
