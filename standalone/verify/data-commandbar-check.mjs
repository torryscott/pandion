// Real-browser smoke for the standalone Data command bar.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(150);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(180);

const toolbar = page.locator('.ps-data-commandbar');
if (!(await toolbar.isVisible()) ||
    !(await page.locator('#ps-data-undo').isDisabled()) ||
    !(await page.locator('#ps-data-redo').isDisabled()))
    throw new Error('Data command bar or its initial history state is incorrect');
const iconParity = await page.evaluate(() => {
    const dataUndo = document.querySelector('#ps-data-undo path');
    const chartUndo = document.querySelector(
        '.graphbuilder2-host button[aria-label="Undo"] path');
    const dataRedo = document.querySelector('#ps-data-redo path');
    const chartRedo = document.querySelector(
        '.graphbuilder2-host button[aria-label="Redo"] path');
    const dataSearch = document.querySelector('#ps-data-find').parentElement;
    const chartSearch = document.querySelector(
        '.graphbuilder2-host [data-role="setting-search-trigger"]');
    return {
        undo: !!dataUndo && !!chartUndo &&
            dataUndo.getAttribute('d') === chartUndo.getAttribute('d'),
        redo: !!dataRedo && !!chartRedo &&
            dataRedo.getAttribute('d') === chartRedo.getAttribute('d'),
        searchCircle: dataSearch.querySelector('circle').getAttribute('r') ===
            chartSearch.querySelector('circle').getAttribute('r'),
        searchPath: dataSearch.querySelector('path').getAttribute('d') ===
            chartSearch.querySelector('path').getAttribute('d')
    };
});
if (!iconParity.undo || !iconParity.redo ||
    !iconParity.searchCircle || !iconParity.searchPath)
    throw new Error(`Data and Chart icon language diverged: ` +
                    JSON.stringify(iconParity));
if (await page.locator('#ps-data-row, #ps-data-row-go, ' +
                       '#ps-data-add-row, #ps-data-add-variable').count())
    throw new Error('removed Go/Add controls remain in the Data command bar');
if (await page.locator('#ps-dataview').count())
    throw new Error('redundant top-level Data workspace toggle remains');
if (await page.locator(
    '#ps-variable-type-menu, #ps-variable-restore, #ps-variable-add, ' +
    '#ps-variable-duplicate, #ps-variable-sort-asc, ' +
    '#ps-variable-sort-desc, #ps-variable-delete').count())
    throw new Error('duplicated spreadsheet commands remain in the inspector');
await page.click('#ps-datagrid th[data-grid-col="condition"]');
await page.waitForTimeout(80);
if (!(await page.locator('#ps-variable-name').isVisible()) ||
    !(await page.locator('#ps-variable-type').isVisible()) ||
    !(await page.locator('#ps-variable-stats').isVisible()))
    throw new Error('inspector cleanup removed variable properties or summary');
console.log('  ok  Data opens with the exact Chart Undo, Redo, and Search icons');

const freshEdit = page.locator(
    '#ps-datagrid td[data-gc="score"][data-gr="0"]');
await freshEdit.dblclick();    // a click now SELECTS
await freshEdit.locator('input.ps-grid-cellinput').fill('62');
await freshEdit.locator('input.ps-grid-cellinput').press('Enter');
await page.waitForTimeout(120);
if (await page.locator('#ps-data-undo').isDisabled())
    throw new Error('first cell edit did not immediately enable visible Undo');
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
let historyState = await page.evaluate(() => ({
    value: window.PS_SHELL.project.table.raw.score[0],
    redoDisabled: document.getElementById('ps-data-redo').disabled
}));
if (historyState.value !== '61' || historyState.redoDisabled)
    throw new Error(`visible Undo/Redo state lagged the first edit: ` +
                    JSON.stringify(historyState));
await page.click('#ps-data-redo');
await page.waitForTimeout(120);
historyState = await page.evaluate(() => ({
    value: window.PS_SHELL.project.table.raw.score[0],
    undoDisabled: document.getElementById('ps-data-undo').disabled
}));
if (historyState.value !== '62' || historyState.undoDisabled)
    throw new Error(`visible Redo did not reapply the first edit: ` +
                    JSON.stringify(historyState));
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
console.log('  ok  the first cell edit immediately activates visible Undo/Redo');

await page.fill('#ps-data-find', 'West');
await page.waitForTimeout(120);
let findState = await page.evaluate(() => ({
    count: document.getElementById('ps-data-find-count').textContent,
    selected: Array.from(document.querySelectorAll(
        '#ps-datagrid td.ps-grid-selected')).map(node => ({
            col: node.getAttribute('data-gc'),
            row: Number(node.getAttribute('data-gr'))
        }))
}));
if (findState.count !== '1 of 12' || findState.selected.length !== 1 ||
    findState.selected[0].col !== 'site' || findState.selected[0].row !== 1)
    throw new Error(`Find did not reveal its first match: ${JSON.stringify(findState)}`);
await page.click('#ps-data-find-next');
findState = await page.evaluate(() => ({
    count: document.getElementById('ps-data-find-count').textContent,
    row: Number(document.querySelector(
        '#ps-datagrid td.ps-grid-selected').getAttribute('data-gr'))
}));
if (findState.count !== '2 of 12' || findState.row !== 3)
    throw new Error(`Find next did not advance: ${JSON.stringify(findState)}`);
await page.keyboard.press('Control+f');
if (!(await page.locator('#ps-data-find').evaluate(node =>
        document.activeElement === node)))
    throw new Error('Cmd/Ctrl+F did not focus Data search');
console.log('  ok  Find navigates matches and owns Cmd/Ctrl+F');

await page.locator('#ps-datagrid td[data-grid-row="9"]')
    .click({ button: 'right' });
if (!(await page.locator('#ps-rowmenu').isVisible()))
    throw new Error('right-clicking a row number did not open row commands');
await page.click('#ps-rowmenu-insert-below');
await page.waitForTimeout(120);
let dimensions = await page.evaluate(() => ({
    rows: window.PS_SHELL.project.table.raw.condition.length,
    cols: window.PS_SHELL.project.table.order.length,
    inserted: window.PS_SHELL.project.table.raw.condition[10]
}));
if (dimensions.rows !== 25 || dimensions.inserted !== '' ||
    await page.locator('#ps-data-undo').isDisabled())
    throw new Error(`contextual row insertion failed: ${JSON.stringify(dimensions)}`);
await page.locator('input.ps-grid-cellinput').press('Escape');
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
if (await page.evaluate(() =>
        window.PS_SHELL.project.table.raw.condition.length) !== 24)
    throw new Error('visible Undo did not restore the row count');

await page.locator('#ps-datagrid th[data-grid-col="hours"]')
    .click({ button: 'right' });
if (!(await page.locator('#ps-columnmenu').isVisible()))
    throw new Error('right-clicking a column did not open column commands');
await page.click('#ps-columnmenu-insert-left');
await page.waitForTimeout(120);
dimensions = await page.evaluate(() => ({
    rows: window.PS_SHELL.project.table.raw.condition.length,
    cols: window.PS_SHELL.project.table.order.length,
    order: window.PS_SHELL.project.table.order
}));
if (dimensions.cols !== 5 || dimensions.order[2] !== 'Variable' ||
    dimensions.order[3] !== 'hours')
    throw new Error(`contextual column insertion failed: ${JSON.stringify(dimensions)}`);
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
if (await page.evaluate(() => window.PS_SHELL.project.table.order.length) !== 4)
    throw new Error('visible Undo did not restore the column count');
console.log('  ok  row and column context menus insert relative to the target');

await page.locator('#ps-datagrid td[data-grid-row="0"]')
    .click({ button: 'right' });
await page.click('#ps-rowmenu-duplicate');
await page.waitForTimeout(120);
let rowAction = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return {
        rows: t.raw.condition.length,
        first: t.order.map(col => t.raw[col][0]),
        second: t.order.map(col => t.raw[col][1]),
        independentId: t.caseIds[0] !== t.caseIds[1]
    };
});
if (rowAction.rows !== 25 ||
    JSON.stringify(rowAction.first) !== JSON.stringify(rowAction.second) ||
    !rowAction.independentId)
    throw new Error(`Duplicate row did not create an independent copy: ` +
                    JSON.stringify(rowAction));
await page.click('#ps-data-undo');
await page.waitForTimeout(120);

await page.locator('#ps-datagrid td[data-grid-row="0"]')
    .click({ button: 'right' });
await page.click('#ps-rowmenu-delete');
await page.waitForTimeout(120);
rowAction = await page.evaluate(() => ({
    rows: window.PS_SHELL.project.table.raw.condition.length,
    firstScore: window.PS_SHELL.project.table.raw.score[0]
}));
if (rowAction.rows !== 23 || rowAction.firstScore !== '55')
    throw new Error(`Delete row removed the wrong observation: ` +
                    JSON.stringify(rowAction));
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
console.log('  ok  row duplicate and delete are recoverable Data actions');

await page.locator('#ps-datagrid th[data-grid-col="hours"]')
    .click({ button: 'right' });
await page.click('#ps-columnmenu-duplicate');
await page.waitForTimeout(120);
let columnAction = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return {
        order: t.order,
        same: JSON.stringify(t.raw.hours) === JSON.stringify(t.raw['hours copy'])
    };
});
if (columnAction.order[3] !== 'hours copy' || !columnAction.same)
    throw new Error(`Duplicate column did not copy beside its source: ` +
                    JSON.stringify(columnAction));
await page.click('#ps-data-undo');
await page.waitForTimeout(120);

await page.locator('#ps-datagrid th[data-grid-col="site"]')
    .click({ button: 'right' });
await page.click('#ps-columnmenu-rename');
const renameInput = page.locator('#ps-variable-name');
if (!(await renameInput.evaluate(node => document.activeElement === node)))
    throw new Error('Rename column did not route to the variable inspector');
await renameInput.fill('location');
await renameInput.press('Enter');
await page.waitForTimeout(120);
if (!(await page.evaluate(() =>
        window.PS_SHELL.project.table.order.includes('location'))))
    throw new Error('inspector-routed Rename column did not commit');
await page.click('#ps-data-undo');
await page.waitForTimeout(120);

await page.locator('#ps-datagrid th[data-grid-col="site"]')
    .click({ button: 'right' });
await page.click('#ps-columnmenu-type');
if (!(await page.locator('#ps-typemenu').isVisible()))
    throw new Error('Change measure type did not open the established type menu');
await page.keyboard.press('Escape');

await page.locator('#ps-datagrid th[data-grid-col="site"]')
    .click({ button: 'right' });
await page.click('#ps-columnmenu-delete');
await page.waitForTimeout(120);
if (await page.evaluate(() =>
        window.PS_SHELL.project.table.order.length) !== 3)
    throw new Error('Delete column did not remove its target');
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
console.log('  ok  column rename, duplicate, type, and delete reuse established controls');

await page.locator('#ps-datagrid th[data-grid-col="score"]')
    .click({ button: 'right' });
await page.click('#ps-columnmenu-sort-asc');
await page.waitForTimeout(120);
let sorted = await page.evaluate(() =>
    window.PS_SHELL.project.table.raw.score.map(Number));
if (sorted[0] !== 52 || sorted[sorted.length - 1] !== 91)
    throw new Error(`ascending context sort failed: ${JSON.stringify(sorted)}`);
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
await page.locator('#ps-datagrid th[data-grid-col="score"]')
    .click({ button: 'right' });
await page.click('#ps-columnmenu-sort-desc');
await page.waitForTimeout(120);
sorted = await page.evaluate(() =>
    window.PS_SHELL.project.table.raw.score.map(Number));
if (sorted[0] !== 91 || sorted[sorted.length - 1] !== 52)
    throw new Error(`descending context sort failed: ${JSON.stringify(sorted)}`);
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
console.log('  ok  column context sorting replaces the duplicated inspector controls');

await page.locator('#ps-datagrid th[data-grid-col="hours"]')
    .click({ button: 'right' });
await page.click('#ps-columnmenu-hide');
await page.waitForTimeout(120);
let columnView = await page.evaluate(() => ({
    visible: window.PS_SHELL.visibleColumns(),
    order: window.PS_SHELL.project.table.order.slice(),
    value: window.PS_SHELL.project.table.raw.hours[0],
    indicator: document.getElementById('ps-data-hidden-columns').textContent
}));
if (columnView.visible.includes('hours') ||
    !columnView.order.includes('hours') || columnView.value !== '3.1' ||
    !columnView.indicator.includes('1 column hidden'))
    throw new Error(`Hide column changed data or missed its status: ` +
                    JSON.stringify(columnView));
await page.click('#ps-data-hidden-columns');
if (!(await page.locator('#ps-columnview-menu').isVisible()))
    throw new Error('hidden-column indicator did not open restoration controls');
await page.click('#ps-columnview-hidden-list button[data-show-column="hours"]');
await page.waitForTimeout(120);
if (!(await page.locator(
        '#ps-datagrid th[data-grid-col="hours"]').isVisible()))
    throw new Error('individual Show action did not restore its column');

await page.click('#ps-data-hidden-columns');
await page.click('#ps-columnview-focus');
await page.waitForTimeout(120);
columnView = await page.evaluate(() => ({
    visible: window.PS_SHELL.visibleColumns(),
    focus: window.PS_SHELL.columnView().focus,
    indicator: document.getElementById('ps-data-hidden-columns').textContent
}));
if (JSON.stringify(columnView.visible) !==
        JSON.stringify(['condition', 'score']) ||
    !columnView.focus || !columnView.indicator.includes('Chart focus'))
    throw new Error(`chart-variable focus rendered the wrong view: ` +
                    JSON.stringify(columnView));
await page.click('#ps-data-hidden-columns');
await page.click('#ps-columnview-focus');
await page.waitForTimeout(120);
if ((await page.locator('#ps-datagrid th[data-grid-col]').count()) !== 4 ||
    (await page.evaluate(() => window.PS_SHELL.columnView().focus)))
    throw new Error('turning off chart focus did not restore the full grid');
const savedColumnView = await page.evaluate(() =>
    window.PS_SHELL.projectFileText());
if (savedColumnView.includes('hiddenColumns') ||
    savedColumnView.includes('focusChartColumns'))
    throw new Error('temporary column visibility leaked into the project file');
console.log('  ok  temporary hiding and chart focus preserve the dataset and restore cleanly');

await page.locator('#ps-datagrid td[data-gc="score"][data-gr="0"]')
    .click({ button: 'right' });
await page.click('#ps-cellmenu-toggle');
await page.waitForTimeout(120);
if (!(await page.locator('#ps-data-exclusions').evaluate(node =>
        node.classList.contains('ps-data-exclusions-visible'))) ||
    !(await page.locator('#ps-data-exclusions-count').textContent())
        .includes('1 value'))
    throw new Error('exclusion status did not appear in the command bar');
await page.locator('#ps-datagrid td[data-grid-row="0"]')
    .click({ button: 'right' });
await page.click('#ps-rowmenu-insert-above');
await page.waitForTimeout(120);
const shiftedExclusion = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return {
        moved: !!(t.excluded.score && t.excluded.score[1]),
        value: t.raw.score[1]
    };
});
if (!shiftedExclusion.moved || shiftedExclusion.value !== '61')
    throw new Error(`row insertion detached a cell exclusion from its value: ` +
                    JSON.stringify(shiftedExclusion));
await page.locator('input.ps-grid-cellinput').press('Escape');
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
await page.click('#ps-data-restore');
await page.waitForTimeout(120);
if (await page.evaluate(() =>
        Object.keys(window.PS_SHELL.project.table.excluded).length) !== 0)
    throw new Error('command-bar Restore did not clear exclusions');
console.log('  ok  exclusions follow row insertion and recovery updates in place');

await page.click('#ps-data-more');
if (!(await page.locator('#ps-datamenu').isVisible()))
    throw new Error('Data overflow menu did not open');
await page.click('#ps-datamenu-fitall');
await page.waitForTimeout(120);
if (!(await page.locator('.ps-grid-table').evaluate(node =>
        node.classList.contains('ps-grid-sized'))))
    throw new Error('overflow Auto-fit all did not size the grid');
await page.click('#ps-data-more');
await page.click('#ps-datamenu-resetwidths');
await page.waitForTimeout(120);
if (await page.locator('.ps-grid-table').evaluate(node =>
        node.classList.contains('ps-grid-sized')))
    throw new Error('overflow Reset widths did not restore automatic layout');
console.log('  ok  overflow menu exposes secondary column commands');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('DATA COMMAND BAR CHECK: ALL GREEN');
