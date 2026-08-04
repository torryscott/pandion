// t4-34 + t4-35 (Torry's asks, Jul 27 2026): discontiguous column selection
// via Cmd/Ctrl+click, and drag-a-header-to-reorder with live parting.
//
// The selection model rule: the set (GRID_SELECTION_COLS) is the truth for
// every column consumer, and the rect degrades to the FOCUSED column while
// the set is active, so an untaught consumer UNDER-selects instead of
// silently spanning the gap. The drag rule is b4's: Escape restores
// geometry AND kills the gesture; a commit is one undo step.
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
// Ctrl+left-click on macOS synthesizes a CONTEXTMENU (that is why Mac
// users press Cmd); the probe must speak the platform's own modifier.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('cols', ['a', 'b', 'c', 'd', 'e'],
        [['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '10'],
         ['11', '12', '13', '14', '15']]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
});
const selCols = () => page.evaluate(() => window.PS_SHELL.selectedColumns());

console.log('case 1: Cmd/Ctrl+click toggles columns in and out of the set');
await page.click('th[data-grid-col="a"]');
await page.waitForTimeout(150);
await page.click('th[data-grid-col="c"]', { modifiers: [MOD] });
await page.waitForTimeout(150);
ok(JSON.stringify(await selCols()) === JSON.stringify(['a', 'c']),
   `Ctrl+click adds a non-adjacent column (${JSON.stringify(await selCols())})`);
await page.click('th[data-grid-col="e"]', { modifiers: [MOD] });
await page.waitForTimeout(150);
ok(JSON.stringify(await selCols()) === JSON.stringify(['a', 'c', 'e']),
   'and another');
await page.click('th[data-grid-col="c"]', { modifiers: [MOD] });
await page.waitForTimeout(150);
ok(JSON.stringify(await selCols()) === JSON.stringify(['a', 'e']),
   'Ctrl+clicking a selected column removes it');
const paint = await page.evaluate(() => {
    const sel = k => document.querySelector('th[data-grid-col="' + k + '"]')
        .classList.contains('ps-grid-axis-selected');
    return { a: sel('a'), b: sel('b'), e: sel('e') };
});
ok(paint.a && paint.e && !paint.b,
   `the headers paint the SET, not the span: a and e lit, b between them ` +
   `dark (${JSON.stringify(paint)})`);

console.log('case 2: copy skips the gap');
const tsv = await page.evaluate(() => window.PS_SHELL.selectionText());
const head = tsv.split('\n')[0], row0 = tsv.split('\n')[1];
ok(head === 'a\te' && row0 === '1\t5',
   `TSV carries only the selected columns, side by side ` +
   `("${head}" / "${row0}")`);

console.log('case 3: the context menu acts on the set');
await page.click('th[data-grid-col="a"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-columnmenu-hide');
await page.waitForTimeout(500);
ok(JSON.stringify(await page.evaluate(() =>
       Array.from(document.querySelectorAll('th[data-grid-col]'))
           .map(h => h.getAttribute('data-grid-col')))) ===
   JSON.stringify(['b', 'c', 'd']),
   'hiding from inside the set hides a AND e, leaving the gap column alone');

console.log('case 4: chart-from-selection carries exactly the set');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('mix', ['cond', 'noise', 'score'],
        [['x', '9', '1'], ['y', '8', '2'], ['x', '7', '3'], ['y', '6', '4']],
        { cond: 'nominal', noise: 'continuous', score: 'continuous' });
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
});
await page.click('th[data-grid-col="cond"]');
await page.waitForTimeout(150);
await page.click('th[data-grid-col="score"]', { modifiers: [MOD] });
await page.waitForTimeout(150);
await page.evaluate(() => window.PS_SHELL.runCommand('data-chart-sel'));
await page.waitForTimeout(600);
const armChips = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#ps-analysis-arm .ps-arm-chip'))
        .map(c => c.textContent));
ok(JSON.stringify(armChips) === JSON.stringify(['cond', 'score']),
   `the armed dialog reads the SET: noise, between them, is not dragged ` +
   `along (${JSON.stringify(armChips)}) - the 200-column workflow`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 5: dragging a header reorders, with live parting');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('mv', ['p', 'q', 'r', 's'],
        [['1', '2', '3', '4'], ['5', '6', '7', '8']]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
});
const headRect = k => page.evaluate(k2 => {
    const r = document.querySelector('th[data-grid-col="' + k2 + '"]')
        .getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, k);
const fromR = await headRect('s'), toR = await headRect('q');
await page.mouse.move(fromR.x, fromR.y);
await page.mouse.down();
let parted = false;
for (let i = 1; i <= 10; i++) {
    await page.mouse.move(fromR.x + (toR.x - 30 - fromR.x) * i / 10, fromR.y,
                          { steps: 1 });
    await page.waitForTimeout(20);
    if (i === 7) parted = await page.evaluate(() =>
        !!document.querySelector('th[data-grid-col="q"]').style.transform ||
        !!document.querySelector('th[data-grid-col="r"]').style.transform);
}
await page.mouse.up();
await page.waitForTimeout(700);
ok(parted, 'mid-drag, the columns it passes carry a parting transform: the ' +
   'data moves out of the way');
const orderAfter = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.project.table.order));
ok(orderAfter === JSON.stringify(['p', 's', 'q', 'r']),
   `dropping commits the new order (${orderAfter})`);
await page.evaluate(() => window.PS_SHELL.dataUndo());
await page.waitForTimeout(600);
ok(await page.evaluate(() =>
       JSON.stringify(window.PS_SHELL.project.table.order)) ===
   JSON.stringify(['p', 'q', 'r', 's']),
   'and one undo puts the column back');

console.log('case 5b: a dead-zone drop restores geometry instead of sticking');
// Torry's screenshot, Jul 31 2026: drop a column just short of where the
// neighbor parts - the order does not change, so the commit path never
// re-renders, and the old handler skipped the restore on the promise that
// the re-render would wipe the transforms. The column stuck overlapping
// its neighbor with a gap where it belonged. The contract: after ANY
// release, either the order changed or every transform is gone.
{
    const from2 = await headRect('q');
    await page.mouse.move(from2.x, from2.y);
    await page.mouse.down();
    // Arm (>6px horizontal) but stay inside q's own slot.
    await page.mouse.move(from2.x + 12, from2.y, { steps: 4 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
        order: JSON.stringify(window.PS_SHELL.project.table.order),
        stuck: [...document.querySelectorAll(
            '#ps-datagrid th[data-grid-col], #ps-datagrid td[data-gc]')]
            .filter(c => c.style.transform).length,
    }));
    ok(after.stuck === 0,
       `a no-op drop leaves ZERO cells carrying a transform (${after.stuck})`);
    // Case 5 committed a move and then UNDID it, so the standing order
    // here is the original p,q,r,s.
    ok(after.order === JSON.stringify(['p', 'q', 'r', 's']),
       `and the order is untouched (${after.order})`);
}

console.log('case 6: Escape cancels the drag outright (the b4 rule)');
const fr2 = await headRect('p'), to2 = await headRect('r');
await page.mouse.move(fr2.x, fr2.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++)
    await page.mouse.move(fr2.x + (to2.x - fr2.x) * i / 6, fr2.y, { steps: 1 });
await page.waitForTimeout(80);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const cancelled = await page.evaluate(() => ({
    transforms: Array.from(document.querySelectorAll('th[data-grid-col]'))
        .filter(h => h.style.transform).length,
    order: JSON.stringify(window.PS_SHELL.project.table.order)
}));
await page.mouse.up();
await page.waitForTimeout(300);
const postUp = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.project.table.order));
ok(cancelled.transforms === 0 && cancelled.order === JSON.stringify(['p', 'q', 'r', 's']),
   'Escape restores every column and commits nothing');
ok(postUp === JSON.stringify(['p', 'q', 'r', 's']),
   'and the release after the cancel is inert: the gesture is dead');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('COLUMN GESTURES CHECK PASS');
await browser.close();
