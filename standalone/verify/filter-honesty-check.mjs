// Punch list t4-25: the filter popover misrepresented a filter on a retyped
// column.
//
// Found while writing the B5 coverage probe. With `hours >= 4` stored and
// Hours then retyped to Nominal, three surfaces disagreed: the chart note and
// the button tooltip both said `hours >= "4" ... not applied`, while the
// POPOVER, the one place a user can edit the thing, displayed
// `hours = (choose a level)` with a live preview of "showing 24 of 24 rows".
// The operator select dropped `ge` because the column can no longer use it, so
// it fell back to the first option; the value select had no matching level, so
// it showed the placeholder. Neither is what is stored, and neither is what is
// being disclosed elsewhere.
//
// The rule this asserts: the popover shows the STORED condition, marks why it
// is not being applied, and agrees with every other surface.
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
await page.waitForTimeout(1400);

console.log('case 1: a stranded numeric comparison shows itself');
const strand = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await sleep(400);
    window.PS_SHELL.setFilters([{ col: 'hours', op: 'ge', value: 4 }]);
    await sleep(700);
    window.PS_SHELL.setColType('hours', 'nominal');
    await sleep(900);
    document.getElementById('ps-data-filter-btn').click();
    await sleep(600);
    const m = document.getElementById('ps-filtermenu');
    const opSel = m.querySelector('[data-filter-op]');
    const valEl = m.querySelector('[data-filter-value]');
    return {
        stored: JSON.stringify(window.PS_SHELL.project.table.filters),
        op: opSel ? opSel.value : null,
        opLabel: opSel && opSel.selectedOptions[0]
            ? opSel.selectedOptions[0].textContent : null,
        val: valEl ? valEl.value : null,
        note: (m.querySelector('.ps-filter-stranded') || {}).textContent || '',
        inapplicable: (window.PS_SHELL.project.table.filterInapplicable || [])
            .join('|')
    };
});
ok(/"op":"ge"/.test(strand.stored),
   `setup: the stored operator is still ge (${strand.stored})`);
ok(strand.op === 'ge',
   `the popover's operator select shows the STORED operator, not the first ` +
   `one it happens to allow (${strand.op})`);
ok(/needs numbers/.test(strand.opLabel || ''),
   `marked as unusable on this column rather than looking ordinary ` +
   `("${strand.opLabel}")`);
ok(String(strand.val) === '4',
   `and the value select shows the stored 4, not "(choose a level)" ` +
   `(${JSON.stringify(strand.val)})`);
ok(/not being applied/.test(strand.note) && /hours/.test(strand.note),
   `with a sentence saying it is not being applied and why ("${strand.note}")`);
ok(/hours/.test(strand.inapplicable),
   `which is the same thing the chart note is disclosing ` +
   `(filterInapplicable: ${strand.inapplicable})`);

console.log('case 2: a value that is not a level is shown, not swallowed');
const stray = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-data-filter-btn').click();   // close
    await sleep(300);
    // An equality filter is legal on a nominal column, so the OPERATOR is
    // fine here and only the value is stranded. That separates the two halves
    // of the fix instead of testing them together.
    window.PS_SHELL.setFilters([{ col: 'condition', op: 'eq', value: 'Placebo' }]);
    await sleep(800);
    document.getElementById('ps-data-filter-btn').click();
    await sleep(600);
    const m = document.getElementById('ps-filtermenu');
    const valEl = m.querySelector('[data-filter-value]');
    return { val: valEl ? valEl.value : null,
             label: valEl && valEl.selectedOptions && valEl.selectedOptions[0]
                 ? valEl.selectedOptions[0].textContent : null,
             note: (m.querySelector('.ps-filter-stranded') || {}).textContent || '',
             levels: (window.PS_SHELL.project.table.levels.condition || []).join('|') };
});
ok(stray.levels.split('|').indexOf('Placebo') === -1,
   `setup: "Placebo" really is not one of condition's levels (${stray.levels})`);
ok(stray.val === 'Placebo',
   `the stored value is shown (${JSON.stringify(stray.val)})`);
ok(/not a level here/.test(stray.label || ''),
   `and marked, so it does not read as an ordinary choice ("${stray.label}")`);
ok(/not being applied/.test(stray.note),
   `with its own explanation ("${stray.note}")`);

console.log('case 3: an ordinary filter is left completely alone');
const fine = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-data-filter-btn').click();
    await sleep(300);
    window.PS_SHELL.setColType('hours', 'continuous');
    await sleep(700);
    window.PS_SHELL.setFilters([{ col: 'hours', op: 'ge', value: 4 }]);
    await sleep(800);
    document.getElementById('ps-data-filter-btn').click();
    await sleep(600);
    const m = document.getElementById('ps-filtermenu');
    const opSel = m.querySelector('[data-filter-op]');
    return { op: opSel ? opSel.value : null,
             label: opSel && opSel.selectedOptions[0]
                 ? opSel.selectedOptions[0].textContent : null,
             notes: m.querySelectorAll('.ps-filter-stranded').length,
             inapplicable: (window.PS_SHELL.project.table.filterInapplicable
                 || []).length };
});
ok(fine.op === 'ge' && !/needs numbers/.test(fine.label || ''),
   `a working comparison carries no marking (${JSON.stringify(fine.label)})`);
ok(fine.notes === 0 && fine.inapplicable === 0,
   `and no explanation, because there is nothing to explain ` +
   `(${fine.notes} notes)`);

console.log('case 4: the B7 note injection is idempotent against user edits');
// The engine's note editor holds the COMPOSED text (user words + injected
// filter sentence), so committing any edit while a filter is live bakes the
// sentence into the stored note. Before the Jul 27 follow-up fix, the next
// render drew the sentence TWICE, and clearing the filter left a stale
// "showing N of M rows" claim drawn on the chart and riding every export -
// a false disclosure, the exact class B7 exists to prevent.
const baked = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setFilters([{ col: 'hours', op: 'ge', value: 4 }]);
    await sleep(900);
    // Commit the composed note plus the user's own word, exactly as the
    // engine's text panel does (chartSpec routing on a migrated module).
    const spec = JSON.parse(window.PS_SHELL.buildPayload().chartSpec || '{}');
    spec.chartNote = (spec.chartNote || '') + ' (edited)';
    window.setOption('chartSpec', JSON.stringify(spec));
    await sleep(1200);
    const note = window.PS_SHELL.buildPayload().chartNote || '';
    return { count: (note.match(/Filter: /g) || []).length, note };
});
ok(baked.count === 1,
   `after the user commits an edited note, the filter sentence appears ` +
   `exactly ONCE, not once per render (${JSON.stringify(baked.note)})`);
ok(/\(edited\)/.test(baked.note),
   `and the user's own words survive the scrub`);

const cleared = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setFilters([]);
    await sleep(900);
    const note = window.PS_SHELL.buildPayload().chartNote || '';
    // What the chart actually DRAWS is the assertion that matters: the
    // stale claim rode the render-side spec, not just the payload key.
    const drawn = Array.from(document.querySelectorAll('svg text'))
        .map(t => t.textContent).filter(t => /Filter:/.test(t));
    return { note, drawn };
});
ok(!/Filter: /.test(cleared.note) && cleared.drawn.length === 0,
   `clearing the filter removes the baked sentence from the drawn chart, ` +
   `so no export can claim rows are hidden when none are ` +
   `(drawn: ${JSON.stringify(cleared.drawn)})`);
ok(/\(edited\)/.test(cleared.note),
   `while the user's own note text is kept (${JSON.stringify(cleared.note)})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FILTER HONESTY CHECK PASS');
await browser.close();
