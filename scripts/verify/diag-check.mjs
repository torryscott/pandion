// Failure-diagnostics probe, browser half (see diag-probe.R for the
// page generator). Drives the three silent-blank failure modes the
// Jul 2026 diagnostics were built for and asserts each paints its own
// self-explaining box - plus the two healthy paths staying box-free:
//
//   1. healthy inline render      chart draws, NO diag box, and none
//                                 appears after the 6 s reveal window
//   2. scripts never execute      (all <script> stripped - the field
//                                 report's suspect branch) the STATIC
//                                 Layer A box fades in at ~6 s with
//                                 the "scripts did not execute" detail
//   3. bundle parse error         (garbage after the bundle marker)
//                                 the standalone ES5 primer survives,
//                                 captures the SyntaxError, and
//                                 upgrades the box: "scripts DO
//                                 execute ... engine failed to load"
//   4. render() throws            (poisoned engine via addInitScript)
//                                 Layer B's red error box paints
//                                 IMMEDIATELY with the exception +
//                                 meta line, and the original error
//                                 is re-thrown for pageerror probes
//   5. cached mode, engine absent "Loading chart engine" self-heal
//                                 note (NOT an error box) - the
//                                 legitimate transient keeps its
//                                 non-scary treatment
//
// Usage: node scripts/verify/diag-check.mjs
// Env:   GB2_DIAG_OUT   dir holding the probe pages (default /tmp/gb2-diag-probe)
//        GB2_NODE_BASE  a dir whose node_modules contains playwright

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
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
const OUT = process.env.GB2_DIAG_OUT || '/tmp/gb2-diag-probe';
const HASH = readFileSync(path.join(OUT, 'hash.txt'), 'utf8').trim();
const INLINE = readFileSync(path.join(OUT, 'diag-inline.html'), 'utf8');

let fails = 0;
function expect(label, cond) {
    if (cond) console.log('  ok: ' + label);
    else { console.log('  FAIL: ' + label); fails++; }
}

const browser = await chromium.launch();

// Every case gets a FRESH context (file:// localStorage persists
// across pages in one context - the established probe rule).
async function freshPage(initScript) {
    const ctx = await browser.newContext();
    if (initScript) await ctx.addInitScript(initScript);
    const page = await ctx.newPage();
    return { ctx, page };
}

const diagState = () => ({
    pending: (() => {
        const d = document.querySelector('[data-role=gb2-diag-pending]');
        if (!d) return null;
        return {
            opacity: parseFloat(getComputedStyle(d).opacity),
            text: d.textContent || '',
        };
    })(),
    errBox: (() => {
        const d = document.querySelector('[data-role=gb2-diag-error]');
        if (!d) return null;
        return { text: d.textContent || '' };
    })(),
    chart: document.querySelectorAll('svg [data-bar-cat]').length,
    loading: (document.body.innerText || '').indexOf('Loading chart engine') >= 0,
});

// ---- 1. healthy inline render: chart draws, no diagnostics ever
{
    const { ctx, page } = await freshPage();
    await page.goto('file://' + path.join(OUT, 'diag-inline.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0,
        null, { timeout: 30000 });
    let st = await page.evaluate(diagState);
    expect('healthy: chart drawn', st.chart > 0);
    expect('healthy: pending box wiped by render', st.pending === null);
    expect('healthy: no error box', st.errBox === null);
    // Outlast the 6 s reveal + primer timers: nothing may appear late.
    await page.waitForTimeout(7000);
    st = await page.evaluate(diagState);
    expect('healthy: still box-free after the 6 s reveal window',
           st.pending === null && st.errBox === null && st.chart > 0);
    await ctx.close();
}

// ---- 2. scripts never execute: static Layer A box at ~6 s
{
    // Strip every script BODY (tags stay) - simulates a results view
    // that inserts the HTML but never runs the scripts.
    const stripped = INLINE.replace(/<script>[\s\S]*?<\/script>/g, '<script></script>');
    const p = path.join(OUT, 'diag-noscript.html');
    writeFileSync(p, stripped);
    const { ctx, page } = await freshPage();
    await page.goto('file://' + p);
    let st = await page.evaluate(diagState);
    expect('no-script: pending box present but invisible at load',
           st.pending !== null && st.pending.opacity < 0.05);
    await page.waitForFunction(() => {
        const d = document.querySelector('[data-role=gb2-diag-pending]');
        return d && parseFloat(getComputedStyle(d).opacity) > 0.9;
    }, null, { timeout: 12000 });
    st = await page.evaluate(diagState);
    expect('no-script: box revealed by pure CSS at ~6 s', st.pending.opacity > 0.9);
    expect('no-script: names the failure ("scripts did not execute")',
           st.pending.text.indexOf('scripts did not execute') >= 0);
    expect('no-script: carries the report ask + module version',
           st.pending.text.indexOf('screenshot this box') >= 0 &&
           st.pending.text.indexOf('Module version') >= 0);
    await ctx.close();
}

// ---- 3. bundle parse error: primer survives and captures it
{
    const marker = '/*GB2_BUNDLE_START:' + HASH + '*/';
    const idx = INLINE.indexOf(marker);
    expect('parse-error setup: bundle marker found', idx > 0);
    const corrupted = INLINE.slice(0, idx + marker.length) +
        '\n)]}this is not javascript(\n' +
        INLINE.slice(idx + marker.length);
    const p = path.join(OUT, 'diag-parse-error.html');
    writeFileSync(p, corrupted);
    const { ctx, page } = await freshPage();
    await page.goto('file://' + p);
    await page.waitForFunction(() => {
        const d = document.querySelector('[data-role=gb2-diag-pending]');
        return d && parseFloat(getComputedStyle(d).opacity) > 0.9;
    }, null, { timeout: 12000 });
    const st = await page.evaluate(diagState);
    expect('parse-error: box revealed', st.pending !== null);
    expect('parse-error: primer upgraded the detail (scripts DO execute)',
           st.pending.text.indexOf('scripts DO execute') >= 0);
    expect('parse-error: captured the SyntaxError',
           /SyntaxError|Unexpected token/i.test(st.pending.text));
    expect('parse-error: user agent included',
           st.pending.text.indexOf('[ua:') >= 0);
    await ctx.close();
}

// ---- 4. render() throws: immediate Layer B red box + async rethrow
{
    const { ctx, page } = await freshPage(
        // Poisoned engine with the CURRENT hash: the inline gate skips
        // the bundle body, the loader calls render(), render throws.
        `window.GraphBuilder2 = {
            __hash: ${JSON.stringify(HASH)},
            render: function () { throw new Error("probe boom"); }
        };`
    );
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
    await page.goto('file://' + path.join(OUT, 'diag-inline.html'));
    await page.waitForFunction(() =>
        !!document.querySelector('[data-role=gb2-diag-error]'),
        null, { timeout: 10000 });
    const st = await page.evaluate(diagState);
    expect('render-throw: red error box painted immediately', st.errBox !== null);
    expect('render-throw: exception text shown',
           st.errBox.text.indexOf('probe boom') >= 0);
    expect('render-throw: meta line (module version + bundle mode)',
           st.errBox.text.indexOf('module v') >= 0 &&
           st.errBox.text.indexOf('bundle: inline') >= 0);
    expect('render-throw: pending box replaced (no double box)',
           st.pending === null);
    await page.waitForTimeout(300);
    expect('render-throw: original error re-thrown for pageerror probes',
           pageErrors.some(m => m.indexOf('probe boom') >= 0));
    await ctx.close();
}

// ---- 5. cached mode, engine absent: self-heal note, NOT an error
{
    const { ctx, page } = await freshPage(
        'window.__setOpts = []; window.setOption = function (k, v) { window.__setOpts.push([k, v]); };'
    );
    await page.goto('file://' + path.join(OUT, 'diag-cached.html'));
    await page.waitForFunction(() =>
        (document.body.innerText || '').indexOf('Loading chart engine') >= 0,
        null, { timeout: 10000 });
    const st = await page.evaluate(diagState);
    expect('cached-absent: self-heal note shown', st.loading);
    expect('cached-absent: NOT classified as an error', st.errBox === null);
    expect('cached-absent: pending box replaced by the note', st.pending === null);
    const healPoke = await page.evaluate(() =>
        (window.__setOpts || []).some(o => o[0] === 'clientBundleHash' && o[1] === ''));
    expect('cached-absent: self-heal poke still fires', healPoke);
    await ctx.close();
}

// ---- 5b. script-src mode, engine never arrives (a shared .omv opened
// where Pandion is not installed - the SHIPPED default path). It must
// end at the install message, not sit on "Loading the chart engine"
// forever, which is what it did before the Aug 2026 audit.
{
    const { ctx, page } = await freshPage();
    await page.goto('file://' + path.join(OUT, 'diag-ssmiss.html'));
    // the poll runs ~9 s, then the module-missing timers add ~3 s
    await page.waitForFunction(() =>
        !!document.querySelector('[data-role="gb2-module-missing"]'),
        null, { timeout: 25000 });
    const txt = await page.evaluate(() =>
        (document.querySelector('[data-role="gb2-module-missing"]').textContent || ''));
    expect('scriptsrc-absent: ends at the install message, not a spinner',
           /needs the Pandion Plots module/.test(txt));
    expect('scriptsrc-absent: tells the user the data is still in the file',
           /saved in this file/.test(txt));
    const stuck = await page.evaluate(() =>
        (document.body.innerText || '').indexOf('Loading the chart engine') >= 0);
    expect('scriptsrc-absent: the wait note is gone by then', !stuck);
    await ctx.close();
}

// ---- 6. built-without-minify note: visible AND survives the render
{
    const { ctx, page } = await freshPage();
    await page.goto('file://' + path.join(OUT, 'diag-minmissing.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0,
        null, { timeout: 30000 });
    const st = await page.evaluate(() => {
        const n = document.querySelector('[data-role=gb2-diag-minmissing]');
        return {
            note: n ? (n.textContent || '') : null,
            visible: n ? n.getBoundingClientRect().height > 10 : false,
            chart: document.querySelectorAll('svg [data-bar-cat]').length,
        };
    });
    expect('min-missing: chart still draws (note is a warning, not a block)',
           st.chart > 0);
    expect('min-missing: note present after render (outside the host wipe)',
           st.note !== null && st.visible);
    expect('min-missing: note names the fix',
           st.note !== null && st.note.indexOf('minify-widget.sh') >= 0);
    await ctx.close();
}

await browser.close();
console.log(fails === 0 ? 'diag-check: ALL OK' : `diag-check: ${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
