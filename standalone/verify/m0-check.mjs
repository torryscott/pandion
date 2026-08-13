// M0 probe for the standalone Pandion Plots shell (standalone/index.html).
//
// Asserts, in headless chromium against the real min bundle:
//   1. the shell renders the CG bar chart from the hardcoded table with
//      zero page errors (3 bars, correct tick labels, stock default fill);
//   2. the shell's JS aggregation matches R at 10-significant-digit
//      precision (means + SE + ci95/ci99 halves, R-computed expecteds);
//   3. a REAL-GESTURE edit round-trips: click a bar (panel opens), click a
//      palette swatch, force the debounced flush - the setOption sink must
//      capture ONE cumulative chartSpec carrying the recolor, and the
//      jamovi-only keys must never reach the store;
//   4. the edit survives the shell echo re-render AND a cold reload
//      (localStorage restore).
//
// Usage:  node standalone/verify/m0-check.mjs
// Env:    GB2_NODE_BASE  a dir whose node_modules contains playwright

import { createRequire } from 'node:module';
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
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

let failures = 0;
function ok(cond, label) {
    if (cond) { console.log('  ok  ' + label); }
    else { console.log('  FAIL ' + label); failures++; }
}
function close(a, b, tol, label) {
    ok(typeof a === 'number' && Math.abs(a - b) <= tol,
       label + ' (' + a + ' vs ' + b + ')');
}

// R-computed expecteds for the hardcoded M0 table (signif(x, 10)).
const EXPECT = [
    { x: 'Control',   mean: 60.375, se: 1.935915251 },
    { x: 'Low dose',  mean: 72.125, se: 1.551928524 },
    { x: 'High dose', mean: 84.625, se: 1.792220291 },
];
const EXPECT_CI95_CTRL = 4.57771215;
const EXPECT_CI99_CTRL = 6.774703084;

const browser = await chromium.launch();

async function newPage() {
    // Fresh ephemeral context per case: file:// localStorage persists
    // across runs otherwise (the probe law).
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(PAGE);
    await page.waitForTimeout(400);
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(150);
    }
    return { ctx, page, errors };
}

// The chart svg is the LARGEST svg on the page (toolbar icons are svgs too).
const CHART_SVG_JS = `(() => {
    const svgs = Array.from(document.querySelectorAll('svg'));
    svgs.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    return svgs[0] || null;
})()`;

// ---------------------------------------------------------------- case 1+2
{
    console.log('case 1: render + aggregation parity');
    const { ctx, page, errors } = await newPage();

    const info = await page.evaluate(`(() => {
        const svg = ${CHART_SVG_JS};
        const bars = Array.from(document.querySelectorAll('[data-bar-cat]'))
            .filter(el => el.tagName.toLowerCase() === 'path' && (el.getAttribute('fill') || '').indexOf('#') === 0);
        const texts = svg ? Array.from(svg.querySelectorAll('text')).map(t => t.textContent) : [];
        const payload = window.PS_SHELL.buildPayload();
        return {
            hasSvg: !!svg && svg.clientWidth > 300,
            nanInSvg: svg ? svg.outerHTML.indexOf('NaN') !== -1 : true,
            barFills: bars.map(b => b.getAttribute('fill')),
            barCats: bars.map(b => b.getAttribute('data-bar-cat')),
            texts,
            bars: payload.bars,
            xCategories: payload.xCategories,
            hasGroups: payload.hasGroups,
            xLabel: payload.xLabel, yLabel: payload.yLabel,
            missingNote: payload.missingNote,
            // B21. This button used to be HIDDEN, and this probe pinned that.
            // Hidden AGAIN on purpose (Torry, Jul 31 2026): the command
            // bar's "Export chart" is the one export, and the Basics help
            // sentence is retargeted by the shell this time - the dangling
            // sentence is why the first hide was reverted.
            exportBtnLive: (() => {
                const b = document.querySelector('button[title="Export plot"]');
                return !!b && b.offsetParent !== null;
            })(),
        };
    })()`);

    ok(errors.length === 0, 'zero page errors' + (errors.length ? ': ' + errors[0] : ''));
    ok(info.hasSvg, 'chart svg present');
    ok(!info.nanInSvg, 'no NaN in svg');
    ok(info.barFills.length === 3, '3 visible bars (got ' + info.barFills.length + ')');
    ok(info.barFills.every(f => f === '#2d5c94'), 'stock default fill on every bar');
    for (const t of ['Control', 'Low dose', 'High dose', 'condition', 'score'])
        ok(info.texts.some(s => (s || '').indexOf(t) !== -1), 'svg text: ' + t);
    ok(!info.exportBtnLive,
       'engine export icon is hidden; the command bar owns chart export');

    ok(Array.isArray(info.bars) && info.bars.length === 3, 'payload has 3 cells');
    ok(JSON.stringify(info.xCategories) === JSON.stringify(['Control', 'Low dose', 'High dose']),
       'xCategories order');
    ok(info.hasGroups === false, 'hasGroups false');
    ok(info.xLabel === 'condition' && info.yLabel === 'score', 'axis labels from roles');
    ok(info.missingNote === '', 'no missing note');
    for (let i = 0; i < 3; i++) {
        const cell = info.bars[i] || {};
        ok(cell.x === EXPECT[i].x && cell.group === null && cell.n === 8,
           'cell ' + i + ' identity/n');
        close(cell.mean, EXPECT[i].mean, 0, 'cell ' + i + ' mean exact');
        close(cell.se, EXPECT[i].se, 5e-9, 'cell ' + i + ' se at 10 sig digits');
        ok(Array.isArray(cell.values) && cell.values.length === 8, 'cell ' + i + ' values ship');
    }

    // ci95/ci99 parity for the qt port: rebuild the payload with the
    // error-bar type poked through the option store (the same path an
    // engine errorBarType commit takes).
    const ci = await page.evaluate(`(() => {
        const st = window.PS_SHELL.optionStore();
        st.errorBarType = 'ci95';
        const c95 = window.PS_SHELL.buildPayload().bars[0].se;
        st.errorBarType = 'ci99';
        const c99 = window.PS_SHELL.buildPayload().bars[0].se;
        delete st.errorBarType;
        return { c95, c99 };
    })()`);
    close(ci.c95, EXPECT_CI95_CTRL, 5e-9, 'ci95 half-width matches R qt');
    close(ci.c99, EXPECT_CI99_CTRL, 5e-9, 'ci99 half-width matches R qt');

    await ctx.close();
}

// ---------------------------------------------------------------- case 3+4
{
    console.log('case 2: real-gesture edit round-trip + persistence');
    const { ctx, page, errors } = await newPage();

    // Click the first bar's center (real mouse - synthetic dispatchEvent
    // clicks are swallowed by the engine's phantom-click guards).
    const barBox = await page.evaluate(`(() => {
        const bar = Array.from(document.querySelectorAll('[data-bar-cat]'))
            .filter(el => el.tagName.toLowerCase() === 'path' && (el.getAttribute('fill') || '').indexOf('#') === 0)[0];
        const r = bar.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await page.mouse.click(barBox.x, barBox.y);
    await page.waitForTimeout(300);

    const panel = await page.evaluate(`(() => {
        const host = document.getElementById('psroot');
        const swatches = Array.from(host.querySelectorAll('button'))
            .filter(b => /rgb\\(/.test(b.style.backgroundColor || '') &&
                         b.offsetParent !== null &&
                         b.getBoundingClientRect().width < 40 &&
                         b.getBoundingClientRect().width > 8);
        const target = swatches.find(b => b.style.backgroundColor === 'rgb(225, 142, 76)');
        if (!target) return { panelOpen: host.textContent.indexOf('Bars - Control') !== -1, swatch: null };
        // The panel can sit below the fold - a mouse click at off-viewport
        // coordinates hits nothing (the M1 layout lesson).
        target.scrollIntoView({ block: 'center' });
        const r = target.getBoundingClientRect();
        return { panelOpen: host.textContent.indexOf('Bars - Control') !== -1,
                 swatch: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
    })()`);
    ok(panel.panelOpen, 'bar click opened the Bars - Control panel');
    ok(!!panel.swatch, 'orange palette swatch located');

    await page.mouse.click(panel.swatch.x, panel.swatch.y);
    await page.waitForTimeout(150);
    // Force the engine's debounced commit flush. The flush defers while
    // __gb2_inspectorInputAt is fresh (<700 ms), so zero the stamp first
    // (the documented commit-probe law), then let the shell echo run.
    await page.evaluate(
        `window.__gb2_inspectorInputAt = 0; window.dispatchEvent(new Event('beforeunload'))`);
    await page.waitForTimeout(400);

    const after = await page.evaluate(`(() => {
        const st = window.PS_SHELL.optionStore();
        const spec = st.chartSpec ? JSON.parse(st.chartSpec) : null;
        const bar = Array.from(document.querySelectorAll('[data-bar-cat]'))
            .filter(el => el.tagName.toLowerCase() === 'path' && el.getAttribute('fill'))[0];
        const cs = spec && spec.categoryStyles && spec.categoryStyles[0];
        return {
            keys: Object.keys(st),
            color: cs ? cs.color : null,
            original: cs ? cs.original : null,
            barFill: bar.getAttribute('fill'),
            ls: !!window.localStorage.getItem('psstandalone.project.v2'),
        };
    })()`);
    // The guarantee is that a STYLE edit leaks no individual style key: the
    // chartSpec consolidation is what keeps jamovi's per-option dispatch cost
    // off this app. plotWidth and plotHeight are not style - they are the plot
    // SIZE, a real payload key the engine reads directly - and punch list 27's
    // fit-to-pane writes them, so they are named here rather than making the
    // assertion vaguer.
    const NON_STYLE = ['plotWidth', 'plotHeight'];
    const leaked = after.keys.filter(k => k !== 'chartSpec' &&
        NON_STYLE.indexOf(k) === -1);
    ok(after.keys.indexOf('chartSpec') !== -1 && leaked.length === 0,
       'the store holds chartSpec and no loose style key (got ' +
       after.keys.join(',') + ')');
    ok(after.color === '#e18e4c' && after.original === 'Control',
       'chartSpec carries the Control recolor');
    ok(after.barFill === '#e18e4c', 'bar repainted through the echo');
    ok(after.ls, 'project persisted to localStorage');
    ok(errors.length === 0, 'zero page errors through the gesture' +
       (errors.length ? ': ' + errors[0] : ''));

    // Cold reload in the SAME context: localStorage restore must repaint
    // the edit with no interaction.
    await page.reload();
    await page.waitForTimeout(400);
    const reborn = await page.evaluate(`(() => {
        const bar = Array.from(document.querySelectorAll('[data-bar-cat]'))
            .filter(el => el.tagName.toLowerCase() === 'path' && el.getAttribute('fill'))[0];
        return { barFill: bar ? bar.getAttribute('fill') : null,
                 keys: Object.keys(window.PS_SHELL.optionStore()) };
    })()`);
    ok(reborn.barFill === '#e18e4c', 'edit survives cold reload');
    ok(reborn.keys.indexOf('chartSpec') !== -1, 'options restored from localStorage');

    // Reset returns to defaults.
    await page.click('#ps-reset');
    await page.waitForTimeout(300);
    const resetFill = await page.evaluate(`document.querySelectorAll('[data-bar-cat]')[0].getAttribute('fill')`);
    ok(resetFill === '#2d5c94', 'reset restores the stock palette');

    await ctx.close();
}

await browser.close();
console.log(failures === 0 ? 'M0 PROBE PASS' : 'M0 PROBE: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
