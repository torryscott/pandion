// Real-browser check for the SCATTER-OVERLAY RELOAD/ECHO GAP (Tier 2).
// The engine computes marginal arrays client-side on enable; the shell
// now harvests them from the engine's live data and re-ships them on
// every payload rebuild while a data fingerprint matches. The probe
// pins the two failure modes the audit found (an echoed edit and a
// reload both wiped the overlays) plus the honesty rule: after a data
// edit the arrays are OMITTED (no overlay beats a wrong overlay), and
// re-enabling comes back.
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
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(900);
await page.evaluate(() => { window.PS_SHELL.setModule('xyplotbuilder'); });
await page.waitForTimeout(900);

async function marginalBars() {
    return await page.evaluate(() => {
        const svg = Array.from(document.querySelectorAll('#psroot svg'))
            .sort((a, b) => b.clientWidth * b.clientHeight -
                a.clientWidth * a.clientHeight)[0];
        if (!svg) return 0;
        return svg.querySelectorAll(
            '[data-role="xy-marginal-x"], [data-role="xy-marginal-y"]').length;
    });
}

// ---- enable marginals through the engine's real "+" menu
const plusBtn = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#psroot button'))
        .find(x => (x.textContent || '').trim() === '+');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(plusBtn.x, plusBtn.y);
await page.waitForTimeout(400);
const ovl = await page.evaluate(() => {
    const b = document.querySelector('button[data-kind="ovl_marginal"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(ovl.x, ovl.y);
// The engine draws instantly but COMMITS the option on its own
// debounce; wait for the harvest (the commit's side effect), not a
// fixed sleep.
await page.waitForFunction(() =>
    !!(window.PS_SHELL.chart() || {}).overlayCache, { timeout: 8000 });
const enabled = await marginalBars();
if (enabled < 10)
    throw new Error('marginals did not enable: ' + enabled + ' elements');
console.log('  ok  the + menu enables marginal distributions (' +
            enabled + ' elements)');
const cache = await page.evaluate(() => {
    const c = window.PS_SHELL.chart().overlayCache;
    return c ? { keys: Object.keys(c.values).sort(),
                 xHist: (c.values.xyMarginalXHist || []).length } : null;
});
if (!cache || cache.xHist < 5)
    throw new Error('harvest missed the arrays: ' + JSON.stringify(cache));
console.log('  ok  the shell harvested the engine-computed arrays (' +
            cache.keys.join(', ') + ')');

// ---- an echoed edit no longer wipes the overlays (the audit repro)
await page.evaluate(() => {
    window.setOption('chartSpec', JSON.stringify({ chartTitle: 'echo survives' }));
});
await page.waitForTimeout(1200);
const afterEcho = await marginalBars();
if (afterEcho < 10)
    throw new Error('echoed edit wiped the marginals: ' + afterEcho);
console.log('  ok  an echoed edit keeps the marginals (' + afterEcho + ')');

// ---- reload keeps them
await page.reload();
await page.waitForTimeout(1400);
const afterReload = await marginalBars();
if (afterReload < 10)
    throw new Error('reload wiped the marginals: ' + afterReload);
console.log('  ok  a reload keeps the marginals (' + afterReload + ')');

// ---- .pand round trip keeps them
const fileText = await page.evaluate(() => window.PS_SHELL.projectFileText());
const tmp = '/tmp/ps-overlay.pand';
fs.writeFileSync(tmp, fileText);
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(PAGE);
await page2.waitForTimeout(600);
await page2.click('#ps-welcome-new');
await page2.waitForTimeout(250);
await page2.setInputFiles('#ps-file', tmp);
await page2.waitForTimeout(1500);
const pandBars = await page2.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.clientWidth * b.clientHeight -
            a.clientWidth * a.clientHeight)[0];
    return svg ? svg.querySelectorAll(
        '[data-role="xy-marginal-x"], [data-role="xy-marginal-y"]').length : 0;
});
if (pandBars < 10)
    throw new Error('.pand lost the marginals: ' + pandBars);
console.log('  ok  marginals ride .pand into a fresh session (' + pandBars + ')');
await ctx2.close();

// ---- honesty: a DATA edit stales the fingerprint and OMITS the arrays
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(600);
await page.dblclick('td[data-gc="score"][data-gr="0"]');   // a click now SELECTS
await page.waitForTimeout(250);
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('99');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const stale = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return { shipped: (p.xyMarginalXHist || []).length,
             marginal: p.xyMarginal,
             specOn: /"xyMarginal"\s*:\s*"histogram"/.test(p.chartSpec || '') };
});
if (stale.shipped !== 0 || stale.marginal !== 'none' || stale.specOn)
    throw new Error('stale data must present the overlay cleanly OFF ' +
                    '(arrays omitted, xyMarginal "none"): ' +
                    JSON.stringify(stale));
console.log('  ok  a data edit turns the stale overlay cleanly off ' +
            '(no wrong overlays, no phantom chrome)');

// ---- re-enabling recomputes against the new data
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(900);
const plus2 = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#psroot button'))
        .find(x => (x.textContent || '').trim() === '+');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(plus2.x, plus2.y);
await page.waitForTimeout(400);
const ovl2 = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll(
        'button[data-kind="ovl_marginal"]'))
        .find(x => x.getBoundingClientRect().width > 0);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
// The cleanly-off presentation is exactly what makes the engine's +
// menu list Distributions again (it gates on xyMarginal === "none").
if (!ovl2)
    throw new Error('the + menu does not offer Distributions after the ' +
                    'stale overlay was turned off');
await page.mouse.click(ovl2.x, ovl2.y);
await page.waitForFunction(() => {
    const c = (window.PS_SHELL.chart() || {}).overlayCache;
    return !!c && (window.PS_SHELL.buildPayload().xyMarginalXHist || []).length > 0;
}, { timeout: 8000 });
const back = await marginalBars();
if (back < 10)
    throw new Error('re-enable did not restore marginals: ' + back);
const freshCache = await page.evaluate(() => {
    const c = window.PS_SHELL.chart().overlayCache;
    const p = window.PS_SHELL.buildPayload();
    return { rebuilt: (p.xyMarginalXHist || []).length,
             cached: c ? (c.values.xyMarginalXHist || []).length : 0 };
});
if (freshCache.rebuilt < 5)
    throw new Error('fresh harvest did not re-ship: ' +
                    JSON.stringify(freshCache));
console.log('  ok  re-enabling recomputes and re-harvests against the new data');

// ---- heatmap: the chart TYPE is honored across data edits, and its
// tiles self-heal (the shell pins a synthetic xyBinCount so the
// ENGINE recomputes tiles from the CURRENT points at render entry,
// then harvests them - the stale state lasts exactly one render).
const trig2 = await page.evaluate(() => {
    const b = document.querySelector('button[data-role="graphtype-trigger"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(trig2.x, trig2.y);
await page.waitForTimeout(300);
const hmCard = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button[data-gt="heatmap"]'))
        .find(x => x.getBoundingClientRect().width > 0);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!hmCard) throw new Error('graph-type flyout offers no heatmap card');
await page.mouse.click(hmCard.x, hmCard.y);
await page.waitForFunction(() => {
    const c = (window.PS_SHELL.chart() || {}).overlayCache;
    return !!c && (c.values.xyBins || []).length > 0;
}, { timeout: 8000 });
const tilesA = await page.evaluate(() =>
    JSON.stringify(window.gb2_undo.getData().xyBins || []));
console.log('  ok  the flyout switches to the heatmap and the tiles are ' +
            'harvested');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);
await page.dblclick('td[data-gc="score"][data-gr="1"]');   // a click now SELECTS
await page.waitForTimeout(250);
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('77');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(1000);
const heat = await page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.clientWidth * b.clientHeight -
            a.clientWidth * a.clientHeight)[0];
    const c = (window.PS_SHELL.chart() || {}).overlayCache;
    return {
        tiles: svg ? svg.querySelectorAll('[data-role="xy-bin"]').length : 0,
        tilesJson: JSON.stringify(window.gb2_undo.getData().xyBins || []),
        cacheBins: c ? (c.values.xyBins || []).length : 0,
        pinLeft: !!(window.__gb2_pendingOpts &&
            Object.prototype.hasOwnProperty.call(
                window.__gb2_pendingOpts, 'xyBinCount'))
    };
});
if (heat.tiles < 4 || heat.cacheBins < 4)
    throw new Error('heatmap went blank after the data edit: ' +
                    JSON.stringify({ tiles: heat.tiles,
                                     cacheBins: heat.cacheBins }));
if (heat.tilesJson === tilesA)
    throw new Error('heatmap tiles were NOT recomputed against the new data');
if (heat.pinLeft)
    throw new Error('the synthetic xyBinCount pin leaked past the render');
console.log('  ok  a data edit keeps the heatmap drawn with tiles ' +
            'recomputed against the new data (no leaked pin)');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('OVERLAY RELOAD CHECK: ALL GREEN');
