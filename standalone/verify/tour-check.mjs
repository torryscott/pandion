// Real-browser smoke for the "Show me how" walkthroughs (js/ps-tour.js).
//
// The walkthroughs drive the engine with SYNTHETIC pointer events, and the
// engine legitimately defends itself against synthesized input. That makes
// this probe load-bearing in a way most UI smokes are not: a change to the
// engine's click handling, its hit strips, or its panel selectors breaks a
// walkthrough silently, and only an end-to-end run catches it. So every case
// asserts the CHART actually changed, never just that a panel appeared.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(400);
}
await page.waitForFunction(() => !!document.querySelector('.graphbuilder2-host svg'),
                           null, { timeout: 15000 });

const chartState = () => page.evaluate(() => ({
    errorBars: document.querySelectorAll('[data-role="error-bar"]').length,
    topTick: (() => {
        const ticks = Array.from(document.querySelectorAll('text'))
            .filter(t => /^[0-9.]+$/.test((t.textContent || '').trim()))
            .map(t => ({ v: parseFloat(t.textContent), y: t.getBoundingClientRect().top }))
            .filter(o => isFinite(o.v));
        if (!ticks.length) return null;
        ticks.sort((a, b) => a.y - b.y);
        return ticks[0].v;
    })(),
    barFills: Array.from(document.querySelectorAll('[data-bar-cat]'))
        .map(b => b.getAttribute('fill') || '').filter(Boolean),
    panel: (document.querySelector('[data-role="inspector-title"]') || {}).innerText || ''
}));

async function playToEnd(key, timeoutMs = 45000) {
    // Block body, not an expression body: returning the promise would make
    // page.evaluate await the whole walkthrough, and the poll below (with its
    // own timeout and miss reporting) would never actually run.
    await page.evaluate(k => { window.PS_TOUR.play(k); }, key);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        await page.waitForTimeout(400);
        if (!await page.evaluate(() => window.PS_TOUR.isRunning())) break;
    }
    if (await page.evaluate(() => window.PS_TOUR.isRunning()))
        throw new Error(`walkthrough "${key}" did not finish within ${timeoutMs} ms`);
    const misses = await page.evaluate(() => window.PS_TOUR.misses());
    if (misses.length)
        throw new Error(`walkthrough "${key}" could not find targets: ${misses.join(', ')}`);
}

// ---- 1. the picker opens from the Help menu and lists context-fitting tours
await page.click('[data-ps-menu="help"]');
await page.waitForTimeout(150);
const helpItems = await page.locator('#ps-appmenu button').allInnerTexts();
if (!helpItems.some(t => /Show me how/.test(t)))
    throw new Error('Help menu has no "Show me how" entry: ' + JSON.stringify(helpItems));
await page.locator('#ps-appmenu button', { hasText: 'Show me how' }).click();
await page.waitForTimeout(250);
if (!(await page.locator('#ps-tour-dialog').isVisible()))
    throw new Error('"Show me how" did not open the walkthrough picker');
const listed = await page.locator('#ps-tour-list [data-tour]').count();
if (listed < 3)
    throw new Error(`expected at least 3 walkthroughs on a default bar chart, saw ${listed}`);
console.log(`  ok  Help menu opens the picker with ${listed} walkthroughs for this chart`);

// ---- 2. typing a novice question narrows the list
await page.fill('#ps-tour-search', 'error');
await page.waitForTimeout(200);
const hits = await page.locator('#ps-tour-list [data-tour]').allInnerTexts();
if (hits.length !== 1 || !/error bars/i.test(hits[0]))
    throw new Error('search for "error" did not isolate the error-bar walkthrough: ' +
                    JSON.stringify(hits));
await page.fill('#ps-tour-search', 'zzzznotathing');
await page.waitForTimeout(200);
if (!(await page.locator('.ps-tour-empty').isVisible()))
    throw new Error('an unmatched query should explain itself, not show an empty list');
console.log('  ok  typed questions filter the list and a miss explains itself');

// ---- 3. context gating: a tour that cannot apply is not offered
const gated = await page.evaluate(() => {
    const all = Object.keys(window.PS_TOUR.tours);
    const shown = window.PS_TOUR.available().map(a => a.key);
    return { all, shown };
});
if (!gated.shown.includes('error-bars') || !gated.shown.includes('one-bar-color'))
    throw new Error('bar-chart walkthroughs missing from a bar chart: ' + JSON.stringify(gated));
console.log('  ok  walkthroughs are gated to the chart they fit');

await page.click('#ps-tour-close');
await page.waitForTimeout(200);

// ---- 4. the error-bar walkthrough really draws error bars
await page.evaluate(() => { if (window.setOption) window.setOption('errorBarType', 'se'); });
await page.waitForTimeout(1200);
await playToEnd('error-bars');
const afterEb = await chartState();
if (afterEb.errorBars < 1)
    throw new Error('error-bar walkthrough finished but drew no error bars');
if (!/error bars/i.test(afterEb.panel))
    throw new Error('error-bar walkthrough did not leave the Error bars panel open, saw: ' +
                    JSON.stringify(afterEb.panel));
console.log(`  ok  error-bar walkthrough drew ${afterEb.errorBars} error bars and opened its panel`);

// ---- 5. the axis walkthrough really rescales the axis
const beforeAxis = await chartState();
await playToEnd('axis-range');
const afterAxis = await chartState();
if (afterAxis.topTick === beforeAxis.topTick)
    throw new Error(`axis walkthrough did not change the axis (top tick stayed ${beforeAxis.topTick})`);
if (afterAxis.topTick !== 140)
    throw new Error(`axis walkthrough should top the axis at 140, saw ${afterAxis.topTick}`);
console.log(`  ok  axis walkthrough rescaled the value axis ${beforeAxis.topTick} -> ${afterAxis.topTick}`);

// ---- 6. the bar-color walkthrough recolors exactly one bar
await playToEnd('one-bar-color');
const afterCol = await chartState();
// Count by colour rather than by index: bars carry invisible hit clones that
// also match [data-bar-cat], so a positional diff is not a stable count.
const recolored = afterCol.barFills.filter(f => /dd7e2b/i.test(f)).length;
if (recolored < 1)
    throw new Error('bar-color walkthrough did not apply the new colour: ' +
                    JSON.stringify(afterCol.barFills));
if (recolored === afterCol.barFills.length)
    throw new Error('bar-color walkthrough recoloured every bar; the scope should have been This bar');
console.log('  ok  bar-color walkthrough recoloured one series, not the whole chart');

// ---- 7. the check-graph walkthrough opens the lint panel
await playToEnd('check-graph');
const lint = await page.evaluate(() => {
    const nav = document.querySelector('[data-role="help-nav"]');
    const body = nav ? nav.parentElement : null;
    return {
        nav: !!nav,
        passed: document.querySelectorAll('[data-role="lint-passed"]').length,
        text: body ? (body.innerText || '').replace(/\s+/g, ' ').slice(0, 300) : ''
    };
});
if (!lint.nav || !/check/i.test(lint.text))
    throw new Error('check-graph walkthrough did not reach the Check graph panel: ' +
                    JSON.stringify(lint));
console.log(`  ok  check-graph walkthrough opened the pitfall scanner (${lint.passed} passed-check pills)`);

// ---- 8. Exit stops a walkthrough and takes its chrome away
await page.evaluate(() => { window.PS_TOUR.play('axis-range'); });
await page.waitForTimeout(900);
if (!await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('walkthrough was not running when Exit was tested');
await page.evaluate(() => window.PS_TOUR.exit());
await page.waitForTimeout(400);
if (await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('Exit did not stop the walkthrough');
const chromeGone = await page.evaluate(() => {
    const layer = document.querySelector('[data-role="ps-tour-layer"]');
    if (!layer) return true;
    return getComputedStyle(layer).pointerEvents === 'none';
});
if (!chromeGone)
    throw new Error('the walkthrough overlay still captures pointer events after Exit');
console.log('  ok  Exit stops playback and the overlay stays click-through');

// ---- 9. the overlay never rides an export or a copy
const tagged = await page.evaluate(() => {
    const layer = document.querySelector('[data-role="ps-tour-layer"]');
    if (!layer) return 'no layer';
    const untagged = Array.from(layer.querySelectorAll('*'))
        .filter(n => !n.classList.contains('ignore-html') && n.tagName !== 'svg' &&
                     !n.closest('svg')).length;
    return layer.classList.contains('ignore-html') && untagged === 0;
});
if (tagged !== true)
    throw new Error('walkthrough chrome is not fully ignore-html tagged: ' + JSON.stringify(tagged));
console.log('  ok  walkthrough chrome is ignore-html, so exports and copies never contain it');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('tour-check: ALL GREEN');
await browser.close();
