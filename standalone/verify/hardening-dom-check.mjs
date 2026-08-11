// Fast DOM smoke tests for release-hardening behavior. This intentionally
// stubs the chart engine: the existing browser probes cover real rendering.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function loadLinkedom() {
    for (const base of [process.cwd(), '/private/tmp/pandion-dom-smoke', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('linkedom'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('linkedom not found; install it in the project or /private/tmp/pandion-dom-smoke');
    process.exit(2);
}

const { parseHTML } = loadLinkedom();
const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = source('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const shippedVersion = source('js/ps-shell.js')
    .match(/APP_VERSION = "([^"]+)"/)[1];
const { window } = parseHTML(html);
const { document } = window;

class Storage {
    constructor(seed = {}) { this.data = { ...seed }; }
    getItem(key) { return Object.hasOwn(this.data, key) ? this.data[key] : null; }
    setItem(key, value) {
        if (this.failProjectWrite && key === 'psstandalone.project.v2') {
            const error = new Error('Quota exceeded');
            error.name = 'QuotaExceededError';
            throw error;
        }
        this.data[key] = String(value);
    }
    removeItem(key) { delete this.data[key]; }
}

const backup = {
    version: 3,
    id: 'recovery-test',
    name: 'Recovered project',
    table: {
        name: 'recovered-data',
        order: ['group', 'score'],
        raw: { group: ['A', 'B'], score: ['1', '2'] },
        types: { group: 'nominal', score: 'continuous' },
        declaredLevels: {},
        excluded: {},
        missingTokens: ['NA']
    },
    charts: [{
        id: 'c1', name: 'Chart 1', module: 'plotbuilder',
        roles: { plotbuilder: { xvar: 'group', yvar: 'score' } },
        options: { plotbuilder: {} }
    }],
    activeChart: 'c1',
    ui: { dataOpen: false, workspace: 'chart' }
};

const localStorage = new Storage({
    'psstandalone.project.v2': '{broken json',
    'psstandalone.project.backup.v1': JSON.stringify(backup)
});
const sessionStorage = new Storage({ 'psstandalone.welcome.dismissed': '1' });

Object.assign(window, {
    localStorage,
    sessionStorage,
    confirm: () => true,
    prompt: () => null,
    alert: () => {},
    requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    // linkedom has no MutationObserver. One shell observer is installed by
    // an IIFE at boot (the chart toolbar's zoom re-dock), so without a stub
    // ps-shell.js throws while it is still loading and this probe dies at
    // exit 1 - which run.sh treats as a real failure, so the WHOLE suite
    // stops here and nothing after it runs. A no-op is honest: the observer
    // is a backstop for renders the shell does not drive, and this harness
    // drives every one of them.
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    GraphBuilder2: {
        render(id) {
            const host = document.getElementById(id);
            host.innerHTML =
                '<div data-role="chart-card">' +
                '<div data-role="chart-toolbar"></div>' +
                '<div data-test-chart-canvas>' +
                '<svg width="640" height="420" viewBox="0 0 640 420"></svg>' +
                '</div></div>';
            host.__gb2_chartSize = () => ({ w: 640, h: 420 });
        }
    }
});
window.navigator.storage = { estimate: async () => ({ usage: 1024, quota: 4096 }) };

// linkedom does not currently mirror option selection into select.value.
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() {
        const option = Array.from(this.options || []).find(o => o.selected) ||
            Array.from(this.options || [])[0];
        return option ? option.value : '';
    },
    set(value) {
        for (const option of Array.from(this.options || []))
            option.selected = option.value === String(value);
    }
});

function evaluate(code) {
    const names = [
        'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
        'Blob', 'FileReader', 'URL', 'DOMParser', 'XMLSerializer',
        'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
        'setTimeout', 'clearTimeout', 'confirm', 'prompt', 'alert',
        'MutationObserver'
    ];
    const values = names.map(name => name === 'window' ? window :
        name === 'document' ? document :
        name === 'localStorage' ? localStorage :
        name === 'sessionStorage' ? sessionStorage :
        window[name] || globalThis[name]);
    new Function(...names, code)(...values);
}

for (const file of [
    'templates/templates.js', 'js/ps-stat.js', 'js/ps-omv.js',
    'js/ps-data.js', 'js/ps-shell.js'
]) evaluate(source(file));
document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise(resolve => setTimeout(resolve, 20));

let failures = 0;
function ok(condition, label) {
    console.log((condition ? '  ok  ' : '  FAIL ') + label);
    if (!condition) failures++;
}

console.log('case 1: last-known-good recovery');
ok(window.PS_SHELL.project.name === 'Recovered project',
    'restores the backup when the current snapshot is corrupt');
ok(document.getElementById('ps-recovery-note').textContent.includes('previous local backup'),
    'explains the recovery in the start center');
ok(window.PS_SHELL.diagnosticsText().includes('Autosave: recovered'),
    'diagnostics expose recovered autosave health');

console.log('case 2: explicit v2 migration');
const migrated = window.PS_SHELL.migrateSnapshot({
    version: 2, name: 'Legacy', table: backup.table,
    module: 'freqplotbuilder', roles: { freqplotbuilder: { var: 'group' } },
    options: { freqplotbuilder: { showCounts: true } }
});
// v4 since Aug 2026 (the formula vocabulary rewrite): a v2 snapshot
// walks the whole chain, v2 -> v3 shape -> v4 vocabulary.
ok(migrated && migrated.version === 4 && migrated.charts.length === 1,
    'v2 becomes a current single-document project');
ok(migrated.charts[0].module === 'freqplotbuilder',
    'migration preserves the analysis type');

console.log('case 3: 20,000-row virtualized data grid');
const rows = Array.from({ length: 20000 }, (_, i) => ['G' + (i % 4), String(i)]);
window.PS_SHELL.loadTable('large-data', ['group', 'score'], rows,
    { group: 'nominal', score: 'continuous' });
window.PS_SHELL.setWorkspace('data');
await new Promise(resolve => setTimeout(resolve, 20));
const grid = document.getElementById('ps-datagrid');
const initialWindow = window.PS_SHELL.gridWindow();
ok(initialWindow.start === 0 && initialWindow.end === 140 &&
    initialWindow.total === 20000, 'renders only the first 140-row window');
ok(initialWindow.end < initialWindow.total,
    'keeps the remaining rows outside the DOM window');
// Punch list 37 rewrote this footer (it was a permanent how-to; it is now
// Sum/Average/Count plus the dataset shape), so the wording moved. The claim
// it protects has not: virtualization is disclosed AND the user is told the
// chart uses every row, not just the windowed ones.
{
    const foot = document.getElementById('ps-gridfoot').textContent;
    ok(/20,000 rows/.test(foot) && /windowed/i.test(foot) &&
       /uses all of them/i.test(foot),
       'discloses virtualization while confirming all rows are available (' +
       foot.trim().slice(0, 80) + ')');
}

grid.scrollTop = 250000;
grid.dispatchEvent(new window.Event('scroll'));
await new Promise(resolve => setTimeout(resolve, 30));
const scrolledWindow = window.PS_SHELL.gridWindow();
ok(scrolledWindow.start > 9000, 'moves the rendered window after scrolling');
ok(scrolledWindow.end - scrolledWindow.start === 140 &&
    scrolledWindow.end < scrolledWindow.total,
    'keeps a bounded middle window with rows before and after it');
ok(grid.scrollTop === 250000,
    'preserves the large-grid scroll position across a virtual rerender');

const ordinaryHeader = Array.from({ length: 18 }, (_, i) => 'v' + (i + 1));
const ordinaryTypes = Object.fromEntries(ordinaryHeader.map(name =>
    [name, 'continuous']));
ordinaryTypes.v1 = 'nominal';
const ordinaryRows = Array.from({ length: 240 }, (_, row) =>
    ordinaryHeader.map((_, col) => String(row * ordinaryHeader.length + col)));
window.PS_SHELL.loadTable('ordinary-data', ordinaryHeader, ordinaryRows,
    ordinaryTypes);
window.PS_SHELL.setWorkspace('data');
await new Promise(resolve => setTimeout(resolve, 20));
const ordinaryWindow = window.PS_SHELL.gridWindow();
ok(ordinaryWindow.start === 0 && ordinaryWindow.end === 240 &&
    document.querySelectorAll('#ps-datagrid td[data-grid-row]').length === 240,
    'renders an ordinary 240-row by 18-variable dataset completely');
ok(!document.getElementById('ps-gridfoot').textContent.includes(
    'Virtualized view'),
    'does not expose moderate datasets to the virtual-scroll path');

console.log('case 4: temporary column visibility');
window.PS_SHELL.setModule('plotbuilder');
window.PS_SHELL.setRoles('plotbuilder', { xvar: 'v1', yvar: 'v2' });
ok(window.PS_SHELL.hideColumn('v18') &&
    !window.PS_SHELL.visibleColumns().includes('v18'),
    'hides an individual column from the Data workspace');
ok(window.PS_SHELL.project.table.order.includes('v18') &&
    window.PS_SHELL.project.table.raw.v18.length === 240,
    'keeps hidden-column data in the underlying dataset');
ok(!Array.from(document.querySelectorAll(
    '#ps-datagrid th[data-grid-col]')).some(head =>
        head.getAttribute('data-grid-col') === 'v18'),
    'removes a hidden column from the rendered grid');
ok(document.getElementById('ps-data-hidden-columns').textContent.includes(
    '1 column hidden'),
    'discloses the active column view in the command bar');
window.PS_SHELL.setColumnFocus(true);
ok(JSON.stringify(window.PS_SHELL.visibleColumns()) ===
    JSON.stringify(['v1', 'v2']),
    'focus mode shows only variables assigned to the current chart');
const savedColumnViewProject = await window.PS_SHELL.projectFileText();
ok(!savedColumnViewProject.includes('GRID_HIDDEN_COLUMNS') &&
    !savedColumnViewProject.includes('hiddenColumns') &&
    !savedColumnViewProject.includes('focusChartColumns'),
    'column visibility is excluded from the saved project');
window.PS_SHELL.showAllColumns();
ok(window.PS_SHELL.visibleColumns().length === 18 &&
    window.PS_SHELL.columnView().focus === false,
    'Show all restores the complete view and turns off chart focus');

console.log('case 5: diagnostics dialog');
window.PS_SHELL.showDiagnostics();
await new Promise(resolve => setTimeout(resolve, 5));
ok(document.getElementById('ps-diagnostics').style.display === 'flex',
    'opens from the application command surface');
ok(document.getElementById('ps-diagnostics-grid').textContent
    .includes(shippedVersion),
    'reports the release version');
ok(window.PS_SHELL.diagnosticsText().includes('240 rows'),
    'reports the active dataset dimensions');

console.log('case 6: workspace-specific document tabs');
window.PS_SHELL.addChart('freqplotbuilder');
const rememberedChart = window.PS_SHELL.workspaceDocument();
window.PS_SHELL.addLayout();
const firstLayout = window.PS_SHELL.workspaceDocument();
window.PS_SHELL.addLayout();
const rememberedLayout = window.PS_SHELL.workspaceDocument();
let visibleTabs = Array.from(document.querySelectorAll('#ps-tabs .ps-tab'))
    .map(tab => tab.getAttribute('data-chart-id'));
ok(visibleTabs.length === 2 &&
    visibleTabs.every(id => window.PS_SHELL.charts().find(doc =>
        doc.id === id && doc.type === 'layout')),
    'Layouts shows layout tabs only');
window.PS_SHELL.setWorkspace('chart');
visibleTabs = Array.from(document.querySelectorAll('#ps-tabs .ps-tab'))
    .map(tab => tab.getAttribute('data-chart-id'));
ok(window.PS_SHELL.workspaceDocument() === rememberedChart &&
    visibleTabs.length === 2 &&
    visibleTabs.every(id => window.PS_SHELL.charts().find(doc =>
        doc.id === id && doc.type !== 'layout')),
    'Charts restores the last chart and shows chart tabs only');
window.PS_SHELL.setWorkspace('layout');
ok(window.PS_SHELL.workspaceDocument() === rememberedLayout,
    'Layouts restores the last active layout');
window.PS_SHELL.closeDocument(rememberedLayout);
window.PS_SHELL.closeDocument(firstLayout);
ok(window.PS_SHELL.workspace() === 'layout' &&
    window.PS_SHELL.workspaceDocument() === null &&
    document.getElementById('ps-workspace-empty').style.display === 'flex',
    'an empty layout workspace stays contextual');

console.log('case 7: Help Me Choose guidance');
window.PS_SHELL.showAnalysisGallery();
ok(document.querySelectorAll('[data-analysis-module]').length === 7 &&
    document.querySelectorAll('[data-analysis-help]').length === 1,
    'adds Help Me Choose as the eighth gallery choice');
document.querySelector('[data-analysis-help]').click();
ok(document.getElementById('ps-help-choose').style.display === 'flex' &&
    document.querySelectorAll('#ps-help-choose [data-hmc-go]').length === 7,
    'opens the seven-question guidance route without creating a chart');
document.querySelector('#ps-help-choose [data-hmc-go="compare"]').click();
ok(document.querySelectorAll('#ps-help-choose [data-hmc-go]').length === 3,
    'uses progressive follow-up questions for an ambiguous goal');
document.querySelector(
    '#ps-help-choose [data-hmc-go="compare-summary"]').click();
const chartCountBeforeHelp = window.PS_SHELL.charts().length;
ok(document.querySelector(
    '#ps-help-choose [data-hmc-create="plotbuilder"]') &&
    document.getElementById('ps-help-choose-body').textContent.includes(
        'Recommended analysis'),
    'explains the recommendation before offering to create it');
document.querySelector(
    '#ps-help-choose [data-hmc-create="plotbuilder"]').click();
ok(window.PS_SHELL.charts().length === chartCountBeforeHelp + 1 &&
    window.PS_SHELL.chart().module === 'plotbuilder',
    'creates the recommended existing chart module only after confirmation');
ok(document.querySelector('#psroot .ps-guided-empty') &&
    !document.querySelector('#psroot [data-empty-action]'),
    'keeps the empty-chart guidance free of redundant setup and data actions');

console.log('case 8: layout template gallery');
window.PS_SHELL.showLayoutGallery();
ok(document.querySelectorAll('[data-layout-template]').length === 8,
    'offers eight visual starting arrangements');
ok(document.querySelectorAll('[data-layout-orientation]').length === 2,
    'offers Landscape and Portrait without duplicating the template list');
document.querySelector('[data-layout-orientation="portrait"]').click();
ok(document.querySelector(
    '.ps-layout-template-preview.ps-layout-template-portrait'),
    'adapts the existing template previews to a portrait page');
const twoColumnTemplate = document.querySelector(
    '[data-layout-template="two-columns"]');
ok(!twoColumnTemplate.disabled, 'enables templates supported by available charts');
twoColumnTemplate.click();
window.PS_SHELL.createLayoutFromTemplate();
const templatedLayout = window.PS_SHELL.charts().find(doc =>
    doc.id === window.PS_SHELL.workspaceDocument());
const templateCharts = templatedLayout.items.filter(item => item.kind === 'chart');
const templateLabels = templatedLayout.items.filter(item => item.kind === 'text');
ok(templateCharts.length === 2 && templateLabels.length === 2,
    'creates ordinary chart items with optional A/B labels');
ok(templatedLayout.page.h > templatedLayout.page.w,
    'creates the selected template on a portrait page');
ok(templateCharts[0].x < templateCharts[1].x &&
    templateCharts[0].w === templateCharts[1].w,
    'calculates an editable two-column arrangement');
window.PS_SHELL.addLayout();
ok(!!document.querySelector('#ps-lcanvas .ps-layout-canvas-empty') &&
    !document.querySelector('#ps-lcanvas > .ps-lmissing'),
    'uses the centered blank-layout fallback');

console.log('case 7: proportional chart-panel resizing');
const resizeOrigin = { x: 40, y: 40, w: 400, h: 200 };
const resizePage = { w: 1000, h: 700 };
const resizeView = { snap: false, grid: 8 };
const horizontalResize = window.PS_SHELL.resizeLayoutPanel(
    resizeOrigin, 120, 15, resizePage, resizeView, false);
const verticalResize = window.PS_SHELL.resizeLayoutPanel(
    resizeOrigin, 15, 120, resizePage, resizeView, false);
const freeResize = window.PS_SHELL.resizeLayoutPanel(
    resizeOrigin, 120, 15, resizePage, resizeView, true);
ok(horizontalResize.w / horizontalResize.h === 2 &&
    verticalResize.w / verticalResize.h === 2,
    'locks width and height to the pointer-down aspect ratio');
ok(Math.abs(freeResize.w / freeResize.h - 2) > 0.1,
    'Shift permits deliberate freeform resizing');
const boundedResize = window.PS_SHELL.resizeLayoutPanel(
    resizeOrigin, 2000, 10, resizePage, resizeView, false);
ok(boundedResize.w <= resizePage.w - resizeOrigin.x &&
    boundedResize.h <= resizePage.h - resizeOrigin.y &&
    boundedResize.w / boundedResize.h === 2,
    'preserves proportions when constrained by the page edge');

console.log('case 8: standalone chart-toolbar skin');
const appCss = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent).join('\n');
ok(appCss.includes('[data-role="chart-toolbar"]') &&
    appCss.includes('width: 100% !important') &&
    appCss.includes('transform: none !important'),
    'decouples the application toolbar from chart geometry');
ok(appCss.includes('[data-role="toolbar-make"]') &&
    appCss.includes('[data-role="toolbar-actions"]') &&
    appCss.includes('@container (max-width: 590px)'),
    'preserves familiar command zones with compact responsive styling');

console.log('case 9: responsive shared statistics panel');
const engineSource = source('../inst/widget/graphbuilder2.js');
ok(engineSource.includes('function _inspectorAvailableWidth()') &&
    engineSource.includes('Math.min(INSPECTOR_MIN_W, availW)') &&
    engineSource.includes('inspectorPanel.style.maxWidth'),
    'caps the lower panel to its visible host and lets its preferred minimum yield');
ok(engineSource.includes('_gb2GeomRO.observe(host)') &&
    !engineSource.includes('var _availH = (document.documentElement.clientWidth'),
    'resyncs on host changes without retaining the viewport-width fallback');

console.log('case 10: standalone bidirectional observation exclusion');
window.PS_SHELL.loadTable('exclusion-data',
    ['condition', 'score', 'site'],
    [['A', '10', 'East'], ['A', '20', 'West'], ['B', '30', 'East']],
    { condition: 'nominal', score: 'continuous', site: 'nominal' });
window.PS_SHELL.setWorkspace('chart');
window.PS_SHELL.setModule('plotbuilder');
window.PS_SHELL.setRoles('plotbuilder',
    { xvar: 'condition', yvar: 'score' });
const beforeExclusion = window.PS_SHELL.buildPayload();
const aBefore = beforeExclusion.bars.find(bar => bar.x === 'A');
const firstCaseId = window.PS_SHELL.project.table.caseIds[0];
ok(aBefore && aBefore.n === 2 &&
    aBefore.caseIds[0] === firstCaseId &&
    aBefore.sourceColumns[0] === 'score',
    'carries stable source-cell metadata beside individual chart values');
window.setOption('chartSpec', JSON.stringify({
    hiddenPoints: [{ cat: 'A', group: '', idx: 0 }]
}));
const afterChartExclusion = window.PS_SHELL.buildPayload();
const aAfterChart = afterChartExclusion.bars.find(bar => bar.x === 'A');
const storedSpecAfterExclusion =
    JSON.parse(window.PS_SHELL.optionStore().chartSpec);
ok(!window.PS_SHELL.project.table.excludedRows[firstCaseId] &&
    window.PS_SHELL.project.table.columns.condition[0] === 'A' &&
    window.PS_SHELL.project.table.columns.score[0] === null,
    'promotes a chart point exclusion to only its source dataset cell');
ok(aAfterChart && aAfterChart.n === 2 &&
    afterChartExclusion.hiddenPoints.length === 1 &&
    window.PS_SHELL.optionStore().hiddenPoints.length === 0 &&
    storedSpecAfterExclusion.hiddenPoints.length === 0,
    'derives chart visibility from dataset truth while keeping persisted positional state empty');
window.PS_SHELL.setExcluded('score', 0, false);
window.PS_SHELL.setExcludedRows([1], true);
const afterDataExclusion = window.PS_SHELL.buildPayload();
const aAfterData = afterDataExclusion.bars.find(bar => bar.x === 'A');
ok(aAfterData && aAfterData.n === 1 &&
    aAfterData.caseIds[0] === firstCaseId,
    'propagates a Data-workspace row exclusion back into chart payloads');

console.log('case 11: stable centered chart geometry');
await new Promise(resolve => setTimeout(resolve, 120));
const zoomChart = window.PS_SHELL.charts().find(doc => doc.type !== 'layout');
window.PS_SHELL.switchChart(zoomChart.id);
window.PS_SHELL.setModule('plotbuilder');
window.PS_SHELL.setRoles('plotbuilder',
    { xvar: 'condition', yvar: 'score' });
const viewCanvas = document.querySelector('[data-test-chart-canvas]');
// Jul 27 2026 export-authority ruling: a FIT-MANAGED doc exports at the
// 7.5x5 standard regardless of the window (pinned end to end in fitpanes
// case 6), while a doc whose size the USER owns exports at the engine's
// native geometry. This case asserts the second contract - the engine's
// measured size passes through with no scaling - so it states that
// premise instead of inheriting whichever one the harness pane implies.
zoomChart.fitPane = false;
const payloadBeforeCenteredView = JSON.stringify(window.PS_SHELL.buildPayload());
const centeredExportSize = window.PS_SHELL.exportSize();
ok(appCss.includes('> :not([data-role="chart-toolbar"])') &&
    appCss.includes('align-self: center !important') &&
    appCss.includes('margin-left: auto !important'),
    'centers every current and newly rebuilt non-toolbar chart-card child');
ok(appCss.includes('intermediate engine') &&
    !source('js/ps-shell.js').includes('centerChartCanvas'),
    'keeps undo and redo alignment independent of shell render timing');
// FLIPPED Jul 27 2026: this line used to assert NO zoom control existed,
// the old no-scaling policy. Torry's view-zoom ruling overturned it - the
// figure keeps its logical size and CSS zoom on the HOST scales the view -
// so the contract is now that the sanctioned control exists and that any
// zoom lives on the host, never on the canvas element the engine owns.
ok(!!document.getElementById('ps-chart-zoom') &&
    !viewCanvas.style.zoom &&
    !viewCanvas.hasAttribute('data-ps-view-scale'),
    'view zoom is the sanctioned display mechanism, applied at the host');
ok(centeredExportSize.w === 640 && centeredExportSize.h === 420 &&
    JSON.stringify(window.PS_SHELL.buildPayload()) === payloadBeforeCenteredView,
    'preserves native engine and export geometry at 100 percent');

console.log('case 12: explanatory chart-role cards');
window.PS_SHELL.setModule('xyplotbuilder');
window.PS_SHELL.setRoles('xyplotbuilder',
    { xvar: 'score', yvar: 'score', groupVar: null, facetVar: null });
const roleCards = document.querySelectorAll('#ps-slots .ps-role-card');
// Flattened rail (Aug 2026): empty OPTIONAL roles collapse to add-rows,
// whose label lives in .ps-role-add-label; filled roles keep .ps-slot-label.
const roleLabels = Array.from(document.querySelectorAll(
    '#ps-slots .ps-slot-label, #ps-slots .ps-role-add-label'))
    .map(node => node.textContent);
ok(roleCards.length === 4 &&
    roleLabels.includes('X axis') && roleLabels.includes('Y axis') &&
    roleLabels.includes('Color / group') && roleLabels.includes('Panels'),
    'uses uniform plain-language cards for every scatter role');
// De-busy pass (Torry, Jul 27 2026) + the flattening (Aug 2026): the blurb
// shows one sentence with the full guidance in its tooltip; filled zones
// read settled via ps-slot-filled, and the empty optional zones are
// collapsed add-rows carrying NO badge at all (quieter than the badge the
// de-busy pass allowed them).
ok(document.getElementById('ps-analysis-help').textContent.trim() ===
    'Show the relationship between two numeric variables.' &&
    (document.getElementById('ps-analysis-help').getAttribute('data-tip') || '')
        .includes('X controls horizontal position') &&
    document.querySelectorAll('.ps-role-badge').length === 0 &&
    document.querySelectorAll('#ps-slots .ps-slot-filled').length === 2,
    'one-sentence blurb with tooltip; no badge chrome on this settled rail');
const groupRole = document.querySelector(
    '#ps-slots .ps-role-add-row[data-role-key="groupVar"]');
groupRole.click();
ok(!!document.querySelector(
        '#ps-slots [data-role-key="groupVar"] .ps-role-picker') &&
    !!document.querySelector(
        '#ps-slots .ps-role-picker button[data-col="site"]'),
    'expands an inline eligible-variable picker when a role card is clicked');
document.querySelector('#ps-slots .ps-role-picker button[data-col="site"]').click();
ok(window.PS_SHELL.rolesStore().groupVar === 'site' &&
    !document.querySelector('#ps-columns .ps-chip[data-col="site"]') &&
    !!document.querySelector(
        '#ps-slots [data-role-key="groupVar"] .ps-slot-chip[data-col="site"]'),
    'assigns from the picker; the variable moves out of the list into its zone');

console.log('case 13: storage failure remains honest');
localStorage.failProjectWrite = true;
window.PS_SHELL.loadTable('memory-only', ['value'], [['1'], ['2']],
    { value: 'continuous' });
ok(window.PS_SHELL.project.table.name === 'memory-only',
    'keeps the latest change in memory');
ok(window.PS_SHELL.diagnosticsText().includes('Autosave: error') &&
    window.PS_SHELL.diagnosticsText().includes('storage is full'),
    'reports that local recovery could not be updated');
localStorage.failProjectWrite = false;

if (failures) {
    console.error(`HARDENING DOM CHECK: ${failures} failure(s)`);
    process.exit(1);
}
console.log('HARDENING DOM CHECK: ALL GREEN');
