// Scroll anchoring vs the chart rebuild (Sep 14 2026, Torry's Safari report:
// "the whole graph moved up a few pixels and then moved back down" about a
// second after switching the error-bar Type, and now and then after a
// double-click on a tick label; the color/spread wobble had already been
// fixed by the Fit hold, this one survived it).
//
// Every option echo rebuilds the chart subtree in one task. Safari's scroll
// anchoring picks an anchor node inside that subtree, sees it land a few
// pixels away in the rebuilt tree, and moves the workspace pane to "keep it
// still": 31px in WebKit at 1470x720, forced to zero when layout runs
// after every DOM step (a heisenbug by construction), gone with
// overflow-anchor:none on the pane. Chromium's anchor choice nets to zero,
// so it never showed headlessly. The fix is CSS: the workspace pane and
// the docked panel slot opt out of anchoring; the shell already manages
// their scrolling explicitly (the rule is on the scroll boxes: the pane
// and the controls column, which the docked panel rebuilds inside).
//
// A second Safari-only movement rides the same gesture with the panel
// BESIDE the chart (case 3): the toolbar strip carries the chrome
// counter-zoom, and WebKit resolved its 9px bottom margin at two sizes
// across a rebuild (9 x 1.299 x 0.77 = 9 one frame, 9 x 0.77 = 6.9 the
// next), so the chart sat 2.08px higher from the local re-render until
// the echo. The gap now lives on the chart wrap, one zoom level deep,
// scaled by the counter-zoom so it stays 9 visual px at every view zoom.
//
// Cases, chromium and webkit (webkit skipped with exit 2 when absent). Each
// samples per animation frame for 4s after the click: the pane's and the
// controls column's scrollTop, the chart box, the toolbar-to-chart gap
// (9 visual px at every zoom by design), and that the chart was really
// rebuilt inside the window (a missed click cannot pass as a fix), and
// that the window ends where it began. It spans the local re-render
// (~40ms), the echo (~1.6s; the engine hash-skips its DOM rebuild for this
// gesture, but the shell's render wrapper and refit still write styles,
// which is exactly the re-resolution that flipped the margin back), and
// the height reserve's first drop attempt (~3.1s).
//   1. 1470x720, panel under the chart, no zoom, pane scrolled to the
//      panel: switch the error-bar Type from 95% CI to SE (Torry's repro).
//   2. same page: double-click the first category label (inline editor
//      opens), then Escape.
//   3. 1366x620, panel beside the chart (zoom 0.77): the same Type switch.
//   4. 1100x700, panel under the chart but the chart shrunk to fit the
//      narrow pane (zoom 0.74): the same Type switch. The laptop case.
// CONTROL (main's index.html, webkit): case 1 fails with the pane at 259
// instead of 228 and the chart 31px up (anchoring); case 3 fails with the
// chart box 2.08px off and the gap 6.9..9 (the margin flip, zero scroll);
// case 4 fails on the gap and the chart box (both mechanisms at once).
// Chromium and Firefox pass every case on both pages (Firefox runs when
// Playwright's firefox build is installed, and is skipped otherwise).
//
// Usage: node standalone/verify/scroll-anchor-check.mjs

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
const pw = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

let failures = 0;
function ok(cond, label) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label); failures++; }
}
const fmt = n => (Math.round(n * 100) / 100).toFixed(2);

async function open(browser, w, h, dock) {
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
        window.setOption('errorBarType', 'ci95');
        await s(2000);
    });
    return page;
}
// The chart svg is the largest one in the host (the first svg is a toolbar icon).
const geom = () => {
    let svg = null, area = 0;
    for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
        const b = s.getBoundingClientRect();
        if (b.width * b.height > area) { area = b.width * b.height; svg = s; }
    }
    const ws = document.getElementById('ps-main-workspace');
    const col = document.querySelector('.ps-controls');
    const r = svg ? svg.getBoundingClientRect() : null;
    const bar = document.querySelector('.graphbuilder2-host [data-role="chart-toolbar"]');
    const wrap = svg ? svg.parentElement : null;
    // The toolbar-to-chart gap in VISUAL px: 9 at every zoom by design.
    const gap = (bar && wrap) ? wrap.getBoundingClientRect().top - bar.getBoundingClientRect().bottom : null;
    if (svg && !svg.__saId) svg.__saId = (window.__saSeq = (window.__saSeq || 0) + 1);
    return { ws: ws ? ws.scrollTop : null, col: col ? col.scrollTop : null,
             top: r ? r.top : null, left: r ? r.left : null, h: r ? r.height : null,
             gap, svgId: svg ? svg.__saId : null, zoom: document.querySelector('.graphbuilder2-host').style.zoom,
             anchor: getComputedStyle(ws).overflowAnchor };
};
// Sample per animation frame for `ms`: the extreme drift of every tracked
// number from its starting value (what painted, not what a timer saw).
async function watch(page, ms) {
    await page.evaluate(([fnSrc, ms]) => {
        const geom = new Function('return (' + fnSrc + ')()');
        const g0 = geom();
        const w = { g0, ws: 0, col: 0, top: 0, left: 0, h: 0, gapMin: g0.gap, gapMax: g0.gap, rebuilt: false, frames: 0, armed: false };
        const loop = () => {
            const g = geom(); w.frames++; w.armed = true; w.last = g;
            for (const k of ['ws', 'col', 'top', 'left', 'h'])
                if (g[k] != null && g0[k] != null) w[k] = Math.max(w[k], Math.abs(g[k] - g0[k]));
            if (g.gap != null) { w.gapMin = Math.min(w.gapMin, g.gap); w.gapMax = Math.max(w.gapMax, g.gap); }
            if (g.svgId !== g0.svgId) w.rebuilt = true;
            w.raf = requestAnimationFrame(loop);
        };
        w.raf = requestAnimationFrame(loop);
        window.__sa = w;
        return new Promise(r => setTimeout(r, ms));
    }, [geom.toString(), ms]);
    return page.evaluate(() => { const w = window.__sa; cancelAnimationFrame(w.raf);
        return { ws: w.ws, col: w.col, top: w.top, left: w.left, h: w.h, gapMin: w.gapMin, gapMax: w.gapMax, rebuilt: w.rebuilt, frames: w.frames, g0: w.g0, last: w.last }; });
}
// Start the sampler and click only once its first frame has run, so the
// click's own frame is inside the window.
async function watchAround(page, ms, act) {
    const p = watch(page, ms);
    await page.waitForFunction(() => window.__sa && window.__sa.armed, null, { timeout: 3000 });
    await act();
    return p;
}
const still = (r, tag, opts) => {
    opts = opts || {};
    ok(r.frames > 60, tag + ': sampled ' + r.frames + ' frames');
    if (opts.rebuild !== false)
        ok(r.rebuilt, tag + ': the chart was rebuilt inside the window (a green from a missed click is not a green)');
    ok(r.ws <= 0.5, tag + ': the pane did not scroll (max ' + fmt(r.ws) + 'px from ' + r.g0.ws + ')');
    ok(r.col <= 0.5, tag + ': the controls column did not scroll (max ' + fmt(r.col) + 'px)');
    ok(r.top <= 0.5 && r.left <= 0.5 && r.h <= 0.5,
       tag + ': the chart box held still (max drift top ' + fmt(r.top) + ' left ' + fmt(r.left) + ' h ' + fmt(r.h) + 'px)');
    ok(r.gapMax - r.gapMin <= 0.5 && Math.abs(r.gapMin - 9) <= 0.6,
       tag + ': the toolbar-to-chart gap stayed 9 visual px (' + fmt(r.gapMin) + '..' + fmt(r.gapMax) + ' at zoom ' + JSON.stringify(r.g0.zoom) + ')');
    // Not only "never drifted": the window ends where it began, past the
    // height reserve's first drop attempt (~3.1s after the click).
    ok(r.last && Math.abs(r.last.ws - r.g0.ws) <= 0.5 && Math.abs(r.last.top - r.g0.top) <= 0.5,
       tag + ': ended where it began (pane ' + r.g0.ws + ' -> ' + (r.last ? r.last.ws : '?') + ', chart top ' + fmt(r.g0.top) + ' -> ' + (r.last ? fmt(r.last.top) : '?') + ')');
};
const expectCi = async (page, tag) => {
    const et = await page.evaluate(() => PS_SHELL.optionStore().errorBarType);
    ok(et === 'ci95', tag + ': starts on 95% CI (errorBarType=' + et + ')');
};
const expectSe = async (page, tag) => {
    const et = await page.evaluate(() => PS_SHELL.optionStore().errorBarType);
    ok(et === 'se', tag + ': the option committed (errorBarType=' + et + ')');
};
async function clickErrorBar(page) {
    const t = await page.evaluate(() => {
        let svg = null, area = 0;
        for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
            const b = s.getBoundingClientRect(); if (b.width * b.height > area) { area = b.width * b.height; svg = s; } }
        const el = svg.querySelector('[data-role="error-bar"]');
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(1200);
}
async function seSeg(page) {
    return page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button[data-eb-type="se"]')).find(b => b.offsetParent);
        if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
}
// The first category label (data-role x-cat-label), by its position: the
// inline editor it opens must not move the pane or the chart either.
async function catLabel(page) {
    return page.evaluate(() => {
        let svg = null, area = 0;
        for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
            const b = s.getBoundingClientRect(); if (b.width * b.height > area) { area = b.width * b.height; svg = s; } }
        const el = svg.querySelector('text[data-role="x-cat-label"]');
        if (!el) return null; const r = el.getBoundingClientRect();
        const ws = document.getElementById('ps-main-workspace').getBoundingClientRect();
        if (r.top < ws.top || r.bottom > ws.bottom) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent || '').trim() };
    });
}

async function engineRun(name, launcher) {
    let browser;
    try { browser = await launcher.launch(); }
    catch (e) {
        if (name === 'webkit') { console.error('webkit unavailable: ' + e.message.split('\n')[0]); process.exit(2); }
        if (name === 'firefox') { console.log('== firefox skipped (not installed): ' + e.message.split('\n')[0]); return; }
        throw e;
    }
    console.log('== ' + name);
    // case 1: Torry's repro, panel under the chart
    {
        const page = await open(browser, 1470, 720, 'below');
        await clickErrorBar(page);
        const g = await page.evaluate(geom);
        ok(g.anchor === 'none', '[' + name + '] the pane opts out of scroll anchoring (overflow-anchor: ' + g.anchor + ')');
        // The property is not inherited: the capped panel (its own scroller)
        // keeps anchoring for its own content. A refactor that moved the rule
        // onto the host or the panel would show up here.
        ok((await page.evaluate(() => { const p = document.querySelector('.gb2-panel'); return p ? getComputedStyle(p).overflowAnchor : null; })) === 'auto',
           '[' + name + '] the panel, a nested scroller, keeps its own anchoring');
        ok(!(await page.evaluate(() => document.querySelector('#ps-engine-dock-slot .gb2-panel'))), '[' + name + '] the panel is under the chart');
        ok(g.ws > 40, '[' + name + '] the click revealed the panel by scrolling the pane (scrollTop ' + g.ws + ')');
        ok(g.zoom === '', '[' + name + '] no view zoom at 1470x720 (the chart fits the pane)');
        const seg = await seSeg(page);
        ok(!!seg, '[' + name + '] the SE Type button is visible');
        if (seg) {
            await expectCi(page, '[' + name + '] case 1');
            const r = await watchAround(page, 4000, () => page.mouse.click(seg.x, seg.y));
            still(r, '[' + name + '] Type 95% CI -> SE, panel below');
            await expectSe(page, '[' + name + '] case 1');
        }
        // case 2: double-click a category label, then Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        let lab = await catLabel(page);
        ok(!!lab, '[' + name + '] a category label is on screen' + (lab ? ' (' + lab.text + ')' : ''));
        if (lab) {
            // Select the label first and let the shell's reveal scroll (the
            // designed scroll-to-show-the-panel after a click) finish; the
            // double-click on the already selected label is what is measured.
            await page.mouse.click(lab.x, lab.y);
            await page.waitForTimeout(1500);
            lab = await catLabel(page) || lab;
            const r2 = await watchAround(page, 1400, async () => {
                await page.mouse.dblclick(lab.x, lab.y); await page.waitForTimeout(600); await page.keyboard.press('Escape'); });
            still(r2, '[' + name + '] tick-label double-click + Escape', { rebuild: false });
            // Escape steps out one layer at a time (the text panel docks the
            // color picker, which the first Escape closes), and the shell
            // HOLDS echoes while an inline editor is open, so make sure the
            // editor is really gone before the next commit.
            for (let i = 0; i < 3; i++) {
                if (!(await page.evaluate(() => !!document.querySelector('textarea[data-role="inline-text-editor"]')))) break;
                await page.keyboard.press('Escape'); await page.waitForTimeout(250);
            }
            ok(!(await page.evaluate(() => !!document.querySelector('textarea[data-role="inline-text-editor"]'))), '[' + name + '] the inline editor closed');
        }
        // Grow above the panel: a figure note makes the chart taller while
        // the pane is scrolled to the panel. The pane must hold its scroll
        // and let the panel move down by the growth, which is what Chromium
        // and Firefox always did; Safari 27's anchor choice used to scroll
        // the pane instead. This pins the one behaviour the rule changes.
        {
            // Through the engine's own debounced commit (chartNote rides the
            // chartSpec blob on this module), flushed at once; the shell's
            // echo then re-renders with the note.
            // (The flush defers while a panel input was touched in the last
            // 700ms; the Escape above counts, so the stamp is zeroed first.)
            const r3 = await watchAround(page, 2600, () => page.evaluate(() => {
                window.__gb2_inspectorInputAt = 0;
                window.__gb2_setOption('chartNote', 'Error bars show the standard error.');
                window.dispatchEvent(new Event('beforeunload'));
            }));
            ok(r3.rebuilt, '[' + name + '] the figure note rebuilt the chart');
            ok(r3.h > 8, '[' + name + '] the chart grew for the note (+' + fmt(r3.h) + 'px)');
            ok(r3.ws <= 0.5, '[' + name + '] the pane held its scroll while the chart grew above the panel (max ' + fmt(r3.ws) + 'px)');
        }
        ok(page.__errors.length === 0, '[' + name + '] no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
        await page.close();
    }
    // case 4: a laptop pane narrower than the chart with the panel UNDER it:
    // Fit shrinks the chart (zoom below 1), so the counter-zoomed toolbar is
    // in play here too. The margin flip alone moved the chart 2.4px on main
    // at this geometry, and anchoring was partially masking it.
    {
        const page = await open(browser, 1100, 700, 'below');
        await clickErrorBar(page);
        const g = await page.evaluate(geom);
        ok(g.zoom !== '' && Number(g.zoom) < 1, '[' + name + '] Fit shrank the chart at 1100x700 (zoom ' + g.zoom + ')');
        ok(!(await page.evaluate(() => document.querySelector('#ps-engine-dock-slot .gb2-panel'))), '[' + name + '] the panel is under the chart at 1100x700');
        const seg = await seSeg(page);
        ok(!!seg, '[' + name + '] the SE Type button is visible at 1100x700');
        if (seg) {
            await expectCi(page, '[' + name + '] case 4');
            const r = await watchAround(page, 4000, () => page.mouse.click(seg.x, seg.y));
            still(r, '[' + name + '] Type 95% CI -> SE, panel below, chart shrunk');
            await expectSe(page, '[' + name + '] case 4');
        }
        ok(page.__errors.length === 0, '[' + name + '] no page errors (1100x700)' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
        await page.close();
    }
    // The zoomed layouts run in chromium and webkit only: in Firefox the
    // engine's deferred canvas grow paints one frame at the base height
    // (about 1.2px at zoom 0.77, its text measurement differs), an engine
    // matter unrelated to this fix and invisible in the other engines.
    if (name === 'firefox') { await browser.close(); return; }
    // case 3: panel beside the chart
    {
        const page = await open(browser, 1366, 620, 'auto');
        await clickErrorBar(page);
        const beside = await page.evaluate(() => !!document.querySelector('#ps-engine-dock-slot .gb2-panel'));
        ok(beside, '[' + name + '] the panel docked beside the chart at 1366x620');
        const seg = await seSeg(page);
        ok(!!seg, '[' + name + '] the SE Type button is visible beside');
        if (seg) {
            await expectCi(page, '[' + name + '] case 3');
            const r = await watchAround(page, 4000, () => page.mouse.click(seg.x, seg.y));
            still(r, '[' + name + '] Type 95% CI -> SE, panel beside');
            await expectSe(page, '[' + name + '] case 3');
        }
        ok(page.__errors.length === 0, '[' + name + '] no page errors (beside)' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
        await page.close();
    }
    await browser.close();
}
await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
await engineRun('firefox', pw.firefox);
console.log(failures ? 'scroll-anchor: FAIL (' + failures + ')' : 'scroll-anchor: PASS');
process.exit(failures ? 1 : 0);
