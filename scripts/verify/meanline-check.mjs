// The mean line marker (Sep 2026), driven in a headless browser over
// the pages meanline-render.R writes.
//
//   GB2_MEANLINE_OUT=/tmp/gb2-meanline node scripts/verify/meanline-check.mjs
//
// The Line marker shape draws a dot chart's summary as a short line
// across its slot (Size = thickness, Length = share of the slot), the
// classic mean-with-error-bars look. Real mouse gestures for everything
// clicked on the chart, and a mock window.setOption to read what the
// chart commits. Each section catches its own error, so a control run
// against an engine without the feature still exercises every section.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp']
        .filter(Boolean);
    for (const base of bases) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try next */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_MEANLINE_OUT || '/tmp/gb2-meanline';

let failures = 0;
function expect(label, condition, detail = '') {
    if (condition) console.log('  ok: ' + label + (detail ? ' ' + detail : ''));
    else {
        failures++;
        console.log('  FAIL: ' + label + (detail ? ' ' + detail : ''));
    }
}

const browser = await chromium.launch();

async function open(name) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
        window.__commits = [];
        window.setOption = (k, v) => { window.__commits.push([k, v]); };
    });
    await page.goto('file://' + path.join(OUT, name + '.html'));
    await page.waitForFunction(() => document.querySelector('[data-role="gb2-chart-svg"]'), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.mouse.move(1, 1);
    page.__errors = errors;
    return { ctx, page };
}

// Everything committed so far, with chartSpec exploded into its keys.
async function flush(page) {
    return page.evaluate(() => {
        try { window.__gb2_inspectorInputAt = 0; } catch (e) {}
        window.dispatchEvent(new Event('beforeunload'));
        const out = { real: {}, spec: {} };
        for (const [k, v] of window.__commits) {
            if (k === 'chartSpec') {
                try { Object.assign(out.spec, JSON.parse(v)); } catch (e) {}
            } else out.real[k] = v;
        }
        return out;
    });
}

async function clickAt(page, x, y) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
}
async function center(page, selector, frac = 0.5) {
    return page.evaluate(([sel, f]) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width * f, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, [selector, frac]);
}
async function clickSel(page, selector, frac = 0.5) {
    const c = await center(page, selector, frac);
    if (!c) return false;
    await clickAt(page, c.x, c.y);
    return true;
}

async function lineMarkers(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('[data-role="line-marker"]')).map(m => {
        const r = m.getBoundingClientRect();
        return { shape: m.getAttribute('data-marker-shape'), tag: m.tagName.toLowerCase(),
                 w: r.width, h: r.height, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom,
                 group: m.getAttribute('data-bar-group') };
    }));
}
console.log('== mean line marker: geometry');
try {
    const a = await open('ml_dot');
    const L = await lineMarkers(a.page);
    const slot = await a.page.evaluate(() => {
        // The width a bar would take: the category pitch on this chart
        // (two ungrouped categories), minus the category gap.
        const ticks = Array.from(document.querySelectorAll('[data-role="line-marker"]')).map(m => m.getBoundingClientRect());
        return ticks.length === 2 ? Math.abs((ticks[1].left + ticks[1].right) / 2 - (ticks[0].left + ticks[0].right) / 2) : null;
    });
    expect('two mean lines drawn as lines', L.length === 2 && L.every(m => m.shape === 'line' && m.tag === 'rect'));
    expect('they run across the slot (wide, thin)', L.every(m => m.w > 8 * m.h), JSON.stringify(L.map(m => [m.w.toFixed(1), m.h.toFixed(1)])));
    expect('half-slot by default', slot && L.every(m => m.w > 0.25 * slot && m.w < 0.5 * slot),
        JSON.stringify([L[0] && L[0].w, slot]));
    const b = await open('ml_dot_long');
    const L2 = await lineMarkers(b.page);
    const ratio = L2[0].w / L[0].w;
    expect('Length 90% is 1.8x the default 50%', Math.abs(ratio - 1.8) < 0.08, ratio.toFixed(3));
    await b.ctx.close();

    const h = await open('ml_dot_horiz');
    const LH = await lineMarkers(h.page);
    expect('horizontal chart: the lines stand upright', LH.length === 2 && LH.every(m => m.h > 8 * m.w));
    await h.ctx.close();

    const g = await open('ml_dot_grouped');
    const LG = await lineMarkers(g.page);
    LG.sort((p, q) => p.x0 - q.x0);
    let overlap = false;
    for (let i = 1; i < LG.length; i++) if (LG[i].x0 < LG[i - 1].x1 - 0.5) overlap = true;
    expect('grouped: four lines, none running into its neighbor', LG.length === 4 && !overlap,
        JSON.stringify(LG.map(m => [m.x0.toFixed(1), m.x1.toFixed(1)])));
    await g.ctx.close();

    expect('no page errors on the line charts', a.page.__errors.length === 0, a.page.__errors.join(' | '));
    await a.ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== mean line marker: the Markers tab');
try {
    const { ctx, page } = await open('ml_dot_plain');
    await page.evaluate(() => { window.__gb2_lsActiveTab = 'markers'; window.__gb2_lsActiveStripMarkers = 'marker-shape'; });
    const mk = await center(page, '[data-role="line-marker"]', 0.85);
    await clickAt(page, mk.x, mk.y);
    await page.waitForTimeout(300);
    const btn = await page.evaluate(() => {
        const b = document.querySelector('[data-preset-marker-shape="line"]');
        const wrap = document.querySelector('[data-field="marker-length-wrap"]');
        return { has: !!b, wrapShown: wrap ? getComputedStyle(wrap).display !== 'none' : null };
    });
    expect('a dot chart offers the Line shape', btn.has);
    expect('Length stays hidden until Line is picked', btn.wrapShown === false);
    // Shapes obey the panel's This/All toggle: style every dot.
    await clickSel(page, '[data-field="scope-btn"][data-mode="all"]');
    await clickSel(page, '[data-preset-marker-shape="line"]');
    await page.waitForTimeout(200);
    let L = await lineMarkers(page);
    expect('picking Line redraws the dots as lines', L.length === 2 && L.every(m => m.shape === 'line'));
    const wrapNow = await page.evaluate(() => getComputedStyle(document.querySelector('[data-field="marker-length-wrap"]')).display);
    expect('the Length control appears', wrapNow !== 'none', wrapNow);
    const w50 = L[0].w;
    await clickSel(page, '[data-ls-btn="marker-length"]');
    await page.evaluate(() => {
        const s = document.querySelector('[data-field="marker-length"]');
        s.value = '80';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    L = await lineMarkers(page);
    expect('Length 80% widens the line to 1.6x', Math.abs(L[0].w / w50 - 1.6) < 0.08, (L[0].w / w50).toFixed(3));
    const c = await flush(page);
    expect('commits the shape and the length',
        c.spec.linePointShape === 'line' && c.spec.lineMarkerLength === 0.8, JSON.stringify(c.spec));
    await clickSel(page, '[data-ls-btn="marker-shape"]');
    await clickSel(page, '[data-preset-marker-shape="circle"]');
    await page.waitForTimeout(200);
    L = await lineMarkers(page);
    const wrapOff = await page.evaluate(() => getComputedStyle(document.querySelector('[data-field="marker-length-wrap"]')).display);
    expect('back to Circle: dots again, Length hidden', L.every(m => m.tag === 'circle') && wrapOff === 'none');
    expect('no page errors in the panel', page.__errors.length === 0, page.__errors.join(' | '));
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }
try {
    const { ctx, page } = await open('ml_dot_grouped_plain');
    await page.evaluate(() => { window.__gb2_lsActiveTab = 'markers'; window.__gb2_lsActiveStripMarkers = 'marker-shape'; });
    const mk = await center(page, '[data-role="line-marker"]', 0.8);
    await clickAt(page, mk.x, mk.y);
    await page.waitForTimeout(300);
    await clickSel(page, '[data-field="scope-btn"][data-mode="all"]');
    await clickSel(page, '[data-preset-marker-shape="line"]');
    await page.waitForTimeout(200);
    const c = await flush(page);
    expect('grouped chart: Line spreads the markers to their own slots', c.spec.lineMarkerSpread === 1, JSON.stringify(c.spec));
    const L = await lineMarkers(page);
    const lines = L.filter(m => m.shape === 'line').sort((p, q) => p.x0 - q.x0);
    let overlap = false;
    for (let i = 1; i < lines.length; i++) if (lines[i].x0 < lines[i - 1].x1 - 0.5) overlap = true;
    expect('grouped lines have room and do not touch', lines.length === 4 && !overlap && lines.every(m => m.w > 16),
        JSON.stringify(lines.map(m => m.w.toFixed(1))));
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

await browser.close();
if (failures > 0) {
    console.log(failures + ' check(s) failed');
    process.exit(1);
}
console.log('all mean-line checks passed');
