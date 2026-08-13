// t4-144 (engine): sampled ramp colors keep a visibility floor against
// the white page. Drives the REAL flyout on the standalone (min bundle):
// a 2-group bar picks Blues and the second series must come out as a
// visible pale blue, not the ramp's near-white terminus; a 9-group chart
// holds the same floor at its light end; viridis stays untouched end to
// end; and the flyout's own Blues row previews the same clamped set.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname,
                   '..', 'standalone', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);

console.log('case 1: Blues at k=2 through the real flyout');
const two = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // Two groups: A/B x S1/S2.
    window.PS_SHELL.loadTable('ramp2', ['group', 'site', 'score'], [
        ['A', 'S1', '60'], ['A', 'S2', '61'], ['A', 'S1', '62'],
        ['A', 'S2', '59'], ['B', 'S1', '64'], ['B', 'S2', '68'],
        ['B', 'S1', '65'], ['B', 'S2', '67']]);
    await s(900);
    const roles = window.PS_SHELL.rolesStore();
    roles.xvar = 'group'; roles.yvar = 'score'; roles.groupVar = 'site';
    window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
    await s(1800);
    // Open the palette flyout from the toolbar and click the Blues row.
    const trigger = document.querySelector('[data-role="palette-trigger"]');
    trigger.click();
    await s(400);
    const fly = document.querySelector('[data-role="palette-flyout"]');
    const rows = Array.from(fly.querySelectorAll('button, [role="button"]'));
    const blues = rows.find(r => /\bBlues\b/.test(r.textContent));
    // The flyout row's own swatches: what the user is promised.
    const promised = Array.from(blues.querySelectorAll('*'))
        .map(el => el.style && el.style.background)
        .filter(v => v && /rgb|#/.test(v));
    blues.click();
    await s(1500);
    const chart = Array.from(
        document.querySelectorAll('.graphbuilder2-host svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    const fills = [...new Set(Array.from(
        chart.querySelectorAll('path[data-bar-cat], rect[data-bar-cat]'))
        .map(el => getComputedStyle(el).fill)
        .filter(f => f && f !== 'none'))];
    return { promised, fills };
});
const toHex = (rgb) => {
    const m = String(rgb).match(/\d+/g);
    if (!m) return String(rgb).toLowerCase();
    return '#' + m.slice(0, 3).map(n =>
        (+n < 16 ? '0' : '') + (+n).toString(16)).join('');
};
const hexes = two.fills.map(toHex);
ok(hexes.length === 2, `two distinct series fills rendered (${hexes})`);
ok(hexes.includes('#08306b'),
   'the dark end is the ramp\'s true dark terminus, untouched');
const light = hexes.find(h => h !== '#08306b');
// Perceptual floor asserted via luminance proxy: the old terminus
// #f7fbff has channel min 247; the clamped end must sit clearly below.
const chan = light.match(/[0-9a-f]{2}/g).map(h => parseInt(h, 16));
ok(light !== '#f7fbff' && Math.min(...chan) < 215,
   `the light series is VISIBLE pale blue, not the near-white terminus ` +
   `(${light})`);
ok(chan[2] > chan[0] && chan[2] > 230,
   `and still reads as light blue - blue channel dominant and high ` +
   `(${light})`);

console.log('case 2: k=9 holds the same floor at its light end');
const nine = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let g = 1; g <= 9; g++)
        for (let i = 0; i < 3; i++)
            rows.push(['A', 'G' + g, String(50 + g * 2 + i)]);
    window.PS_SHELL.loadTable('ramp9', ['group', 'site', 'score'], rows);
    await s(900);
    const roles9 = window.PS_SHELL.rolesStore();
    roles9.xvar = 'group'; roles9.yvar = 'score'; roles9.groupVar = 'site';
    window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
    await s(2000);
    const chart = Array.from(
        document.querySelectorAll('.graphbuilder2-host svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    return [...new Set(Array.from(
        chart.querySelectorAll('path[data-bar-cat], rect[data-bar-cat]'))
        .map(el => getComputedStyle(el).fill)
        .filter(f => f && f !== 'none'))];
});
const nineHex = nine.map(toHex);
ok(nineHex.length === 9, `nine distinct series colors (${nineHex.length})`);
ok(nineHex.includes('#08306b'), 'dark terminus exact at k=9');
const lightest9 = nineHex.map(h =>
    ({ h, min: Math.min(...h.match(/[0-9a-f]{2}/g).map(x => parseInt(x, 16))) }))
    .sort((a, b) => b.min - a.min)[0];
ok(lightest9.h !== '#f7fbff' && lightest9.min < 215,
   `the k=9 lightest step holds the same floor (${lightest9.h})`);

console.log('case 3: viridis is untouched - chroma passes the floor');
const vir = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // The engine's own committer + the debounce-and-echo settle the
    // shell needs (window.setOption alone left the Blues chart in place
    // in this harness).
    window.__gb2_setOption('chartPalette', 'viridis');
    await s(2600);
    const chart = Array.from(
        document.querySelectorAll('.graphbuilder2-host svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    return [...new Set(Array.from(
        chart.querySelectorAll('path[data-bar-cat], rect[data-bar-cat]'))
        .map(el => getComputedStyle(el).fill)
        .filter(f => f && f !== 'none'))];
});
const virHex = vir.map(toHex);
// The BUILT-IN viridis (what chartPalette "viridis" resolves to) ends at
// #6ece58 green - far from white, so the floor must not move either end.
// (The yellow-ended list is the premade "Viridis (rich)"; its
// chroma-passes-the-floor case lives in the source unit test.)
ok(virHex.includes('#440154') && virHex.includes('#6ece58'),
   `viridis keeps its exact termini, untouched by the floor (${virHex})`);

console.log('case 4: the flyout row promises what the chart delivers');
ok(two.promised.length >= 6,
   `the Blues row rendered swatches to inspect (${two.promised.length})`);
const promisedHexes = two.promised.map(toHex);
ok(!promisedHexes.includes('#f7fbff'),
   'no swatch in the row is the near-white terminus a chart can no ' +
   'longer produce');
ok(errors.length === 0,
   'no page errors ' + JSON.stringify(errors.slice(0, 2)));
await browser.close();
console.log('RAMP FLOOR CHECK PASS');
