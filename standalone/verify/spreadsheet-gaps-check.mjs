// Punch list t3-47: the four spreadsheet gaps.
//
//   Replace        Find had prev/next and a count; Replace did not exist, so
//                  recoding Male/male/M to one level meant a computed IF()
//                  column or one cell at a time.
//   Column reorder 12 commands in the column menu and no move left/right.
//   Fill down      "Fill with focused value" filled a SELECTION from its
//                  focused cell; carrying a value to the bottom of a column,
//                  which is what every spreadsheet means by fill, was absent.
//   Column stats   the panel headed with a variable's name showed Rows,
//                  Valid, Missing, Distinct, Excluded and Used-in, and no
//                  mean, SD, min, median or max.
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

console.log('case 1: Replace, on the recode the item names');
const recode = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // The item's own example: three spellings of one level.
    window.PS_SHELL.loadTable('people', ['sex', 'score'], [
        ['Male', '1'], ['male', '2'], ['M', '3'], ['Female', '4'],
        ['male', '5']
    ]);
    await s(1000);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    // t3-47 follow-up (Torry's ruling): Replace is hidden at rest - Find is
    // the sticky control - and reveals from the toggle. Opened HERE through
    // the real button, because the rest of this file writes straight to the
    // inputs and would exercise a UI the user cannot see.
    const wrap = document.getElementById('ps-data-replace-wrap');
    const hiddenAtRest = wrap.hasAttribute('hidden') && wrap.offsetParent === null;
    document.getElementById('ps-data-replace-toggle').click();
    await s(250);
    // The layout assertion the first shape lacked, and the one that would
    // have caught Torry's screenshot: the revealed controls occupy DISJOINT
    // rectangles ("Replace" overflowed its inherited 22px glyph-button box
    // across "All"), and the whole-cell label sits on the app type scale
    // (it inherited the 16px default).
    function rct(id) {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, l: r.left, r: r.right, t: r.top, b: r.bottom };
    }
    const rs = [rct('ps-data-replace'), rct('ps-data-replace-one'),
                rct('ps-data-replace-all'), rct('ps-data-replace-whole-wrap')];
    const overlaps = [];
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const w = Math.min(rs[i].r, rs[j].r) - Math.max(rs[i].l, rs[j].l);
        const h = Math.min(rs[i].b, rs[j].b) - Math.max(rs[i].t, rs[j].t);
        if (w > 1 && h > 1) overlaps.push(rs[i].id + ' x ' + rs[j].id);
      }
    const wholeFs = parseFloat(getComputedStyle(document.querySelector(
        '#ps-data-replace-whole-wrap span')).fontSize);
    // CONTROL LESSON: the original overlap was OVERFLOWING TEXT ("Replace"
    // spilling out of an inherited 22px glyph-button box across "All"), and
    // element rects cannot see that - the boxes stay disjoint while the ink
    // collides. scrollWidth vs clientWidth is the measurement that bites.
    const spills = ['ps-data-replace-one', 'ps-data-replace-all',
                    'ps-data-replace-whole-wrap'].filter(id => {
        const n = document.getElementById(id);
        return n.scrollWidth > n.clientWidth + 1;
    });
    const nowVisible = wrap.offsetParent !== null;
    const before = window.PS_SHELL.project.table.levels.sex.slice();
    document.getElementById('ps-data-find').value = 'male';
    document.getElementById('ps-data-find')
        .dispatchEvent(new Event('input', { bubbles: true }));
    await s(500);
    document.getElementById('ps-data-replace').value = 'Male';
    window.PS_SHELL.gridReplace(true);
    await s(1000);
    return { before, hiddenAtRest, nowVisible, overlaps, wholeFs, spills,
             after: window.PS_SHELL.project.table.levels.sex.slice(),
             values: window.PS_SHELL.project.table.raw.sex.slice(),
             toast: document.getElementById('ps-toast').innerText };
});
ok(recode.hiddenAtRest && recode.nowVisible,
   'Replace is hidden at rest and reveals from its toggle: Find is sticky, ' +
   'Replace is a mode (Torry\'s ruling, Jul 27 2026)');
ok(recode.overlaps.length === 0,
   `and the revealed controls occupy disjoint rectangles ` +
   `(${JSON.stringify(recode.overlaps)})`);
ok(recode.spills.length === 0,
   `and no control's text overflows its own box, which is what the rects ` +
   `cannot see (${JSON.stringify(recode.spills)})`);
ok(recode.wholeFs <= 12,
   `with the whole-cell label on the app type scale, not the inherited ` +
   `16px default (${recode.wholeFs}px)`);
ok(recode.before.length === 4,
   `setup: four spellings before (${JSON.stringify(recode.before)})`);
ok(recode.values[0] === 'Male' && recode.values[1] === 'Male' &&
   recode.values[4] === 'Male',
   `every spelling of male becomes one (${JSON.stringify(recode.values)})`);
// THE ONE THAT MATTERS. A substring replace turns Female into FeMale, which
// corrupts the exact dataset this feature exists to fix. Whole-cell is the
// default because of it, and this assertion is why the default is that way.
ok(recode.values[3] === 'Female',
   `and Female is UNTOUCHED, which a substring replace would have turned ` +
   `into FeMale (${JSON.stringify(recode.values)})`);
ok(/Replaced \d+ value/.test(recode.toast) && /puts them back/.test(recode.toast),
   `and it says how many and how to undo ` +
   `("${recode.toast.replace(/\n/g, ' ').slice(0, 80)}")`);

console.log('case 2: substring is available, and discloses itself');
const inside = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.dataUndo();
    await s(700);
    document.getElementById('ps-data-replace-whole').checked = false;
    document.getElementById('ps-data-find').value = 'male';
    document.getElementById('ps-data-find')
        .dispatchEvent(new Event('input', { bubbles: true }));
    await s(500);
    document.getElementById('ps-data-replace').value = 'Male';
    window.PS_SHELL.gridReplace(true);
    await s(900);
    const out = { values: window.PS_SHELL.project.table.raw.sex.slice(),
                  toast: document.getElementById('ps-toast').innerText };
    document.getElementById('ps-data-replace-whole').checked = true;
    window.PS_SHELL.dataUndo();
    await s(700);
    return out;
});
ok(inside.values[3] === 'FeMale',
   `turning the switch OFF does replace inside cells, so the capability is ` +
   `there for anyone who wants it (${JSON.stringify(inside.values)})`);
ok(/matched inside cells/.test(inside.toast),
   `and the message says which rule ran, because the two give different ` +
   `answers on the same data ("${inside.toast.replace(/\n/g, ' ').slice(0, 80)}")`);

console.log('case 3: and one undo takes the whole replacement back');
const undone = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.dataUndo();
    await s(800);
    return window.PS_SHELL.project.table.raw.sex.slice();
});
ok(undone[1] === 'male' && undone[2] === 'M',
   `a multi-cell replace is ONE undo step, not one per cell ` +
   `(${JSON.stringify(undone)})`);

console.log('case 4: replacing nothing takes no undo step');
const noop = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const depth = window.PS_SHELL.dataHistory().undo;
    // A search that MATCHES but whose replacement is byte-identical.
    // Searching for something ABSENT returns earlier, on "no matches", and so
    // never reaches the branch this is about; and replacing "male" with
    // "male" is not a no-op either, because it lowercases the cell reading
    // "Male", which is a real edit and should take a step.
    document.getElementById('ps-data-find').value = 'Female';
    document.getElementById('ps-data-find')
        .dispatchEvent(new Event('input', { bubbles: true }));
    await s(500);
    document.getElementById('ps-data-replace').value = 'Female';
    window.PS_SHELL.gridReplace(true);
    await s(600);
    return { depth, after: window.PS_SHELL.dataHistory().undo,
             toast: document.getElementById('ps-toast').innerText };
});
ok(noop.after === noop.depth,
   `a replace that changes nothing leaves no undo step behind ` +
   `(${noop.depth} -> ${noop.after})`);

console.log('case 5: column reorder');
const moved = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const before = window.PS_SHELL.project.table.order.slice();
    window.PS_SHELL.moveColumnBy('score', -1);
    await s(700);
    const after = window.PS_SHELL.project.table.order.slice();
    document.getElementById('ps-toast').innerHTML = '';
    window.PS_SHELL.moveColumnBy(after[0], -1);
    await s(500);
    return { before, after,
             edgeToast: document.getElementById('ps-toast').innerText,
             unchanged: window.PS_SHELL.project.table.order.slice() };
});
ok(JSON.stringify(moved.before) === JSON.stringify(['sex', 'score']) &&
   JSON.stringify(moved.after) === JSON.stringify(['score', 'sex']),
   `a column moves left (${JSON.stringify(moved.before)} -> ` +
   `${JSON.stringify(moved.after)})`);
ok(JSON.stringify(moved.unchanged) === JSON.stringify(moved.after) &&
   /already at the start/.test(moved.edgeToast),
   `and at the edge it says so rather than silently doing nothing ` +
   `("${moved.edgeToast.replace(/\n/g, ' ').slice(0, 50)}")`);

console.log('case 6: fill down');
const filled = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('grp', ['label', 'n'], [
        ['A', '1'], ['', '2'], ['', '3'], ['B', '4'], ['', '5']
    ]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    window.PS_SHELL.setGridSelection('label', 0, 'label', 0, 'cells');
    await s(300);
    window.PS_SHELL.gridFillDown();
    await s(900);
    return { values: window.PS_SHELL.project.table.raw.label.slice(),
             toast: document.getElementById('ps-toast').innerText };
});
ok(filled.values.every(v => v === 'A'),
   `the selected value carries to the bottom of its column ` +
   `(${JSON.stringify(filled.values)})`);
ok(/Filled \d+ cell/.test(filled.toast) && /puts them back/.test(filled.toast),
   `saying how many and how to undo ` +
   `("${filled.toast.replace(/\n/g, ' ').slice(0, 60)}")`);

console.log('case 7: column stats, where they mean something');
const stats = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('nums', ['v', 'grp'], [
        ['2', 'a'], ['4', 'b'], ['4', 'a'], ['4', 'b'], ['5', 'a'],
        ['5', 'b'], ['7', 'a'], ['9', 'b']
    ]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.selectVariable('v');
    await s(500);
    const num = document.getElementById('ps-variable-stats').innerText;
    window.PS_SHELL.selectVariable('grp');
    await s(400);
    const cat = document.getElementById('ps-variable-stats').innerText;
    return { num, cat };
});
// mean 5, SD 2 (the textbook 2,4,4,4,5,5,7,9 set), median 4.5, min 2, max 9.
ok(/Mean\s*5\b/.test(stats.num) && /SD\s*2\b/.test(stats.num),
   `a numeric column reports a mean and SD, computed by the same ps-stat the ` +
   `charts use ("${stats.num.replace(/\n/g, ' ').slice(0, 90)}")`);
ok(/Median\s*4\.5/.test(stats.num) && /Min\s*2\b/.test(stats.num) &&
   /Max\s*9\b/.test(stats.num),
   `with median, min and max ("${stats.num.replace(/\n/g, ' ')}")`);
ok(!/Mean/.test(stats.cat),
   `and a NOMINAL column reports none of them ` +
   `("${stats.cat.replace(/\n/g, ' ').slice(0, 70)}")`);

// THE CASE THAT MATTERS: a numeric-CODED nominal, such as a 1-5 rating typed
// Nominal. A text column is refused by the numeric filter anyway, so only
// this one proves the type guard is doing work, and it is the exact column
// where a printed mean would mislead.
const coded = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('rating', ['r', 'y'],
        [['1', 'a'], ['5', 'b'], ['3', 'a'], ['5', 'b']],
        { r: 'nominal', y: 'nominal' });
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.selectVariable('r');
    await s(500);
    return { type: window.PS_SHELL.project.table.types.r,
             text: document.getElementById('ps-variable-stats').innerText };
});
ok(coded.type === 'nominal',
   `setup: a numeric-coded column typed Nominal (${coded.type})`);
ok(!/Mean/.test(coded.text),
   `gets no mean, because averaging category codes is the classic way to ` +
   `mislead yourself ("${coded.text.replace(/\n/g, ' ').slice(0, 70)}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SPREADSHEET GAPS CHECK PASS');
await browser.close();
