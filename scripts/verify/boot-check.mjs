// Engine-boot handshake probe, browser half (see boot-probe.R for the
// page generator). Drives the full placeholder -> cached-render
// choreography in headless chromium:
//
//   1. boot.html in a FRESH context: the placeholder page must define
//      window.GraphBuilder2 (engine warm), copy the bundle into
//      localStorage, and write clientBundleHash back through the
//      (mocked) window.setOption - all WITHOUT drawing a chart.
//   2. cached.html in the SAME context: a data render whose loader
//      finds the bundle in localStorage (fresh document, no inline
//      bundle) and draws a real chart. This is the exact path the
//      first variable drop takes after the boot handshake completes.
//   3. cached.html in a FRESH context (empty localStorage): the
//      self-heal path - "Loading chart engine" note + a poke that
//      clears clientBundleHash so the next R run re-ships inline.
//
// Usage: node scripts/verify/boot-check.mjs
// Env:   GB2_BOOT_OUT   dir holding the probe pages (default /tmp/gb2-boot-probe)
//        GB2_NODE_BASE  a dir whose node_modules contains playwright

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(
        new URL('.', import.meta.url).pathname,
        process.cwd(),
        '/tmp',
        '/private/tmp',
    );
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next base */ }
    }
    console.error(
        'playwright not found from any of: ' + bases.join(', ') + '\n' +
        'Install once with:  cd /tmp && npm i playwright && npx playwright install chromium\n' +
        '(or set GB2_NODE_BASE to a directory whose node_modules has it)');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_BOOT_OUT || '/tmp/gb2-boot-probe';
const HASH = readFileSync(path.join(OUT, 'hash.txt'), 'utf8').trim();

let fails = 0;
function expect(label, cond) {
    if (cond) console.log('  ok: ' + label);
    else { console.log('  FAIL: ' + label); fails++; }
}

// Mock jamovi's injected setOption so the store snippet's write-back
// is observable. Installed via addInitScript so it exists before any
// inline script runs.
const MOCK = `window.__setOpts = [];
window.setOption = function (k, v) { window.__setOpts.push([k, v]); };`;

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(MOCK);

// ---- 1. boot page: engine warm + stored + hash committed, no chart
const boot = await ctx.newPage();
await boot.goto('file://' + path.join(OUT, 'boot.html'));
await boot.waitForFunction(() =>
    typeof window.GraphBuilder2 !== 'undefined', null, { timeout: 20000 });
expect('boot: engine defined (bundle executed)', true);
// The store + write-back is deferred 400 ms.
await boot.waitForFunction((h) =>
    (window.__setOpts || []).some(o => o[0] === 'clientBundleHash' && o[1] === h),
    HASH, { timeout: 20000 });
expect('boot: clientBundleHash committed via setOption', true);
// The bundle is deliberately NOT copied into localStorage any more
// (Aug 2026 audit: the cached VALUE was never verified against the hash
// that keyed it, so anything able to write that origin could get
// arbitrary JS eval'd with the widget's privileges). Pinned negatively.
const stored = await boot.evaluate((h) => {
    const v = window.localStorage.getItem('graphbuilder2.bundle.' + h);
    return v ? v.length : 0;
}, HASH);
expect('boot: bundle NOT copied into localStorage', stored === 0);
const bootState = await boot.evaluate(() => ({
    text: document.body.innerText || '',
    charts: document.querySelectorAll('svg [data-bar-cat]').length,
}));
expect('boot: placeholder message visible',
       bootState.text.indexOf('Drag a categorical variable') >= 0);
expect('boot: no chart drawn', bootState.charts === 0);
await boot.close();

// ---- 2. cached page in a FRESH page of the same context.
// A fresh page has no window.GraphBuilder2, and the localStorage copy
// that used to be eval'd here is gone, so the loader must fall through
// to the self-heal rather than draw. (The cached mode still earns its
// keep for the case it was really built for: repeat deliveries into the
// SAME results iframe, which jamovi does several times per run -
// covered by case 4 below.)
const warm = await ctx.newPage();
await warm.goto('file://' + path.join(OUT, 'cached.html'));
await warm.waitForFunction(() =>
    (window.__setOpts || []).some(o => o[0] === 'clientBundleHash' && o[1] === ''),
    null, { timeout: 20000 });
expect('cached, fresh page: self-heals instead of eval-ing a cached bundle', true);
const warmState = await warm.evaluate(() => ({
    charts: document.querySelectorAll('svg [data-bar-cat]').length,
    evalled: typeof window.GraphBuilder2 !== 'undefined',
}));
expect('cached, fresh page: no chart drawn from a cached copy', warmState.charts === 0);
expect('cached, fresh page: no engine materialised out of localStorage',
       !warmState.evalled);
await warm.close();

// ---- 2b. the real cached win: engine already live in THIS window.
// Load the boot page (ships + defines the engine), then apply the cached
// payload into the same page - it must draw with no self-heal.
const same = await ctx.newPage();
await same.goto('file://' + path.join(OUT, 'boot.html'));
await same.waitForFunction(() =>
    typeof window.GraphBuilder2 !== 'undefined', null, { timeout: 20000 });
const cachedHtml = readFileSync(path.join(OUT, 'cached.html'), 'utf8');
await same.evaluate((html) => {
    document.body.insertAdjacentHTML('beforeend', html);
    // file:// innerHTML does not execute scripts - run them explicitly
    for (const sc of document.body.querySelectorAll('script')) {
        if (sc.__ran) continue;
        sc.__ran = true;
        try { (0, eval)(sc.textContent); } catch (e) {}
    }
}, cachedHtml);
await same.waitForFunction(() =>
    document.querySelectorAll('svg [data-bar-cat]').length > 0, null, { timeout: 20000 });
const sameState = await same.evaluate(() => ({
    healPoke: (window.__setOpts || []).some(o => o[0] === 'clientBundleHash' && o[1] === ''),
}));
expect('cached, same window: chart drawn by reusing the live engine', true);
expect('cached, same window: no self-heal poke fired', !sameState.healPoke);
await same.close();
await ctx.close();

// ---- 3. cached page with EMPTY localStorage: self-heal path
const coldCtx = await browser.newContext();
await coldCtx.addInitScript(MOCK);
const cold = await coldCtx.newPage();
await cold.goto('file://' + path.join(OUT, 'cached.html'));
await cold.waitForFunction(() =>
    (window.__setOpts || []).some(o => o[0] === 'clientBundleHash' && o[1] === ''),
    null, { timeout: 20000 });
expect('self-heal: clientBundleHash cleared for re-ship', true);
const coldLoading = await cold.evaluate(() =>
    (document.body.innerText || '').indexOf('Loading chart engine') >= 0);
expect('self-heal: "Loading chart engine" note shown', coldLoading);
await coldCtx.close();
await browser.close();

if (fails > 0) { console.error(fails + ' boot-probe failure(s)'); process.exit(1); }
console.log('boot handshake probe: all checks passed');
