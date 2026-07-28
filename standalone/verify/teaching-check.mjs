// Punch list items 19 and 21.
//
//   19  measure types are the app's core gate and were never defined anywhere.
//       VAR_TYPES was four bare labels; the type menu showed icon plus label
//       with no description; the chip tooltip said only "<Type> variable -
//       click to change the type". A student whose 1-5 rating column would not
//       drop on a value axis had to already understand three words the app
//       never explained - and the refused drop said nothing either, because
//       dragover returned without preventDefault, so no drop event ever fired.
//   21  whole-page file drop is advertised in the loader ("or drop one anywhere
//       on the page") with no dragenter, no dragleave and no overlay, while
//       role slots, the variable list and the wizard all light up.
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
await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(400);
}

// --------------------------------------------------------------- 19
console.log('case 1: the type menu defines the four types');
await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('data');
    window.PS_SHELL.selectVariable('condition');
});
await page.waitForTimeout(400);
const menu = await page.evaluate(() => {
    // data-tip, not title: the app has its own tooltip now (punch list 42),
    // so the native attribute is deliberately empty. Falls back to title so
    // this keeps working for any control that still uses it. Which variable
    // leads the list depends on what is assigned (assigned ones leave it,
    // roles-first pass Jul 27 2026), so the claim is type-agnostic: the
    // tooltip must open with the definition of the chip's OWN type.
    const chip = document.querySelector('#ps-columns .ps-chip');
    return { kind: chip ? chip.getAttribute('data-kind') : '',
             tooltip: chip
        ? (chip.getAttribute('data-tip') || chip.title || '') : '' };
});
const DEFS = { nominal: /Nominal: Named groups with no order/,
               ordinal: /Ordinal: /, continuous: /Continuous: Numbers/,
               id: /ID: / };
ok(DEFS[menu.kind] && DEFS[menu.kind].test(menu.tooltip),
   `the variable chip's tooltip defines its own type (${menu.kind}) rather ` +
   `than naming it ("${menu.tooltip.split('\n')[0]}")`);
ok(/For example/.test(menu.tooltip),
   'and gives an example a student would recognise');

const opened = await page.evaluate(() => {
    const chip = document.querySelector('#ps-datagrid th [data-type-badge], ' +
        '#ps-columns .ps-chip');
    const r = chip.getBoundingClientRect();
    window.PS_SHELL.openTypeMenu(r.left, r.bottom, 'condition');
    const m = document.getElementById('ps-typemenu');
    return { shown: m.style.display === 'block', text: m.innerText,
             entries: Array.from(m.querySelectorAll('button')).map(b => ({
                 label: (b.querySelector('.ps-tm-label') || {}).textContent,
                 gloss: (b.querySelector('.ps-tm-gloss') || {}).textContent,
                 eg: (b.querySelector('.ps-tm-eg') || {}).textContent,
                 // data-tip, not title: see above.
                 note: b.getAttribute('data-tip') || b.title })) };
});
ok(opened.shown && opened.entries.length === 4,
   `the type menu lists all four measure types (${opened.entries.length})`);
ok(opened.entries.every(e => e.gloss && e.gloss.length > 12),
   `every one carries a definition, not just a label ` +
   `(${JSON.stringify(opened.entries.map(e => e.label))})`);
ok(opened.entries.every(e => e.eg && /e\.g\./.test(e.eg)),
   'and an example');
ok(opened.entries.every(e => e.note && e.note.length > 20),
   'with a longer note on hover for the part that catches people out');
// The one distinction the whole gate turns on has to be stated somewhere.
const ord = opened.entries.filter(e => e.label === 'Ordinal')[0];
ok(/double duty|value axis/i.test(ord.note),
   `Ordinal explains its dual role, which is what a 1-5 rating column needs ` +
   `("${ord.note.slice(0, 90)}")`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 2: the inspector says what the chosen type means');
const hint = await page.evaluate(() => {
    window.PS_SHELL.selectVariable('score');
    return { type: document.getElementById('ps-variable-type').value,
             hint: document.getElementById('ps-variable-type-hint').textContent };
});
ok(hint.type === 'continuous' && /average/.test(hint.hint),
   `the Measure type field carries a live definition ("${hint.hint}")`);
const hint2 = await page.evaluate(() => {
    window.PS_SHELL.setColType('score', 'nominal');
    window.PS_SHELL.selectVariable('score');
    return document.getElementById('ps-variable-type-hint').textContent;
});
ok(/no order/.test(hint2) && !/average/.test(hint2),
   `and it follows the type rather than being fixed copy ("${hint2}")`);

// --------------------------------------------------------------- 19: refusals
console.log('case 3: a refused drop explains itself and offers the fix');
const refused = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // The exact case the item names: a numeric rating column typed Nominal,
    // dropped on a value axis.
    window.PS_SHELL.loadTable('ratings', ['grp', 'rating'], [
        ['a', '1'], ['a', '3'], ['b', '5'], ['b', '4']
    ], { grp: 'nominal', rating: 'nominal' });
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setWorkspace('chart');
    await sleep(700);
    document.getElementById('ps-toast').innerHTML = '';
    const before = window.PS_SHELL.project.table.types.rating;
    const out = window.PS_SHELL.refuseReasonFor('yvar', 'rating');
    return { before: before, why: out && out.why, fix: out && out.fix };
});
ok(refused.before === 'nominal',
   'setup: a numeric rating column is typed Nominal');
ok(refused.why && /rating is Nominal/.test(refused.why),
   `the refusal names the variable and its type ("${refused.why}")`);
ok(refused.fix === 'continuous',
   `and identifies the one change that would work (${refused.fix})`);

// Drive it as a real drag so the fix is exercised end to end: the old
// dragover returned without preventDefault, so no drop ever fired here.
const dropped = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const chip = Array.from(document.querySelectorAll('#ps-columns .ps-chip'))
        .filter(c => c.getAttribute('data-col') === 'rating')[0];
    const slots = Array.from(document.querySelectorAll('.ps-slot-drop'));
    const target = slots[1] || slots[0];
    const dt = new DataTransfer();
    chip.dispatchEvent(new DragEvent('dragstart',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
    const over = new DragEvent('dragover',
        { dataTransfer: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(over);
    const marked = target.className;
    target.dispatchEvent(new DragEvent('drop',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sleep(300);
    const toast = document.getElementById('ps-toast');
    return { overAccepted: over.defaultPrevented, marked: marked,
             toast: toast.textContent,
             button: (toast.querySelector('button') || {}).textContent };
});
ok(dropped.overAccepted,
   'dragover now accepts the drop so a refusal can be reported at all');
ok(/ps-dropreject/.test(dropped.marked),
   `and the slot shows the refusal while the drag is still in the air ` +
   `("${dropped.marked}")`);
ok(/is Nominal/.test(dropped.toast),
   `dropping it explains why instead of doing nothing ` +
   `("${dropped.toast.slice(0, 110)}")`);
ok(/Set to Continuous/.test(dropped.button || ''),
   `with the fix offered as one click (${JSON.stringify(dropped.button)})`);
const applied = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#ps-toast button').click();
    await sleep(500);
    return window.PS_SHELL.project.table.types.rating;
});
ok(applied === 'continuous', 'and taking it retypes the column');

// --------------------------------------------------------------- 21
console.log('case 4: the page shows a target for the drop it advertises');
const zone = await page.evaluate(() => {
    const z = document.getElementById('ps-pagedrop');
    return { exists: !!z,
             hidden: z ? getComputedStyle(z).display === 'none' : null,
             inert: z ? getComputedStyle(z).pointerEvents === 'none' : null };
});
ok(zone.exists && zone.hidden,
   'the drop target exists and is out of the way when nothing is dragging');
ok(zone.inert,
   'and is pointer-inert, so it can never swallow the drop it advertises');

const lit = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['a,b\n1,2'], 'x.csv', { type: 'text/csv' }));
    document.dispatchEvent(new DragEvent('dragenter',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
    const z = document.getElementById('ps-pagedrop');
    return { on: z.classList.contains('ps-pagedrop-on'), text: z.innerText };
});
ok(lit.on, 'dragging a file over the page lights the target');
ok(/Drop to open/.test(lit.text) && /\.omv/.test(lit.text),
   `and it says what will happen and what is accepted ` +
   `("${lit.text.replace(/\n/g, ' ')}")`);

// A variable chip dragged onto a role slot must NOT light the whole page.
const chipDrag = await page.evaluate(() => {
    const z = document.getElementById('ps-pagedrop');
    z.classList.remove('ps-pagedrop-on');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'score');
    document.dispatchEvent(new DragEvent('dragenter',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
    return z.classList.contains('ps-pagedrop-on');
});
ok(!chipDrag,
   'dragging a variable chip does not light it, only files do');

const cleared = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const dt = new DataTransfer();
    dt.items.add(new File(['a,b\n1,2'], 'x.csv', { type: 'text/csv' }));
    document.dispatchEvent(new DragEvent('dragenter',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
    const beforeLeave = document.getElementById('ps-pagedrop')
        .classList.contains('ps-pagedrop-on');
    // relatedTarget null is the real exit: dragleave fires for every child
    // crossed, so a boolean would flicker the overlay off mid-drag.
    document.dispatchEvent(new DragEvent('dragleave',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sleep(100);
    return { beforeLeave: beforeLeave,
             after: document.getElementById('ps-pagedrop')
                 .classList.contains('ps-pagedrop-on') };
});
ok(cleared.beforeLeave && !cleared.after,
   'and leaving the window puts it away again');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('TEACHING CHECK PASS');
await browser.close();
