// Hand-entered and multi-site category data arrives spelled several ways.
// Control, control, CONTROL and "control " are one group to a reader and four
// levels to the app, which means four bars, four palette colours and four
// cells in every statistic.
//
// Since t4-186 the app does NOT normalise whitespace into levels: " Control"
// and "Control" are distinct categories, stored and DISPLAYED verbatim (the
// silent trailing-space merge was real data loss, and hiding the spaces made
// the difference impossible to see). The advice card is the honest route:
// it names the variants, counts them, and merges on one click.
//
// This probe pins that the app notices, says how many categories are really
// there, merges on one click keeping the commonest spelling, and takes one
// undo. It also pins the ghost-level hazard: a column whose level ORDER was
// set by hand carries declaredLevels, and a rewrite that leaves a dead name
// in that list re-adds it as an empty category.
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
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
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

const adviceText = () => page.evaluate(() => {
    const s = document.getElementById('ps-variable-advice-section');
    if (!s || s.style.display === 'none') return '';
    return (document.getElementById('ps-variable-advice') || {}).innerText || '';
});
const levelsOf = c => page.evaluate(cc =>
    (window.PS_SHELL.project.table.levels[cc] || []).slice(), c);
const rawOf = c => page.evaluate(cc =>
    (window.PS_SHELL.project.table.raw[cc] || []).slice(), c);

// Eighteen rows, three real groups, each spelled three ways, including a
// trailing-space variant - since t4-186 that space makes a DISTINCT level
// (stored and shown verbatim), so the card must count it and the merge
// must fold it.
async function loadVariants() {
    await page.evaluate(() => {
        const spell = ['Control', 'control ', 'CONTROL',
                       'Low dose', 'low dose', 'Low Dose',
                       'High dose', 'high dose', 'HIGH DOSE'];
        const rows = [];
        for (let i = 0; i < 18; i++) rows.push([spell[i % 9], String(50 + i)]);
        window.PS_SHELL.loadTable('spelling', ['group', 'score'], rows);
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.evaluate(() => window.PS_SHELL.selectVariable('group'));
    await page.waitForTimeout(400);
}

console.log('case 1: the app counts the categories that are really there');
await loadVariants();
const before = await levelsOf('group');
ok(before.length === 9,
   'nine spellings become nine categories today, got ' + JSON.stringify(before));
const txt = await adviceText();
ok(/9/.test(txt) && /3/.test(txt),
   'the advice says nine spellings are really three, got ' +
   JSON.stringify(txt.slice(0, 220)));
ok(/Control/.test(txt),
   'it shows an example group so the claim can be checked, got ' +
   JSON.stringify(txt.slice(0, 220)));
const acts = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-variable-advice [data-advice]'))
    .map(b => b.getAttribute('data-advice')));
ok(acts.indexOf('advice-merge-variants') !== -1,
   'a one-click merge is offered, got ' + JSON.stringify(acts));

console.log('case 1b: the level list says how many rows each category holds');
// The claim on the card is only checkable if the sizes are visible. The list
// named the categories and never their sizes, so "is CONTROL a typo or a
// third of my data" needed a filter or a chart to answer.
const counts = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-variable-levels .ps-level-order'))
    .map(r => (r.querySelector('.ps-level-label') || {}).textContent + '=' +
              ((r.querySelector('.ps-level-count') || {}).textContent || '')));
ok(counts.length === 9 && counts.every(c => /=\d+$/.test(c)),
   'every category carries a row count, got ' + JSON.stringify(counts));
ok(counts.indexOf('Control=2') !== -1 && counts.indexOf('control =2') !== -1,
   'and the counts are right - the trailing-space variant keeps its space ' +
   'IN the label (t4-185/186: whitespace is visible, never silently merged), ' +
   'got ' + JSON.stringify(counts));
const lbl = await page.evaluate(() => {
    const r = document.querySelector('#ps-variable-levels .ps-level-order');
    return r ? r.getAttribute('aria-label') : '';
});
ok(/2 rows/.test(lbl) && /position 1 of 9/.test(lbl),
   'the count is announced without losing the position, got ' + JSON.stringify(lbl));

console.log('case 1c: the Sort A-Z escape hatch is reachable');
// It shares the .ps-level-reset class, which is display:none, and only its
// SIBLING ever had its display restored, so a built and wired button could
// never appear. It is the one-click answer to the deliberate first-seen level
// order, which is the divergence from R the README leaves open.
const sortBtn = await page.evaluate(() => {
    const b = document.getElementById('ps-variable-level-sort');
    return b ? { shown: b.offsetParent !== null, tip: b.getAttribute('data-tip'),
                 text: b.textContent.trim() } : null;
});
ok(sortBtn && sortBtn.shown,
   'the button is on screen for a categorical variable, got ' +
   JSON.stringify(sortBtn));
await page.evaluate(() =>
    document.getElementById('ps-variable-level-sort').click());
await page.waitForTimeout(700);
const sorted = await levelsOf('group');
ok(sorted[0] === 'CONTROL' || sorted[0] === 'Control',
   'clicking it sorts the levels, got ' + JSON.stringify(sorted));
await page.keyboard.press(MOD + '+z');
await page.waitForTimeout(700);
ok((await levelsOf('group'))[0] === 'Control',
   'and one undo puts the order back, got ' +
   JSON.stringify(await levelsOf('group')));
// A continuous variable has no order to sort.
await page.evaluate(() => window.PS_SHELL.selectVariable('score'));
await page.waitForTimeout(300);
ok(!(await page.evaluate(() => {
       const b = document.getElementById('ps-variable-level-sort');
       return b && b.offsetParent !== null;
   })), 'and it stays away from a continuous variable');
await page.evaluate(() => window.PS_SHELL.selectVariable('group'));
await page.waitForTimeout(300);

console.log('case 2: merging keeps the commonest spelling');
await page.evaluate(() =>
    document.querySelector('#ps-variable-advice [data-advice="advice-merge-variants"]').click());
await page.waitForTimeout(800);
const after = await levelsOf('group');
ok(after.length === 3, 'three categories remain, got ' + JSON.stringify(after));
ok(after.indexOf('Control') !== -1 && after.indexOf('Low dose') !== -1 &&
   after.indexOf('High dose') !== -1,
   'and they are the commonest spelling of each, got ' + JSON.stringify(after));
const raws = await rawOf('group');
ok(raws.every(v => ['Control', 'Low dose', 'High dose'].indexOf(v) !== -1),
   'the underlying values were rewritten, not just the labels');
ok((await adviceText()) === '', 'the advice stands down once merged');

console.log('case 3: one undo puts every spelling back');
await page.keyboard.press(MOD + '+z');
await page.waitForTimeout(800);
ok((await levelsOf('group')).length === 9,
   'undo restores all nine, got ' + JSON.stringify(await levelsOf('group')));

console.log('case 4: a hand-set level order does not leave ghosts');
await loadVariants();
// Moving a level stores a declared order. A rewrite that forgets to prune it
// re-adds the dead spelling as an empty category.
// (col, levelValue, direction) - move the last spelling up one slot.
await page.evaluate(() => window.PS_SHELL.moveVariableLevel('group', 'HIGH DOSE', -1));
await page.waitForTimeout(500);
const declaredBefore = await page.evaluate(() =>
    ((window.PS_SHELL.project.table.declaredLevels || {}).group || []).slice());
ok(declaredBefore.length === 9,
   'the reorder stored a declared order, got ' + JSON.stringify(declaredBefore));
await page.evaluate(() => window.PS_SHELL.selectVariable('group'));
await page.waitForTimeout(300);
await page.evaluate(() =>
    document.querySelector('#ps-variable-advice [data-advice="advice-merge-variants"]').click());
await page.waitForTimeout(800);
const afterDeclared = await levelsOf('group');
ok(afterDeclared.length === 3,
   'still exactly three categories with a declared order in play, got ' +
   JSON.stringify(afterDeclared));

console.log('case 5: genuinely different categories are left alone');
await page.evaluate(() => {
    const rows = [], g = ['East', 'West', 'North', 'South'];
    for (let i = 0; i < 20; i++) rows.push([g[i % 4], String(10 + i)]);
    window.PS_SHELL.loadTable('sites', ['site', 'v'], rows);
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.evaluate(() => window.PS_SHELL.selectVariable('site'));
await page.waitForTimeout(400);
ok((await adviceText()) === '',
   'four distinct names are not called spellings, got ' +
   JSON.stringify(await adviceText()));

// Every shipped example must be silent, or the card is noise.
const exampleIds = await page.evaluate(() =>
    window.PS_SHELL.examples().map(e => e.id));
for (const ex of exampleIds) {
    await page.evaluate(id => window.PS_SHELL.loadSample(id), ex);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(300);
    const cols = await page.evaluate(() => window.PS_SHELL.project.table.order.slice());
    for (const c of cols) {
        await page.evaluate(cc => window.PS_SHELL.selectVariable(cc), c);
        await page.waitForTimeout(160);
        ok(!/spellings of/.test(await adviceText()),
           'example ' + ex + ' column ' + c + ' is not flagged');
    }
}

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('LEVEL VARIANTS CHECK: ALL GREEN');
await browser.close();
