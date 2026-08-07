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
    'Exclude this value from the dataset', { exact: true });
const menuText = (await excludeAction.textContent()).trim();
if (menuText !== 'Exclude this value from the dataset')
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
// ---- the Jul 29 2026 interaction round (Torry): symmetric menus, ghost
// hover, and the Data workspace's Cmd/Ctrl+E working on the chart.
console.log('  round: ghost menu, hover affordance, Cmd/Ctrl+E');

// Let the restore's echo chain settle completely first: a re-render lands
// ~ECHO_MS after the last commit and would destroy a just-opened menu
// (point menus are deliberately not re-armed across renders).
await page.waitForTimeout(2600);

// Exclude a point again so a ghost exists (via the point menu, the
// already-proven path).
{
    const pt = page.locator(
        '[data-role="data-point"][data-point-cat="A"][data-point-idx="0"]');
    await pt.waitFor({ state: 'visible' });
    await pt.evaluate(point => {
        // NOT nextElementSibling: the earlier flows SELECTED this point,
        // and a selected point carries a pointer-events:none selection
        // ring between itself and its interaction halo. Scan forward for
        // the element that owns interaction.
        let halo = point.nextElementSibling;
        while (halo && halo.getAttribute('pointer-events') !== 'all')
            halo = halo.nextElementSibling;
        if (!halo) throw new Error('round setup: no interaction halo found');
        const rect = halo.getBoundingClientRect();
        halo.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, button: 2,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    });
    const menu2 = page.locator('[data-role="gb2-point-menu"]');
    await menu2.waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => { throw new Error('round setup: point menu never opened'); });
    const menu2Text = (await menu2.textContent()).trim();
    if (!menu2Text.includes('Exclude this value from the dataset'))
        throw new Error('round setup: unexpected menu text :: ' + menu2Text);
    await menu2.getByText('Exclude this value from the dataset').click();
    await page.waitForTimeout(1800);
}
const ghost2 = page.locator('[data-role="data-point-hidden"]');
if (await ghost2.count() !== 1)
    throw new Error('setup: expected one ghost for the interaction round');

// (1) Hover affordance: the ghost solidifies under the pointer - it had
// NO hover feedback before, which made a small dashed ring genuinely hard
// to target (the report's words: "really hard to actually select").
const ghostBox = await ghost2.boundingBox();
await page.mouse.move(ghostBox.x + ghostBox.width / 2,
                      ghostBox.y + ghostBox.height / 2);
await page.waitForTimeout(200);
const hovered = await ghost2.evaluate(g => {
    const ring = g.querySelector('circle');
    return { dash: ring.getAttribute('stroke-dasharray'),
             w: ring.getAttribute('stroke-width') };
});
if (hovered.dash !== 'none' || Number(hovered.w) < 1.5)
    throw new Error('ghost has no hover affordance: ' +
        JSON.stringify(hovered));

// (2) A plain CLICK opens the menu instead of instantly restoring - one
// stray click must not undo an explicit exclusion - and the menu names
// the INCLUDE side truthfully (the relabel observer is hidden-aware; an
// unaware relabel said "Exclude" on a button that includes).
await page.mouse.click(ghostBox.x + ghostBox.width / 2,
                       ghostBox.y + ghostBox.height / 2);
await page.waitForTimeout(300);
if (await ghost2.count() !== 1)
    throw new Error('a plain ghost click still instantly restores');
const includeAction = page.locator('[data-role="gb2-point-menu"]')
    .getByText('Include this value in the dataset', { exact: true });
if (!(await includeAction.isVisible()))
    throw new Error('the ghost menu does not offer inclusion by name');
await includeAction.click();
await page.waitForTimeout(1800);
const included = await page.evaluate(() => ({
    ghosts: document.querySelectorAll('[data-role="data-point-hidden"]').length,
    hoursCell: !!(window.PS_SHELL.project.table.excluded.hours || {})[0],
    n: window.PS_SHELL.buildPayload().bars.find(b => b.x === 'A').n,
}));
if (included.ghosts !== 0 || included.hoursCell || included.n !== 2)
    throw new Error('menu inclusion did not round-trip to the dataset: ' +
        JSON.stringify(included));

// (3) Cmd/Ctrl+E on the HOVERED point: the Data workspace's exclusion
// shortcut, now speaking on the chart surface. Exclude by shortcut...
const pt0 = page.locator(
    '[data-role="data-point"][data-point-cat="A"][data-point-idx="0"]');
const ptBox = await pt0.boundingBox();
await page.mouse.move(ptBox.x + ptBox.width / 2, ptBox.y + ptBox.height / 2);
await page.waitForTimeout(200);
await page.keyboard.press('Control+e');
await page.waitForTimeout(1800);
const afterKey = await page.evaluate(() => ({
    ghosts: document.querySelectorAll('[data-role="data-point-hidden"]').length,
    hoursCell: !!(window.PS_SHELL.project.table.excluded.hours || {})[0],
}));
if (afterKey.ghosts !== 1 || !afterKey.hoursCell)
    throw new Error('Cmd/Ctrl+E on a hovered point did not exclude: ' +
        JSON.stringify(afterKey));
// ...and include by the same shortcut on the ghost.
const ghost3 = page.locator('[data-role="data-point-hidden"]');
const gBox = await ghost3.boundingBox();
await page.mouse.move(gBox.x + gBox.width / 2, gBox.y + gBox.height / 2);
await page.waitForTimeout(200);
await page.keyboard.press('Control+e');
await page.waitForTimeout(1800);
const afterKey2 = await page.evaluate(() => ({
    ghosts: document.querySelectorAll('[data-role="data-point-hidden"]').length,
    hoursCell: !!(window.PS_SHELL.project.table.excluded.hours || {})[0],
    hours: window.PS_SHELL.project.table.columns.hours[0],
}));
if (afterKey2.ghosts !== 0 || afterKey2.hoursCell || afterKey2.hours !== 1.5)
    throw new Error('Cmd/Ctrl+E on a hovered ghost did not include: ' +
        JSON.stringify(afterKey2));
console.log('  ok  ghost hover, symmetric include menu, and Cmd/Ctrl+E ' +
            'toggle all round-trip to the dataset');

// (4) The stationary-cursor contract (Torry, Jul 31 2026). Excluding redraws
// the ghost at the point's EXACT position, under a cursor that never moved,
// so no mouseenter fires and the tracked hover is null. The shortcut has to
// work anyway, by hit-testing whatever is under the pointer. Note there is
// deliberately NO mouse movement between these presses: the movement is what
// used to paper over the gap, and step (3) above only passed because it
// happened to cross a boundary.
await page.keyboard.press('Control+e');
await page.waitForTimeout(1800);
const still1 = await page.evaluate(() => ({
    ghosts: document.querySelectorAll('[data-role="data-point-hidden"]').length,
    excluded: !!(window.PS_SHELL.project.table.excluded.hours || {})[0],
}));
if (still1.ghosts !== 1 || !still1.excluded)
    throw new Error('a still cursor could not EXCLUDE by shortcut: ' +
        JSON.stringify(still1));
await page.keyboard.press('Control+e');
await page.waitForTimeout(1800);
const still2 = await page.evaluate(() => ({
    ghosts: document.querySelectorAll('[data-role="data-point-hidden"]').length,
    excluded: !!(window.PS_SHELL.project.table.excluded.hours || {})[0],
    hours: window.PS_SHELL.project.table.columns.hours[0],
}));
if (still2.ghosts !== 0 || still2.excluded || still2.hours !== 1.5)
    throw new Error('a still cursor could not INCLUDE by shortcut: ' +
        JSON.stringify(still2));
console.log('  ok  the toggle survives the mark being replaced under a ' +
            'stationary cursor, in both directions');

if (errors.length) throw new Error(errors[0]);

await browser.close();
console.log('EXCLUSION BRIDGE CHECK: ALL GREEN');
