// Toolbar re-dock across a re-render (Sep 14 2026, Torry: "the bar with
// Stats, Show, Hide, Settings, Find and Add flashes and kind of resets"
// on every stat change in the standalone).
//
// The engine's re-render discards the toolbar strip and builds a new one;
// the shell's Zoom select, a captured node, has to be re-appended into
// the new strip. Both re-dock paths ran on a zero-delay timer after the
// render, and the browser paints between the render task and that timer,
// so one or two frames showed the strip without the select: the actions
// cluster sat 135px further right for those frames (its zone is
// flex-end aligned), then jumped back. Now the render wrapper re-docks
// the select synchronously, in the render's own task.
//
// Cases, chromium and webkit (webkit skipped with exit 2 when absent),
// each sampled per animation frame for 1.5s:
//   1. 1470x800, panel under the chart: switch the error-bar Type from
//      95% CI to SE (the engine's LOCAL re-render);
//   2. same page: a color pick through the shell's option store (the
//      shell-driven ECHO render);
//   3. 1100x700 (Fit zoom below 1, counter-zoomed strip): the Type switch.
// Every frame: the select is inside the strip, the actions cluster's left
// edge and the count of visible button labels are unchanged, and the
// chart was rebuilt inside the window.
// CONTROL (main's ps-shell.js): every case fails with 1-3 frames without
// the select and the cluster 135px to the right.
//
// Usage: node standalone/verify/toolbar-redock-check.mjs

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
const geom = () => {
    const host = document.querySelector('.graphbuilder2-host');
    const bar = host && host.querySelector('[data-role="chart-toolbar"]');
    const sel = document.getElementById('ps-charttools');
    const act = bar && bar.querySelector('[data-role="toolbar-actions"]');
    const svg = host && host.querySelector('svg[data-role="gb2-chart-svg"]');
    if (svg && !svg.__trId) svg.__trId = (window.__trSeq = (window.__trSeq || 0) + 1);
    return {
        hasBar: !!bar,
        selIn: !!(bar && sel && bar.contains(sel)),
        actLeft: act ? act.getBoundingClientRect().left : null,
        labels: bar ? Array.from(bar.querySelectorAll('[data-role="toolbar-btn-label"]')).filter(l => l.offsetParent).length : null,
        tight: !!(bar && bar.classList.contains('ps-tb-tight')),
        svgId: svg ? svg.__trId : null,
        zoom: host ? host.style.zoom : null
    };
};
async function watch(page, ms) {
    await page.evaluate(([fnSrc, ms]) => {
        const geom = new Function('return (' + fnSrc + ')()');
        const g0 = geom();
        const w = { g0, frames: 0, armed: false, noSel: 0, noBar: 0, actDrift: 0, labelChange: 0, tightChange: 0, rebuilt: false };
        const loop = () => {
            const g = geom(); w.frames++; w.armed = true;
            if (!g.hasBar) w.noBar++;
            else if (!g.selIn) w.noSel++;
            if (g.actLeft != null && g0.actLeft != null) w.actDrift = Math.max(w.actDrift, Math.abs(g.actLeft - g0.actLeft));
            if (g.labels !== g0.labels) w.labelChange++;
            if (g.tight !== g0.tight) w.tightChange++;
            if (g.svgId !== g0.svgId) w.rebuilt = true;
            w.raf = requestAnimationFrame(loop);
        };
        w.raf = requestAnimationFrame(loop);
        window.__tr = w;
        return new Promise(r => setTimeout(r, ms));
    }, [geom.toString(), ms]);
    return page.evaluate(() => { const w = window.__tr; cancelAnimationFrame(w.raf);
        return { frames: w.frames, noSel: w.noSel, noBar: w.noBar, actDrift: w.actDrift, labelChange: w.labelChange, tightChange: w.tightChange, rebuilt: w.rebuilt, g0: w.g0 }; });
}
async function watchAround(page, ms, act) {
    const p = watch(page, ms);
    await page.waitForFunction(() => window.__tr && window.__tr.armed, null, { timeout: 3000 });
    await act();
    return p;
}
const steady = (r, tag) => {
    ok(r.frames > 40, tag + ': sampled ' + r.frames + ' frames');
    ok(r.rebuilt, tag + ': the chart was rebuilt inside the window');
    ok(r.g0.selIn, tag + ': the Zoom select starts inside the strip');
    ok(r.noSel === 0 && r.noBar === 0, tag + ': the strip never painted without the Zoom select (' + r.noSel + ' frames without it, ' + r.noBar + ' without a strip)');
    ok(r.actDrift <= 0.5, tag + ': the actions cluster held its place (max drift ' + fmt(r.actDrift) + 'px from ' + fmt(r.g0.actLeft) + ')');
    ok(r.labelChange === 0 && r.tightChange === 0, tag + ': the button labels never flickered (' + r.labelChange + ' label frames, ' + r.tightChange + ' tight-class frames)');
};
async function clickErrorBar(page) {
    const t = await page.evaluate(() => {
        const el = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"] [data-role="error-bar"]');
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

async function engineRun(name, launcher) {
    let browser;
    try { browser = await launcher.launch(); }
    catch (e) {
        if (name === 'webkit') { console.error('webkit unavailable: ' + e.message.split('\n')[0]); process.exit(2); }
        throw e;
    }
    console.log('== ' + name);
    for (const cfg of [{ w: 1470, h: 800, tag: '1470x800' }, { w: 1100, h: 700, tag: '1100x700, chart shrunk' }]) {
        const page = await open(browser, cfg.w, cfg.h, 'below');
        await clickErrorBar(page);
        const seg = await seSeg(page);
        ok(!!seg, '[' + name + ' ' + cfg.tag + '] the SE Type button is visible');
        if (seg) {
            const r = await watchAround(page, 1500, () => page.mouse.click(seg.x, seg.y));
            steady(r, '[' + name + ' ' + cfg.tag + '] Type switch (local re-render)');
        }
        if (cfg.w === 1470) {
            // The shell-driven echo: an option written to the store.
            await page.waitForTimeout(2000);
            const r2 = await watchAround(page, 1500, () => page.evaluate(() => window.setOption('barColor', '#597b2f')));
            steady(r2, '[' + name + ' ' + cfg.tag + '] color option (shell echo render)');
        }
        ok(page.__errors.length === 0, '[' + name + ' ' + cfg.tag + '] no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : ''));
        await page.close();
    }
    await browser.close();
}
await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
console.log(failures ? 'toolbar-redock: FAIL (' + failures + ')' : 'toolbar-redock: PASS');
process.exit(failures ? 1 : 0);
