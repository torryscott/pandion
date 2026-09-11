// A layout must carry each chart's font outside the renderer host. Browser
// defaults and the currently active chart are not references for another panel.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
let chromium;
for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
    try { ({ chromium } = createRequire(path.join(base, 'x.js'))('playwright')); break; }
    catch { /* Try the same shared dependency locations as the other probes. */ }
}
assert(chromium, 'Playwright is required for layout font verification');
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE || 'standalone/index.html')).href);
    await page.waitForFunction(() => window.PS_SHELL);
    if (await page.locator('#ps-welcome').isVisible()) await page.click('#ps-welcome-sample');
    await page.evaluate(() => PS_SHELL.loadTable('Font reference', ['GROUP', 'VALUE'],
        [['A', '1'], ['A', '3'], ['B', '2'], ['B', '6']]));
    const charts = [];
    for (const family of ['', 'serif', 'monospace']) {
        if (charts.length) await page.evaluate(() => PS_SHELL.addChart());
        await page.evaluate(() => {
            PS_SHELL.setModule('plotbuilder');
            PS_SHELL.setRoles('plotbuilder', { xvar: 'GROUP', yvar: 'VALUE' });
        });
        await page.waitForTimeout(600);
        await page.evaluate(f => window.__gb2_setOption('chartFontFamily', f), family);
        await page.waitForTimeout(2300);
        const chart = await page.evaluate(() => {
            const root = document.querySelector('#psroot [data-role="gb2-chart-svg"]');
            const texts = [...root.querySelectorAll('text')].filter(t => t.textContent.trim());
            return { id: PS_SHELL.chart().id, texts: texts.map(t =>
                ({ text: t.textContent, font: getComputedStyle(t).fontFamily })) };
        });
        assert(chart.texts.length >= 6, 'real chart labels required');
        assert(chart.texts.every(t => t.font === (family || 'sans-serif')),
            'the chosen font must actually reach every live chart label');
        charts.push(chart);
    }
    const tableBefore = await page.evaluate(() => JSON.stringify(PS_SHELL.project.table));
    await page.evaluate(() => PS_SHELL.addLayout());
    for (const c of charts) {
        await page.click('#ps-laddchart');
        await page.click('#ps-lchartmenu button[data-chart="' + c.id + '"]');
    }
    await page.waitForFunction(ids => ids.every(id => PS_SHELL.snapshotOf(id)?.valid), charts.map(c => c.id));
    await page.evaluate(() => {
        PS_SHELL.chart().items.forEach((it, i) => Object.assign(it,
            { x: 30 + i * 320, y: 150, w: 300, h: 300 }));
        PS_SHELL.render();
    });
    for (const stage of ['initial', 'reopened']) {
        if (stage === 'reopened') {
            await page.evaluate(() => {
                const saved = PS_SHELL.projectText();
                PS_SHELL.markSavedForTest();
                return PS_SHELL.openProjectText(saved);
            });
            await page.waitForFunction(ids => ids.every(id => PS_SHELL.snapshotOf(id)?.valid), charts.map(c => c.id));
        }
        const live = await page.evaluate(() => PS_SHELL.chart().items.filter(it => it.kind === 'chart').map(it => {
            const panel = document.querySelector('.ps-litem[data-item-id="' + it.id + '"]');
            return { id: it.chartId, texts: [...panel.querySelectorAll('svg text')]
                .filter(t => t.textContent.trim()).map(t => ({ text: t.textContent, font: getComputedStyle(t).fontFamily })) };
        }));
        const exported = await page.evaluate(() => PS_SHELL.exportSource('white'));
        const svgPage = await browser.newPage();
        await svgPage.goto('data:image/svg+xml,' + encodeURIComponent(exported.svg));
        const rendered = await svgPage.evaluate(() => [...document.documentElement.children]
            .filter(el => el.localName === 'svg').map(root => [...root.querySelectorAll('text')]
                .filter(t => t.textContent.trim()).map(t => ({ text: t.textContent, font: getComputedStyle(t).fontFamily }))));
        if (process.env.PS_LAYOUT_FONT_OUT) {
            fs.mkdirSync(process.env.PS_LAYOUT_FONT_OUT, { recursive: true });
            fs.writeFileSync(path.join(process.env.PS_LAYOUT_FONT_OUT, stage + '-fonts.json'),
                JSON.stringify({ charts, live, rendered }, null, 2));
            fs.writeFileSync(path.join(process.env.PS_LAYOUT_FONT_OUT, stage + '-layout.svg'), exported.svg);
            await svgPage.screenshot({ path: path.join(process.env.PS_LAYOUT_FONT_OUT, stage + '-layout.png') });
        }
        assert.equal(live.length, charts.length, 'all three panels are visible');
        assert.equal(rendered.length, charts.length, 'all three panels are exported');
        charts.forEach((c, i) => {
            assert.equal(live[i].id, c.id, 'layout preserves chart identities');
            assert.deepEqual(rendered[i], c.texts, 'export preserves every label and its source font');
            assert.deepEqual(live[i].texts, c.texts, 'layout workspace preserves every label and its source font');
        });
        // Loading fills absent optional fields with their schema defaults. Every
        // original field, including raw observations, typed values and case IDs,
        // must still survive exactly.
        const tableAfter = await page.evaluate(() => PS_SHELL.project.table);
        for (const [key, value] of Object.entries(JSON.parse(tableBefore)))
            assert.deepEqual(tableAfter[key], value, 'preserved table field: ' + key);
        await svgPage.close();
        console.log('  ok  ' + stage + ': all three panels preserve source fonts, labels and data');
    }
    assert.deepEqual(errors, []);
    console.log('LAYOUT FONT CHECK PASS (3 independent chart fonts; initial and saved/reopened layouts)');
} finally { await browser.close(); }
