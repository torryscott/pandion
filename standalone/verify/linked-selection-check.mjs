// Real-engine browser smoke for standalone point <-> Data linked selection.
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

await page.evaluate(() => {
    window.PS_SHELL.loadTable('linked-data',
        ['condition', 'score', 'hours', 'site'],
        [['A', '10', '1.5', 'East'], ['A', '20', '2.5', 'West'],
         ['B', '30', '3.5', 'East']],
        { condition: 'nominal', score: 'continuous',
          hours: 'continuous', site: 'nominal' });
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'hours' });
    window.setOption('showDataPoints', true);
});
await page.waitForTimeout(650);

function point(cat, idx) {
    return page.locator(
        `[data-role="data-point"][data-point-cat="${cat}"]` +
        `[data-point-idx="${idx}"]`);
}
async function dispatchOnHalo(pointLocator, type) {
    await pointLocator.evaluate((painted, eventType) => {
        let halo = painted.nextElementSibling;
        while (halo && !(halo.tagName.toLowerCase() === 'circle' &&
               halo.getAttribute('pointer-events') === 'all'))
            halo = halo.nextElementSibling;
        if (!halo) throw new Error('point interaction halo is missing');
        const rect = halo.getBoundingClientRect();
        halo.dispatchEvent(new MouseEvent(eventType, {
            bubbles: true, cancelable: true,
            button: eventType === 'contextmenu' ? 2 : 0,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        }));
    }, type);
}

const first = point('A', 0);
await first.waitFor({ state: 'visible' });
await dispatchOnHalo(first, 'click');
await page.waitForTimeout(250);
if (await page.locator('#ps-linked-selection').count())
    throw new Error('persistent linked-selection banner remains in the chart');
if (await page.locator('[data-role="data-point-selected"]').count() !== 1)
    throw new Error('point click did not retain the engine selection ring');

await dispatchOnHalo(point('A', 0), 'contextmenu');
const pointMenu = page.locator('[data-role="gb2-point-menu"]');
await pointMenu.waitFor({ state: 'visible' });
const menuLabels = await pointMenu.locator('button').allTextContents();
if (!menuLabels.includes('Exclude this value from the dataset') ||
    !menuLabels.includes('Reveal in Data'))
    throw new Error('point menu does not expose both Data actions');
await pointMenu.locator('[data-ps-action="reveal-point"]').click();
await page.waitForTimeout(250);
const revealed = page.locator(
    '#ps-datagrid td[data-gc="hours"][data-gr="0"]');
if (!(await revealed.isVisible()) ||
    !(await revealed.evaluate(node =>
        node.classList.contains('ps-grid-selected') &&
        node.classList.contains('ps-grid-linked'))))
    throw new Error('Reveal in Data did not select and link the source cell');

// Reverse direction: edit row 2 Hours in Data, then return to Charts.
const ordinarySelection = page.locator(
    '#ps-datagrid td[data-gc="hours"][data-gr="1"]');
const widthsBeforeEdit = await page.locator(
    '#ps-datagrid th[data-grid-col]').evaluateAll(nodes =>
        nodes.map(node => ({
            col: node.getAttribute('data-grid-col'),
            width: node.getBoundingClientRect().width
        })));
await ordinarySelection.dblclick();   // a click now SELECTS
const widthsDuringEdit = await page.locator(
    '#ps-datagrid th[data-grid-col]').evaluateAll(nodes =>
        nodes.map(node => ({
            col: node.getAttribute('data-grid-col'),
            width: node.getBoundingClientRect().width
        })));
for (const before of widthsBeforeEdit) {
    const during = widthsDuringEdit.find(item => item.col === before.col);
    if (!during || Math.abs(during.width - before.width) > 1)
        throw new Error(
            `opening a short cell editor resized ${before.col}: ` +
            `${before.width} -> ${during ? during.width : 'missing'}`);
}
console.log('  ok  opening a short cell editor preserves every column width');
if (!(await ordinarySelection.locator('input.ps-grid-cellinput').isVisible()) ||
    await ordinarySelection.evaluate(node =>
        node.classList.contains('ps-grid-linked')))
    throw new Error('ordinary Data edit retained the Reveal emphasis');
if (await revealed.evaluate(node => node.classList.contains('ps-grid-linked')))
    throw new Error('previously revealed source remained sticky');
await ordinarySelection.locator('input.ps-grid-cellinput').press('Escape');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(500);
const selectedRing = page.locator('[data-role="data-point-selected"]');
const selectedPointKey = await page.evaluate(() => window.__gb2_selectedPointKey);
if (await selectedRing.count() !== 1)
    throw new Error('Data selection did not highlight one chart point; key=' +
                    selectedPointKey);
if (selectedPointKey !== 'A::::1')
    throw new Error(`wrong chart point linked from Data: ${selectedPointKey}`);

// A selected source cell that is not itself represented by an individual
// point should remain silent in Charts and clear the previous point ring.
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(120);
const categoryCell = page.locator(
    '#ps-datagrid td[data-gc="condition"][data-gr="0"]');
await categoryCell.dblclick();        // a click now SELECTS
await categoryCell.locator('input.ps-grid-cellinput').press('Escape');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(500);
if (await page.locator('[data-role="data-point-selected"]').count())
    throw new Error('non-plotted Data cell retained the previous point ring');
if (await page.evaluate(() => window.__gb2_selectedPointKey) != null)
    throw new Error('non-plotted Data cell retained a selected point key');
console.log('  ok  non-plotted Data selections remain silent in Charts');
if (errors.length) throw new Error(errors[0]);

await browser.close();
console.log('LINKED SELECTION CHECK: ALL GREEN');
