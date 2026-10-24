// The signature card in the Computed variable dialog (Oct 2026, layer 1
// of the formula-help mockup): a card above the formula box follows the
// caret into any function call, showing its shape with the argument the
// caret is in, what it does, its missing-value rule and a link to its
// reference entry; an unknown name is told so and offered the functions
// the search would have found; and the error line's fixes are buttons.
// Also pins the card's missing-value wording to the guide's Formula
// reference, cell for cell.
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
    window.PS_SHELL.loadTable('sig', ['score', 'age', 'grp'],
        [['61', '34', 'Control'], ['55', '29', 'control'], ['68', '', 'Treatment'],
         ['58', '41', 'Treatment'], ['64', '37', 'Control']],
        { score: 'continuous', age: 'continuous', grp: 'nominal' });
});
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.runCommand('data-compute'));
await page.waitForTimeout(300);

const card = () => page.evaluate(() => {
    const c = document.getElementById('ps-fsig');
    const cur = c.querySelector('.ps-fsig-cur');
    const a = c.querySelector('a[data-guide-link]');
    return {
        hidden: c.hidden,
        sig: c.querySelector('.ps-fsig-sig') ? c.querySelector('.ps-fsig-sig').textContent : null,
        cur: cur ? cur.textContent : null,
        inArg: c.querySelector('.ps-fsig-in') ? c.querySelector('.ps-fsig-in').textContent : null,
        what: c.querySelector('.ps-fsig-what') ? c.querySelector('.ps-fsig-what').textContent : null,
        miss: c.querySelector('.ps-fsig-miss') ? c.querySelector('.ps-fsig-miss').textContent : null,
        href: a ? a.getAttribute('href') : null,
        uses: Array.from(c.querySelectorAll('.ps-fsig-use')).map(b => b.textContent),
        msg: document.getElementById('ps-formula-msg').textContent,
        fixes: Array.from(document.querySelectorAll('#ps-formula-msg .ps-fmsg-fix')).map(b => b.textContent),
        formula: document.getElementById('ps-formula-input').value,
        summary: !!document.querySelector('#ps-formula-preview .ps-fprev-sum'),
    };
});
async function caret(formula, pos) {
    await page.fill('#ps-formula-input', formula);
    await page.evaluate((p) => {
        const ta = document.getElementById('ps-formula-input');
        ta.focus(); ta.setSelectionRange(p, p);
        ta.dispatchEvent(new Event('keyup'));
    }, pos);
    await page.waitForTimeout(80);
    return card();
}

console.log('case 1: the card follows the caret into a call and names the argument');
let c = await caret('MEAN(score, age)', 5);
ok(!c.hidden && c.sig === 'MEAN(a, b, ...)' && c.cur === 'a' && c.inArg === 'you are in a',
   `inside MEAN( the first argument is highlighted (${c.sig} / ${c.cur})`);
ok(c.what === 'The average of several columns, row by row. A scale score.',
   `the sentence is the Functions browser's (${c.what})`);
ok(/^Missing values: Missing if any argument is missing, unless ignore_missing = 1; then missing only when every argument is\. Reference$/.test(c.miss || ''),
   `the missing rule is spelled out with a Reference link (${c.miss})`);
ok(c.href === '../docs/user-guide.html#fn-mean',
   `the link goes to the function's own reference entry (${c.href})`);
c = await caret('MEAN(score, age)', 12);
ok(c.cur === 'b' && c.inArg === 'you are in b', `after the comma the second argument is highlighted (${c.cur})`);
c = await caret('MEAN(score, age, ', 17);
ok(c.cur === '...' && c.inArg === 'you are in another argument', `past the named arguments the ... is highlighted (${c.cur})`);
c = await caret('ROUND(score / 7, 1)', 18);
ok(c.sig === 'ROUND(x, digits)' && c.cur === 'digits', `a second named argument is named (${c.cur})`);
c = await caret('ROUND(score, 1, 2)', 17);
ok(c.cur === null && /takes 2 arguments/.test(c.inArg || ''), `one argument too many says how many it takes (${c.inArg})`);

console.log('case 2: nested calls resolve to the innermost one, and the caret can leave');
const f = 'IF(score > VMEAN(score), "high", "low")';
c = await caret(f, f.indexOf('VMEAN(') + 6);
ok(c.sig === 'VMEAN(column)' && c.cur === 'column', `inside VMEAN the inner card shows (${c.sig})`);
c = await caret(f, f.indexOf('VMEAN('));
ok(c.sig === 'IF(test, then, else)' && c.cur === 'test', `just before VMEAN the IF card shows its test slot (${c.sig} / ${c.cur})`);
c = await caret(f, f.indexOf('"low"'));
ok(c.cur === 'else', `in the third slot the else branch is highlighted (${c.cur})`);
c = await caret(f, 0);
ok(c.hidden, 'at the start of the formula, outside every call, the card is hidden');
c = await caret('IF(score > 1, "a(b', 18);
ok(c.hidden, 'inside an unclosed string the card stays hidden');
c = await caret('score + 1', 9);
ok(c.hidden, 'a formula with no call shows no card');

console.log('case 3: an unknown name is told so and offered what the search finds');
c = await caret('AVERAGE(score, age)', 8);
ok(!c.hidden && /AVERAGE\(\) is not a function here\./.test(c.what || '') &&
   c.uses.join(',') === 'Use MEAN,Use VMEAN',
   `AVERAGE is refused with MEAN and VMEAN offered (${c.what} / ${c.uses})`);
await page.click('#ps-fsig .ps-fsig-use');
await page.waitForTimeout(100);
c = await card();
ok(c.formula === 'MEAN(score, age)' && c.sig === 'MEAN(a, b, ...)' && c.summary,
   `Use MEAN rewrites the name in place and the preview appears (${c.formula})`);
c = await caret('sd(score)', 3);
ok(c.uses.join(',') === 'Use VSD', `sd finds VSD through the search words (${c.uses})`);

console.log('case 4: the error line offers its fixes as buttons');
c = await caret('MEAN(score)', 11);
ok(c.fixes.join(',') === 'Use VMEAN(score)', `the one-argument MEAN error offers the V-form (${c.fixes})`);
await page.click('#ps-formula-msg .ps-fmsg-fix');
await page.waitForTimeout(100);
c = await card();
ok(c.formula === 'VMEAN(score)' && c.msg === '' && c.summary,
   `the button applies it and the preview appears (${c.formula})`);
c = await caret('average(score, age)', 19);
ok(c.fixes.join(',') === 'Use MEAN,Use VMEAN', `an unknown function offers the names the engine suggested (${c.fixes})`);
await page.click('#ps-formula-msg .ps-fmsg-fix');
await page.waitForTimeout(100);
c = await card();
ok(c.formula === 'MEAN(score, age)' && c.msg === '', `and rewrites it as typed, case and all (${c.formula})`);
c = await caret('IF(Score > 60, "Score", 0)', 26);
ok(c.fixes.join(',') === 'Use score', `a mis-cased variable offers the real name (${c.fixes}; ${c.msg})`);
await page.click('#ps-formula-msg .ps-fmsg-fix');
await page.waitForTimeout(100);
c = await card();
ok(c.formula === 'IF(score > 60, "Score", 0)' && c.msg === '',
   `the rename is token-level: the quoted text keeps its spelling (${c.formula})`);
c = await caret('= score + 1', 11);
ok(c.fixes.join(',') === 'Remove the =', `the spreadsheet habit offers its fix (${c.fixes})`);
await page.click('#ps-formula-msg .ps-fmsg-fix');
await page.waitForTimeout(100);
c = await card();
ok(c.formula === 'score + 1' && c.msg === '', `and the = is gone (${c.formula})`);
c = await caret('LOG10(score', 11);
ok(c.fixes.length === 0 && /expected "\)"/.test(c.msg), 'an error with no named fix shows no button');

console.log('case 5: every function card says what the Formula reference says');
const guide = fs.readFileSync(path.join(root, 'docs', 'user-guide.html'), 'utf8');
const cellText = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const guideMissing = {};
for (const m of guide.matchAll(/<tr id="fn-([a-z0-9]+)">([^]*?)<\/tr>/g)) {
    const cells = [...m[2].matchAll(/<td>([^]*?)<\/td>/g)].map(x => cellText(x[1]));
    if (cells.length >= 3) guideMissing[m[1].toUpperCase()] = cells[2];
}
for (const k of Object.keys(guideMissing))
    if (/^As MEAN\.$/.test(guideMissing[k])) guideMissing[k] = guideMissing.MEAN;
const names = await page.evaluate(() => Array.from(document.querySelectorAll('button.ps-fn-row code'))
    .map(n => n.textContent).filter(l => l.indexOf('(') !== -1).map(l => l.slice(0, l.indexOf('('))));
ok(names.length >= 27 && names.indexOf('MEAN') !== -1 && names.indexOf('COALESCE') !== -1,
   `the browser lists ${names.length} functions to check`);
let agree = 0, drift = [];
for (const name of names) {
    const cc = await caret(name + '(', name.length + 1);
    const said = (cc.miss || '').replace(/^Missing values: /, '').replace(/ Reference$/, '');
    if (!guideMissing[name]) drift.push(name + ': no reference row');
    else if (said !== guideMissing[name]) drift.push(name + ': card "' + said + '" vs guide "' + guideMissing[name] + '"');
    else agree++;
    if (cc.href !== '../docs/user-guide.html#fn-' + name.toLowerCase()) drift.push(name + ': link ' + cc.href);
}
ok(drift.length === 0, `all ${agree} cards match their reference cell and link to it` +
   (drift.length ? ' - drift: ' + drift.join(' | ') : ''));

console.log('case 6: the card and the fix buttons pass the accessibility audit');
const axe = axePath();
if (!axe) console.log('  --  axe-core not found beside playwright; audit skipped');
else {
    await page.addScriptTag({ path: axe });
    await caret('AVERAGE(score, age)', 8);
    await page.evaluate(() => { const ta = document.getElementById('ps-formula-input'); ta.value = 'MEAN(score)'; ta.dispatchEvent(new Event('input')); ta.setSelectionRange(5, 5); ta.dispatchEvent(new Event('keyup')); });
    await page.waitForTimeout(100);
    const res = await page.evaluate(async () => {
        const r = await window.axe.run(document.getElementById('ps-formula-dialog'), {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '));
    });
    const visible = await page.evaluate(() => !document.getElementById('ps-fsig').hidden &&
        document.querySelectorAll('#ps-formula-msg .ps-fmsg-fix').length > 0);
    ok(visible, 'the card and a fix button are on screen for the audit');
    ok(res.length === 0, 'zero axe violations in the dialog' + (res.length ? ': ' + res.join(' | ') : ''));
}
await page.keyboard.press('Escape');
ok(errors.length === 0, 'zero page errors (' + errors.join('; ') + ')');

await browser.close();
console.log(failures ? `FORMULA SIGNATURE CHECK: ${failures} FAILURE(S)` : 'FORMULA SIGNATURE CHECK PASS');
process.exit(failures ? 1 : 0);
