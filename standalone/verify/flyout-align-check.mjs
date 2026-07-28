// Torry's report, Jul 27 2026: the graph-type and palette dropdowns open
// far to the RIGHT of the buttons that summon them (~146px), at every
// zoom.
//
// ROOT CAUSE, and it is the shell's: both flyouts are absolutely
// positioned inside the CHART WRAP, and the engine centres that wrap when
// its card is wider than the figure - always true here, where the
// workspace pane is much wider than a 7.5in chart while the toolbar spans
// the full card. So the buttons sat ~150px LEFT of the flyouts' coordinate
// origin. The engine's own maths is correct by intent: the palette flyout
// computes max(6, trigger.left - origin.left), which simply went negative
// and clamped to the 6px corner. Inside jamovi the wrap and the toolbar
// share a left edge, so neither shows the fault - which is exactly why
// this is ours to fix in the shell, not in the shared engine.
//
// THE FIX is alignment, not arithmetic: the toolbar is constrained to the
// figure's width and centred the same way, so the engine's positioning
// lands under the right button. The flyouts also join the chrome
// counter-zoom, so a reduced view no longer renders half-size dropdowns
// with halved offsets.
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1700);

// Open a flyout by clicking its real trigger, and report where it landed
// relative to that trigger. A dropdown belongs under the control that
// opened it; anything past a button's width reads as "somewhere else".
// PROBE LAW re-learned here: the shell re-seats the menu one task AFTER
// the engine's own handler (which stopPropagation's, so the shell listens
// in the capture phase and defers). A probe that clicks and measures in
// the SAME evaluate reads the engine's floored position and reports a
// failure that does not exist on screen. Click, yield, then measure - and
// drive it with a real mouse, the way a user does.
async function measure(kind) {
    const box = await page.evaluate((k) => {
        const t = document.getElementById('psroot')
            .querySelector('[data-role="' + k + '-trigger"]');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, kind);
    if (!box) return { err: 'no ' + kind + ' trigger' };
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(350);
    const out = await page.evaluate((k) => {
        const root = document.getElementById('psroot');
        const trig = root.querySelector('[data-role="' + k + '-trigger"]');
        const fly = root.querySelector('[data-role="' + k + '-flyout"]');
        if (!fly || fly.style.display === 'none')
            return { err: 'no visible ' + k + ' flyout' };
        const b = trig.getBoundingClientRect();
        const f = fly.getBoundingClientRect();
        return { delta: Math.round(f.left - b.left),
                 width: Math.round(f.width),
                 below: Math.round(f.top - b.bottom) };
    }, kind);
    await page.mouse.click(box.x, box.y);   // close it again
    await page.waitForTimeout(200);
    return out;
}

console.log('case 1: a dropdown opens under the button that summoned it');
const gt = await measure('graphtype');
ok(!gt.err && Math.abs(gt.delta) <= 24,
   `the graph-type dropdown sits under its own button ` +
   `(${gt.delta}px across; it was 146px away)`);
const pal = await measure('palette');
ok(!pal.err && Math.abs(pal.delta) <= 24,
   `so does the palette dropdown (${pal.delta}px across)`);
ok(gt.below >= -4 && gt.below < 40 && pal.below >= -4 && pal.below < 40,
   `and both hang just below the toolbar, not floating over the chart ` +
   `(${gt.below}px, ${pal.below}px)`);

console.log('case 2: the toolbar still spans the full width');
// The first shape of this fix shrank the TOOLBAR to the chart's width so
// the engine's own positioning would land right. It worked, and Torry
// rejected it on sight: "I liked the fact that the bar was all the way
// across the top. I just wanted the menu to be under the button." Pinned,
// so nobody re-derives that solution: the MENU moves, never the bar.
const align = await page.evaluate(() => {
    const root = document.getElementById('psroot');
    const tb = root.querySelector('[data-role="chart-toolbar"]');
    const card = tb.parentElement;
    const svg = Array.from(root.querySelectorAll('svg'))
        .sort((a, b) => (Number(b.getAttribute('width')) || 0) -
                        (Number(a.getAttribute('width')) || 0))[0];
    return { tbX: Math.round(tb.getBoundingClientRect().left),
             tbW: Math.round(tb.getBoundingClientRect().width),
             cardX: Math.round(card.getBoundingClientRect().left),
             cardW: Math.round(card.getBoundingClientRect().width),
             wrapX: Math.round(svg.parentElement.getBoundingClientRect().left) };
});
ok(Math.abs(align.tbX - align.cardX) <= 2 &&
   align.tbW >= align.cardW - 4,
   `the bar runs the full width of the card, as it did before ` +
   `(${align.tbW}px of ${align.cardW}px)`);
ok(align.wrapX - align.tbX > 40,
   `and the chart stays centred under it, which is exactly the offset ` +
   `the menus have to overcome (${align.wrapX - align.tbX}px)`);

console.log('case 3: it holds at a reduced view, where chrome counter-zooms');
await page.selectOption('#ps-chart-zoom', '0.5');
await page.waitForTimeout(700);
const gt50 = await measure('graphtype');
const pal50 = await measure('palette');
ok(Math.abs(gt50.delta) <= 24 && Math.abs(pal50.delta) <= 24,
   `both dropdowns stay under their buttons at 50% ` +
   `(${gt50.delta}px, ${pal50.delta}px; the palette one was 48px off)`);
ok(gt50.width === gt.width && pal50.width === pal.width,
   `and they render at TRUE size rather than shrinking with the chart ` +
   `(${gt50.width}px vs ${gt.width}px)`);
await page.selectOption('#ps-chart-zoom', 'fit');
await page.waitForTimeout(500);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FLYOUT ALIGN CHECK PASS');
await browser.close();
