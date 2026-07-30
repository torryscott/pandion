// Equivalent-access contract across every standalone chart family.
//
// Each analysis must expose a focusable named chart, point readers to the
// Statistics panel, and provide substantive values in semantic tables/text.
// Faceted, uncertainty, excluded-data, and missing-role states are included.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function resolveFrom(name) {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js')).resolve(name); }
        catch { /* try the next shared dependency location */ }
    }
    return null;
}
const playwrightPath = resolveFrom('playwright');
const axePath = resolveFrom('axe-core');
if (!playwrightPath || !axePath) {
    console.error('chart-accessibility-check requires playwright and axe-core');
    process.exit(2);
}
const { chromium } = createRequire(playwrightPath)('playwright');
const axeSource = readFileSync(
    path.join(path.dirname(axePath), 'axe.min.js'), 'utf8');
const pagePath = process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html');
const pageUrl = 'file://' + pagePath;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));
function ok(condition, message, detail = '') {
    if (!condition)
        throw new Error(message + (detail ? ': ' + detail : ''));
    console.log('  ok  ' + message);
}
async function audit(label) {
    const violations = await page.evaluate(async () => {
        const result = await window.axe.run('#psroot', {
            runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa',
                         'wcag22aa'],
            },
            resultTypes: ['violations'],
        });
        return result.violations
            .filter(item => item.id === 'target-size' ||
                item.impact === 'serious' || item.impact === 'critical')
            .map(item => item.id + ' x' + item.nodes.length + ' (' +
                item.nodes.slice(0, 3).map(node => node.target.join(' ')).
                    join(', ') + ')');
    });
    ok(violations.length === 0, label + ' is axe-clean',
        violations.join(' | '));
}

await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(250);
}
await page.addScriptTag({ content: axeSource });
await page.evaluate(() => {
    const header = [
        'group', 'panel', 'category', 'score', 'x', 'y',
        't1', 't2', 't3', 'i1', 'i2', 'i3',
    ];
    const rows = [];
    for (let index = 0; index < 24; index++) {
        const group = index % 2 ? 'Treatment' : 'Control';
        const panel = index % 4 < 2 ? 'North' : 'South';
        const category = ['Low', 'Middle', 'High'][index % 3];
        const score = 10 + index + (group === 'Treatment' ? 4 : 0);
        const x = index + 1;
        const y = 3 + x * 1.7 + (index % 3);
        rows.push([
            group, panel, category, String(score), String(x), String(y),
            String(score - 2), String(score + 1), String(score + 4),
            String(index % 5 + 1), String((index + 1) % 5 + 1),
            String((index + 2) % 5 + 1),
        ]);
    }
    window.PS_SHELL.loadTable('accessibility-matrix', header, rows, {
        group: 'nominal', panel: 'nominal', category: 'ordinal',
        score: 'continuous', x: 'continuous', y: 'continuous',
        t1: 'continuous', t2: 'continuous', t3: 'continuous',
        i1: 'ordinal', i2: 'ordinal', i3: 'ordinal',
    }, {
        group: ['Control', 'Treatment'],
        panel: ['North', 'South'],
        category: ['Low', 'Middle', 'High'],
        i1: ['1', '2', '3', '4', '5'],
        i2: ['1', '2', '3', '4', '5'],
        i3: ['1', '2', '3', '4', '5'],
    });
    window.PS_SHELL.setWorkspace('chart');
    // Exercise the exclusion bridge in analyses that use score.
    window.PS_SHELL.setExcluded('score', 0, true);
});
await page.waitForTimeout(400);

const families = [
    {
        label: 'Compare Groups', module: 'plotbuilder',
        roles: {
            xvar: 'category', yvar: 'score',
            groupVar: 'group', facetVar: 'panel',
        },
        options: { errorBarType: 'se' },
        name: /bar|dot|line/i,
        extraName: /standard error|\bSE\b|error bar/i,
    },
    {
        label: 'Distribution', module: 'distplotbuilder',
        roles: { var: 'score', groupVar: 'group', facetVar: 'panel' },
        options: { graphType: 'histogram' },
        name: /histogram|distribution/i,
    },
    {
        label: 'Frequencies', module: 'freqplotbuilder',
        roles: { var: 'category', groupVar: 'group', facetVar: 'panel' },
        options: { graphType: 'bar' },
        name: /bar|frequency|frequencies/i,
    },
    {
        label: 'Repeated Measures', module: 'rmplotbuilder',
        roles: {
            measures: ['t1', 't2', 't3'],
            betweenVar: 'group', facetVar: 'panel',
        },
        options: { errorBarType: 'se' },
        name: /repeated|line/i,
    },
    {
        label: 'Correlation Matrix', module: 'corrplotbuilder',
        roles: { vars: ['score', 'x', 'y', 't1'] },
        options: { corrMethod: 'pearson' },
        name: /correlation|matrix/i,
    },
    {
        label: 'Likert / Survey', module: 'likertplotbuilder',
        roles: { items: ['i1', 'i2', 'i3'] },
        options: {},
        name: /likert|survey/i,
    },
    {
        label: 'Scatter', module: 'xyplotbuilder',
        roles: {
            xvar: 'x', yvar: 'y',
            groupVar: 'group', facetVar: 'panel',
        },
        options: { xyShowFit: true, xyShowCI: true, xyFitType: 'linear' },
        name: /scatter|relationship/i,
    },
];

console.log('case 1: every chart family has an equivalent named structure');
for (const family of families) {
    await page.evaluate(config => {
        window.PS_SHELL.setModule(config.module);
        window.PS_SHELL.setRoles(config.module, config.roles);
        Object.assign(window.PS_SHELL.optionStore(), config.options);
        // Re-entering the module applies the option store and redraws.
        window.PS_SHELL.setModule(config.module);
    }, family);
    await page.waitForTimeout(750);
    const chart = await page.evaluate(() => {
        const svg = document.querySelector(
            '#psroot svg[data-role="gb2-chart-svg"]');
        return svg ? {
            role: svg.getAttribute('role'),
            tabindex: svg.getAttribute('tabindex'),
            name: svg.getAttribute('aria-label') || '',
            panels: document.querySelectorAll(
                '#psroot [data-facet-index], #psroot [data-panel-key]').length,
        } : null;
    });
    ok(!!chart, family.label + ' draws a chart');
    ok(chart.role === 'img' && chart.tabindex === '0',
        family.label + ' exposes one focusable image');
    ok(chart.name.length >= 45 && family.name.test(chart.name),
        family.label + ' accessible name identifies the chart structure',
        chart.name);
    ok(/Statistics panel/i.test(chart.name),
        family.label + ' accessible name points to substantive values',
        chart.name);
    await audit(family.label + ' chart');

    const statistics = page.locator(
        '#psroot button[aria-label="Statistics"]').first();
    ok(await statistics.count() === 1,
        family.label + ' exposes the Statistics control');
    await statistics.click();
    await page.waitForTimeout(450);
    const stats = await page.evaluate(() => {
        const tabPanes = Array.from(document.querySelectorAll(
            '#psroot [data-st-pane]'));
        const panel = document.querySelector('#psroot .gb2-panel');
        const panes = tabPanes.length ? tabPanes : (panel ? [panel] : []);
        const text = panes.map(node => node.textContent || '').join(' ');
        const tables = panes.flatMap(node =>
            Array.from(node.querySelectorAll('table')));
        return {
            panes: tabPanes.length,
            panel: !!panel,
            text: text.replace(/\s+/g, ' ').trim(),
            tables: tables.length,
            headers: tables.reduce((sum, table) =>
                sum + table.querySelectorAll('th').length, 0),
            cells: tables.reduce((sum, table) =>
                sum + table.querySelectorAll('td').length, 0),
        };
    });
    ok((stats.panes > 0 || stats.panel) && stats.text.length >= 80,
        family.label + ' Statistics panel contains substantive prose',
        stats.text.slice(0, 160));
    ok(stats.tables > 0 && stats.headers > 0 && stats.cells > 0,
        family.label + ' Statistics values use semantic tables',
        JSON.stringify(stats));
    ok(/\d/.test(stats.text),
        family.label + ' Statistics panel exposes numeric results');
    if (family.extraName)
        ok(family.extraName.test(chart.name + ' ' + stats.text),
            family.label + ' alternatives define the uncertainty display',
            (chart.name + ' ' + stats.text).slice(0, 1200));
    await audit(family.label + ' Statistics panel');
}

console.log('case 2: excluded observations and uncertainty are disclosed');
await page.evaluate(() => {
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', {
        xvar: 'category', yvar: 'score',
        groupVar: 'group', facetVar: 'panel',
    });
    Object.assign(window.PS_SHELL.optionStore(), { errorBarType: 'se' });
    window.PS_SHELL.setModule('plotbuilder');
});
await page.waitForTimeout(700);
await page.locator('#psroot button[aria-label="Statistics"]').first().click();
await page.waitForTimeout(350);
const disclosure = await page.evaluate(() => {
    const svg = document.querySelector(
        '#psroot svg[data-role="gb2-chart-svg"]');
    return ((svg && svg.getAttribute('aria-label')) || '') + ' ' +
        Array.from(document.querySelectorAll('#psroot [data-st-pane]'))
            .map(node => node.textContent || '').join(' ');
});
ok(/excluded|hidden/i.test(disclosure),
    'chart alternatives disclose excluded or hidden observations',
    disclosure.replace(/\s+/g, ' ').slice(0, 240));
ok(/standard error|\bSE\b|error bar/i.test(disclosure),
    'chart alternatives define the uncertainty display',
    disclosure.replace(/\s+/g, ' ').slice(0, 240));

console.log('case 3: every missing-role state remains understandable');
for (const family of families) {
    await page.evaluate(config => {
        window.PS_SHELL.setModule(config.module);
        window.PS_SHELL.setRoles(config.module, {});
    }, family);
    await page.waitForTimeout(280);
    const empty = await page.evaluate(() => ({
        chart: !!document.querySelector(
            '#psroot svg[data-role="gb2-chart-svg"]'),
        heading: document.querySelector('#psroot .ps-guided-empty h3')
            ?.textContent || '',
        copy: document.querySelector('#psroot .ps-guided-empty p')
            ?.textContent || '',
        choose: !!document.querySelector('#psroot #ps-empty-choose'),
    }));
    ok(!empty.chart && /needs variables/i.test(empty.heading) &&
       empty.copy.length > 20 && empty.choose,
       family.label + ' missing-role state explains recovery',
       JSON.stringify(empty));
    await audit(family.label + ' missing-role state');
}

await browser.close();
if (pageErrors.length)
    throw new Error('page errors: ' + pageErrors.join(' | '));
console.log('CHART ACCESSIBILITY CHECK: PASS');
