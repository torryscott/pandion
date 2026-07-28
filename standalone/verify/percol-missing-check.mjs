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
    const own = { label: document.getElementById('ps-variable-missing-col-label').textContent,
                  value: document.getElementById('ps-variable-missing-col').value,
                  ph: document.getElementById('ps-variable-missing-col').placeholder,
                  hint: document.getElementById('ps-variable-missing-col-hint').textContent };
    window.PS_SHELL.selectVariable('errors');
    await s(400);
    const inherit = { value: document.getElementById('ps-variable-missing-col').value,
                      ph: document.getElementById('ps-variable-missing-col').placeholder };
    return { own, inherit };
});
ok(/rating/.test(panel.own.label) && panel.own.value === '9',
   `a column with its own list shows it, under its own name ` +
   `("${panel.own.label}" = "${panel.own.value}")`);
ok(panel.inherit.value === '' && /using the dataset labels/.test(panel.inherit.ph),
   `and a column without one shows an EMPTY box whose placeholder says what ` +
   `it is inheriting, so blank never reads as "no labels" ("${panel.inherit.ph}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PER-COLUMN MISSING CHECK PASS');
await browser.close();
