// Real-browser check for the style/palette LIBRARY BRIDGE (audit fix 2,
// Option A): the shell interprets the engine's one-shot styleLibrary /
// paletteLibrary actions verb-for-verb like jamovi's R side, persists
// the machine library in localStorage, feeds it back through the
// payload, resolves default palettes/styles, and carries the library
// inside .pand files. Also covers the layout empty-panel copy branch
// (audit fix 3).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

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
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(500);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(900);

// ---- palette save through the ENGINE'S exact pathway (window.setOption)
const machineId = await page.evaluate(() =>
    window.PS_SHELL.buildPayload().paletteLibraryMachineId);
if (!machineId || !/^m_/.test(machineId))
    throw new Error('payload carries no machine id: ' + machineId);
await page.evaluate((mid) => {
    window.setOption('paletteLibrary', JSON.stringify({
        kind: 'save', name: 'Probe pal',
        colors: ['#112233', '#445566', '#778899'],
        machineId: mid, timestamp: Date.now()
    }));
}, machineId);
await page.waitForTimeout(400);
const afterSave = await page.evaluate(() => ({
    stored: window.PS_SHELL.libraries().palette.palettes['Probe pal'],
    payload: window.PS_SHELL.buildPayload().paletteLibrary['Probe pal'],
    ls: (() => {
        try {
            return JSON.parse(localStorage.getItem('psstandalone.libraries.v1'))
                .palette.palettes['Probe pal'];
        } catch (e) { return null; }
    })()
}));
if (JSON.stringify(afterSave.stored) !== '["#112233","#445566","#778899"]' ||
    JSON.stringify(afterSave.payload) !== JSON.stringify(afterSave.stored) ||
    JSON.stringify(afterSave.ls) !== JSON.stringify(afterSave.stored))
    throw new Error('palette save did not persist end to end: ' +
                    JSON.stringify(afterSave));
console.log('  ok  palette save action persists to store, payload, and localStorage');

// ---- R-parity guards: wrong machine + stale timestamp are ignored
await page.evaluate((mid) => {
    window.setOption('paletteLibrary', JSON.stringify({
        kind: 'delete', name: 'Probe pal',
        machineId: 'm_someone_else', timestamp: Date.now() + 1000
    }));
    window.setOption('paletteLibrary', JSON.stringify({
        kind: 'delete', name: 'Probe pal',
        machineId: mid, timestamp: 1
    }));
}, machineId);
await page.waitForTimeout(300);
if (!(await page.evaluate(() =>
    !!window.PS_SHELL.libraries().palette.palettes['Probe pal'])))
    throw new Error('a foreign or stale action mutated the library');
console.log('  ok  foreign-machine and stale-timestamp actions are ignored');

// ---- style savedefault + palette savedefault
await page.evaluate((mid) => {
    window.setOption('styleLibrary', JSON.stringify({
        kind: 'savedefault', name: 'Probe style',
        groups: ['text'], opts: { chartTextColor: '#8b1a1a' },
        machineId: mid, timestamp: Date.now()
    }));
    window.setOption('paletteLibrary', JSON.stringify({
        kind: 'savedefault', name: 'Probe pal',
        colors: ['#112233', '#445566', '#778899'],
        machineId: mid, timestamp: Date.now() + 1
    }));
}, machineId);
await page.waitForTimeout(400);

// ---- THE core bug: everything survives a reload
await page.reload();
await page.waitForTimeout(900);
const afterReload = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return {
        pal: p.paletteLibrary['Probe pal'],
        style: p.styleLibrary['Probe style'],
        palDefault: p.paletteDefaultId,
        styleDefault: p.styleDefaultId
    };
});
if (!afterReload.pal || !afterReload.style ||
    afterReload.palDefault !== 'saved:Probe pal' ||
    afterReload.styleDefault !== 'Probe style')
    throw new Error('library lost on reload: ' + JSON.stringify(afterReload));
console.log('  ok  saved styles, palettes, and defaults survive a reload');

// ---- the saved style appears in the ENGINE's Theme flyout
await page.click('text=Theme');
await page.waitForTimeout(400);
const flyout = await page.evaluate(() => {
    const f = document.querySelector('[data-role="palette-flyout"]');
    return f ? f.textContent : '';
});
if (!flyout.includes('Probe style'))
    throw new Error('engine flyout does not list the saved style');
console.log('  ok  the engine Theme flyout lists the persisted style');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ---- default palette resolves an UNPINNED chart; default style
// auto-applies to a BRAND-NEW chart exactly once
await page.click('.ps-tab-add');
await page.waitForTimeout(300);
await page.click('#ps-analysis-grid [data-analysis-module="plotbuilder"]');
await page.waitForTimeout(400);
await page.click('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-drop');
await page.waitForTimeout(150);
await page.click('#ps-slots .ps-role-picker button[data-col="condition"]');
await page.waitForTimeout(250);
await page.click('#ps-slots .ps-slot[data-role-key="yvar"] .ps-slot-drop');
await page.waitForTimeout(150);
await page.click('#ps-slots .ps-role-picker button[data-col="score"]');
await page.waitForTimeout(1600);
const newChart = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const p = window.PS_SHELL.buildPayload();
    const spec = JSON.parse((c.options[c.module] || {}).chartSpec || '{}');
    return {
        stamped: c.styleStamp,
        autoApply: p.styleAutoApply,
        textColor: spec.chartTextColor || p.chartTextColor || null,
        chartPalette: p.chartPalette
    };
});
if (newChart.chartPalette !== 'saved:Probe pal')
    throw new Error('unpinned chart did not resolve the default palette: ' +
                    JSON.stringify(newChart));
if (newChart.textColor !== '#8b1a1a' || newChart.stamped !== true ||
    newChart.autoApply !== false)
    throw new Error('default style did not auto-apply exactly once: ' +
                    JSON.stringify(newChart));
console.log('  ok  new charts resolve the default palette and auto-apply the default style once');

// ---- fix 3: an UNASSIGNED chart placed in a layout explains itself
const missingCopy = await page.evaluate(() => {
    window.PS_SHELL.addChart('plotbuilder');            // no variables
    const bare = window.PS_SHELL.chart().id;
    window.PS_SHELL.createLayoutFromTemplate('blank');
    const lay = window.PS_SHELL.chart();
    lay.items = [{ id: 'i1', kind: 'chart', chartId: bare,
                   x: 30, y: 30, w: 400, h: 280 }];
    window.PS_SHELL.render();
    return new Promise(res => setTimeout(() => {
        const m = document.querySelector('#ps-lcanvas .ps-lmissing');
        res(m ? m.textContent : null);
    }, 700));
});
if (!missingCopy || !missingCopy.includes('needs variables'))
    throw new Error('empty layout panel copy did not branch: ' + missingCopy);
console.log('  ok  empty layout panels name the real cause (unassigned variables)');

// ---- .pand carry-along into a clean machine
const fileText = await page.evaluate(() => window.PS_SHELL.projectFileText());
if (!JSON.parse(fileText).libraries.palettes['Probe pal'])
    throw new Error('.pand does not embed the library snapshot');
const tmp = '/tmp/ps-library-bridge.pand';
fs.writeFileSync(tmp, fileText);
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(PAGE);
await page2.waitForTimeout(500);
await page2.click('#ps-welcome-new');
await page2.waitForTimeout(250);
await page2.setInputFiles('#ps-file', tmp);
await page2.waitForTimeout(900);
const imported = await page2.evaluate(() => ({
    pal: window.PS_SHELL.libraries().palette.palettes['Probe pal'],
    style: window.PS_SHELL.libraries().style.styles['Probe style']
}));
if (!imported.pal || !imported.style)
    throw new Error('.pand did not import the library on a clean machine: ' +
                    JSON.stringify(imported));
console.log('  ok  .pand files carry saved styles/palettes onto a clean machine');
await ctx2.close();

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('LIBRARY BRIDGE CHECK: ALL GREEN');
