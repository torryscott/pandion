// Launch audit regressions: cross-analysis state, workspace-aware export,
// layout status language, diagnostics placement, and color-series semantics.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try next shared dependency location */ }
    }
    throw new Error('playwright not found');
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
const playwright = loadPlaywright();
const browserName = process.env.PS_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName))
    throw new Error(`Unsupported PS_BROWSER: ${browserName}`);
const browserType = playwright[browserName];
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await browserType.launch();
const context = await browser.newContext({
    viewport: { width: 1366, height: 768 }
});
if (process.env.PS_OFFLINE === '1') {
    await context.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
}
const page = await context.newPage();
const errors = [], warnings = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {
    if (m.type() === 'warning') warnings.push(m.text());
});
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);

console.log('case 1: analysis changes clear chart-part state and status');
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    PS_SHELL.setWorkspace('chart');
    PS_SHELL.setModule('xyplotbuilder');
    PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
    await sleep(900);
});
const point = page.locator('[data-role="xy-point"]').first();
await point.waitFor({ state: 'visible' });
await point.evaluate(painted => {
    const halo = painted.nextElementSibling;
    if (!halo) throw new Error('point interaction halo missing');
    const r = halo.getBoundingClientRect();
    halo.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    }));
});
await page.waitForTimeout(350);
const picked = await page.evaluate(() => ({
    stored: localStorage.getItem('graphbuilder2.inspector.v1'),
    setupSub: document.getElementById('ps-inspector-subtitle').textContent,
    partTitle: (document.querySelector('[data-role="inspector-title"]') || {})
        .textContent || '',
    partVisible: (() => {
        const title = document.querySelector('[data-role="inspector-title"]');
        return !!title && title.offsetParent !== null;
    })()
}));
ok(picked.stored && picked.stored !== '[]',
   'a Scatter point opens a persisted chart-part editor');
ok(/select chart parts to style below/i.test(picked.setupSub) &&
   picked.partVisible && picked.partTitle.trim().length > 0,
   'chart setup stays in the right inspector while selected-part styling opens below');

await page.selectOption('#ps-module', 'distplotbuilder');
await page.waitForTimeout(850);
const switched = await page.evaluate(() => ({
    stored: localStorage.getItem('graphbuilder2.inspector.v1'),
    ctx: document.getElementById('ps-status-context').textContent.trim(),
    sel: document.getElementById('ps-status-selection').textContent.trim(),
    visibleText: document.querySelector('.graphbuilder2-host').innerText
}));
ok(switched.stored === '[]' || switched.stored === null,
   `analysis change clears engine selection (${switched.stored})`);
ok(/Distribution/.test(switched.ctx) && !/\bcells?\b/.test(switched.sel),
   `both status slots describe the new analysis ` +
   `("${switched.ctx}" / "${switched.sel}")`);
ok(!/Hide points/i.test(switched.visibleText),
   'the Scatter-only point editor does not survive in Distribution');

for (const [mod, roles, label] of [
    ['freqplotbuilder', { var: 'condition' }, 'Frequencies'],
    ['corrplotbuilder', { vars: ['score', 'hours'] }, 'Correlation']
]) {
    await page.evaluate(([m, r]) => {
        PS_SHELL.setModule(m); PS_SHELL.setRoles(m, r);
    }, [mod, roles]);
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
        ctx: document.getElementById('ps-status-context').textContent.trim(),
        sel: document.getElementById('ps-status-selection').textContent.trim(),
        stored: localStorage.getItem('graphbuilder2.inspector.v1')
    }));
    ok(state.ctx.includes(label) && !/\bcells?\b/.test(state.sel) &&
       (state.stored === '[]' || state.stored === null),
       `${label} has fresh status and no stale chart-part selection`);
}

console.log('case 2: export has one contextual entry per workspace');
await page.evaluate(() => PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(450);
const dataExport = await page.evaluate(() => {
    const b = document.getElementById('ps-export');
    return { label: b.textContent.trim(), visible: b.offsetParent !== null,
             disabled: b.disabled,
             inspector: document.getElementById('ps-inspector-title').textContent,
             moreHasViewDupes: !!document.querySelector(
                 '#ps-datamenu-focus-columns, #ps-datamenu-resetview') };
});
ok(dataExport.visible && !dataExport.disabled &&
   dataExport.label === 'Export data',
   `Data exposes an honest Export data action (${JSON.stringify(dataExport)})`);
ok(dataExport.inspector === 'Variable properties' &&
   !dataExport.moreHasViewDupes,
   'Data uses a focused inspector title and one column-visibility menu');
await page.click('[data-ps-menu="file"]');
const fileExportLabel = await page.locator(
    '#ps-appmenu [data-app-command="export"] span').first().textContent();
ok(/Export data as CSV/.test(fileExportLabel),
   `File menu agrees with the Data action ("${fileExportLabel}")`);
await page.keyboard.press('Escape');

await page.evaluate(() => PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(450);
const chartExports = await page.evaluate(() => ({
    globalVisible: document.getElementById('ps-export').offsetParent !== null,
    engineVisible: (() => {
        const b = document.querySelector(
            '.graphbuilder2-host button[title="Export plot"]');
        return !!b && b.offsetParent !== null;
    })()
}));
ok(!chartExports.globalVisible && chartExports.engineVisible,
   'Charts show one Export action, in the chart toolbar');
await page.evaluate(() => PS_SHELL.runCommand('whats-new'));
await page.waitForTimeout(250);
const releaseFormats = await page.evaluate(() => ({
    note: document.getElementById('ps-whatsnew-body').innerText,
    formats: Array.from(document.querySelectorAll(
        'input[name="ps-export-format"]')).map(n => n.value)
}));
ok(!/TIFF/i.test(releaseFormats.note) &&
   releaseFormats.formats.join(',') === 'svg,pdf,png,jpg',
   'release notes and exporter promise the same four formats');
await page.keyboard.press('Escape');

console.log('case 3: layout status and action language stay synchronized');
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    PS_SHELL.addLayout(); await sleep(900);
    PS_SHELL.setWorkspace('layout'); await sleep(500);
});
const beforeCount = await page.locator('#ps-status-context').textContent();
await page.click('#ps-laddtext');
await page.waitForTimeout(500);
const layoutState = await page.evaluate(() => ({
    ctx: document.getElementById('ps-status-context').textContent.trim(),
    sel: document.getElementById('ps-status-selection').textContent.trim(),
    sub: document.getElementById('ps-inspector-subtitle').textContent.trim(),
    itemDup: document.getElementById('ps-ctx-duplicate').textContent.trim(),
    docDup: document.getElementById('ps-inspector-duplicate').textContent.trim(),
    labels: Array.from(document.querySelectorAll(
        '.ps-layout-position-grid .ps-layout-field-label')).map(n => ({
            text: n.textContent.trim(),
            whiteSpace: getComputedStyle(n).whiteSpace,
            height: n.getBoundingClientRect().height
        }))
}));
ok(layoutState.ctx !== beforeCount && /layout item/.test(layoutState.ctx) &&
   !/\bpanel/.test(layoutState.ctx),
   `adding text immediately updates the item count ("${layoutState.ctx}")`);
ok(layoutState.sel === '1 layout item selected' &&
   /1 selected item/.test(layoutState.sub),
   `selection status and inspector subtitle agree ` +
   `("${layoutState.sel}" / "${layoutState.sub}")`);
ok(layoutState.itemDup === 'Duplicate item' &&
   layoutState.docDup === 'Duplicate layout',
   'item actions and document actions name different targets');
ok(layoutState.labels.length === 4 &&
   layoutState.labels.every(x => x.whiteSpace === 'nowrap' && x.height < 20),
   `position labels stay on one line at 1366 px ` +
   `(${layoutState.labels.map(x => x.text).join(', ')})`);

console.log('case 4: timing is a diagnostic, not chart appearance');
await page.evaluate(() => PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(500);
await page.click('.graphbuilder2-host button[aria-label="Chart settings"]');
await page.waitForTimeout(350);
ok(!(await page.locator('.graphbuilder2-host')
    .getByText('Show render timing overlay', { exact: true }).count()),
   'Chart settings no longer contains the render-timing toggle');
await page.evaluate(() => PS_SHELL.runCommand('diagnostics'));
await page.waitForTimeout(350);
ok(await page.locator('#ps-diagnostics-timing').isVisible(),
   'Help > Diagnostics contains the render-timing toggle');
await page.check('#ps-diagnostics-timing');
await page.waitForTimeout(250);
ok(await page.locator('#ps-dbg-overlay').count() === 1,
   'the relocated toggle still creates the overlay');
await page.uncheck('#ps-diagnostics-timing');
await page.keyboard.press('Escape');

console.log('case 5: Vision check compares series, not ungrouped categories');
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    PS_SHELL.setModule('plotbuilder');
    PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    await sleep(850);
    document.querySelector(
        '.graphbuilder2-host button[aria-label="Chart settings"]').click();
    await sleep(250);
    document.querySelector('[data-gs-tab="accessibility"]').click();
    await sleep(250);
});
const ungroupedVision = await page.evaluate(() => ({
    swatches: document.querySelectorAll('[data-cvd-swatch]').length,
    fixes: document.querySelectorAll('[data-cvd-fix="fix"]').length,
    text: document.querySelector('.graphbuilder2-host').innerText
}));
ok(ungroupedVision.swatches === 0 && ungroupedVision.fixes === 0,
   'an ungrouped category chart is treated as one color series');

await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score', groupVar: 'site' });
    await sleep(900);
    if (!document.querySelector('[data-gs-tab="accessibility"]')) {
        document.querySelector(
            '.graphbuilder2-host button[aria-label="Chart settings"]').click();
        await sleep(250);
    }
    const tab = document.querySelector('[data-gs-tab="accessibility"]');
    if (!tab) throw new Error('Accessibility settings tab missing');
    tab.click();
    await sleep(250);
});
const groupedVision = await page.evaluate(() =>
    document.querySelectorAll('[data-cvd-swatch]').length);
ok(groupedVision >= 2,
   `a grouped chart still exposes its ${groupedVision} meaningful series colors`);

console.log('case 6: launch viewports keep every workspace reachable');
await page.keyboard.press('Escape');
for (const size of [
    { width: 640, height: 800 },
    { width: 760, height: 900 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 }
]) {
    await page.setViewportSize(size);
    for (const workspace of ['data', 'chart', 'layout']) {
        await page.evaluate(w => PS_SHELL.setWorkspace(w), workspace);
        await page.waitForTimeout(240);
        const fit = await page.evaluate(({ w, workspace: active }) => {
            const visible = node => {
                if (!node) return false;
                const r = node.getBoundingClientRect();
                const cs = getComputedStyle(node);
                return cs.display !== 'none' && cs.visibility !== 'hidden' &&
                    r.width > 0 && r.height > 0;
            };
            const main = document.querySelector('.ps-main-workspace')
                .getBoundingClientRect();
            const app = document.querySelector('.ps-appbar')
                .getBoundingClientRect();
            const surface = active === 'data'
                ? document.getElementById('ps-datacard')
                : active === 'layout'
                  ? document.getElementById('ps-layout')
                  : document.querySelector('.graphbuilder2-host');
            const narrowControls = [
                'ps-narrow-menu', 'ps-narrow-nav', 'ps-narrow-inspector'
            ].map(id => visible(document.getElementById(id)));
            return {
                noPageOverflow:
                    document.documentElement.scrollWidth <= innerWidth + 1,
                chromeInside: app.left >= -1 && app.right <= innerWidth + 1,
                mainInside: main.left >= -1 && main.right <= innerWidth + 1 &&
                    main.width > 100 && main.height > 100,
                surfaceVisible: visible(surface),
                status: document.getElementById('ps-status-context')
                    .textContent.trim(),
                responsiveChrome: w <= 760
                    ? narrowControls.every(Boolean)
                    : visible(document.querySelector('.ps-project-panel')) &&
                      visible(document.querySelector('.ps-controls'))
            };
        }, { w: size.width, workspace });
        ok(Object.values(fit).every(Boolean),
           `${workspace} is reachable and unclipped at ` +
           `${size.width}\u00d7${size.height} (${JSON.stringify(fit)})`);
    }
}

ok(!warnings.some(w => /indicator redraw failed/.test(w)),
   'no indicator redraw warning was emitted');
if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAUNCH CONTRACT CHECK PASS');
await browser.close();
