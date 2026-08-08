// Opening a menu with the mouse destroyed the selection the menu acts on.
//
// A document pointerdown handler clears the grid selection for any press
// outside #ps-datagrid and four grid popovers. The application menu bar and
// the Data command bar are not on that list, so the press that OPENS Edit or
// Data threw the selection away before the item was clicked. The result:
//
//   Edit > Paste                       says "Select the cell to paste into first."
//   Data > Exclude or include values   permanently greyed, tooltip
//                                      "Select cells in the Data workspace first"
//   Data > New chart from selection    permanently greyed, same reason
//   Data > Fill down                   renders ENABLED (its enable test reads the
//                                      variable inspector, which survives) and its
//                                      handler then says "Select a cell to fill from"
//
// Every one of those is reachable by keyboard, because F10 and arrow keys fire
// no pointerdown, so the commands are not broken. They are unreachable by the
// gesture almost everyone uses, and each one blames the user for not doing the
// thing they had just done.
//
// The fix is the allowlist. The menus are transient chrome that ACT ON the
// selection, so pressing them is not "clicking away".
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
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(600);

const sel = () => page.evaluate(() => window.PS_SHELL.gridSelection());
// A real press, because the whole bug lives in a pointerdown handler and a
// synthetic click never fires one.
async function press(sel_) {
    const box = await page.locator(sel_).first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(300);
}
async function seatCell() {
    const pt = await page.evaluate(() => {
        const c = document.querySelectorAll('#ps-datagrid td[data-gc]')[6];
        const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(300);
}

console.log('case 1: opening a top-level menu keeps the selection');
await seatCell();
ok(!!(await sel()), 'a cell is selected to begin with');
await press('#ps-menubar button:has-text("Edit")');
ok(!!(await sel()),
   'the selection survives opening Edit, got ' + JSON.stringify(await sel()));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 2: the menu items that act on it are live');
await seatCell();
await press('#ps-menubar button:has-text("Data")');
const items = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-appmenu [data-cmd], #ps-appmenu button, #ps-appmenu [role="menuitem"]'))
    .map(n => ({
        text: (n.textContent || '').trim(),
        dis: n.getAttribute('aria-disabled') === 'true' || n.disabled === true ||
             n.classList.contains('ps-menu-disabled')
    })));
const excl = items.find(i => /Exclude or include/i.test(i.text));
const fromSel = items.find(i => /chart from selection/i.test(i.text));
ok(excl && !excl.dis,
   'Exclude or include selected values is enabled, got ' + JSON.stringify(excl));
ok(fromSel && !fromSel.dis,
   'New chart from selection is enabled, got ' + JSON.stringify(fromSel));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 3: the command actually runs from the menu');
await seatCell();
const before = await page.evaluate(() =>
    window.PS_SHELL.project.table.excluded &&
    JSON.stringify(window.PS_SHELL.project.table.excluded));
await press('#ps-menubar button:has-text("Data")');
await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll(
        '#ps-appmenu [data-cmd], #ps-appmenu button, #ps-appmenu [role="menuitem"]'))
        .find(x => /Exclude or include/i.test(x.textContent || ''));
    n.click();
});
await page.waitForTimeout(700);
const after = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.project.table.excluded));
ok(after !== before,
   'the exclusion landed, before ' + before + ' after ' + after);

console.log('case 3b: fill down runs instead of refusing');
// This one rendered ENABLED even while broken, because its enable test reads
// the variable inspector (which survives the menu press) while its handler
// reads the cell selection (which did not). Enable state and handler
// disagreed about what "selected" means.
await seatCell();
const fillFrom = (await sel()).anchorRow;
const fillBefore = await page.evaluate(() =>
    window.PS_SHELL.project.table.raw.hours.slice());
await press('#ps-menubar button:has-text("Data")');
await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll(
        '#ps-appmenu [data-cmd], #ps-appmenu button, #ps-appmenu [role="menuitem"]'))
        .find(x => /Fill down/i.test(x.textContent || ''));
    if (n) n.click();
});
await page.waitForTimeout(700);
const fillAfter = await page.evaluate(() =>
    window.PS_SHELL.project.table.raw.hours.slice());
ok(fillAfter.slice(fillFrom).every(v => v === fillBefore[fillFrom]) &&
   JSON.stringify(fillAfter) !== JSON.stringify(fillBefore),
   'the column filled downward from the selected cell, got ' +
   JSON.stringify(fillAfter.slice(0, 5)));
await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+z');
await page.waitForTimeout(600);

console.log('case 4: pressing the grid toolbar keeps the selection too');
await seatCell();
await press('#ps-data-more');
ok(!!(await sel()),
   'the overflow menu does not throw the selection away, got ' +
   JSON.stringify(await sel()));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 5: the command palette is on the list too');
// The palette is the route the F1 sheet recommends by name, and its result
// buttons run commands that act on the selection. The press on a result
// landed in the same document handler first, so a mouse click on New chart
// from selection destroyed the selection and then asked for it. The
// keyboard route through the palette always worked, same signature as the
// menus.
await page.evaluate(() =>
    window.PS_SHELL.setGridSelection('score', 0, 'hours', 0, 'column'));
await page.waitForTimeout(300);
ok(JSON.stringify(await page.evaluate(() =>
    window.PS_SHELL.selectedColumns())) === JSON.stringify(['score', 'hours']),
   'two columns are selected to begin with');
await page.keyboard.press(
    (process.platform === 'darwin' ? 'Meta' : 'Control') + '+Shift+KeyP');
await page.waitForTimeout(400);
await page.evaluate(() => {
    const s = document.getElementById('ps-command-search');
    s.value = 'chart from selection';
    s.dispatchEvent(new Event('input'));
});
await page.waitForTimeout(300);
await press('[data-palette-command="data-chart-sel"]');
await page.waitForTimeout(600);
const armedChips = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-analysis-arm .ps-arm-chip'))
    .map(c => c.textContent));
ok(JSON.stringify(armedChips) === JSON.stringify(['score', 'hours']),
   'the command runs on the selection it was invoked for, got ' +
   JSON.stringify(armedChips));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 6: clicking genuinely away still clears it');
await seatCell();
const away = await page.evaluate(() => {
    const r = document.getElementById('ps-inspector-data').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 8 };
});
await page.mouse.move(away.x, away.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(300);
ok(!(await sel()),
   'a press outside the grid and its menus clears as before, got ' +
   JSON.stringify(await sel()));

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('MENU SELECTION CHECK: ALL GREEN');
await browser.close();
