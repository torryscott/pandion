// Real-engine browser smoke for standalone dataset-linked point exclusion.
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
const context = await browser.newContext({ viewport: { width: 1500, height: 920 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(150);
}

await page.evaluate(() => {
    window.PS_SHELL.loadTable('bridge-data',
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

const before = await page.evaluate(() => {
    const payload = window.PS_SHELL.buildPayload();
    const bar = payload.bars.find(item => item.x === 'A');
    return {
        n: bar.n,
        caseId: bar.caseIds[0],
        sourceColumn: bar.sourceColumns[0]
    };
});
if (before.n !== 2 || !before.caseId || before.sourceColumn !== 'hours')
    throw new Error('stable case metadata missing before exclusion');

const firstPoint = page.locator(
    '[data-role="data-point"][data-point-cat="A"][data-point-idx="0"]');
await firstPoint.waitFor({ state: 'visible' });
await firstPoint.evaluate(point => {
    const halo = point.nextElementSibling;
    if (!halo || halo.tagName.toLowerCase() !== 'circle' ||
        halo.getAttribute('pointer-events') !== 'all')
        throw new Error('individual point interaction halo is missing');
    const rect = halo.getBoundingClientRect();
    halo.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
    }));
});
const pointMenu = page.locator('[data-role="gb2-point-menu"]');
await pointMenu.waitFor({ state: 'visible' });
const excludeAction = pointMenu.getByText(
    'Exclude this value from dataset', { exact: true });
const menuText = (await excludeAction.textContent()).trim();
if (menuText !== 'Exclude this value from dataset')
    throw new Error(`standalone point action was not relabeled: ${menuText}`);
await excludeAction.click();
// The shared engine intentionally batches style/spec commits for 1.5 s.
await page.waitForTimeout(1800);
const linked = await page.evaluate(caseId => {
    const table = window.PS_SHELL.project.table;
    const payload = window.PS_SHELL.buildPayload();
    const bar = payload.bars.find(item => item.x === 'A');
    const stored = window.PS_SHELL.optionStore();
    const spec = stored.chartSpec ? JSON.parse(stored.chartSpec) : {};
    return {
        rowExcluded: table.excludedRows[caseId] === 1,
        hoursCellExcluded: !!(table.excluded.hours &&
            table.excluded.hours[0]),
        conditionMissing: table.columns.condition[0] === null,
        scoreMissing: table.columns.score[0] === null,
        hoursMissing: table.columns.hours[0] === null,
        chartN: bar.n,
        projectedHidden: payload.hiddenPoints,
        positionalState: stored.hiddenPoints,
        serializedPositionalState: spec.hiddenPoints
    };
}, before.caseId);
if (linked.rowExcluded || !linked.hoursCellExcluded || linked.conditionMissing ||
    linked.scoreMissing || !linked.hoursMissing ||
    linked.chartN !== 2 || linked.projectedHidden.length !== 1 ||
    linked.positionalState.length !== 0 ||
    linked.serializedPositionalState.length !== 0)
    throw new Error('chart exclusion did not become dataset truth: ' +
        JSON.stringify(linked));
const ghost = page.locator('[data-role="data-point-hidden"]');
if (await ghost.count() !== 1)
    throw new Error('dataset exclusion did not render one crossed-out point');
const hiddenBadge = page.locator('[data-role="gb2-hp-badge"]');
if (!(await hiddenBadge.isVisible()) ||
    !(await hiddenBadge.textContent()).includes('1'))
    throw new Error('dataset exclusion is absent from chart visibility status');

await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(150);
const cell = page.locator('#ps-datagrid td[data-gc="hours"][data-gr="0"]');
if (!(await cell.isVisible())) throw new Error('excluded Data row is not visible');
if (!(await cell.evaluate(node => node.classList.contains('ps-grid-excl'))))
    throw new Error('excluded Data cell lacks its visual state');
await cell.click({ button: 'right' });
if ((await page.locator('#ps-cellmenu-toggle').textContent()) !== 'Include value')
    throw new Error('Data context menu does not offer value inclusion');
if ((await page.locator('#ps-cellmenu-row').textContent()) !== 'Exclude row 1')
    throw new Error('cell exclusion incorrectly changed the row action');
await page.click('#ps-cellmenu-toggle');
await page.waitForTimeout(350);
const restoredN = await page.evaluate(() => {
    const payload = window.PS_SHELL.buildPayload();
    return payload.bars.find(item => item.x === 'A').n;
});
if (restoredN !== 2) throw new Error('including the Data row did not restore the chart');

// Reverse direction: exclude Hours in Data, then confirm that the chart
// derives the same ghost, badge, and Visibility-panel entry.
await cell.click({ button: 'right' });
if ((await page.locator('#ps-cellmenu-toggle').textContent()) !== 'Exclude value')
    throw new Error('restored Data cell does not offer value exclusion');
await page.click('#ps-cellmenu-toggle');
await page.waitForTimeout(350);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(500);
if (await page.locator('[data-role="data-point-hidden"]').count() !== 1)
    throw new Error('Data-origin exclusion did not produce a chart ghost');
const dataBadge = page.locator('[data-role="gb2-hp-badge"]');
if (!(await dataBadge.isVisible()))
    throw new Error('Data-origin exclusion did not produce hidden status');
await dataBadge.locator('[data-role="hp-badge-header"]').click();
const visibilityLink = dataBadge.getByText('Open Visibility panel…');
await visibilityLink.waitFor({ state: 'visible' });
await visibilityLink.click();
const inspectorTitle = page.locator('[data-role="inspector-title"]');
if (!(await inspectorTitle.textContent()).includes('Visibility'))
    throw new Error('hidden status did not open the Visibility panel');
const inspectorPanel = inspectorTitle.locator('..');
const hiddenPointEntry = inspectorPanel.getByText(/^Point #/).first();
await hiddenPointEntry.waitFor({ state: 'visible' });
await hiddenPointEntry.click();
await page.waitForTimeout(1800);
const restoredFromChart = await page.evaluate(() => ({
    hours: window.PS_SHELL.project.table.columns.hours[0],
    hidden: window.PS_SHELL.buildPayload().hiddenPoints.length
}));
if (restoredFromChart.hours !== 1.5 || restoredFromChart.hidden !== 0)
    throw new Error('Visibility-panel restore did not include the Data value');
if (errors.length) throw new Error(errors[0]);

await browser.close();
console.log('EXCLUSION BRIDGE CHECK: ALL GREEN');
