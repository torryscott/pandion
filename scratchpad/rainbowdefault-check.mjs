// Punch list t4-147: the rainbow default palette + the colorblind-safe
// pruning. Drives the built dist (min bundle).
//  1. A fresh grouped chart paints the new stock colors in order.
//  2. An EIGHT-group default chart passes every Vision tile - the new
//     "safe at every k it offers" claim, checked in the product's own UI.
//  3. A retired cb id still RESOLVES (old files keep their look) and
//     its label still prints, but the gallery no longer lists it.
//  4. The curated flyout's Colorblind-safe pair is Muted IV + Classic II.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const NEW = ['#2d5c94', '#902634', '#e18e4c', '#597b2f',
             '#faca59', '#32295e', '#5bb1ba', '#d35a80'];
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname,
                   '..', 'standalone', 'dist', 'pandion-plots.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(900);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1800);

const toHex = (rgb) => {
    const m = String(rgb).match(/\d+/g);
    if (!m) return String(rgb).toLowerCase();
    return '#' + m.slice(0, 3).map(n =>
        (+n < 16 ? '0' : '') + (+n).toString(16)).join('');
};

console.log('case 1: a fresh grouped chart wears the rainbow in order');
const fills = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const roles = window.PS_SHELL.rolesStore();
    roles.xvar = 'site'; roles.yvar = 'score'; roles.groupVar = 'condition';
    window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
    await s(2000);
    const chart = Array.from(document.querySelectorAll('.graphbuilder2-host svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    // Legend order = series order = palette order.
    return Array.from(chart.querySelectorAll('[data-legend-row] [data-role="legend-swatch"]'))
        .map(el => getComputedStyle(el).fill);
});
const legend = fills.map(toHex);
ok(legend.length === 3 && legend[0] === NEW[0] && legend[1] === NEW[1] &&
   legend[2] === NEW[2],
   `three series paint blue, red, orange in order (${legend})`);

console.log('case 2: an EIGHT-group default chart passes every Vision tile');
const tiles = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let g = 1; g <= 8; g++)
        for (let i = 0; i < 3; i++)
            rows.push(['A', 'G' + g, String(40 + g * 3 + i)]);
    window.PS_SHELL.loadTable('rain8', ['x', 'g', 'y'], rows);
    await s(900);
    const roles = window.PS_SHELL.rolesStore();
    roles.xvar = 'x'; roles.yvar = 'y'; roles.groupVar = 'g';
    window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
    await s(2200);
    document.querySelector(
        '[data-role="chart-toolbar"] [title*="settings" i], ' +
        '[data-role="chart-toolbar"] [aria-label*="settings" i]').click();
    await s(900);
    Array.from(document.querySelectorAll('button'))
        .find(b => /accessibility/i.test(b.textContent || '')).click();
    await s(700);
    const out = [];
    for (const t of document.querySelectorAll('[data-cvd-opt]')) {
        const mode = t.getAttribute('data-cvd-opt');
        const dot = t.querySelector('span[title]');
        out.push({ mode, tip: dot ? dot.getAttribute('title') : null });
    }
    return { tiles: out,
        status: (document.querySelector('[data-field="cvd-fix-area"]') || {})
            .textContent || '' };
});
const judged = tiles.tiles.filter(t =>
    ['none', 'protanopia', 'deuteranopia', 'tritanopia'].includes(t.mode));
ok(judged.length === 4, `four judged tiles found (${judged.length})`);
for (const t of judged)
    ok(t.tip !== null && /pass the separation check/.test(t.tip),
       `${t.mode} dot reports a PASS at eight groups`);
// At eight groups the three deficiencies pass but GRAYSCALE cannot
// (no shade arrangement separates 8 colors in print) - the status line
// must say that honestly and point at patterns, and must NOT offer a
// Fix button for an unfixable target.
ok(/grayscale/i.test(tiles.status) && /patterns/i.test(tiles.status),
   'the status line reports the grayscale limit and points at patterns');
ok(!/Fix (all|unlocked) colors/.test(tiles.status),
   'and offers no Fix button, since nothing fixable is failing');

console.log('case 3: a retired colorblind palette resolves but is not listed');
const retired = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.__gb2_setOption('chartPalette', 'cb-spectrum-dark-ii');
    await s(2600);
    const chart = Array.from(document.querySelectorAll('.graphbuilder2-host svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    const fills = [...new Set(Array.from(
        chart.querySelectorAll('path[data-bar-cat], rect[data-bar-cat]'))
        .map(el => getComputedStyle(el).fill))];
    // The palette flyout: open it and read the rows + current label.
    document.querySelector('[data-role="palette-trigger"]').click();
    await s(400);
    const fly = document.querySelector('[data-role="palette-flyout"]');
    const text = fly ? fly.textContent : '';
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return { fills, flyText: text.replace(/\s+/g, ' ') };
});
const retFills = retired.fills.map(toHex);
ok(retFills.includes('#003001') && retFills.includes('#007790'),
   `the retired id still paints its own colors (${retFills.slice(0, 3)}...)`);
ok(/Spectrum Classic II/.test(retired.flyText) &&
   /Spectrum Muted IV/.test(retired.flyText),
   'the curated Colorblind-safe pair is Classic II + Muted IV');
ok(!/Spectrum Dark II(?! I)/.test(retired.flyText.replace('Spectrum Dark III', '')),
   'and Dark II is no longer offered anywhere in the flyout');
ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors.slice(0, 2)));
await browser.close();
console.log('RAINBOW DEFAULT CHECK PASS');
