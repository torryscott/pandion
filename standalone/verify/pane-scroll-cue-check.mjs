// The workspace pane must say when there is more below it.
//
// THE BUG. Opening the Statistics panel on a laptop leaves the panel
// running past the bottom of the workspace pane: measured at 1280x800 on
// the sample project, the pane could scroll another 260px, two of the ten
// comparison rows were on screen, and Place brackets sat 60px below the
// visible edge. macOS draws no scrollbar until you scroll, so the pane
// reported offsetWidth === clientWidth and boxShadow "none": nothing on
// screen said there was anything below, and the one control that places
// the brackets is what was below.
//
// The engine already solved exactly this for its own long tables
// (graphbuilder2.js, the [data-st-scroll] wrappers): a bottom-edge inset
// shadow that appears while there is more to see and clears at the end.
// This gives the workspace pane the same cue, in the same values, so it
// introduces no new visual language.
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
// A laptop, which is where this bites. The pane fits everything at 1500x1000.
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1900);

const pane = () => page.evaluate(() => {
    const sc = document.getElementById('ps-main-workspace');
    return {
        more: sc.scrollHeight - sc.clientHeight - sc.scrollTop,
        scrollbarPx: sc.offsetWidth - sc.clientWidth,
        shadow: getComputedStyle(sc).boxShadow
    };
});

console.log('case 1: a settled chart with nothing below says nothing');
const rest = await pane();
ok(rest.more <= 2, `the pane has nothing below at rest (${rest.more}px)`);
ok(rest.shadow === 'none',
   'so it draws no cue, because a cue that is always on is not a cue');

console.log('case 2: open the Statistics panel, which runs past the fold');
// Real gesture at a resolved centre: the engine drops synthetic clicks at
// (0,0) with detail 0.
const btn = await page.evaluate(() => {
    const x = Array.from(document.querySelectorAll('#psroot button'))
        .find(e => /statistics/i.test(e.getAttribute('aria-label') || ''));
    const r = x.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(btn.x, btn.y);
await page.waitForTimeout(2600);
const open = await pane();
ok(open.more > 20,
   `there really is more below now (${open.more}px, and the reveal has ` +
   `already scrolled what it is allowed to)`);
ok(open.scrollbarPx === 0,
   'and the platform still draws no scrollbar, so the cue cannot come from there');
ok(/inset/.test(open.shadow) && /rgba/.test(open.shadow),
   `the pane carries the bottom-edge cue (${open.shadow})`);

console.log('case 3: the cue clears at the end, so it always means "more"');
await page.evaluate(() => {
    const sc = document.getElementById('ps-main-workspace');
    sc.scrollTop = sc.scrollHeight;
});
await page.waitForTimeout(400);
const bottom = await pane();
ok(bottom.more <= 2, 'scrolled to the end');
ok(bottom.shadow === 'none', 'the cue is gone');
// And back: this is a live signal, not a one-shot painted at open time.
await page.evaluate(() => {
    document.getElementById('ps-main-workspace').scrollTop = 0;
});
await page.waitForTimeout(400);
ok(/inset/.test((await pane()).shadow),
   'and it returns on scrolling back up');

console.log('case 4: it is the same cue the engine uses for its own tables');
// Pinned as a literal rather than compared against a live engine element:
// the engine's [data-st-scroll] wrappers only paint theirs while THEIR
// content overflows a 320px max-height, which it does not at every size,
// so a live comparison would pass or fail on the fixture rather than on
// the contract. The value is copied from graphbuilder2.js (search
// "inset 0 -10px 8px -8px"); if that moves, this should move with it.
ok((await pane()).shadow === 'rgba(0, 0, 0, 0.22) 0px -10px 8px -8px inset',
   'same offsets, blur and alpha as the Sigma panel table wrappers');

console.log('case 5: the cue clears when the CONTENT shrinks, not just on scroll');
// The first version wired its ResizeObserver to sc.firstElementChild,
// which is #ps-datacard - display:none in this workspace, height 0,
// permanently. So the observer could never fire for chart content: the
// cue armed only as a side effect of the reveal scroll, and closing the
// panel left the shadow painted with nothing below it. Closed here with
// the panel's own visible Close button, a real gesture.
const closeBtn = await page.evaluate(() => {
    const x = document.querySelector('#psroot [data-role="st-close-btn"]');
    if (!x) return null;
    const r = x.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok(!!closeBtn, 'the Statistics panel has its own Close button');
await page.mouse.click(closeBtn.x, closeBtn.y);
await page.waitForTimeout(1600);
const shrunk = await pane();
ok(shrunk.more <= 2, `closing it leaves nothing below (${shrunk.more}px)`);
ok(shrunk.shadow === 'none',
   `and the cue goes with it (${shrunk.shadow})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PANE SCROLL CUE: PASS');
await browser.close();
