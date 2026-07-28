// Punch list item 7: layout history.
//
// Before this, every layout mutator persisted straight away with nothing
// kept, so removing a panel from a figure was permanent; and Cmd/Ctrl+Z in
// the Layout workspace fell through the undo-key router to the ENGINE's
// document-capture handler, silently undoing a style edit on a chart in a
// different tab.
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
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(200);
}

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const items = () => page.evaluate(() => {
    const layout = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    return layout ? layout.items.map(i => ({ id: i.id, kind: i.kind,
        x: i.x, y: i.y, w: i.w, h: i.h, text: i.text })) : null;
});
const layoutPage = () => page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    return l ? { w: l.page.w, h: l.page.h } : null;
});
const histBtns = () => page.evaluate(() => ({
    undo: document.getElementById('ps-lundo').disabled,
    redo: document.getElementById('ps-lredo').disabled
}));

// Give the chart a style edit first, so the ENGINE has undo history of its
// own. Anything the layout's Cmd+Z leaks into would show up here.
const chartId = await page.evaluate(() => window.PS_SHELL.chart().id);
await page.evaluate(() => {
    window.setOption('chartSpec', JSON.stringify({ barOpacity: 0.42 }));
});
await page.waitForTimeout(200);
const specBefore = await page.evaluate(() => JSON.stringify(
    window.PS_SHELL.optionStore().chartSpec || ''));
if (!/0\.42/.test(specBefore))
    throw new Error('setup: the style edit did not reach the option store');

await page.evaluate(() => { window.PS_SHELL.showLayoutGallery(); });
await page.waitForTimeout(150);
await page.click('[data-layout-template="single"]');
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(400);

const start = await items();
if (!start || !start.length)
    throw new Error('setup: the template produced no layout items');
if (!(await histBtns()).undo)
    throw new Error('a freshly created layout offers Undo with nothing to undo');
console.log('  ok  a new layout starts with an empty history');

// ---- 1. delete is recoverable, from the toast and from the key ----
await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    window.PS_SHELL.selectLayoutItems([l.items[0].id]);
});
await page.waitForTimeout(60);
await page.keyboard.press('Delete');
await page.waitForTimeout(150);
if ((await items()).length !== start.length - 1)
    throw new Error('Delete did not remove the selected item');
const toast = page.locator('#ps-toast.ps-toast-action button');
if (await toast.count() !== 1)
    throw new Error('deleting a layout item offered no Undo toast');
await toast.click();
await page.waitForTimeout(250);
if ((await items()).length !== start.length)
    throw new Error('the delete toast did not restore the item');
console.log('  ok  deleting a panel is offered back through the toast');

await page.click('#ps-lcanvas', { position: { x: 4, y: 4 } });
await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    window.PS_SHELL.selectLayoutItems([l.items[0].id]);
});
await page.keyboard.press('Delete');
await page.waitForTimeout(150);
await page.keyboard.press(`${MOD}+z`);
await page.waitForTimeout(250);
if ((await items()).length !== start.length)
    throw new Error('Cmd/Ctrl+Z did not undo the layout delete');
console.log('  ok  Cmd/Ctrl+Z undoes a layout delete');

// ---- 2. the key does not reach the engine ----
await page.keyboard.press(`${MOD}+z`);
await page.keyboard.press(`${MOD}+z`);
await page.waitForTimeout(250);
await page.evaluate(id => window.PS_SHELL.switchChart(id), chartId);
await page.waitForTimeout(300);
const specAfter = await page.evaluate(() => JSON.stringify(
    window.PS_SHELL.optionStore().chartSpec || ''));
if (specAfter !== specBefore)
    throw new Error('undo in Layout leaked into the chart styling history: ' +
                    specBefore + ' -> ' + specAfter);
console.log('  ok  layout undo never touches the chart styling history');
await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    window.PS_SHELL.switchChart(l.id);
});
await page.waitForTimeout(300);

// ---- 3. a burst of nudges is ONE undo step ----
await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    window.PS_SHELL.selectLayoutItems([l.items[0].id]);
});
await page.waitForTimeout(60);
const beforeNudge = (await items())[0].x;
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
const nudged = (await items())[0].x;
if (nudged === beforeNudge)
    throw new Error('setup: the arrow nudges did not move the item');
await page.keyboard.press(`${MOD}+z`);
await page.waitForTimeout(250);
if ((await items())[0].x !== beforeNudge)
    throw new Error('one undo did not clear the whole nudge burst: ' +
                    (await items())[0].x + ' vs ' + beforeNudge);
console.log('  ok  a burst of nudges collapses into one undo step');

// ---- 4. redo ----
await page.keyboard.press(`${MOD}+Shift+z`);
await page.waitForTimeout(250);
if ((await items())[0].x !== nudged)
    throw new Error('redo did not reapply the nudge');
console.log('  ok  redo reapplies a layout change');

// ---- 5. page size is history, view preferences are not ----
const pageBefore = await layoutPage();
const gridBefore = await page.evaluate(() =>
    document.getElementById('ps-lgrid-toggle').getAttribute('aria-pressed'));
await page.selectOption('#ps-lpage', 'square');
await page.waitForTimeout(200);
if ((await layoutPage()).w === pageBefore.w)
    throw new Error('setup: the page preset did not change the page');
await page.click('#ps-lgrid-toggle');
await page.waitForTimeout(120);
const gridToggled = await page.evaluate(() =>
    document.getElementById('ps-lgrid-toggle').getAttribute('aria-pressed'));
if (gridToggled === gridBefore)
    throw new Error('setup: the grid toggle did not change');
await page.keyboard.press(`${MOD}+z`);
await page.waitForTimeout(250);
const pageAfter = await layoutPage();
if (pageAfter.w !== pageBefore.w || pageAfter.h !== pageBefore.h)
    throw new Error('undo did not restore the page size: ' +
                    JSON.stringify(pageAfter) + ' vs ' + JSON.stringify(pageBefore));
if (await page.evaluate(() =>
        document.getElementById('ps-lgrid-toggle').getAttribute('aria-pressed'))
    !== gridToggled)
    throw new Error('undo reverted a view preference (the grid toggle) as well ' +
                    'as the content change');
console.log('  ok  undo restores the page size and leaves view preferences alone');

// ---- 6. the toolbar buttons track the stacks ----
let hb = await histBtns();
if (hb.redo)
    throw new Error('Redo stayed disabled after an undo left something to redo');
await page.click('#ps-lredo');
await page.waitForTimeout(250);
if ((await layoutPage()).w === pageBefore.w)
    throw new Error('the toolbar Redo button did not reapply the page change');
await page.click('#ps-lundo');
await page.waitForTimeout(250);
if ((await layoutPage()).w !== pageBefore.w)
    throw new Error('the toolbar Undo button did not revert the page change');
console.log('  ok  the toolbar Undo and Redo buttons drive the same history');

// ---- 7. the Edit menu names what the key will actually do ----
async function editMenuUndoLabel() {
    await page.click('[data-ps-menu="edit"]');
    await page.waitForTimeout(120);
    const label = await page.evaluate(() => {
        const b = document.querySelector('#ps-appmenu [data-app-command="undo"]');
        return b ? b.querySelector('span').textContent.trim() : null;
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    return label;
}
const layoutLabel = await editMenuUndoLabel();
if (!/layout/i.test(layoutLabel || ''))
    throw new Error('the Edit menu still says "' + layoutLabel +
                    '" while a layout is on screen');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(200);
const dataLabel = await editMenuUndoLabel();
if (!/data/i.test(dataLabel || ''))
    throw new Error('the Edit menu says "' + dataLabel + '" in the Data workspace');
console.log('  ok  the Edit menu names the history the shortcut will use');

// ---- B4: Escape cancels a live drag and puts the item back ----
// (the Edit-menu case above leaves the app in the Data workspace)
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(250);
// Escape used to clear the SELECTION and repaint from already-mutated
// coordinates without touching LAY_DRAG or its document listeners, so the
// item stayed where the cursor had put it and kept following the mouse.
await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    window.PS_SHELL.selectLayoutItems([l.items[0].id]);
});
await page.waitForTimeout(80);
const home = (await items())[0];
const itemBox = await page.locator(
    `.ps-litem[data-item-id="${home.id}"]`).boundingBox();
await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + 14);
await page.mouse.down();
await page.mouse.move(itemBox.x + itemBox.width / 2 + 90, itemBox.y + 74,
                      { steps: 8 });
await page.waitForTimeout(80);
const dragged = (await items())[0];
if (dragged.x === home.x && dragged.y === home.y)
    throw new Error('setup: the drag did not move the item');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
let back = (await items())[0];
if (back.x !== home.x || back.y !== home.y)
    throw new Error('Escape did not put the dragged item back: ' +
                    JSON.stringify(back) + ' vs ' + JSON.stringify(home));
// and the gesture must be DEAD: further pointer movement moves nothing
await page.mouse.move(itemBox.x + itemBox.width / 2 + 200, itemBox.y + 160,
                      { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(120);
back = (await items())[0];
if (back.x !== home.x || back.y !== home.y)
    throw new Error('the item kept following the mouse after Escape: ' +
                    JSON.stringify(back));
if (!(await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    return window.PS_SHELL.layoutSelection().length === 1;
})))
    throw new Error('Escape dropped the selection instead of cancelling the drag');
console.log('  ok  Escape cancels a live layout drag and restores the item');

// ---- 8. history does not survive into a different project ----
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(200);
if ((await histBtns()).undo)
    throw new Error('setup: expected the layout to have history at this point');
await page.evaluate(() => window.PS_SHELL.loadSample());
await page.waitForTimeout(400);
const survived = await page.evaluate(() =>
    window.PS_SHELL.layoutHistoryDepth());
if (survived !== 0)
    throw new Error('layout history survived a project load (' + survived +
                    ' entries); layout ids are not project-unique');
console.log('  ok  loading another project clears the layout history');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT UNDO CHECK PASS');
await browser.close();
