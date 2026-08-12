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

console.log('case 6r: at rest the section is one row stating the RULE');
// t4-136. A rule cannot contradict the Summary card's Missing tile the
// way a second count could, it does not change with the data so the
// section never goes silent, and leading with "Blank cells" SHOWS the
// invariant on every variable instead of explaining it.
const resting = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.selectVariable('errors');
    await s(400);
    const sec = document.getElementById('ps-variable-missing-toggle')
        .closest('.ps-inspector-section');
    return {
        rule: document.getElementById('ps-missing-rule').textContent,
        expanded: document.getElementById('ps-variable-missing-toggle')
            .getAttribute('aria-expanded'),
        wrapHidden: document.getElementById('ps-variable-missing-wrap').hidden,
        height: Math.round(sec.getBoundingClientRect().height),
        datasetFieldInRail: !!sec.querySelector('#ps-variable-missing')
    };
});
ok(resting.expanded === 'false' && resting.wrapHidden,
   'the section is collapsed until asked');
ok(/^Blank cells, or /.test(resting.rule),
   `and the one visible line states the RULE in force, leading with the ` +
   `one part no list can change ("${resting.rule}")`);
ok(/\(dataset list\)\.$/.test(resting.rule),
   'naming which of the two lists it is, so the scope is asserted ' +
   'continuously even though the control is not standing there');
ok(resting.height < 90,
   `in about one row rather than a block (${resting.height}px)`);
ok(!resting.datasetFieldInRail,
   'and the DATASET-wide field is no longer inside the per-variable ' +
   'panel, which was the second cause of the busy feeling');

console.log('case 6: the chips say what counts, each with its own cost');
// t4-137. Each code is a chip carrying its own live match count, so
// cause and consequence sit in one glyph; the blank chip is permanent
// and unremovable, making "blank always counts" a visible fact. The
// expected counts are recomputed here from the raw text, the same way
// the app reads it, so the assertion is exact without hand-copying the
// fixture.
const chipsFor = async (col) => page.evaluate(async (c) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.selectVariable(c);
    await s(350);
    if (document.getElementById('ps-variable-missing-wrap').hidden)
        document.getElementById('ps-variable-missing-toggle').click();
    await s(250);
    const t = window.PS_SHELL.project.table;
    const raw = t.raw[c].map(v => String(v == null ? '' : v).trim());
    return {
        raw,
        dsLen: (t.missingTokens || ['NA']).length,
        chips: Array.from(document.querySelectorAll(
            '#ps-missing-chips .ps-missing-chip')).map(ch => ({
                text: ch.textContent.replace(/\u2715/g, '').trim(),
                dead: ch.classList.contains('ps-missing-chip-dead'),
                blank: ch.classList.contains('ps-missing-chip-blank'),
                removable: !!ch.querySelector('.ps-missing-chip-x')
            })),
        agg: document.getElementById('ps-missing-agg').textContent,
        state: document.getElementById('ps-missing-state').textContent,
        rule: document.getElementById('ps-missing-rule').textContent
    };
}, col);
const rating6 = await chipsFor('rating');
const nines = rating6.raw.filter(v => v === '9').length;
const blanks6 = rating6.raw.filter(v => v === '').length;
ok(rating6.chips[0].blank && !rating6.chips[0].removable &&
   rating6.chips[0].text === 'blank(' + blanks6 + ')',
   `the blank chip leads, carries its count, and has no remove button: ` +
   `"blank always counts" is a fact you can see (` +
   rating6.chips[0].text + ')');
ok(rating6.chips.length === 2 &&
   rating6.chips[1].text === '9(' + nines + ')' &&
   rating6.chips[1].removable,
   `the column's own code is a chip with ITS cost on it ` +
   `(${rating6.chips[1].text})`);
ok(/\(this variable's list\)\.$/.test(rating6.rule) &&
   /^Different from the dataset/.test(rating6.state),
   'the rule and the state line both say this variable differs');
const errors6 = await chipsFor('errors');
ok(errors6.chips.length === errors6.dsLen + 1 &&
   errors6.chips[1].text.indexOf('NA(') === 0,
   `an inheriting column shows every dataset code as a chip, one per ` +
   `code plus blank (${errors6.chips.map(c => c.text)})`);
ok(/^Same as the rest of the dataset\.$/.test(errors6.state),
   'and its state line says so');

console.log('case 6b: editing the chips IS choosing the list');
// Adding a code forks; removing back to the dataset set UN-forks; the
// revert link drops the override whole. The state line can never lie
// because "different" is true exactly when the set differs.
const forked = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const t = window.PS_SHELL.project.table;
    const expected = (t.missingTokens || ['NA']).concat('-99');
    const add = document.getElementById('ps-missing-add');
    add.value = '-99';
    add.dispatchEvent(new Event('change', { bubbles: true }));
    await s(700);
    const afterAdd = {
        expected,
        stored: t.missingTokensByCol && t.missingTokensByCol.errors
            ? t.missingTokensByCol.errors.slice() : null,
        state: document.getElementById('ps-missing-state').textContent,
        hasRevert: !!document.getElementById('ps-missing-usedataset')
    };
    const x = Array.from(document.querySelectorAll('.ps-missing-chip-x'))
        .find(b => b.getAttribute('aria-label').indexOf('-99') !== -1);
    x.click();
    await s(700);
    const afterRemove = {
        stored: !!(t.missingTokensByCol && t.missingTokensByCol.errors),
        state: document.getElementById('ps-missing-state').textContent
    };
    return { afterAdd, afterRemove };
});
ok(String(forked.afterAdd.stored) === String(forked.afterAdd.expected) &&
   /^Different from the dataset/.test(forked.afterAdd.state) &&
   forked.afterAdd.hasRevert,
   'adding a code forks the list and the state line discloses it, with ' +
   'a one-click way back');
ok(!forked.afterRemove.stored &&
   /^Same as the rest of the dataset\.$/.test(forked.afterRemove.state),
   'removing it back to the dataset set UN-forks automatically, so an ' +
   'identical list is never claimed to be different');
const reverted = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const t = window.PS_SHELL.project.table;
    const add = document.getElementById('ps-missing-add');
    add.value = '-77';
    add.dispatchEvent(new Event('change', { bubbles: true }));
    await s(700);
    document.getElementById('ps-missing-usedataset').click();
    await s(700);
    return !!(t.missingTokensByCol && t.missingTokensByCol.errors);
});
ok(!reverted, 'and the revert link drops the override whole');

console.log('case 6c: the aggregate never prints a zero; the chips ' +
            'carry the split');
// The t4-135 no-printed-zero rule now governs the AGGREGATE sentence.
// The chips DO print (0), deliberately: on a chip the zero is a
// per-code count and the typo warning, and it cannot read as a rival
// claim because the chips visibly sum to the aggregate.
const shapes = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('shapes',
        ['bothk', 'allblank', 'alllab', 'nothing'],
        [['1', '', 'NA', '1'],
         ['NA', '', 'NA', '2'],
         ['', '3', '3', '3']],
        { bothk: 'nominal', allblank: 'nominal', alllab: 'nominal',
          nothing: 'continuous' });
    window.PS_SHELL.setWorkspace('data');
    await s(500);
    const out = {};
    for (const c of ['bothk', 'allblank', 'alllab', 'nothing']) {
        window.PS_SHELL.selectVariable(c);
        await s(350);
        if (document.getElementById('ps-variable-missing-wrap').hidden)
            document.getElementById('ps-variable-missing-toggle').click();
        await s(200);
        out[c] = {
            agg: document.getElementById('ps-missing-agg').textContent.trim(),
            chips: Array.from(document.querySelectorAll(
                '#ps-missing-chips .ps-missing-chip')).map(ch =>
                    ch.textContent.replace(/\u2715/g, '').trim()),
            dead: Array.from(document.querySelectorAll(
                '#ps-missing-chips .ps-missing-chip-dead')).length,
            showHidden: document.getElementById('ps-missing-show').hidden
        };
    }
    return out;
});
ok(shapes.bothk.agg === '2 of 3 cells are missing.' &&
   String(shapes.bothk.chips) === 'blank(1),NA(1)',
   `both routes: the aggregate is the total, the chips are the parts, ` +
   `and they visibly sum (${shapes.bothk.chips})`);
ok(shapes.allblank.agg === '2 of 3 cells are missing.' &&
   String(shapes.allblank.chips) === 'blank(2),NA(0)' &&
   shapes.allblank.dead === 1,
   `a code matching nothing wears (0) in grey: the zero is the typo ` +
   `warning, ON the code it indicts (${shapes.allblank.chips})`);
ok(shapes.alllab.agg === '2 of 3 cells are missing.' &&
   String(shapes.alllab.chips) === 'blank(0),NA(2)',
   `and the all-labelled shape mirrors it (${shapes.alllab.chips})`);
ok(shapes.nothing.agg === 'Nothing is missing here. All 3 cells have a value.' &&
   shapes.nothing.showHidden,
   'nothing missing opens with a word, never a 0, and Show them ' +
   'withdraws rather than pointing at nothing');
for (const [col, v] of Object.entries(shapes))
    ok(!/(^|[^\d])0([^\d]|$)/.test(v.agg),
       `no zero is printed in the ${col} aggregate, where a zero beside ` +
       `a count is what read as a contradiction in the field`);

console.log('case 6s: a count of one agrees with its verb');
const single = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.selectVariable('bothk');
    await s(350);
    const t = window.PS_SHELL.project.table;
    window.PS_SHELL.setColumnMissingTokens('bothk', 'zzz');
    await s(600);
    const agg = document.getElementById('ps-missing-agg').textContent.trim();
    window.PS_SHELL.setColumnMissingTokens('bothk', '');
    await s(400);
    return agg;
});
ok(single === '1 of 3 cells is missing.',
   `one missing cell agrees with its verb ("${single}")`);

console.log('case 6e: Show them paints the cells, live, and lets go');
const showThem = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.selectVariable('allblank');
    await s(350);
    if (document.getElementById('ps-variable-missing-wrap').hidden)
        document.getElementById('ps-variable-missing-toggle').click();
    await s(250);
    document.getElementById('ps-missing-show').click();
    await s(400);
    const lit = document.querySelectorAll('td.ps-grid-missinghit').length;
    const label = document.getElementById('ps-missing-show').textContent;
    // The highlight is LIVE: declaring another code while it is on
    // paints the newly missing cells the moment the chip lands.
    const add = document.getElementById('ps-missing-add');
    add.value = '3';
    add.dispatchEvent(new Event('change', { bubbles: true }));
    await s(700);
    const litAfterAdd = document.querySelectorAll(
        'td.ps-grid-missinghit').length;
    // Switching the subject retires the paint.
    window.PS_SHELL.selectVariable('bothk');
    await s(400);
    const litAfterSwitch = document.querySelectorAll(
        'td.ps-grid-missinghit').length;
    window.PS_SHELL.setColumnMissingTokens('allblank', '');
    await s(300);
    return { lit, label, litAfterAdd, litAfterSwitch };
});
ok(showThem.lit === 2 && showThem.label === 'Hide them',
   `Show them outlines exactly the missing cells in the grid ` +
   `(${showThem.lit}) and offers the way back`);
ok(showThem.litAfterAdd === 3,
   'the highlight is LIVE: declaring a code while it is on paints the ' +
   'newly missing cell immediately, which is cause and effect in the ' +
   'data itself');
ok(showThem.litAfterSwitch === 0,
   'and switching variables retires the paint rather than leaving it ' +
   'behind');

console.log('case 6d: the explanation and the dataset list are one click away');
const doors = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    if (document.getElementById('ps-variable-missing-wrap').hidden)
        document.getElementById('ps-variable-missing-toggle').click();
    await s(250);
    document.getElementById('ps-missing-explain').click();
    await s(400);
    const dlg = document.getElementById('ps-missing-dialog');
    const out = {
        open: getComputedStyle(dlg).display === 'flex',
        text: dlg.textContent.replace(/\s+/g, ' '),
        field: !!dlg.querySelector('#ps-variable-missing'),
        described: dlg.getAttribute('aria-describedby')
    };
    document.getElementById('ps-missing-dialog-close').click();
    await s(300);
    window.PS_SHELL.runCommand('data-missing');
    await s(400);
    out.viaMenu = getComputedStyle(dlg).display === 'flex';
    document.getElementById('ps-missing-dialog-close').click();
    await s(200);
    return out;
});
ok(doors.open && doors.field,
   'How this works opens a dialog carrying BOTH the explanation and the ' +
   'dataset-wide list, since neither is about the variable being inspected');
ok(/blank/i.test(doors.text) && /REPLACES/.test(doors.text),
   'the explanation states the invariant and the replace-semantics');
ok(doors.described === 'ps-missing-dialog-lead',
   'and the dialog describes itself, so a screen reader hears the model ' +
   'on open rather than landing silently on a button');
ok(doors.viaMenu,
   'the Data menu reaches it too, so the dataset setting does not require ' +
   'selecting a variable first');

console.log('case 6f: the dataset list has a door NAMED for editing');
// Hiding an editing control behind a button called "How this works"
// made changing the dataset list a secret. Both doors open the same
// dialog; each is honest about why you would click it. Inherited chips
// also carry their provenance, so removing one is never a surprise.
const named = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    if (document.getElementById('ps-variable-missing-wrap').hidden)
        document.getElementById('ps-variable-missing-toggle').click();
    await s(250);
    const btn = document.getElementById('ps-missing-editds');
    const out = { label: btn ? btn.textContent : null };
    btn.click();
    await s(400);
    const dlg = document.getElementById('ps-missing-dialog');
    out.open = getComputedStyle(dlg).display === 'flex';
    out.fieldLabel = dlg.querySelector('.ps-missing-ds .ps-inspector-field')
        .textContent.replace(/\s+/g, ' ').trim();
    document.getElementById('ps-missing-dialog-close').click();
    await s(300);
    const chip = Array.from(document.querySelectorAll(
        '#ps-missing-chips .ps-missing-chip:not(.ps-missing-chip-blank)'))
        .find(c => !c.classList.contains('ps-missing-chip-dead'));
    out.tip = chip ? chip.getAttribute('data-tip') : null;
    return out;
});
ok(/^Edit the dataset list/.test(named.label) && named.open,
   'the rail names the editing door, and it opens the dialog');
ok(/^Dataset list/.test(named.fieldLabel),
   `whose field now carries the same name the rule line uses ` +
   `("${named.fieldLabel.slice(0, 24)}")`);
ok(named.tip !== null &&
   (/(comes from the dataset list|this variable's own list)/.test(named.tip)),
   `and a chip states its provenance, so removing one is never a ` +
   `surprise ("${named.tip}")`);

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
