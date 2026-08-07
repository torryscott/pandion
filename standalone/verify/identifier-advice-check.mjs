// A participant number is averaged, and the app says the chart is fine.
//
// participant_id holding 1..40 types Continuous. The panel prints Distinct 40
// next to Rows 40 and then Mean 20.5, the value axis picker lists it first,
// and Check my chart answers "run against 10 checks, all passed" with a green
// pill literally named "Categories hold real groups".
//
// The feature for this is already built and the copy is already written. The
// SAME column in three costumes got three outcomes.
//
//   1..40        Continuous   no nudge
//   001..040     Nominal      amber card with a working Set type to ID button
//   P001..P040   Nominal      no nudge
//
// The trigger was "this string has a leading zero", which is a formatting
// accident rather than the identifier signature. The signature is that every
// value is different, which the panel already computes and displays two lines
// above the empty callout slot, and which the catsingle lint already uses
// correctly on the CATEGORY axis. It just never reached the value axis.
//
// The threshold is a judgement call and this probe pins the one I proposed.
// Every value distinct, at least twelve of them, and for a numeric column the
// values must also be integers packed into a near-consecutive range, which is
// what separates a case number from a measurement that happens to have no
// ties. Reaction times are all distinct too, and they must stay silent.
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

const advice = () => page.evaluate(() => {
    const s = document.getElementById('ps-variable-advice-section');
    if (!s || s.style.display === 'none') return '';
    return (document.getElementById('ps-variable-advice') || {}).innerText || '';
});
const acts = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-variable-advice [data-advice]'))
    .map(b => b.getAttribute('data-advice')));
// col is the variable under test; vals supplies its 40 values.
async function load(vals, name) {
    await page.evaluate(a => {
        const rows = a.v.map((x, i) => [x, i % 2 ? 'A' : 'B', String(50 + (i % 30))]);
        window.PS_SHELL.loadTable('ids', [a.n, 'group', 'score'], rows);
    }, { v: vals, n: name });
    await page.waitForTimeout(650);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.evaluate(n => window.PS_SHELL.selectVariable(n), name);
    await page.waitForTimeout(350);
}
const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));

console.log('case 1: a plain integer participant number is recognised');
await load(seq(40, i => String(i + 1)), 'participant_id');
ok((await page.evaluate(() =>
    window.PS_SHELL.project.table.types.participant_id)) === 'continuous',
   'it still types Continuous, which is what makes it averageable');
const t1 = await advice();
ok(/participant_id/.test(t1) && /different|distinct/i.test(t1),
   'the card names the variable and the signature, got ' +
   JSON.stringify(t1.slice(0, 200)));
ok((await acts()).indexOf('advice-id') !== -1,
   'and offers the Set type to ID button that already existed, got ' +
   JSON.stringify(await acts()));

console.log('case 2: taking it keeps the column out of every chart role');
await page.evaluate(() =>
    document.querySelector('#ps-variable-advice [data-advice="advice-id"]').click());
await page.waitForTimeout(700);
ok((await page.evaluate(() =>
    window.PS_SHELL.project.table.types.participant_id)) === 'id',
   'the type is now ID');
ok(!!(await page.evaluate(() => {
        window.PS_SHELL.setModule('plotbuilder');
        return window.PS_SHELL.refuseReasonFor('yvar', 'participant_id');
   })), 'and a value axis now refuses it with a reason');
ok((await advice()) === '', 'the card stands down once answered');

console.log('case 3: the prefixed shape is recognised too');
await load(seq(40, i => 'P' + String(i + 1).padStart(3, '0')), 'participant_id');
ok(/participant_id/.test(await advice()),
   'P001..P040 is the same column in a different costume, got ' +
   JSON.stringify((await advice()).slice(0, 160)));
ok((await acts()).indexOf('advice-id') !== -1, 'and offers the same button');

console.log('case 4: the zero-padded shape keeps its own existing card');
await load(seq(40, i => String(i + 1).padStart(3, '0')), 'participant_id');
const t4 = await advice();
ok(/kept exactly as typed/.test(t4) || /different|distinct/i.test(t4),
   'it still says something useful rather than nothing, got ' +
   JSON.stringify(t4.slice(0, 140)));
ok((await acts()).indexOf('advice-id') !== -1, 'and still offers the button');

console.log('case 5: measurements with no ties stay silent');
// Reaction times. Every value distinct, integers, but spread across a wide
// range rather than packed into a consecutive one.
await load(seq(40, i => String(200 + i * 13 + (i % 7) * 3)), 'rt_ms');
ok((await advice()) === '',
   'a spread-out all-distinct measurement is not called an identifier, got ' +
   JSON.stringify(await advice()));

// Decimals, all distinct, near-consecutive integers-if-you-squint.
await load(seq(40, i => String(20 + i * 0.5)), 'weight_kg');
ok((await advice()) === '',
   'a non-integer measurement is never called an identifier, got ' +
   JSON.stringify(await advice()));

console.log('case 6: repeated values are never an identifier');
await load(seq(40, i => String((i % 8) + 1)), 'trial_no');
ok((await advice()) === '',
   'a column with ties is left alone, got ' + JSON.stringify(await advice()));

console.log('case 7: too few rows is not evidence');
await page.evaluate(() => {
    const rows = [];
    for (let i = 1; i <= 6; i++) rows.push([String(i), 'A', String(50 + i)]);
    window.PS_SHELL.loadTable('tiny', ['pid', 'group', 'score'], rows);
});
await page.waitForTimeout(650);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.evaluate(() => window.PS_SHELL.selectVariable('pid'));
await page.waitForTimeout(350);
ok((await advice()) === '',
   'six distinct values is a coincidence, not a signature, got ' +
   JSON.stringify(await advice()));

console.log('case 8: the shipped examples stay silent');
const ids = await page.evaluate(() => window.PS_SHELL.examples().map(e => e.id));
ok(ids.length >= 3, 'all shipped examples under test, got ' + JSON.stringify(ids));
for (const ex of ids) {
    await page.evaluate(id => window.PS_SHELL.loadSample(id), ex);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(250);
    const cols = await page.evaluate(() => window.PS_SHELL.project.table.order.slice());
    for (const c of cols) {
        await page.evaluate(cc => window.PS_SHELL.selectVariable(cc), c);
        await page.waitForTimeout(150);
        ok(!/identifier/i.test(await advice()),
           'example ' + ex + ' column ' + c + ' is not called an identifier');
    }
}

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('IDENTIFIER ADVICE CHECK: ALL GREEN');
await browser.close();
