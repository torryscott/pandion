// The worked-example preview in the Computed variable dialog (Oct 2026,
// Torry: "build the worked-example layer first"). The preview used to
// print the first three results beside their inputs; it now also says
// how many results are missing and which column made them so, the
// measure type the column will get, and unfolds any row into the
// calculation step by step, so the missing-value rule is SEEN on the
// student's own data. Cases drive the real dialog on a fixture with
// gaps and read what the student would read.
import { createRequire } from 'node:module';
import path from 'node:path';

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
// Eight rows: age has gaps in rows 3 and 7, code carries the dataset's
// default missing code (NA) in row 2, grp is text, attn is an attention check.
await page.evaluate(() => {
    window.PS_SHELL.loadTable('explain',
        ['score', 'age', 'grp', 'attn', 'code'],
        [['61', '34', 'Control', '5', '12'],
         ['55', '29', 'control', '5', 'NA'],
         ['68', '', 'Treatment', '2', '15'],
         ['58', '41', 'Treatment', '', '9'],
         ['64', '37', 'Control', '5', '14'],
         ['52', '23', 'Treatment', '5', '10'],
         ['59', '', 'Control', '5', '11'],
         ['66', '31', 'Treatment', '3', '13']],
        { score: 'continuous', age: 'continuous', grp: 'nominal',
          attn: 'continuous', code: 'continuous' });
});
await page.waitForTimeout(300);
const state = () => page.evaluate(() => {
    const prev = document.getElementById('ps-formula-preview');
    const sum = prev.querySelector('.ps-fprev-sum');
    const trace = prev.querySelector('.ps-fprev-trace');
    return {
        msg: document.getElementById('ps-formula-msg').textContent.trim(),
        sum: sum ? sum.textContent.replace(/\s+/g, ' ').trim() : null,
        type: sum && sum.querySelector('.ps-fprev-type')
            ? sum.querySelector('.ps-fprev-type').textContent : null,
        rows: Array.from(prev.querySelectorAll('tr.ps-fprev-r'))
            .map(r => r.getAttribute('data-fprev-row')),
        res: Array.from(prev.querySelectorAll('td.ps-fprev-res')).map(n => n.textContent),
        heads: Array.from(prev.querySelectorAll('th')).map(n => n.textContent),
        note: (prev.querySelector('.ps-fprev-note') || {}).textContent || '',
        trace: trace ? trace.textContent.replace(/\s+/g, ' ').trim() : null,
        traceLines: trace ? Array.from(trace.querySelectorAll('li')).map(li => {
            const ex = li.querySelector(':scope > .ps-fprev-ex'),
                  val = li.querySelector(':scope > .ps-fprev-val'),
                  why = li.querySelector(':scope > .ps-fprev-why');
            return (ex ? ex.textContent : '') + ' -> ' + (val ? val.textContent : '') +
                (why ? ' [' + why.textContent + ']' : '');
        }) : [],
        expanded: Array.from(prev.querySelectorAll('.ps-fprev-pick[aria-expanded="true"]'))
            .map(b => b.textContent),
        focused: document.activeElement ? document.activeElement.className : null,
    };
});
async function type(f) {
    await page.fill('#ps-formula-input', f);
    await page.waitForTimeout(150);
}

console.log('case 1: the summary counts, names the culprit and states the type');
await page.evaluate(() => window.PS_SHELL.runCommand('data-compute'));
await page.waitForTimeout(300);
await type('age + 1');
let s = await state();
ok(/^8 rows: 6 values, 2 missing \(rows 3, 7: age is missing\)\./.test(s.sum || ''),
   `the summary names the rows and the column (${s.sum})`);
ok(s.type === 'Becomes a Continuous column', `a numeric result is Continuous (${s.type})`);
ok(s.rows.join(',') === '0,1,2,3,4' && s.heads.join('|') === 'Row|age|→ computed',
   `five rows, inputs beside the result (${s.rows.join(',')}; ${s.heads.join('|')})`);
ok(s.res.length === 5 && s.res[2] === 'missing' && s.res[0] === '35',
   `the result column keeps its class and shows missing as a word (${s.res.join(',')})`);
ok(/Click a row/.test(s.note), 'the note invites the click');

console.log('case 2: a row unfolds into the calculation, and the missing rule is spelled out');
await page.click('tr.ps-fprev-r[data-fprev-row="2"] td:last-child');
await page.waitForTimeout(150);
s = await state();
ok(s.trace && /^Row 3, step by step/.test(s.trace), `the trace names the row (${(s.trace || '').slice(0, 40)})`);
ok(s.traceLines[0] === 'age + 1 -> missing [missing because age is missing]' &&
   s.traceLines[1] === 'age -> missing [empty cell in row 3]',
   `the chain reads missing because age is missing, empty cell (${JSON.stringify(s.traceLines)})`);
ok(s.expanded.join(',') === '3' && s.rows.indexOf('2') !== -1,
   'the picked row is marked expanded');
await page.click('tr.ps-fprev-r[data-fprev-row="0"] td:last-child');
await page.waitForTimeout(150);
s = await state();
ok(s.traceLines.join(' | ') === 'age + 1 -> 35 | age -> 34',
   `a present row traces plainly, the literal 1 omitted (${s.traceLines.join(' | ')})`);

console.log('case 3: the summary row numbers open rows past the first five');
await type('IF(age > 30, "older", "younger")');
s = await state();
ok(s.type === 'Becomes a Nominal column' && /2 missing \(rows 3, 7: age is missing\)/.test(s.sum),
   `text results are Nominal, gaps still counted (${s.sum} ${s.type})`);
await page.click('.ps-fprev-sum .ps-fprev-row[data-fprev-row="6"]');
await page.waitForTimeout(150);
s = await state();
ok(s.rows.join(',') === '0,1,2,3,4,6' && s.expanded.join(',') === '7',
   `row 7 is appended to the table and unfolded (${s.rows.join(',')})`);
ok(s.traceLines[0] === 'IF(age > 30, "older", "younger") -> missing [the test is missing, so neither branch is taken]',
   `IF with a missing test says so (${s.traceLines[0]})`);
await page.click('.ps-fprev-pick[data-fprev-row="1"]');
await page.waitForTimeout(150);
s = await state();
ok(s.traceLines.join(' | ') === 'IF(age > 30, "older", "younger") -> younger [the test is false, so the else branch] | age > 30 -> 0 [false] | age -> 29',
   `a taken branch is named and the untaken one is not shown (${s.traceLines.join(' | ')})`);

console.log('case 4: the pick button is the keyboard path and toggles');
await page.focus('.ps-fprev-pick[data-fprev-row="3"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
s = await state();
ok(s.expanded.join(',') === '4' && /^Row 4,/.test(s.trace || ''),
   'Enter on a row button unfolds that row');
ok(s.focused === 'ps-fprev-pick', 'focus stays on the row button after the rebuild');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
s = await state();
ok(s.trace === null && s.expanded.length === 0 && /Click a row/.test(s.note),
   'the same button again folds the row');

console.log('case 5: COALESCE, ignore_missing, division by zero and aggregates explain themselves');
await type('COALESCE(age, score)');
await page.click('.ps-fprev-pick[data-fprev-row="2"]');
await page.waitForTimeout(150);
s = await state();
ok(s.traceLines[0] === 'COALESCE(age, score) -> 68 [the first value that is present (argument 2)]' &&
   s.traceLines.length === 3,
   `COALESCE names where it stopped and shows only what it read (${s.traceLines.join(' | ')})`);
await type('MEAN(age, score, ignore_missing = 1)');
await page.waitForTimeout(100);
s = await state();
ok(s.traceLines[0] === 'MEAN(age, score, ignore_missing = 1) -> 68 [ignore_missing = 1: 1 missing argument skipped]',
   `ignore_missing reports the skip (${s.traceLines[0]})`);
ok(/8 rows: 8 values, 0 missing\./.test(s.sum), `and the summary shows no gaps (${s.sum})`);
await type('score / (age - 34)');
await page.click('.ps-fprev-pick[data-fprev-row="0"]');
await page.waitForTimeout(150);
s = await state();
ok(s.traceLines[0] === 'score / (age - 34) -> missing [missing: division by zero]',
   `division by zero is named (${s.traceLines[0]})`);
ok(/3 missing \(row 1: the result is undefined there; rows 3, 7: age is missing\)/.test(s.sum),
   `each cause gets its own clause, in row order (${s.sum})`);
await type('score - VMEAN(age)');
await page.waitForTimeout(100);
s = await state();
ok(s.traceLines[2] === 'VMEAN(age) -> 32.5 [over 6 values in the column (2 missing skipped), the same on every row]',
   `the aggregate says how many values it saw (${s.traceLines[2]})`);

console.log('case 6: AND short-circuits, a missing code is named as one, text mixes to Nominal');
await type('score < 60 AND age > 30');
// row 1 is still unfolded from the last case: the trace follows the edit
s = await state();
ok(s.expanded.join(',') === '1', 'the unfolded row survives a formula edit');
ok(s.traceLines[0] === 'score < 60 AND age > 30 -> 0 [false: the left side already fails, so the right side is not read]' &&
   s.traceLines.length === 3,
   `AND explains the short circuit and hides the unread side (${s.traceLines.join(' | ')})`);
await type('code * 2');
await page.click('.ps-fprev-pick[data-fprev-row="1"]');
await page.waitForTimeout(150);
s = await state();
ok(s.traceLines[1] === 'code -> missing ["NA" is a missing code for this column]',
   `a declared missing code is named as the reason (${s.traceLines[1]})`);
await type('IF(ISMISSING(age), "none", age)');
s = await state();
ok(s.type === 'Becomes a Nominal column (text and numbers mixed, so text)',
   `mixed results explain why the column is text (${s.type})`);

console.log('case 7: editing an existing computed column previews against the other columns');
await page.keyboard.press('Escape');
await page.evaluate(() => window.PS_SHELL.saveComputedColumn('older', 'age > 30'));
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.runCommand('data-compute'));
await page.waitForTimeout(300);
await type('older + score');
s = await state();
ok(/8 rows: 6 values, 2 missing \(rows 3, 7: older is missing\)/.test(s.sum || ''),
   `a computed column's own gaps are traced to it (${s.sum})`);
await page.keyboard.press('Escape');
ok(errors.length === 0, 'zero page errors (' + errors.join('; ') + ')');

await browser.close();
console.log(failures ? `FORMULA EXPLAIN CHECK: ${failures} FAILURE(S)` : 'FORMULA EXPLAIN CHECK PASS');
process.exit(failures ? 1 : 0);
