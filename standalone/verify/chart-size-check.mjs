// The standard-chart-size contract (Torry's report, Jul 27 2026: "I have
// the standard chart size checked, I resized by dragging, and it exported
// the resized version").
//
// ROOT CAUSE: plotWidth/plotHeight are NOT in the payload's specRealKeys -
// they are chartSpec-routed style keys. So the engine's size controls
// commit under the key "chartSpec" (a blob containing plotWidth), never
// under "plotWidth". Two consequences, both reproduced before the fix:
//   1. fitNoticeSizeCommit watched for the literal keys only, so the box
//      never flipped: it went on claiming "standard" while the figure was
//      whatever the user had dragged.
//   2. The engine EXPLODES chartSpec over data.* at render entry, so the
//      blob's size out-ranked the forced standard - on screen AND in every
//      export, which is the guarantee this checkbox exists to make.
//
// THE CONTRACT, pinned end to end below: checked means 7.5 x 5 in on
// screen and in exports, whatever is stored; resizing hands ownership to
// the user AND says so by unchecking; re-checking takes it back.
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
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1700);

const read = () => page.evaluate(() => {
    const store = window.PS_SHELL.optionStore();
    let spec = {};
    try { spec = JSON.parse(store.chartSpec || '{}'); } catch (e) {}
    const svgs = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => (Number(b.getAttribute('width')) || 0) -
                        (Number(a.getAttribute('width')) || 0));
    const field = document.getElementById('ps-fit-pane')
        .closest('.ps-inspector-field');
    return {
        checked: document.getElementById('ps-fit-pane').checked,
        specW: Number(spec.plotWidth) || 0,
        svgW: svgs[0] ? Number(svgs[0].getAttribute('width')) : 0,
        label: field.querySelector('span').textContent
    };
});
const exportW = () => page.evaluate(async () => {
    const src = await window.PS_SHELL.exportSource();
    return src ? Math.round(src.w) : 0;
});

console.log('case 1: checked means the standard, on screen and in exports');
const base = await read();
ok(base.checked && base.svgW === 720,
   `a fit-managed chart renders at the 7.5 in standard (${base.svgW}px)`);
// 730 = 720 logical + the ink overhang of the textScale (1.15) defaults;
// was 728 before Jul 31 2026. Exports follow CONTENT by ruling, so this
// constant moves exactly when text defaults or the canvas move: keep it
// EXACT so any accidental drift still fails loudly.
ok(await exportW() === 730,
   'and exports at that size (730 = 720 + the scaled-text ink overhang)');

console.log('case 2: a resize hands ownership over, and SAYS so');
// The engine's size field and its drag handle both funnel through its
// debounced _setOption, which is where the chartSpec routing happens, so
// this drives the identical path at the identical entry point.
await page.evaluate(() => { window.__gb2_setOption('plotWidth', 5); });
await page.waitForTimeout(2600);   // engine debounce 1500ms + shell echo
const sized = await read();
ok(sized.specW === 5,
   'the size lands in the chartSpec blob, which is where the engine keeps it');
ok(!sized.checked,
   'the box UNCHECKS itself: it must never claim a size the chart is not');
ok(sized.svgW === 480, `the chart is the user's size (${sized.svgW}px)`);
// 490 = 480 + the scaled-text ink overhang (was 488 pre-textScale).
ok(await exportW() === 490,
   'and the export follows the user, not the standard');
ok(/your size: 5 x/.test(sized.label),
   `the row states the size in force rather than leaving it a mystery ` +
   `("${sized.label}")`);

console.log('case 3: re-checking takes the standard back');
// The user's 5 in is STILL in the blob here. This is the assertion that
// fails without the forced render-spec size: the explode would win.
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.click('#ps-fit-pane');
await page.waitForTimeout(2000);
const restored = await read();
ok(restored.checked && restored.specW === 5 && restored.svgW === 720,
   `the standard out-ranks the stored size (blob still ${restored.specW} in, ` +
   `chart back to ${restored.svgW}px)`);
ok(await exportW() === 730,
   'and the export is the standard again: the guarantee holds');
ok(/7.5 x 5 in/.test(restored.label),
   `and the label returns to the standard ("${restored.label}")`);

console.log('case 4: unchecking by hand transfers ownership, changes nothing');
// A fresh chart has no stored size, so unchecking used to drop it to the
// 6 x 4 template default - a silent resize with no control nearby to
// explain it. Unchecking now seeds the size in force.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addChart('plotbuilder');
    await s(400);
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score' });
    await s(1400);
});
const freshOn = await read();
ok(freshOn.checked && freshOn.svgW === 720,
   `setup: a brand-new chart is standard with nothing stored ` +
   `(${freshOn.svgW}px)`);
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.click('#ps-fit-pane');
await page.waitForTimeout(1600);
const freshOff = await read();
ok(!freshOff.checked && freshOff.svgW === 720,
   `unchecking hands over ownership at the SAME size, no silent jump ` +
   `(${freshOff.svgW}px)`);
ok(/your size: 7.5 x 5/.test(freshOff.label),
   `and the row names the size now under the user's control ` +
   `("${freshOff.label}")`);
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.click('#ps-fit-pane');
await page.waitForTimeout(1400);

console.log('case 5: the standard is the same figure in any window');
await page.setViewportSize({ width: 900, height: 700 });
await page.waitForTimeout(900);
const small = await read();
ok(small.svgW === 720 && await exportW() === 730,
   `a smaller window scales the VIEW, never the figure (${small.svgW}px ` +
   `logical, 730px exported)`);
await page.setViewportSize({ width: 1500, height: 1000 });
await page.waitForTimeout(600);

console.log('case 6: the box keeps up with the chart, not with the commit');
// Torry: "it takes roughly three seconds for the standard chart size
// button to unclick". The notice fired on the engine's COMMIT, which is
// debounced 1500ms and then echoes and re-renders - so the chart resized
// instantly while the box went on claiming "standard" for seconds, which
// is the same dishonesty as the bug above, just briefer. The watcher reads
// the PENDING size instead. Measured through the engine's own size field,
// a real user path: ~1350ms before, ~12ms after.
await page.evaluate(() => {
    const box = document.getElementById('ps-fit-pane');
    if (!box.checked) box.click();
});
await page.waitForTimeout(1500);
const gearOpen = await page.evaluate(() => {
    const gear =
        document.querySelector('#psroot button[title*="Chart settings" i]') ||
        document.querySelector('#psroot button[aria-label*="Chart settings" i]');
    if (gear) gear.click();
    return !!gear;
});
await page.waitForTimeout(900);
ok(gearOpen && await page.evaluate(() =>
       !!document.querySelector('#psroot [data-field="plot-w"]')),
   'setup: the engine size field is reachable (the real path a user takes)');
const lag = await page.evaluate(async () => {
    const f = document.querySelector('#psroot [data-field="plot-w"]');
    const box = document.getElementById('ps-fit-pane');
    f.focus();
    f.value = '5';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
        if (!box.checked) return performance.now() - t0;
        await new Promise(r => setTimeout(r, 10));
    }
    return null;
});
ok(lag !== null && lag < 300,
   `the box lets go the moment the size changes, not when the engine ` +
   `flushes (${lag === null ? 'never' : Math.round(lag) + 'ms'}; the ` +
   `commit-driven version measured ~1350ms)`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CHART SIZE CHECK PASS');
await browser.close();
