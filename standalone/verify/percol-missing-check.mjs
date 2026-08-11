// Punch list t3-58a: missing-value labels were dataset-wide only.
//
// One shared list cannot say "-99 means missing in Age, 9 means missing in a
// rating item, 0 is real in Errors". The control was honestly labelled
// "Dataset missing-value labels", but it sat inside a panel headed
// "Inspecting <name>", which is the scope a reader assumes.
//
// A column may now carry its own list, which WINS WHOLE rather than adding to
// the dataset one: the case this exists for is "0 is real in Errors", and a
// list that only ever grows cannot express that.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);

// The exact table the item describes: -99 is a missing code in age, 9 is a
// missing code in the rating, and 0 in errors is a REAL count. No single
// dataset-wide list can be right for all three.
const load = async () => page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('codes', ['age', 'rating', 'errors'], [
        // rating row 3 is a legitimate 0. It is there so that "the column
        // list WINS" and "the column list is ADDED to the dataset list" give
        // different answers once 0 joins the dataset list in case 3. Without
        // a zero here the two behave identically and the assertion is
        // vacuous, which a control caught.
        ['34', '4', '0'], ['-99', '9', '2'], ['41', '0', '0'],
        ['52', '9', '5'], ['-99', '2', '1'], ['29', '5', '0']
    ]);
    await s(700);
});
const read = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { age: t.columns.age.slice(), rating: t.columns.rating.slice(),
             errors: t.columns.errors.slice(),
             types: { age: t.types.age, rating: t.types.rating,
                      errors: t.types.errors } };
});

console.log('case 1: a per-column list applies to that column only');
await load();
const before = await read();
ok(before.age.indexOf(-99) !== -1,
   `setup: -99 arrives as a real value in age (${JSON.stringify(before.age)})`);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setColumnMissingTokens('age', '-99');
    await s(900);
});
const afterAge = await read();
ok(afterAge.age.filter(v => v === null).length === 2 &&
   afterAge.age.indexOf(-99) === -1,
   `-99 is missing in age (${JSON.stringify(afterAge.age)})`);
ok(JSON.stringify(afterAge.rating) === JSON.stringify(before.rating) &&
   JSON.stringify(afterAge.errors) === JSON.stringify(before.errors),
   `and nothing changed in rating or errors, which is the whole point ` +
   `(${JSON.stringify(afterAge.errors)})`);

console.log('case 2: a second column gets a DIFFERENT code');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setColumnMissingTokens('rating', '9');
    await s(900);
});
const afterBoth = await read();
ok(afterBoth.rating.filter(v => v === null).length === 2,
   `9 is missing in rating (${JSON.stringify(afterBoth.rating)})`);
ok(afterBoth.age.filter(v => v === null).length === 2,
   `age keeps its own -99 rule rather than being overwritten ` +
   `(${JSON.stringify(afterBoth.age)})`);
ok(afterBoth.errors.indexOf(0) !== -1,
   `and 0 is still a real count in errors, which no single dataset-wide list ` +
   `could have managed alongside the other two ` +
   `(${JSON.stringify(afterBoth.errors)})`);

console.log('case 3: the dataset list still governs everything else');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setMissingTokens('NA, 0');
    await s(900);
});
const afterDataset = await read();
ok(afterDataset.errors.filter(v => v === null).length === 3,
   `the dataset list reaches errors, which has no list of its own ` +
   `(${JSON.stringify(afterDataset.errors)})`);
ok(afterDataset.age.filter(v => v === null).length === 2 &&
   afterDataset.rating.filter(v => v === null).length === 2,
   `but NOT the two columns that do: a column list WINS WHOLE, so adding 0 ` +
   `dataset-wide did not start blanking rating's legitimate 0 ` +
   `(${JSON.stringify(afterDataset.rating)})`);
ok(afterDataset.rating.indexOf(0) !== -1,
   `which is the difference between winning and merging, stated directly: ` +
   `rating still holds a real 0 (${JSON.stringify(afterDataset.rating)})`);

console.log('case 4: it survives a real reload, not just a snapshot read');
// An actual round trip through the persisted project, because the failure
// this guards against is "works until you close the tab": the overrides have
// to be in the serialization AND restored before the retype that reads them.
const beforeReload = await read();
await page.reload();
await page.waitForTimeout(1600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-continue');
    await page.waitForTimeout(1400);
}
const afterReload = await read();
ok(JSON.stringify(afterReload.age) === JSON.stringify(beforeReload.age),
   `age keeps its own rule across a reload (${JSON.stringify(afterReload.age)})`);
ok(JSON.stringify(afterReload.rating) === JSON.stringify(beforeReload.rating) &&
   JSON.stringify(afterReload.errors) === JSON.stringify(beforeReload.errors),
   `and so do the other two, which means the overrides were restored BEFORE ` +
   `the retype that reads them (${JSON.stringify(afterReload.errors)})`);

console.log('case 5: clearing an override falls back, it does not blank');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setColumnMissingTokens('age', '');
    await s(900);
});
const cleared = await read();
ok(cleared.age.indexOf(-99) !== -1,
   `-99 is a real value again in age (${JSON.stringify(cleared.age)})`);
ok(cleared.age.filter(v => v === null).length === 0,
   'and clearing did not leave the column blanked by an empty list');

console.log('case 6: the inspector says which list is in force');
const panel = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.selectVariable('rating');
    await s(400);
    // t4-134: the state is an explicit RADIO pair now, the box exists
    // only when forked, and a live count line ties the list to its
    // consequence in this column.
    const own = { label: document.getElementById('ps-variable-missing-col-label').textContent,
                  ownChecked: document.getElementById('ps-missing-mode-own').checked,
                  wrapHidden: document.getElementById('ps-missing-own-wrap').hidden,
                  value: document.getElementById('ps-variable-missing-col').value,
                  hint: document.getElementById('ps-variable-missing-col-hint').textContent,
                  dsHint: document.getElementById('ps-missing-dataset-hint').textContent };
    window.PS_SHELL.selectVariable('errors');
    await s(400);
    const inherit = { dsChecked: document.getElementById('ps-missing-mode-dataset').checked,
                      wrapHidden: document.getElementById('ps-missing-own-wrap').hidden,
                      optDs: document.getElementById('ps-missing-opt-dataset').textContent,
                      hint: document.getElementById('ps-variable-missing-col-hint').textContent };
    return { own, inherit };
});
ok(/rating/.test(panel.own.label) && panel.own.ownChecked &&
   !panel.own.wrapHidden && panel.own.value === '9',
   `a column with its own list shows the OWN radio checked and the list ` +
   `in its box ("${panel.own.label}" = "${panel.own.value}")`);
ok(/Marking \d+ cell/.test(panel.own.hint) &&
   /dataset labels would mark/.test(panel.own.hint),
   `with a live count against the dataset alternative ` +
   `("${panel.own.hint}")`);
ok(/except/.test(panel.own.dsHint) && /rating/.test(panel.own.dsHint),
   `and the dataset field names its exceptions, so "every variable" is ` +
   `never silently untrue ("${panel.own.dsHint}")`);
ok(panel.inherit.dsChecked && panel.inherit.wrapHidden &&
   /Use the dataset labels: /.test(panel.inherit.optDs),
   `a column without one shows the DATASET radio checked, naming what it ` +
   `inherits, with no box at all ("${panel.inherit.optDs}")`);
ok(/matches .* in errors/.test(panel.inherit.hint),
   `and its count line speaks about THIS column ` +
   `("${panel.inherit.hint}")`);

console.log('case 6b: forking pre-fills a COPY, and the radio walks back');
const fork = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.selectVariable('errors');
    await s(300);
    document.getElementById('ps-missing-mode-own').click();
    await s(700);
    const t = window.PS_SHELL.project.table;
    const afterFork = {
        box: document.getElementById('ps-variable-missing-col').value,
        stored: t.missingTokensByCol && t.missingTokensByCol.errors
            ? t.missingTokensByCol.errors.slice() : null
    };
    document.getElementById('ps-missing-mode-dataset').click();
    await s(700);
    const afterBack = {
        stored: !!(t.missingTokensByCol && t.missingTokensByCol.errors),
        dsChecked: document.getElementById('ps-missing-mode-dataset').checked
    };
    return { afterFork, afterBack };
});
ok(fork.afterFork.box !== '' &&
   String(fork.afterFork.stored) === fork.afterFork.box.split(', ').join(','),
   `forking pre-fills the box with a persisted COPY of the dataset ` +
   `labels, so replace-semantics read as editing your own copy ` +
   `("${fork.afterFork.box}")`);
ok(!fork.afterBack.stored && fork.afterBack.dsChecked,
   'and the dataset radio deletes the override, falling back whole');

console.log('case R: a rename carries the column\'s own missing labels with it');
// The one keyed store the rename did not carry, and losing it is not
// cosmetic. The column falls back to the dataset labels, so a code that WAS
// missing comes back as real data. Measured before the fix: valid went from
// 11 to 12 on a rename, and the sentinel re-entered the mean.
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push(['g', String(i === 3 ? -99 : 20 + i)]);
    window.PS_SHELL.loadTable('rn', ['g', 'age'], rows);
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.setColumnMissingTokens('age', '-99'));
await page.waitForTimeout(700);
const validOfR = c => page.evaluate(cc =>
    (window.PS_SHELL.project.table.columns[cc] || [])
        .filter(v => v !== null && v !== undefined).length, c);
ok((await validOfR('age')) === 11,
   'eleven valid while -99 is declared missing for this column, got ' +
   (await validOfR('age')));
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.evaluate(() => window.PS_SHELL.selectVariable('age'));
await page.waitForTimeout(300);
await page.fill('#ps-variable-name', 'age_years');
await page.press('#ps-variable-name', 'Enter');
await page.waitForTimeout(900);
ok((await validOfR('age_years')) === 11,
   'and still eleven after the rename, got ' + (await validOfR('age_years')));
ok((await page.evaluate(() => JSON.stringify(
       window.PS_SHELL.project.table.missingTokensByCol))) ===
   '{"age_years":["-99"]}',
   'because the list moved with the column, got ' +
   (await page.evaluate(() => JSON.stringify(
       window.PS_SHELL.project.table.missingTokensByCol))));

console.log('case D: deleting the column takes its list with it');
// The other half of case R. A deleted column's list would otherwise outlive
// it, ride every saved project, and quietly re-attach to any future column
// that takes the same name, declaring codes the user never declared for it.
await page.evaluate(() => window.PS_SHELL.deleteVariable('age_years'));
await page.waitForTimeout(700);
const orphan = await page.evaluate(() => JSON.stringify(
    window.PS_SHELL.project.table.missingTokensByCol || {}));
ok(!/age_years/.test(orphan),
   'the list went with the column, got ' + orphan);
await page.evaluate(() => window.PS_SHELL.insertVariable('g', false));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
const newCol = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return t.order[t.order.indexOf('g') + 1];
});
await page.evaluate(c => window.PS_SHELL.selectVariable(c), newCol);
await page.waitForTimeout(300);
await page.fill('#ps-variable-name', 'age_years');
await page.press('#ps-variable-name', 'Enter');
await page.waitForTimeout(900);
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    t.raw.age_years = t.raw.g.map((x, i) => String(i === 2 ? -99 : 30 + i));
    t.edited = true;
    window.PS_SHELL.retypeTable();
});
await page.waitForTimeout(700);
const reborn = await page.evaluate(() =>
    window.PS_SHELL.project.table.columns.age_years.slice());
// The fresh column is nominal, so its values are strings. What matters is
// that -99 is a VALUE and nothing was nulled by a list from beyond the
// grave, whichever type the column takes.
ok(reborn.some(v => String(v) === '-99') &&
   reborn.filter(v => v == null).length === 0,
   'and a fresh column under the old name starts with no declared codes, ' +
   'so -99 is a value in it, got ' + JSON.stringify(reborn));

console.log('case P: a duplicate keeps the source\'s own labels');
// The same harm through the duplicate door. The copy holds the same values,
// so a copy that re-admits the declared code averages it.
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push(['g', String(i === 3 ? -99 : 20 + i)]);
    window.PS_SHELL.loadTable('dup', ['g', 'age'], rows);
});
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.setColumnMissingTokens('age', '-99'));
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.insertVariable('age', true));
await page.waitForTimeout(700);
const dup = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const copy = t.order.filter(c => c !== 'g' && c !== 'age')[0];
    return { copy: copy,
             valid: (t.columns[copy] || []).filter(v => v != null).length,
             tokens: (t.missingTokensByCol || {})[copy] || null };
});
ok(dup.valid === 11,
   'eleven valid in ' + dup.copy + ', the declared code stayed missing, got ' +
   dup.valid);
ok(Array.isArray(dup.tokens) && dup.tokens.indexOf('-99') !== -1,
   'because the copy carries the labels, got ' + JSON.stringify(dup.tokens));

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PER-COLUMN MISSING CHECK PASS');
await browser.close();
