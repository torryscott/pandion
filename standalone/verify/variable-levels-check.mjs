// Real-browser smoke for progressive variable-level disclosure and ordering.
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

await page.click('#ps-datagrid th[data-grid-col="hours"]');
if (await page.locator('#ps-variable-level-section').isVisible())
    throw new Error('continuous variables still expose categorical levels');
console.log('  ok  continuous variables omit the levels section');

await page.click('#ps-datagrid th[data-grid-col="condition"]');
await page.waitForTimeout(80);
// The header states the true category count since t4-188 (the clipped
// list read as a complete list, so the total moved on screen).
if (!(await page.locator('#ps-variable-level-section').isVisible()) ||
    await page.locator('#ps-variable-level-title').textContent() !==
        'Category order (3)')
    throw new Error('nominal variables do not expose Category order with its count');
if (await page.locator('#ps-variable-levels button').count())
    throw new Error('visible up/down level buttons remain');
if (await page.locator('#ps-variable-levels [data-level]').count() !== 3 ||
    await page.locator('#ps-variable-levels [draggable="true"]').count())
    throw new Error('category ordering still relies on native browser dragging');
console.log('  ok  nominal variables expose pointer-driven Category order');

function level(name) {
    return page.locator('#ps-variable-levels [data-level]').filter({
        has: page.locator(`.ps-level-label:text-is("${name}")`)
    });
}
async function order() {
    return await page.evaluate(() =>
        window.PS_SHELL.project.table.levels.condition.slice());
}

await level('Low dose').focus();
await level('Low dose').press('Alt+ArrowDown');
await page.waitForTimeout(100);
const lowBox = await level('Low dose').boundingBox();
const controlBox = await level('Control').boundingBox();
await page.mouse.move(lowBox.x + lowBox.width / 2,
                      lowBox.y + lowBox.height / 2);
await page.mouse.down();
await page.mouse.move(lowBox.x + lowBox.width / 2 + 110,
                      lowBox.y + lowBox.height / 2 + 1, { steps: 8 });
await page.waitForTimeout(180);
const driftBox = await level('Low dose').boundingBox();
if (Math.abs(driftBox.x - lowBox.x) > 1)
    throw new Error('category row followed horizontal pointer drift');
await page.mouse.move(controlBox.x - 70, controlBox.y + 1, { steps: 14 });
await page.waitForTimeout(450);
const shiftedControlBox = await level('Control').boundingBox();
if (shiftedControlBox.y < controlBox.y + controlBox.height / 2)
    throw new Error('neighboring category rows did not open the target slot');
await page.mouse.up();
await page.waitForTimeout(180);
if (JSON.stringify(await order()) !==
    JSON.stringify(['Low dose', 'Control', 'High dose']))
    throw new Error(`slow top drag did not reorder levels: ` +
                    `${JSON.stringify(await order())}`);
if (!(await page.locator('#ps-variable-level-reset').isVisible()))
    throw new Error('Reset order did not appear after a manual reorder');
console.log('  ok  slow vertical drag is stable despite horizontal drift');

await page.reload();
await page.waitForTimeout(400);
if (await page.locator('#ps-welcome').isVisible()) {
    const resume = page.locator('#ps-welcome-continue');
    if (await resume.isVisible()) {
        await resume.click();
        await page.waitForTimeout(150);
    }
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.click('#ps-datagrid th[data-grid-col="condition"]');
await page.waitForTimeout(100);
if (JSON.stringify(await order()) !==
    JSON.stringify(['Low dose', 'Control', 'High dose']) ||
    !(await page.locator('#ps-variable-level-reset').isVisible()))
    throw new Error('manual category order did not survive recovery');
console.log('  ok  category order and its reset baseline persist');

await page.click('#ps-variable-level-reset');
await page.waitForTimeout(120);
if (JSON.stringify(await order()) !==
    JSON.stringify(['Control', 'Low dose', 'High dose']) ||
    await page.locator('#ps-variable-level-reset').isVisible())
    throw new Error('Reset order did not restore the original order');
console.log('  ok  Reset order restores the pre-edit level order');

const low = level('Low dose');
await low.focus();
await low.press('Alt+ArrowUp');
await page.waitForTimeout(120);
if (JSON.stringify(await order()) !==
    JSON.stringify(['Low dose', 'Control', 'High dose']))
    throw new Error('keyboard level reorder failed');
await page.click('#ps-data-undo');
await page.waitForTimeout(120);
if (JSON.stringify(await order()) !==
    JSON.stringify(['Control', 'Low dose', 'High dose']))
    throw new Error('Data undo did not restore the category order');
console.log('  ok  keyboard reordering is accessible and undoable');

await page.click('#ps-variable-type-group .ps-vt-row[data-vt="ordinal"]');
await page.waitForTimeout(120);
if (await page.locator('#ps-variable-level-title').textContent() !==
    'Ordered levels (3)')
    throw new Error('ordinal variables do not expose Ordered levels with its count');
console.log('  ok  ordinal variables identify Ordered levels');

if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
await browser.close();
console.log('VARIABLE LEVELS CHECK: ALL GREEN');
