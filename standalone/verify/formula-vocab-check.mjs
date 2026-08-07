// Real-browser check for the two formula-engine gaps a user could not
// work around (Aug 2026). Missing values had no test, so "if this is
// missing use zero" was unwriteable; and there was not one string
// function, so dirty category labels ("Control" vs "control") could not
// be recoded at all.
//
// This probe drives the actual dialog. A formula is typed, previewed,
// saved, and then read back out of the real table, because the seam
// that matters is not the engine alone. Saved values round-trip through
// raw text and get retyped, so a recode has to land as a NOMINAL
// variable with the right levels or it is no use for Group By.
//
// The engine-level cases (every function against every kind of input,
// and the exact error strings) live in formula-unit-check.mjs.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);

// A table a real student could arrive with. "arm" is the dirty-label
// problem, three spellings of two conditions. "post" has two holes.
await page.evaluate(() => {
    window.PS_SHELL.loadTable('vocab',
        ['id', 'arm', 'pre', 'post'],
        [['1', 'Control', '10', '14'],
         ['2', 'control', '12', ''],
         ['3', 'CONTROL', '9', '16'],
         ['4', 'Treatment', '11', ''],
         ['5', 'treatment', '13', '18']],
        { id: 'id', arm: 'nominal', pre: 'continuous', post: 'continuous' });
    window.PS_SHELL.setWorkspace('data');
});
await page.waitForTimeout(500);

console.log('case 1: the dialog offers the new vocabulary');
const help = await page.evaluate(() => {
    const h = document.querySelector('.ps-formula-help');
    return h ? h.textContent.replace(/\s+/g, ' ') : '';
});
for (const fn of ['ISMISSING', 'COALESCE', 'TRIM', 'UPPER', 'LOWER',
                  'LEN', 'CONTAINS'])
    ok(help.indexOf(fn) !== -1,
       `the dialog help names ${fn}, so it is discoverable without the docs`);

console.log('case 2: a missing value can be tested and filled, through the dialog');
await page.click('th[data-grid-col="post"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-columnmenu-compute');
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       document.getElementById('ps-formula-dialog').style.display === 'flex'),
   'the column menu opens the formula dialog');
await page.fill('#ps-formula-name', 'post_filled');
await page.fill('#ps-formula-input', 'COALESCE(post, pre)');
await page.waitForTimeout(250);
const prev = await page.evaluate(() => ({
    msg: document.getElementById('ps-formula-msg').textContent,
    preview: document.getElementById('ps-formula-preview').textContent
}));
ok(prev.msg === '' && /14, 12, 16, 11, 18/.test(prev.preview),
   'the live preview shows the filled values before saving: ' + prev.preview);
await page.click('#ps-formula-save');
await page.waitForTimeout(700);
const filled = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { raw: t.raw.post_filled, typed: t.columns.post_filled,
             type: t.types.post_filled,
             err: t.computedErrors ? t.computedErrors.post_filled : null };
});
ok(!filled.err && String(filled.typed) === '14,12,16,11,18',
   'COALESCE(post, pre) saves a column with no holes left in it');
ok(filled.type === 'continuous',
   'and it lands continuous, so it can drop on a value axis');

console.log('case 3: ISMISSING drives a flag column');
await page.evaluate(() => window.PS_SHELL.openFormulaDialog('post'));
await page.waitForTimeout(350);
await page.fill('#ps-formula-name', 'post_missing');
await page.fill('#ps-formula-input', 'ISMISSING(post)');
await page.waitForTimeout(250);
await page.click('#ps-formula-save');
await page.waitForTimeout(700);
const flag = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { typed: t.columns.post_missing,
             err: t.computedErrors ? t.computedErrors.post_missing : null };
});
ok(!flag.err && String(flag.typed) === '0,1,0,1,0',
   'ISMISSING(post) marks exactly the two empty cells');

console.log('case 4: dirty labels recode into one clean grouping variable');
await page.evaluate(() => window.PS_SHELL.openFormulaDialog('arm'));
await page.waitForTimeout(350);
await page.fill('#ps-formula-name', 'arm_clean');
await page.fill('#ps-formula-input',
    'IF(CONTAINS(LOWER(TRIM(arm)), "control"), "Control", "Treatment")');
await page.waitForTimeout(250);
await page.click('#ps-formula-save');
await page.waitForTimeout(700);
const clean = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { typed: t.columns.arm_clean, type: t.types.arm_clean,
             levels: t.levels.arm_clean,
             err: t.computedErrors ? t.computedErrors.arm_clean : null };
});
ok(!clean.err &&
   String(clean.typed) === 'Control,Control,Control,Treatment,Treatment',
   'three spellings of Control collapse into one label');
ok(clean.type === 'nominal' && String(clean.levels) === 'Control,Treatment',
   'the recode lands nominal with two levels, ready for Group By');

console.log('case 5: both new columns recalculate when the data changes');
// A real cell edit through the paste path, not a poke at the model.
await page.evaluate(() => {
    window.PS_SHELL.setGridSelection('arm', 4, 'arm', 4, 'cells');
    window.PS_SHELL.pasteMatrix([['CoNtRoL']]);
});
await page.waitForTimeout(600);
const after = await page.evaluate(() =>
    String(window.PS_SHELL.project.table.columns.arm_clean));
ok(after === 'Control,Control,Control,Treatment,Control',
   'editing a source value re-runs the recode: ' + after);
// Excluding a value makes it read as missing everywhere downstream, so
// ISMISSING has to agree with the rest of the app about what is there.
await page.evaluate(() => window.PS_SHELL.setExcluded('post', 0, true));
await page.waitForTimeout(600);
const excl = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { flag: String(t.columns.post_missing),
             filled: String(t.columns.post_filled) };
});
ok(excl.flag === '1,1,0,1,0',
   'an excluded cell counts as missing to ISMISSING: ' + excl.flag);
ok(excl.filled === '10,12,16,11,18',
   'and COALESCE fills it from pre, like any other hole: ' + excl.filled);
await page.evaluate(() => window.PS_SHELL.setExcluded('post', 0, false));
await page.waitForTimeout(500);

console.log('case 6: the errors name the fix, in the dialog');
await page.evaluate(() => window.PS_SHELL.openFormulaDialog('pre'));
await page.waitForTimeout(350);
async function msgFor(formula) {
    await page.fill('#ps-formula-input', formula);
    await page.waitForTimeout(250);
    return page.evaluate(() =>
        document.getElementById('ps-formula-msg').textContent);
}
let m = await msgFor('=post-pre');
ok(/remove the leading "="/i.test(m) && /post-pre/.test(m),
   'a leading = is explained rather than reported as a stray character: ' + m);
m = await msgFor('LOG(pre)');
ok(/LOG10/.test(m) && /\bLN\b/.test(m),
   'LOG names both real logs: ' + m);
m = await msgFor('Pre');
ok(/Did you mean pre/.test(m) && /case sensitive/i.test(m),
   'a capitalised variable name says names are case sensitive: ' + m);
m = await msgFor('AVERAGE(pre, post)');
ok(/MEAN/.test(m), 'AVERAGE points at MEAN: ' + m);
// The honesty control. No near name exists, so no suggestion may appear.
m = await msgFor('ZZQQXX(pre)');
ok(/unknown function ZZQQXX\(\)/.test(m) && !/[Dd]id you mean/.test(m),
   'and a name with no near match gets no invented suggestion: ' + m);

console.log('case 7: ordinary formulas are untouched');
await page.fill('#ps-formula-name', 'diff');
await page.fill('#ps-formula-input', 'post - pre');
await page.waitForTimeout(250);
await page.click('#ps-formula-save');
await page.waitForTimeout(700);
const plain = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { typed: t.columns.diff, raw: t.raw.diff,
             err: t.computedErrors ? t.computedErrors.diff : null };
});
ok(!plain.err && String(plain.typed) === '4,,7,,5' &&
   plain.typed[1] === null && plain.typed[3] === null,
   'a plain difference score still propagates missing rather than filling it');
const zres = await page.evaluate(() =>
    window.PS_SHELL.saveComputedColumn('pre_z',
        '(pre - MEAN(pre)) / SD(pre)'));
await page.waitForTimeout(500);
const z0 = await page.evaluate(() =>
    window.PS_SHELL.project.table.columns.pre_z[0]);
ok(!zres.error && Math.abs(z0 - (10 - 11) / 1.5811388) < 1e-5,
   'and the z-score aggregate is unchanged to five places');

console.log('case 8: the grid shows the new columns as computed');
const badges = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return ['post_filled', 'post_missing', 'arm_clean'].map(
        c => t.computed && t.computed[c] != null);
});
ok(badges.every(Boolean),
   'all three are stored as computed columns, so they recalculate and persist');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FORMULA VOCAB CHECK PASS');
await browser.close();
