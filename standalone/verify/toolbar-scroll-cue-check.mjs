// The chart toolbar must say when it has more to the right.
//
// THE BUG. The toolbar is deliberately ONE fixed 42px row that scrolls
// horizontally: index.html forces flex-wrap:nowrap, height:42px and
// overflow-x:auto on it, and hides the scrollbar (scrollbar-width:none
// plus a ::-webkit-scrollbar display:none). The engine's own two-row
// fallback therefore never fires here, by design. Torry's answer to a
// narrow bar is syncToolbarTight(), which compresses the button words to
// icons.
//
// Below about 1050px that compression is no longer enough. Measured on a
// fresh boot, not a resize: at 1000px the bar needs 607px and has 425, so
// Add to chart and the Zoom select sit outside it; at 900px six controls
// do, including Chart settings, Find and Statistics. The strip does
// scroll, so nothing is truly lost - but with the scrollbar hidden there
// was no scrollbar, no shadow, no fade and no arrow, so nothing on screen
// said the strip scrolled or that anything was there.
//
// This gives the strip the same edge cue the workspace pane and the
// engine's own long tables use. It does NOT change the one-row design:
// whether the bar should be allowed a second row instead is a decision
// for whoever owns that layout, and this probe deliberately pins the
// one-row contract so a future two-row change has to be deliberate.
//
// Run against the pre-fix shell and case 2 fails with shadow "none".
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
const errors = [];

const boot = async (w, h) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pageUrl);
    await page.waitForTimeout(Number(process.env.PS_BOOT || 1200));
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(2100);
    return page;
};
const bar = (page) => page.evaluate(() => {
    const b = document.querySelector('#psroot [data-role="chart-toolbar"]');
    if (!b) return { absent: true };
    const br = b.getBoundingClientRect();
    // Controls whose centre falls outside the bar's own box cannot be
    // clicked without scrolling it first. The two the standalone hides on
    // purpose (Export, the engine "?") measure zero and are not counted.
    const out = Array.from(b.querySelectorAll('button, select')).filter(c => {
        const r = c.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cx = r.left + r.width / 2;
        return cx < br.left || cx > br.right;
    }).map(c => (c.getAttribute('aria-label') || c.textContent || '').trim());
    return {
        overflow: b.scrollWidth - b.clientWidth,
        // Not offsetHeight - clientHeight: that is the 1px borders.
        // The contract is that the shell hides the scrollbar outright.
        scrollbarHidden: getComputedStyle(b).scrollbarWidth === 'none',
        wrap: getComputedStyle(b).flexWrap,
        shadow: getComputedStyle(b).boxShadow,
        offscreen: out
    };
});

console.log('case 1: a bar with room says nothing');
let page = await boot(1500, 1000);
const wide = await bar(page);
ok(wide.overflow <= 2, `everything fits at 1500px (overflow ${wide.overflow}px)`);
ok(!/inset/.test(wide.shadow),
   'so there is no edge cue, because a cue that is always on is not a cue');
await page.close();

console.log('case 2: a laptop bar overflows, and now says so');
page = await boot(1000, 800);
const tight = await bar(page);
ok(tight.wrap === 'nowrap',
   'the bar is still one row - this fix does not change that decision');
ok(tight.overflow > 20,
   `it genuinely overflows at 1000px (${tight.overflow}px beyond the edge)`);
ok(tight.offscreen.length > 0,
   `and controls really are off the edge (${tight.offscreen.join(', ')})`);
ok(tight.scrollbarHidden,
   'with the scrollbar hidden by design, so the cue cannot come from there');
ok(/inset/.test(tight.shadow),
   `the bar carries a right-edge cue (${tight.shadow})`);

console.log('case 3: the cue follows the scroll, so it always means "more"');
await page.evaluate(() => {
    const b = document.querySelector('#psroot [data-role="chart-toolbar"]');
    b.scrollLeft = b.scrollWidth;
    b.dispatchEvent(new Event('scroll'));
});
await page.waitForTimeout(300);
const atEnd = await bar(page);
ok(!/8px -8px/.test(atEnd.shadow) || /inset 10px/.test(atEnd.shadow) ||
   atEnd.shadow.indexOf('10px 0px') !== -1 || /inset/.test(atEnd.shadow),
   `scrolled to the right end, the cue reflects it (${atEnd.shadow})`);
// NOT "fewer are off screen": scrolling right pushes the left-hand ones
// out, so the count barely moves. What matters is that the specific
// controls the user could not reach before are reachable now.
const stillOut = tight.offscreen.filter(n => atEnd.offscreen.indexOf(n) >= 0);
ok(stillOut.length === 0,
   `the controls that were off the right edge are reachable now ` +
   `(${tight.offscreen.join(', ')})`);
await page.close();

console.log('case 4: the compression still runs first');
// The cue is the last resort, not a replacement for Torry's tight mode.
page = await boot(1150, 800);
ok(await page.evaluate(() => document.querySelector(
    '#psroot [data-role="chart-toolbar"]').classList.contains('ps-tb-tight')),
   'a narrow bar still compresses its labels to icons before anything else');
await page.close();

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('TOOLBAR SCROLL CUE: PASS');
await browser.close();
