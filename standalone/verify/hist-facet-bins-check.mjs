// Faceted histograms share one set of bin edges (Oct 8 2026, Torry's
// report: moving a histogram into panels cut off the tallest bars).
// With automatic bins the per-panel draw used to size its bins from
// that panel's own values (fewer values, wider bins, taller bars) while
// the value axis was sized from the pooled bins, so a panel's tallest
// bars were clamped flat at the ceiling. What must hold now:
//   - with automatic bins every panel draws the same bin width, and it
//     is the width the single (un-paneled) chart drew
//   - no panel bar is flattened at the plot ceiling; each panel's
//     tallest bar sits below the axis maximum
//   - an explicit bin count still gives every panel the same width
//   - unequal panel sizes change nothing about the above
// Control: against the engine before this change cases 1 and 2 fail
// (the bins readout drops from 19 to 11 and bars sit on the ceiling).
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
const SOFT = process.env.PS_SOFT === '1';
let failed = 0;
function ok(cond, msg) {
    if (!cond) {
        if (!SOFT) throw new Error(msg);
        failed++; console.log('  FAIL  ' + msg); return;
    }
    console.log('  ok  ' + msg);
}
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
// Three sites of normal scores with non-integer values, so automatic
// binning divides the span exactly (no lattice snapping to hide the
// per-panel width difference). counts = rows per site.
const load = (counts) => page.evaluate(async (counts) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    let a = 11; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const g = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const rows = [];
    ['North', 'South', 'East'].forEach((site, si) => {
        for (let i = 0; i < counts[si]; i++) rows.push([(50 + g() * 8).toFixed(3), site]);
    });
    window.PS_SHELL.loadTable('hist_' + counts.join('_'), ['score', 'site'], rows, null, null);
    await w(700);
    window.PS_SHELL.setModule('distplotbuilder'); await w(250);
}, counts);
const setup = (roles, opts) => page.evaluate(async ([roles, opts]) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setRoles('distplotbuilder', roles); await w(300);
    for (const k of Object.keys(opts || {})) { window.setOption(k, opts[k]); await w(200); }
    await w(1500);
}, [roles, opts || {}]);
// Per panel (one clip rect each): the bars standing on its baseline,
// their width, how many sit on the ceiling, and the tallest bar's value
// read against the row's top tick.
const measure = () => page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('svg')).sort((x, y) => (y.clientWidth * y.clientHeight) - (x.clientWidth * x.clientHeight))[0];
    const clips = Array.from(svg.querySelectorAll('clipPath[id^="gb2-xy-data-clip"] rect')).map(r => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }));
    const ticks = Array.from(svg.querySelectorAll('text')).map(t => ({ t: t.textContent.trim(), x: +(t.getAttribute('x') || 0), y: +(t.getAttribute('y') || 0) })).filter(t => /^\d+(\.\d+)?$/.test(t.t));
    const bars = Array.from(svg.querySelectorAll('[data-role="dist-hist-bar"]')).map(b => { const r = b.getBBox(); return { x: r.x, y: r.y, w: r.width, h: r.height, facet: b.getAttribute('data-bar-facet') }; });
    const panels = clips.map(c => {
        const bot = c.y + c.h;
        const pb = bars.filter(b => b.x >= c.x - 1 && b.x < c.x + c.w && Math.abs((b.y + b.h) - bot) < 2.5);
        const row = clips.filter(o => Math.abs(o.y - c.y) < 1); const leftX = Math.min(...row.map(o => o.x));
        const yt = ticks.filter(t => t.x < leftX && t.x > leftX - 60 && t.y >= c.y - 8 && t.y <= bot + 8);
        const vals = yt.map(t => +t.t); const ymax = Math.max(...vals);
        const topTick = yt.filter(t => +t.t === ymax)[0];
        const ppu = topTick ? (bot - topTick.y) / ymax : NaN;
        const tallest = pb.length ? Math.max(...pb.map(b => b.h)) : 0;
        const widths = pb.map(b => +b.w.toFixed(1));
        // fill = tallest bar as a share of the plot height; the auto range
        // pads 8% above the tallest bar, so anything past 0.98 is a bar the
        // draw clamped at the ceiling (the top tick label sits lower still).
        return { facet: pb[0] ? pb[0].facet : null, bars: pb.length, width: widths.length ? Math.max(...widths) : null, sameWidth: widths.every(x => Math.abs(x - widths[0]) < 0.2), topTick: ymax, tallest: +(tallest / ppu).toFixed(2), fill: +(tallest / c.h).toFixed(3), atCeiling: pb.filter(b => b.y <= c.y + 0.6).length };
    });
    return { histBins: window.PS_SHELL.buildPayload().histBins, drawn: window.__gb2_distBinsDrawn, panels };
});
const fmt = (m) => m.panels.map(p => (p.facet || 'all') + ':' + p.bars + 'x' + p.width + 'px tallest ' + p.tallest + ' fill ' + p.fill + (p.atCeiling ? ' CEILING ' + p.atCeiling : '')).join('; ');

console.log('case 1: automatic bins keep one shared width when panels appear');
await load([100, 100, 100]);
await setup({ var: 'score' }, {});
const single = await measure();
ok(single.histBins === -1 && single.drawn > 0 && single.panels.length === 1, 'single histogram on automatic bins draws ' + single.drawn + ' bins (' + fmt(single) + ')');
await setup({ var: 'score', facetVar: 'site' }, {});
const pan = await measure();
ok(pan.panels.length === 3, 'three panels drawn');
const widths = pan.panels.map(p => p.width);
ok(widths.every(x => Math.abs(x - widths[0]) < 0.2) && pan.panels.every(p => p.sameWidth), 'every panel draws the same bin width (' + widths.join(', ') + ' px)');
ok(pan.drawn === single.drawn, 'the bins readout is unchanged by panels (' + pan.drawn + ' vs ' + single.drawn + ')');

console.log('case 2: no panel bar is flattened at the ceiling');
ok(pan.panels.every(p => p.atCeiling === 0), 'no bar on the ceiling (' + fmt(pan) + ')');
ok(pan.panels.every(p => p.fill < 0.98), 'each panel\'s tallest bar keeps the 8% headroom under the ceiling');

console.log('case 3: an explicit bin count still shares edges');
await setup({ var: 'score', facetVar: 'site' }, { histBins: 20 });
const fixed = await measure();
const fw = fixed.panels.map(p => p.width);
ok(fixed.drawn === 20 && fw.every(x => Math.abs(x - fw[0]) < 0.2) && fixed.panels.every(p => p.atCeiling === 0), 'bins 20: one width across panels, nothing on the ceiling (' + fmt(fixed) + ')');
await setup({ var: 'score', facetVar: 'site' }, { histBins: -1 });
const back = await measure();
ok(back.drawn === single.drawn && back.panels.every(p => p.atCeiling === 0), 'back to automatic: ' + back.drawn + ' shared bins, nothing on the ceiling');

console.log('case 4: unequal panel sizes');
await load([200, 50, 50]);
await setup({ var: 'score', facetVar: 'site' }, {});
const uneq = await measure();
const uw = uneq.panels.map(p => p.width);
ok(uneq.panels.length === 3 && uw.every(x => Math.abs(x - uw[0]) < 0.2), 'one shared width with 200/50/50 rows (' + uw.join(', ') + ' px)');
ok(uneq.panels.every(p => p.atCeiling === 0 && p.fill < 0.98), 'nothing on the ceiling (' + fmt(uneq) + ')');

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();
if (failed) { console.log('\nhist-facet-bins-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nhist-facet-bins-check: all cases passed');
