// Punch list t4-26, t4-27, t4-28: three bugs found while WRITING the coverage
// probes for t4-23, not by reading the code and not by the audit. Each is the
// same shape: a gesture that reports one thing while the app does another.
//
//   t4-26  Opening the filter popover and pressing Apply without touching
//          anything rewrote the stored value's type and took a data-history
//          step. There WAS a no-op guard, and it failed for exactly the reason
//          the bug exists: the draft coerces the value through
//          colStoresNumbers, so on a retyped column 4 becomes "4", the JSON
//          differs, and a gesture that changed nothing writes.
//   t4-27  The save toast said "it recalculates whenever the data changes"
//          while the column was all null and computedErrors held "circular
//          reference". The toast is the only feedback at that moment.
//   t4-28  setColType stored whatever it was handed, including "".
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

console.log('case 1: a no-op Apply changes nothing at all (t4-26)');
const noop = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await sleep(400);
    window.PS_SHELL.setFilters([{ col: 'hours', op: 'ge', value: 4 }]);
    await sleep(700);
    // The retype is what makes the coercion diverge, and it is the exact
    // recovery path B5 exists to keep open.
    window.PS_SHELL.setColType('hours', 'nominal');
    await sleep(800);
    const before = JSON.stringify(window.PS_SHELL.project.table.filters);
    const undoBefore = window.PS_SHELL.dataHistory().undo;
    // Open the popover and Apply without touching a control.
    document.getElementById('ps-data-filter-btn').click();
    await sleep(500);
    const applyBtn = document.querySelector('#ps-filtermenu [data-filter-apply]')
        || Array.from(document.querySelectorAll('#ps-filtermenu button'))
            .filter(b => /apply/i.test(b.textContent))[0];
    if (!applyBtn) return { err: 'no Apply button' };
    applyBtn.click();
    await sleep(800);
    return { before, after: JSON.stringify(window.PS_SHELL.project.table.filters),
             undoBefore, undoAfter: window.PS_SHELL.dataHistory().undo };
});
ok(!noop.err, `setup: the popover has an Apply button (${noop.err || 'ok'})`);
ok(/"value":4/.test(noop.before),
   `setup: the stored value is the NUMBER 4 (${noop.before})`);
ok(noop.after === noop.before,
   `a no-op Apply leaves the stored filter byte-identical, rather than ` +
   `rewriting 4 to "4" (${noop.after})`);
ok(noop.undoAfter === noop.undoBefore,
   `and takes no data-history step (${noop.undoBefore} -> ${noop.undoAfter})`);

console.log('case 2: the save toast reports what actually happened (t4-27)');
const cyc = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.saveComputedColumn('alpha', 'score + 1');
    await sleep(400);
    window.PS_SHELL.saveComputedColumn('beta', 'alpha + 1');
    await sleep(400);
    document.getElementById('ps-toast').innerHTML = '';
    // Editing alpha to depend on beta closes the loop. This COMPILES, which
    // is why the refusal has to come at recompute time and why the toast was
    // able to claim success.
    // (source, editingCol): the column being EDITED is the second argument.
    window.PS_SHELL.openFormulaDialog(null, 'alpha');
    await sleep(500);
    // submitFormulaDialog reads the NAME field as well; leaving it empty
    // makes the save fail validation and never reach the toast at all.
    document.getElementById('ps-formula-name').value = 'alpha';
    document.getElementById('ps-formula-input').value = 'beta + 1';
    const save = document.getElementById('ps-formula-save') ||
        Array.from(document.querySelectorAll('#ps-formula-dialog button'))
            .filter(b => /save|update/i.test(b.textContent))[0];
    save.click();
    await sleep(900);
    const t = window.PS_SHELL.project.table;
    return { toast: document.getElementById('ps-toast').innerText,
             err: t.computedErrors && t.computedErrors.alpha,
             values: (t.columns.alpha || []).slice(0, 3) };
});
ok(/circular|cycle/i.test(cyc.err || ''),
   `setup: the save really did create a cycle ("${cyc.err}")`);
ok(cyc.values.every(v => v == null),
   `and the column computes nothing (${JSON.stringify(cyc.values)})`);
ok(!/recalculates whenever the data changes/.test(cyc.toast),
   `the toast no longer promises it recalculates ` +
   `("${cyc.toast.replace(/\n/g, ' ').slice(0, 90)}")`);
ok(/cannot compute/i.test(cyc.toast) && /circular|cycle/i.test(cyc.toast),
   `it names the failure instead, where the only other route to the truth ` +
   `was hovering the fx badge ("${cyc.toast.replace(/\n/g, ' ').slice(0, 100)}")`);

console.log('case 3: setColType validates its argument (t4-28)');
const typ = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const t = window.PS_SHELL.project.table;
    const before = t.types.score;
    window.PS_SHELL.setColType('score', '');
    await sleep(300);
    const afterEmpty = window.PS_SHELL.project.table.types.score;
    window.PS_SHELL.setColType('score', 'banana');
    await sleep(300);
    const afterJunk = window.PS_SHELL.project.table.types.score;
    window.PS_SHELL.setColType('nosuchcolumn', 'nominal');
    await sleep(300);
    window.PS_SHELL.setColType('score', 'nominal');
    await sleep(500);
    return { before, afterEmpty, afterJunk,
             afterReal: window.PS_SHELL.project.table.types.score,
             ghost: 'nosuchcolumn' in window.PS_SHELL.project.table.types };
});
ok(typ.afterEmpty === typ.before,
   `an empty type is refused rather than stored (${JSON.stringify(typ.afterEmpty)})`);
ok(typ.afterJunk === typ.before,
   `so is an unknown one (${JSON.stringify(typ.afterJunk)})`);
ok(!typ.ghost,
   'and naming a column that does not exist does not invent one');
ok(typ.afterReal === 'nominal',
   `while a real type still applies, so the guard is not simply refusing ` +
   `everything (${typ.afterReal})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PROBED BUGS CHECK PASS');
await browser.close();
