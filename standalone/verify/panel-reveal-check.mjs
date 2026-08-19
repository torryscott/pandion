// Panel reveal + header zoom (Torry, Aug 5 2026): colleagues on low-res
// screens clicked a chart part and never saw the editor - it opened below
// the fold. Two cures, both pinned here:
//   1. the chart's View zoom moved from the collapsed Size & view card to
//      a header Zoom row, the same placement Notebook and Layouts use;
//   2. after a REAL chart click, the settled panel is FITTED into view
//      WITHOUT moving the page (t4-203b replaced the scroll, which broke
//      double-click-to-edit via the shorter-panel scroll clamp):
//      max-height + internal scrolling normally, a lifted sheet on tiny
//      windows, capped so the clicked part never leaves the screen.
//      Synthetic input never arms it; the workspace never auto-scrolls.
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
// A deliberately SHORT window: the low-res laptop this feature is for.
const page = await browser.newPage({ viewport: { width: 1366, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1600);
}
await page.waitForFunction(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    return !!svg && svg.querySelectorAll('*').length > 30;
}, null, { timeout: 20000 });

console.log('case 1: the Zoom select lives in the chart toolbar now');
// Round 3 (Torry, Aug 6 2026): the zoom docks IN the chart toolbar at
// the far right - the same bar as the other options, like the Notebook
// and Layout tools bars. (It rode the tab row for a day between homes.)
const header = await page.evaluate(() => {
    const bar = document.querySelector('[data-role="chart-toolbar"]');
    const row = document.getElementById('ps-charttools');
    const sel = document.getElementById('ps-chart-zoom');
    const add = [...(bar ? bar.querySelectorAll('button') : [])]
        .find(b => b.getAttribute('aria-label') === 'Add to chart');
    return {
        shown: !!row && getComputedStyle(row).display !== 'none',
        inBar: !!bar && !!sel && bar.contains(sel),
        inRail: !!document.querySelector('#ps-sizeview #ps-chart-zoom'),
        farRight: !!add && !!sel &&
            sel.getBoundingClientRect().left >
            add.getBoundingClientRect().right,
    };
});
ok(header.shown && header.inBar && !header.inRail && header.farRight,
   'the View zoom sits in the chart toolbar, far right of the actions, ' +
   'no longer buried in Size & view');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       document.getElementById('ps-charttools').offsetParent === null),
   'and the row leaves with the chart workspace');
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       document.getElementById('ps-charttools').offsetParent === null),
   'and it never bleeds into the Layout workspace (own toggle, not just ' +
   'the ancestor swap)');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(400);
await page.selectOption('#ps-chart-zoom', '1');
await page.waitForTimeout(400);

console.log('case 2: a chart click FITS the panel into view without ' +
            'moving the page');
const scrollerSel = '#ps-main-workspace';
const barSpot = await page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    const bar = host.querySelector('svg [data-bar-cat]');
    const r = bar.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(60, r.height / 2) };
});
const chartBefore2 = await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    return { y: Math.round(r.y), h: Math.round(r.height) };
});
const before2 = await page.evaluate(s =>
    document.querySelector(s).scrollTop, scrollerSel);
await page.mouse.click(barSpot.x, barSpot.y);
await page.waitForTimeout(1600);
const after2 = await page.evaluate((s) => {
    const scroller = document.querySelector(s);
    const panel = document.querySelector('.graphbuilder2-host .gb2-panel');
    const pr = panel ? panel.getBoundingClientRect() : null;
    const svg = document.querySelector('.graphbuilder2-host svg');
    const cr = svg.getBoundingClientRect();
    return { scrollTop: scroller.scrollTop,
             panelTop: pr ? pr.top : null,
             panelBottom: pr ? pr.bottom : null,
             panelH: pr ? pr.height : 0,
             chart: { y: Math.round(cr.y), h: Math.round(cr.height) },
             viewH: window.innerHeight };
}, scrollerSel);
ok(after2.panelH > 40, `setup: the click opened a panel (${Math.round(after2.panelH)}px)`);
ok(Math.abs(after2.scrollTop - before2) <= 1,
   `the page did not scroll - the panel is fitted instead ` +
   `(${Math.round(before2)} -> ${Math.round(after2.scrollTop)})`);
ok(after2.panelTop < after2.viewH - 60 &&
   after2.panelBottom <= after2.viewH + 4,
   `the fitted panel is on screen (top ${Math.round(after2.panelTop)}, ` +
   `bottom ${Math.round(after2.panelBottom)} vs window ${after2.viewH})`);
ok(after2.chart.y === chartBefore2.y && after2.chart.h === chartBefore2.h,
   `the chart never moved a pixel - the guarantee the old scroll could ` +
   `not make (y ${chartBefore2.y} -> ${after2.chart.y})`);

console.log('case 3: with the panel visible, another click moves nothing');
const bar2 = await page.evaluate(() => {
    const bars = document.querySelectorAll(
        '.graphbuilder2-host svg [data-bar-cat]');
    const r = bars[bars.length - 1].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(60, r.height / 2) };
});
await page.mouse.click(bar2.x, bar2.y);
await page.waitForTimeout(1600);
const after3 = await page.evaluate(s =>
    document.querySelector(s).scrollTop, scrollerSel);
ok(Math.abs(after3 - after2.scrollTop) <= 8,
   `no gratuitous motion when the panel is already visible ` +
   `(${Math.round(after2.scrollTop)} -> ${Math.round(after3)})`);

console.log('case 4: synthetic input never scrolls (echoes, tours, ' +
            're-renders)');
await page.evaluate(s => { document.querySelector(s).scrollTop = 0; },
                    scrollerSel);
await page.waitForTimeout(200);
await page.evaluate(() => {
    const bar = document.querySelector(
        '.graphbuilder2-host svg [data-bar-cat]');
    const r = bar.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup', 'click'])
        bar.dispatchEvent(new MouseEvent(type, { bubbles: true,
            cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
});
await page.waitForTimeout(1200);
ok(await page.evaluate(s =>
       document.querySelector(s).scrollTop, scrollerSel) === 0,
   'a synthetic click sequence moved nothing - only trusted input reveals');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PANEL REVEAL CHECK PASS');
await browser.close();
