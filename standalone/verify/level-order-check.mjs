// Punch list t4-18: nominal level order is FIRST-SEEN here and SORTED in R.
//
// DECIDED Jul 26 2026 (Torry): keep first-seen. Sorting is actively misleading
// for the ordered-but-nominal data teaching datasets are full of, and matching
// R would silently reorder every already-saved chart and reshuffle its palette
// assignments. What was wrong was never the choice; it was that the divergence
// was invisible and untested. m1-parity.R is structurally incapable of seeing
// it, because it declares explicit levels for every factor and so hands both
// sides the same answer.
//
// So this probe does two things a normal parity case cannot:
//   1. It pins the DIFFERENCE, in both directions, so a silent change to
//      either side fails rather than passing quietly.
//   2. It asserts the escape hatch works, because "keep first-seen" is only
//      defensible if R's order is one click away for the variable that wants
//      it.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

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

const EXPECTED = '/tmp/ps-level-order/expected.json';
const CSV = '/tmp/ps-level-order/levels.csv';
if (!fs.existsSync(EXPECTED) || !fs.existsSync(CSV)) {
    console.error('run standalone/verify/level-order-render.R first (needs jmvcore)');
    process.exit(2);
}
const exp = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
const csv = fs.readFileSync(CSV, 'utf8');

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);

// The same CSV R read, through the app's own import path, with NO declared
// levels. That absence is the whole point.
const shell = await page.evaluate(async (text) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const t = window.PS_SHELL.parseCSV(text);
    window.PS_SHELL.loadTable('levels', t.header, t.rows);
    await s(600);
    window.PS_SHELL.setModule('plotbuilder');
    await s(300);
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'dose', yvar: 'score', groupVar: 'site' });
    await s(900);
    const p = window.PS_SHELL.buildPayload();
    return { x: p.xCategories, g: p.groupCategories,
             levels: window.PS_SHELL.project.table.levels.dose };
}, csv);

console.log('case 1: R sorts, and this shell does not');
ok(JSON.stringify(exp.rXCategories) === JSON.stringify(exp.rSortedDose),
   `setup: R really did sort an undeclared factor ` +
   `(${JSON.stringify(exp.rXCategories)})`);
ok(JSON.stringify(shell.x) === JSON.stringify(exp.entryOrder),
   `the shell keeps the order the data arrived in ` +
   `(${JSON.stringify(shell.x)})`);
ok(JSON.stringify(shell.x) !== JSON.stringify(exp.rXCategories),
   `so the two DIFFER, which is the documented decision rather than a bug: ` +
   `shell ${JSON.stringify(shell.x)} vs R ${JSON.stringify(exp.rXCategories)}`);
// The reason the decision went this way, stated as an assertion so it cannot
// quietly stop being true: alphabetical order is nonsense for this column.
ok(exp.rXCategories[1] === 'High dose' && exp.entryOrder[1] === 'Low dose',
   `and this is exactly why: sorting puts High dose in the middle, between ` +
   `Control and Low dose`);

console.log('case 2: the grouping variable diverges the same way');
ok(JSON.stringify(shell.g) === JSON.stringify(exp.siteEntryOrder),
   `first-seen (${JSON.stringify(shell.g)})`);
ok(JSON.stringify(exp.rGroupCategories) === JSON.stringify(exp.rSortedSite),
   `while R sorted (${JSON.stringify(exp.rGroupCategories)})`);
// Group order drives palette assignment, which is the half of this divergence
// a reader would notice without being able to name it.
ok(shell.g[0] !== exp.rGroupCategories[0],
   `so the FIRST group, and therefore the first palette colour, is not the ` +
   `same variable level in the two shells (${shell.g[0]} vs ` +
   `${exp.rGroupCategories[0]})`);

console.log('case 3: R order is one click away for the variable that wants it');
const sorted = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.sortVariableLevels('dose');
    await s(900);
    const p = window.PS_SHELL.buildPayload();
    return { x: p.xCategories,
             levels: window.PS_SHELL.project.table.levels.dose };
});
ok(JSON.stringify(sorted.x) === JSON.stringify(exp.rXCategories),
   `sorting one variable reproduces R's order exactly, so the divergence is ` +
   `a default and not a limitation (${JSON.stringify(sorted.x)})`);

// Numeric-looking levels must sort NUMERICALLY: "10" belongs after "9". This
// is the trap a plain A-Z sort falls into, and rating scales are full of it.
console.log('case 4: numeric-looking levels sort as numbers, not as text');
const nums = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('ratings', ['rating', 'y'],
        [['9', '1'], ['10', '2'], ['1', '3'], ['2', '4']],
        { rating: 'nominal', y: 'continuous' });
    await s(700);
    window.PS_SHELL.sortVariableLevels('rating');
    await s(800);
    return window.PS_SHELL.project.table.levels.rating;
});
ok(JSON.stringify(nums) === JSON.stringify(['1', '2', '9', '10']),
   `1, 2, 9, 10 rather than the 1, 10, 2, 9 a text sort would give ` +
   `(${JSON.stringify(nums)})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LEVEL ORDER CHECK PASS');
await browser.close();
