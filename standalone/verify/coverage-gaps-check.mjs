// Punch list item t4-23, the still-uncovered half.
//
// t4-23 names three gaps the 21-probe suite never reached. One of the three
// is already closed and this file deliberately does NOT duplicate it:
//
//   GAP 1  "no probe asserts on any import error message (B19, B20 and
//          items 1 and 10)". COVERED ALREADY by verify/import-errors-check.mjs,
//          which is wired into run.sh on both the dev page and the dist
//          build. It asserts on ten import messages by name: the PNG refusal,
//          the by-content binary refusal, the three distinct parse failures,
//          both damaged-.pand halves, the unreadable .omv, the B20 blank-row
//          count and disclosure, and the B19 rename disclosure plus the
//          declared-type-survives-dedupe half. The t4-23 PARTIAL note is
//          simply stale about it. Nothing is re-probed here.
//
//   GAP 2  B5: row-filters-check covers RENAME and DELETE of a filtered
//          variable but not RETYPE. Part A below.
//
//   GAP 3  B10: computed-variables-check has no cycle case. Part B below.
//
// PART A (B5). computeFilterState's non-numeric branch used to return false
// for gt/ge/lt/le, so building "hours >= 4" and then switching Hours to
// Nominal failed EVERY row: 0 of 24, every chart in the project empty. The
// shipped rule is PASS-THROUGH plus disclosure, and the condition survives so
// it starts working again the moment the column is retyped back. Probed on
// the live retype AND on the .pand load path, which B5 names separately.
//
// The filtered column is HOURS, not the plotted score, on purpose: retyping
// a column that holds a chart role empties the chart through validateRoles
// (a nominal cannot be a Y axis), which would mask the pass-through with a
// second, unrelated cause. hours carries no role in the sample chart, so an
// empty chart here can only mean the filter failed every row. B5's own
// example sentence names hours for the same reason.
//
// PART B (B10). Formulas used to be evaluated in column order, writing as
// they went, against a known-columns list that included every other computed
// column. So "alpha = beta + 1" with "beta = alpha + 1" both compiled clean
// and drifted forever, and any forward reference read one edit behind. The
// shipped fix compiles first, topologically sorts, refuses back edges with a
// named error and blanks the members. The cycle has to be built by EDITING an
// existing column, which is exactly why it shipped unnoticed, so this drives
// the real Edit-formula dialog rather than poking state.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
const GE = '≥';   // the label FILTER_OPS gives the ge operator

await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(700);
}

// Retype through the REAL inspector path: select the variable, then change
// the measure-type select, which is what setColType is wired to.
// The inspector only builds its type select in the Data workspace, and a
// select with no matching option silently keeps "" - which setColType would
// then store as the type. Assert the option is really there before firing.
async function retype(col, type) {
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(300);
    await page.evaluate(c => window.PS_SHELL.selectVariable(c), col);
    await page.waitForTimeout(300);
    const applied = await page.evaluate(t => {
        const sel = document.getElementById('ps-variable-type');
        const opts = Array.from(sel.options).map(o => o.value);
        if (opts.indexOf(t) === -1) return { opts: opts, fired: false };
        sel.value = t;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { opts: opts, fired: true };
    }, type);
    if (!applied.fired)
        throw new Error('the inspector type select never offered "' + type +
                        '" for ' + col + ', it offered ' +
                        JSON.stringify(applied.opts));
    await page.waitForTimeout(700);
}
// Everything Part A reads, in one hop: the mask, the surviving condition, the
// two disclosure surfaces (chart note and the Filter button tooltip), and the
// chart's own row count.
const filterState = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const mask = t.filterMask || [];
    let kept = 0;
    for (let i = 0; i < mask.length; i++) if (!mask[i]) kept++;
    const btn = document.getElementById('ps-data-filter-btn');
    const p = window.PS_SHELL.buildPayload();
    return {
        type: t.types.hours,
        rows: mask.length,
        kept: mask.length ? kept : null,
        filters: (t.filters || []).map(f => f.col + '/' + f.op + '/' + f.value),
        filtersJson: JSON.stringify(t.filters || []),
        inapplicable: (t.filterInapplicable || []).slice(),
        // A null payload would mean the chart lost its ROLES, which is a
        // different failure from the one under test - reported, not hidden.
        note: p ? (p.chartNote || '') : '(no payload: the chart lost its roles)',
        chartN: p ? p.bars.reduce((a, b) => a + b.n, 0) : null,
        tip: btn.getAttribute('data-tip') || btn.title || '',
        chipText: btn.textContent
    };
});

// ================================================================ PART A
console.log('PART A - B5: retyping a filtered variable');

// Baseline. hours is continuous and 16 of the 24 sample rows are >= 4.
await page.evaluate(() => window.PS_SHELL.setFilters(
    [{ col: 'hours', op: 'ge', value: 4 }]));
await page.waitForTimeout(700);
let s = await filterState();
ok(s.type === 'continuous' && s.kept === 16 && s.chartN === 16,
   'baseline: hours >= 4 on a continuous column keeps 16 of 24 rows and the ' +
   'chart agrees (type ' + s.type + ', kept ' + s.kept +
   ', chart n ' + s.chartN + ')');
ok(s.inapplicable.length === 0 && !/not applied/.test(s.note),
   'baseline: nothing is reported as inapplicable while the types match ' +
   '(inapplicable ' + JSON.stringify(s.inapplicable) + ')');

// The B5 gesture: two clicks in the inspector turn Hours into Nominal.
await retype('hours', 'nominal');
s = await filterState();
ok(s.type === 'nominal',
   'the inspector really retyped hours (type is now "' + s.type + '")');
ok(s.kept === 24,
   'an order comparison on a text column passes every row through instead of ' +
   'failing all of them: kept ' + s.kept + ' of ' + s.rows +
   ' (the pre-fix behaviour was 0 of 24)');
ok(s.chartN === 24,
   'no chart in the project goes empty after the retype (chart n is ' +
   s.chartN + ')');
ok(s.filters.length === 1 && s.filters[0] === 'hours/ge/4',
   'the condition SURVIVES the wrong type rather than being auto-deleted, so ' +
   'it can start working again: filters are ' + s.filtersJson);
ok(s.inapplicable.length === 1 && s.inapplicable[0] === 'hours ' + GE,
   'the inapplicable condition is recorded by column AND operator: ' +
   JSON.stringify(s.inapplicable));
ok(s.note.indexOf('not applied: hours ' + GE +
                  ' (that comparison needs numbers)') !== -1,
   'the chart note states which comparison was not applied and why, got: "' +
   s.note + '"');
ok(s.tip.indexOf('Not applied: hours ' + GE +
                 ' (that comparison needs numbers)') !== -1,
   'the Filter button tooltip states the same thing, got: "' + s.tip + '"');

// Pass-through means the chip must not claim a subset either.
ok(/Filter · 24 of 24/.test(s.chipText),
   'the command-bar chip counts the pass-through honestly, got: "' +
   s.chipText.trim() + '"');

// The stored operator must survive an open-and-apply round trip through the
// popover, whose operator list drops ge/gt/lt/le for a text column.
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(400);
await page.click('#ps-data-filter-btn');
await page.waitForTimeout(400);
const popover = await page.evaluate(() => {
    const opSel = document.querySelector('#ps-filtermenu [data-filter-op="0"]');
    return {
        options: Array.from(opSel.options).map(o => o.value),
        shown: opSel.value,
        count: (document.querySelector('[data-filter-count]') || {}).textContent
    };
});
await page.click('[data-filter-apply]');
await page.waitForTimeout(700);
s = await filterState();
ok(s.filters.length === 1 && /^hours\/ge\//.test(s.filters[0]),
   'opening the filter popover on a retyped column and pressing Apply does ' +
   'NOT silently rewrite the stored operator (the popover offered only ' +
   JSON.stringify(popover.options) + ' and displayed "' + popover.shown +
   '", stored condition is ' + s.filtersJson + ')');

// Retyping back must restore the real comparison with no residue.
await retype('hours', 'continuous');
s = await filterState();
ok(s.kept === 16 && s.chartN === 16,
   'retyping back to Continuous makes the same saved condition work again ' +
   '(kept ' + s.kept + ' of ' + s.rows + ', chart n ' + s.chartN + ')');
ok(s.inapplicable.length === 0 && !/not applied/.test(s.note),
   'the not-applied disclosure clears with it, note is: "' + s.note + '"');

// B5's second half, which it names separately: the same collapse used to
// happen on LOAD when a saved .pand carried a filter whose column had since
// been retyped. Save in the broken state, load it cold.
await retype('hours', 'nominal');
const pandText = await page.evaluate(() => window.PS_SHELL.projectFileText());
const pandFile = '/tmp/ps-coverage-gaps-retyped.pand';
fs.writeFileSync(pandFile, pandText);
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
const errors2 = [];
page2.on('pageerror', e => errors2.push(String(e)));
await page2.goto(pageUrl);
await page2.waitForTimeout(500);
await page2.click('#ps-welcome-new');
await page2.waitForTimeout(300);
await page2.setInputFiles('#ps-file', pandFile);
await page2.waitForTimeout(1100);
const loaded = await page2.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const mask = t.filterMask || [];
    let kept = 0;
    for (let i = 0; i < mask.length; i++) if (!mask[i]) kept++;
    const p = window.PS_SHELL.buildPayload();
    return { type: t.types.hours, kept: mask.length ? kept : null,
             rows: mask.length,
             filters: (t.filters || []).length,
             inapplicable: (t.filterInapplicable || []).slice(),
             chartN: p ? p.bars.reduce((a, b) => a + b.n, 0) : null,
             note: p ? (p.chartNote || '') : '(no payload)' };
});
ok(loaded.type === 'nominal' && loaded.filters === 1,
   'the saved project really carries the filter on a retyped column (type ' +
   loaded.type + ', ' + loaded.filters + ' condition)');
ok(loaded.kept === 24 && loaded.chartN === 24,
   'loading a .pand whose filter column was retyped does not collapse to zero ' +
   'rows: kept ' + loaded.kept + ' of ' + loaded.rows +
   ', chart n ' + loaded.chartN);
ok(loaded.inapplicable.length === 1 &&
   loaded.inapplicable[0] === 'hours ' + GE &&
   loaded.note.indexOf('not applied: hours ' + GE) !== -1,
   'the loaded project discloses the same thing the live retype does, note: "' +
   loaded.note + '"');
if (errors2.length) throw new Error('page errors on the .pand load: ' +
                                    errors2.join(' | '));
await ctx2.close();

// Back to a clean table for Part B.
await retype('hours', 'continuous');
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(600);

// ================================================================ PART B
console.log('PART B - B10: computed-variable cycles and forward references');

// Two plain computed columns, appended in order: alpha then beta.
const setup = await page.evaluate(() => {
    const a = window.PS_SHELL.saveComputedColumn('alpha', 'score + 1');
    const b = window.PS_SHELL.saveComputedColumn('beta', 'alpha + 1');
    return { a, b };
});
await page.waitForTimeout(700);
let cs = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { order: t.order.slice(), alpha0: t.columns.alpha[0],
             beta0: t.columns.beta[0], score0: t.columns.score[0] };
});
ok(!setup.a.error && !setup.b.error &&
   cs.alpha0 === cs.score0 + 1 && cs.beta0 === cs.alpha0 + 1,
   'setup: alpha = score + 1 and beta = alpha + 1 both compute (score ' +
   cs.score0 + ', alpha ' + cs.alpha0 + ', beta ' + cs.beta0 + ')');

// Open the real Edit-formula dialog on a computed column.
async function openEdit(col) {
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(300);
    await page.click('th[data-grid-col="' + col + '"]', { button: 'right' });
    await page.waitForTimeout(300);
    await page.click('#ps-columnmenu-editformula');
    await page.waitForTimeout(400);
}
const dialogState = () => page.evaluate(() => ({
    open: document.getElementById('ps-formula-dialog').style.display === 'flex',
    msg: document.getElementById('ps-formula-msg').textContent.trim(),
    preview: document.getElementById('ps-formula-preview').textContent.trim(),
    formula: document.getElementById('ps-formula-input').value
}));

// ---- B10, the self-reference half: refused, by name, before it can be saved.
await openEdit('alpha');
await page.fill('#ps-formula-input', 'alpha + 1');
await page.waitForTimeout(300);
let d = await dialogState();
ok(d.msg === 'unknown variable "alpha"',
   'a formula that refers to its own column is refused inline and NAMES the ' +
   'column, got: "' + d.msg + '"');
ok(d.preview === '',
   'the self-reference shows no preview values to trust, preview is: "' +
   d.preview + '"');
await page.click('#ps-formula-save');
await page.waitForTimeout(500);
d = await dialogState();
const kept = await page.evaluate(() =>
    window.PS_SHELL.project.table.computed.alpha);
ok(d.open && d.msg === 'unknown variable "alpha"',
   'pressing Save on a self-reference keeps the dialog open with the same ' +
   'reason rather than accepting it (open ' + d.open + ', msg "' + d.msg + '")');
ok(kept === 'score + 1',
   'the stored formula is untouched by the refused save, still: "' + kept + '"');
// The footer Cancel and the header Close were two controls doing one job;
// the header Close is the app's universal dismiss and is the one that stayed.
await page.click('#ps-formula-close');
await page.waitForTimeout(300);

// ---- B10, the mutual-cycle half. This is the case that shipped unnoticed:
// the dialog CANNOT see it (beta exists and compiles), so the refusal has to
// happen at recompute time.
await openEdit('alpha');
await page.fill('#ps-formula-input', 'beta + 1');
await page.waitForTimeout(300);
d = await dialogState();
ok(d.msg === '' && /beta/.test(d.preview) && /\d/.test(d.preview),
   'the dialog accepts "beta + 1" because beta exists, which is why a cycle ' +
   'has to be caught at recompute time (msg "' + d.msg + '", preview "' +
   d.preview.slice(0, 40) + '")');
await page.click('#ps-formula-save');
await page.waitForTimeout(900);

const cycle = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const errs = t.computedErrors || {};
    const blank = c => ({
        typedAllNull: t.columns[c].every(v => v === null),
        rawAllEmpty: t.raw[c].every(v => v === ''),
        n: t.columns[c].length
    });
    const badge = c => {
        const el = document.querySelector(
            'th[data-grid-col="' + c + '"] .ps-grid-fx');
        return el ? { flag: el.getAttribute('data-fx-error'),
                      tip: el.getAttribute('data-tip') } : null;
    };
    return { keys: Object.keys(errs), alpha: errs.alpha, beta: errs.beta,
             blankAlpha: blank('alpha'), blankBeta: blank('beta'),
             badgeAlpha: badge('alpha'), badgeBeta: badge('beta'),
             dialogOpen: document.getElementById('ps-formula-dialog')
                 .style.display === 'flex' };
});
// The two names are listed in dependency-walk order, which is an artefact of
// column layout and carries no meaning, so the shape and the membership are
// pinned and the order is not.
const namesBoth = m => typeof m === 'string' &&
    /^circular reference \(.+ depend on each other\)$/.test(m) &&
    m.indexOf('alpha') !== -1 && m.indexOf('beta') !== -1;
ok(!cycle.dialogOpen,
   'the save is accepted by the dialog (it closes), so the cycle is a ' +
   'recompute-time refusal, not a parse-time one');
ok(namesBoth(cycle.alpha) && cycle.beta === cycle.alpha,
   'BOTH members of the cycle carry the SAME error, and it names both ' +
   'columns, got alpha: "' + cycle.alpha + '" and beta: "' + cycle.beta + '"');
ok(cycle.keys.length === 2,
   'only the two cycle members are flagged, errors are on: ' +
   JSON.stringify(cycle.keys));
ok(cycle.blankAlpha.typedAllNull && cycle.blankAlpha.rawAllEmpty &&
   cycle.blankBeta.typedAllNull && cycle.blankBeta.rawAllEmpty,
   'both columns are BLANKED so no stale value can drift (' +
   cycle.blankAlpha.n + ' rows, all null and all empty in alpha and beta)');
ok(cycle.badgeAlpha && cycle.badgeAlpha.flag === '1' &&
   cycle.badgeAlpha.tip === 'Formula error: ' + cycle.alpha,
   'the alpha fx badge carries the error flag and shows the same reason the ' +
   'table recorded, tip is: "' + (cycle.badgeAlpha && cycle.badgeAlpha.tip) +
   '"');
ok(cycle.badgeBeta && cycle.badgeBeta.flag === '1',
   'the beta fx badge carries the error flag too (flag ' +
   (cycle.badgeBeta && cycle.badgeBeta.flag) + ')');

// ---- breaking the cycle has to un-break both columns.
await openEdit('alpha');
await page.fill('#ps-formula-input', 'score + 1');
await page.waitForTimeout(300);
await page.click('#ps-formula-save');
await page.waitForTimeout(900);
const healed = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { errs: Object.keys(t.computedErrors || {}),
             score0: t.columns.score[0], alpha0: t.columns.alpha[0],
             beta0: t.columns.beta[0] };
});
ok(healed.errs.length === 0,
   'breaking the cycle clears every formula error (errors on: ' +
   JSON.stringify(healed.errs) + ')');
ok(healed.alpha0 === healed.score0 + 1 && healed.beta0 === healed.alpha0 + 1,
   'both columns recompute from real values again (score ' + healed.score0 +
   ', alpha ' + healed.alpha0 + ', beta ' + healed.beta0 + ')');

// ---- B10's other half: a FORWARD reference must be fresh, not one edit
// behind. gamma is appended AFTER alpha, then alpha is pointed at it, so
// column order and dependency order genuinely disagree.
await page.evaluate(() => window.PS_SHELL.saveComputedColumn(
    'gamma', 'score * 2'));
await page.waitForTimeout(600);
await openEdit('alpha');
await page.fill('#ps-formula-input', 'gamma + 1');
await page.waitForTimeout(300);
await page.click('#ps-formula-save');
await page.waitForTimeout(900);
let fwd = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { iAlpha: t.order.indexOf('alpha'), iGamma: t.order.indexOf('gamma'),
             errs: Object.keys(t.computedErrors || {}) };
});
ok(fwd.iAlpha < fwd.iGamma,
   'setup: alpha (column ' + fwd.iAlpha + ') really sits BEFORE the gamma it ' +
   'depends on (column ' + fwd.iGamma + '), so this is a forward reference');
ok(fwd.errs.length === 0,
   'a forward reference is legal, not an error (errors on: ' +
   JSON.stringify(fwd.errs) + ')');

// Now CHANGE what gamma computes. Evaluated in column order, alpha would read
// gamma's previous values and land one edit behind; evaluated in dependency
// order it lands on the new ones. This is the discriminating step: merely
// creating the forward reference is not, because gamma happened to be up to
// date at that moment.
await openEdit('gamma');
await page.fill('#ps-formula-input', 'score * 3');
await page.waitForTimeout(300);
await page.click('#ps-formula-save');
await page.waitForTimeout(900);
fwd = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { score0: t.columns.score[0], gamma0: t.columns.gamma[0],
             alpha0: t.columns.alpha[0], beta0: t.columns.beta[0],
             errs: Object.keys(t.computedErrors || {}) };
});
ok(fwd.gamma0 === fwd.score0 * 3 && fwd.alpha0 === fwd.gamma0 + 1 &&
   fwd.beta0 === fwd.alpha0 + 1,
   'changing what a forward-referenced column computes settles the whole ' +
   'chain in ONE pass, not one edit behind (score ' + fwd.score0 +
   ' -> gamma ' + fwd.gamma0 + ' -> alpha ' + fwd.alpha0 + ' -> beta ' +
   fwd.beta0 + '; expected ' + fwd.score0 + '/' + (fwd.score0 * 3) + '/' +
   (fwd.score0 * 3 + 1) + '/' + (fwd.score0 * 3 + 2) + ')');

// The same, driven by a real source-cell edit: one edit, one settled answer.
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(400);
await page.dblclick('td[data-gc="score"][data-gr="0"]');
await page.waitForTimeout(300);
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('120');
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await page.keyboard.press('Escape');
const edited = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { score0: t.columns.score[0], gamma0: t.columns.gamma[0],
             alpha0: t.columns.alpha[0], beta0: t.columns.beta[0] };
});
ok(edited.score0 === 120 && edited.gamma0 === 360 &&
   edited.alpha0 === 361 && edited.beta0 === 362,
   'one source-cell edit settles the forward-referencing chain in one step ' +
   '(score ' + edited.score0 + ', gamma ' + edited.gamma0 + ', alpha ' +
   edited.alpha0 + ', beta ' + edited.beta0 + '; expected 120/360/361/362)');

// ---- a self-reference that arrives inside a saved project (a hand-edited
// or hand-written .pand) must be reported, not looped on.
// Point alpha at ITSELF inside the serialized project. Done by parsing and
// re-stringifying rather than by a text replace: beta's formula is already
// the literal "alpha + 1", so a substring test on the raw text could be
// satisfied by beta and prove nothing.
const raw = await page.evaluate(() => window.PS_SHELL.projectFileText());
const doc = JSON.parse(raw);
const tbl = doc.table || (doc.project && doc.project.table) ||
            (doc.snapshot && doc.snapshot.table);
if (tbl && tbl.computed) tbl.computed.alpha = 'alpha + 1';
const cycText = JSON.stringify(doc);
ok(!!(tbl && tbl.computed && tbl.computed.alpha === 'alpha + 1' &&
      tbl.computed.gamma === 'score * 3'),
   'setup: the saved project really carries alpha\'s formula, and it now ' +
   'refers to alpha itself (computed map: ' +
   JSON.stringify(tbl && tbl.computed) + ')');
const cycFile = '/tmp/ps-coverage-gaps-selfref.pand';
fs.writeFileSync(cycFile, cycText);
const ctx3 = await browser.newContext();
const page3 = await ctx3.newPage();
const errors3 = [];
page3.on('pageerror', e => errors3.push(String(e)));
await page3.goto(pageUrl);
await page3.waitForTimeout(500);
await page3.click('#ps-welcome-new');
await page3.waitForTimeout(300);
await page3.setInputFiles('#ps-file', cycFile);
await page3.waitForTimeout(1200);
const selfLoaded = await page3.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { err: (t.computedErrors || {}).alpha,
             alphaAllNull: t.columns.alpha.every(v => v === null),
             score0: t.columns.score[0],
             gammaLive: t.columns.gamma[0] };
});
ok(selfLoaded.err === 'unknown variable "alpha"',
   'a self-referencing formula loaded from a project file is reported by ' +
   'name instead of looping, got: "' + selfLoaded.err + '"');
ok(selfLoaded.alphaAllNull,
   'the self-referencing column loads blank rather than carrying a value it ' +
   'cannot justify');
ok(selfLoaded.gammaLive === selfLoaded.score0 * 3,
   'the healthy computed columns in the same file are unaffected (score ' +
   selfLoaded.score0 + ', gamma ' + selfLoaded.gammaLive + ')');
if (errors3.length) throw new Error('page errors on the self-reference load: ' +
                                    errors3.join(' | '));
await ctx3.close();

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
await browser.close();
console.log('COVERAGE GAPS CHECK PASS');
