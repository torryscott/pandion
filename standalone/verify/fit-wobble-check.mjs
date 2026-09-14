// Fit wobble after an edit (Sep 14 2026, Torry: "it moves down a couple of
// pixels, then back up about a second later" after changing a marker's
// color or spread, with the editing panel docked beside the chart).
//
// Cause: every option echo re-renders the chart; the shell cleared the
// view zoom for the render and then recomputed Fit synchronously, twice,
// while the docked panel was still being rebuilt in the same task, and a
// third time 60ms later from fitSchedule. Beside a docked panel Fit trims
// its scale by the pane's rendered overflow, which differs a little across
// those three DOM states, so the scale went 0.770 -> 0.776 -> 0.772 and two
// of those painted. Fixed by restoring the previous zoom verbatim across a
// render, leaving ONE settled recompute to fitSchedule, and holding the
// scale in force when a recompute lands within 2% above it.
//
// Cases:
//   1. short window, panel beside: a color swatch pick and a marker-spread
//      change each leave the zoom string and the chart's box untouched for
//      2.6s (the echo lands at ~1.7s);
//   2. the hold never freezes a real change: a narrower pane refits, and the
//      chart still fits the pane after it;
//   3. panel under the chart (no zoom): the same edits move nothing.
// CONTROL (unfixed shell): case 1's swatch step fails with three distinct
// zoom values and a 3px height change.
//
// Usage: node standalone/verify/fit-wobble-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname,
               '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

let failures = 0;
function ok(cond, label) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label); failures++; }
}
const fmt = n => (Math.round(n * 100) / 100).toFixed(2);
const browser = await chromium.launch();

async function open(w, h, dock) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.__errors = errors;
    await page.addInitScript(d => {
        try {
            localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1');
            localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: d }));
        } catch (e) { /* private mode */ }
    }, dock);
    await page.goto(PAGE);
    await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(1800);
    }
    try {
        const got = page.locator('button', { hasText: 'Got it' }).first();
        if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
    } catch { /* no toast */ }
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart');
        PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1500);
        window.setOption('graphType', 'dot');
        await s(2500);
    });
    return page;
}
// The chart svg is the largest one (the first svg is a toolbar icon).
const geom = () => ({
    zoom: (() => { const h = document.querySelector('.graphbuilder2-host'); return h ? h.style.zoom : null; })(),
    box: (() => {
        let svg = null, area = 0;
        for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
            const b = s.getBoundingClientRect();
            if (b.width * b.height > area) { area = b.width * b.height; svg = s; }
        }
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        return { top: r.top, left: r.left, w: r.width, h: r.height };
    })(),
    pane: (() => { const p = document.querySelector('.ps-main-workspace');
        return p ? { oX: p.scrollWidth - p.clientWidth, oY: p.scrollHeight - p.clientHeight, w: p.clientWidth, h: p.clientHeight } : null; })()
});
// Sample the geometry every 16ms for `ms` inside the page; return the
// distinct zoom strings seen and the extreme drift of the chart box.
async function watch(page, ms) {
    await page.evaluate(([fnSrc, ms]) => {
        const geom = new Function('return (' + fnSrc + ')()');
        const g0 = geom();
        window.__fw = { zooms: new Set([String(g0.zoom)]), maxTop: 0, maxLeft: 0, maxH: 0, maxW: 0, g0 };
        window.__fwTimer = setInterval(() => {
            const g = geom();
            window.__fw.zooms.add(String(g.zoom));
            if (g.box && g0.box) {
                window.__fw.maxTop = Math.max(window.__fw.maxTop, Math.abs(g.box.top - g0.box.top));
                window.__fw.maxLeft = Math.max(window.__fw.maxLeft, Math.abs(g.box.left - g0.box.left));
                window.__fw.maxH = Math.max(window.__fw.maxH, Math.abs(g.box.h - g0.box.h));
                window.__fw.maxW = Math.max(window.__fw.maxW, Math.abs(g.box.w - g0.box.w));
            }
        }, 16);
        return new Promise(r => setTimeout(r, ms));
    }, [geom.toString(), ms]);
    return page.evaluate(() => { clearInterval(window.__fwTimer); const f = window.__fw;
        return { zooms: Array.from(f.zooms), maxTop: f.maxTop, maxLeft: f.maxLeft, maxH: f.maxH, maxW: f.maxW }; });
}
const still = (r, tag) => {
    ok(r.zooms.length === 1,
       tag + ': one zoom value for 2.6s after the edit (' + r.zooms.join(', ') + ')');
    ok(r.maxTop <= 0.6 && r.maxLeft <= 0.6 && r.maxH <= 0.6 && r.maxW <= 0.6,
       tag + ': the chart box held still (max drift top ' + fmt(r.maxTop) + ' left ' + fmt(r.maxLeft) +
       ' h ' + fmt(r.maxH) + ' w ' + fmt(r.maxW) + ' px)');
};
async function clickMarker(page) {
    const t = await page.evaluate(() => {
        let svg = null, area = 0;
        for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
            const b = s.getBoundingClientRect(); if (b.width * b.height > area) { area = b.width * b.height; svg = s; } }
        const el = svg.querySelector('[data-role="line-marker"]');
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(900);
}
async function swatchClick(page) {
    const sw = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button[data-mk-palette]')).filter(b => b.offsetParent);
        if (!btns.length) return null;
        const b = btns[Math.min(3, btns.length - 1)]; const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!sw) return null;
    await page.mouse.click(sw.x, sw.y);
    return sw;
}
async function spreadChange(page) {
    return page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('.gb2-panel button')).filter(b => /^gap$/i.test((b.textContent || '').trim()) && b.offsetParent);
        if (tabs.length) tabs[0].click();
        const inp = document.querySelector('input[data-field="marker-spread"]');
        if (!inp) return null;
        inp.value = String(Number(inp.value) > 0.5 ? 0.4 : 0.8);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return inp.value;
    });
}

// ---- case 1 + 2: short window, panel beside
{
    console.log('== case 1: 1366x620, panel beside, dot chart');
    const page = await open(1366, 620, 'auto');
    await clickMarker(page);
    const g = await page.evaluate(geom);
    ok(g.zoom !== '' && g.zoom !== null, 'beside the panel Fit applies a zoom (' + g.zoom + ')');
    ok(!!(await page.evaluate(() => document.querySelector('#ps-engine-dock-slot .gb2-panel'))), 'the panel is docked beside the chart');
    const sw = await swatchClick(page);
    ok(!!sw, 'a marker color swatch is visible');
    if (sw) still(await watch(page, 2600), 'color swatch');
    const sp = await spreadChange(page);
    ok(sp !== null, 'the marker-spread slider is reachable (' + sp + ')');
    if (sp !== null) still(await watch(page, 2600), 'marker spread');
    console.log('== case 2: a real pane change still refits');
    const before = await page.evaluate(geom);
    await page.setViewportSize({ width: 1150, height: 620 });
    await page.waitForTimeout(900);
    const after = await page.evaluate(geom);
    ok(after.zoom !== before.zoom, 'narrower pane refit the chart (' + before.zoom + ' -> ' + after.zoom + ')');
    ok(after.pane && after.pane.oX <= 1 && after.pane.oY <= 1,
       'the chart fits the narrower pane (overflow ' + (after.pane ? after.pane.oX + 'x' + after.pane.oY : '?') + ')');
    ok(page.__errors.length === 0, 'no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
    await page.close();
}
// ---- case 3: panel under the chart
{
    console.log('== case 3: 1470x800, panel under the chart');
    const page = await open(1470, 800, 'below');
    await clickMarker(page);
    const g = await page.evaluate(geom);
    ok(g.zoom === '', 'under the chart Fit is at 100 percent (no zoom)');
    const sw = await swatchClick(page);
    ok(!!sw, 'a marker color swatch is visible');
    if (sw) still(await watch(page, 2600), 'color swatch, panel below');
    ok(page.__errors.length === 0, 'no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
    await page.close();
}
await browser.close();
console.log(failures ? 'fit-wobble: FAIL (' + failures + ')' : 'fit-wobble: PASS');
process.exit(failures ? 1 : 0);
