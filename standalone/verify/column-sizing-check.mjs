// Real-browser smoke for standalone Data column sizing.
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
const context = await browser.newContext();
const page = await context.newPage({ viewport: { width: 1500, height: 920 } });
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

function header(col) {
    return page.locator(`#ps-datagrid th[data-grid-col="${col}"]`);
}
async function width(col) {
    return await header(col).evaluate(node => node.getBoundingClientRect().width);
}

const scoreBefore = await width('score');
const hoursBefore = await width('hours');
const handle = header('score').locator('.ps-grid-col-resizer');
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 84, box.y + box.height / 2,
                      { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(120);

const scoreAfter = await width('score');
const hoursAfter = await width('hours');
if (scoreAfter < scoreBefore + 70)
    throw new Error(`divider drag did not widen score: ${scoreBefore} -> ${scoreAfter}`);
if (Math.abs(hoursAfter - hoursBefore) > 2)
    throw new Error(`divider drag changed neighboring hours width: ` +
                    `${hoursBefore} -> ${hoursAfter}`);
const stored = await page.evaluate(() =>
    window.PS_SHELL.project.ui.columnWidths.score);
if (Math.abs(stored - scoreAfter) > 2)
    throw new Error(`resized width was not stored: ${stored} vs ${scoreAfter}`);
console.log('  ok  divider drag changes only the intended column');

await page.reload();
await page.waitForTimeout(400);
if (await page.locator('#ps-welcome').isVisible()) {
    const continueButton = page.locator('#ps-welcome-continue');
    if (await continueButton.isVisible()) {
        await continueButton.click();
        await page.waitForTimeout(150);
    }
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(150);
const scoreReloaded = await width('score');
if (Math.abs(scoreReloaded - scoreAfter) > 2)
    throw new Error(`column width did not survive reload: ` +
                    `${scoreAfter} -> ${scoreReloaded}`);
console.log('  ok  column widths survive local project recovery');

await header('score').locator('.ps-grid-col-resizer').dblclick();
await page.waitForTimeout(120);
const scoreAutoFit = await width('score');
if (scoreAutoFit >= scoreReloaded - 20)
    throw new Error(`double-click did not auto-fit score: ` +
                    `${scoreReloaded} -> ${scoreAutoFit}`);
console.log('  ok  double-clicking a divider auto-fits its column');

await header('score').click({ button: 'right' });
const menu = page.locator('#ps-columnmenu');
if (!(await menu.isVisible()))
    throw new Error('header context menu did not open');
const labels = await menu.locator('button').allTextContents();
for (const expected of ['Auto-fit column', 'Auto-fit all columns',
                        'Reset column width', 'Reset all widths'])
    if (!labels.includes(expected))
        throw new Error(`header menu is missing ${expected}`);
await page.click('#ps-columnmenu-resetall');
await page.waitForTimeout(200);
// Reset all widths used to mean "go back to the browser's stretch-to-fill
// layout" (no widths, not sized). Auto-fit is the default for every column
// now (Torry, Sep 2026), so reset means "fit to content again": the widths
// come straight back, and they are the FITTED ones rather than whatever
// the user had dragged. Asserted both ways below - a reset must restore
// the fitted width, not leave the grid unsized and not keep a dragged one.
const resetState = await page.evaluate(() => ({
    widths: Object.assign({}, window.PS_SHELL.project.ui.columnWidths),
    columns: window.PS_SHELL.project.table.order.length,
    sized: document.querySelector('.ps-grid-table').classList.contains(
        'ps-grid-sized')
}));
if (!resetState.sized ||
    Object.keys(resetState.widths).length !== resetState.columns)
    throw new Error('Reset all widths did not re-fit every column: ' +
                    JSON.stringify(resetState));
const scoreReset = await width('score');
if (Math.abs(scoreReset - scoreAutoFit) > 4)
    throw new Error(`Reset all widths did not restore the fitted width: ` +
                    `${scoreReset} vs auto-fit ${scoreAutoFit}`);
console.log('  ok  header menu exposes auto-fit and reset commands, ' +
            'and reset re-fits to content');

await header('hours').click({ button: 'right' });
await page.click('#ps-columnmenu-fitall');
await page.waitForTimeout(120);
const fitState = await page.evaluate(() => ({
    count: Object.keys(window.PS_SHELL.project.ui.columnWidths).length,
    columns: window.PS_SHELL.project.table.order.length,
    sized: document.querySelector('.ps-grid-table').classList.contains(
        'ps-grid-sized')
}));
if (!fitState.sized || fitState.count !== fitState.columns)
    throw new Error('Auto-fit all did not size every data column');
console.log('  ok  Auto-fit all creates explicit widths for every column');

const activeCell = page.locator(
    '#ps-datagrid td[data-gc="score"][data-gr="0"]');
await activeCell.dblclick();   // a click now SELECTS
const editState = await activeCell.evaluate(node => {
    const input = node.querySelector('input.ps-grid-cellinput');
    const style = getComputedStyle(node);
    return {
        input: !!input,
        selectionCollapsed: !!input &&
            input.selectionStart === input.selectionEnd,
        shadow: style.boxShadow,
        overflow: style.overflow
    };
});
if (!editState.input || !editState.selectionCollapsed ||
    editState.shadow === 'none' || editState.overflow !== 'visible')
    throw new Error(`active-cell treatment regressed: ${JSON.stringify(editState)}`);
await activeCell.locator('input.ps-grid-cellinput').press('Escape');
console.log('  ok  editing shows a cell border without selecting its text');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('COLUMN SIZING CHECK: ALL GREEN');
