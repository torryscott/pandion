// Panel reveal + header zoom (Torry, Aug 5 2026): colleagues on low-res
// screens clicked a chart part and never saw the editor - it opened below
// the fold. Two cures, both pinned here:
//   1. the chart's View zoom moved from the collapsed Size & view card to
//      a header Zoom row, the same placement Notebook and Layouts use;
//   2. after a REAL chart click, the workspace scrolls the MINIMUM that
//      shows the settled panel, capped so the clicked part (floored at
//      the plot area) never leaves the screen - short panels reveal
//      fully, tall ones partially; synthetic input never scrolls.
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

console.log('case 1: the Zoom select lives in the chart header now');
const header = await page.evaluate(() => {
    const row = document.getElementById('ps-charttools');
    const sel = document.getElementById('ps-chart-zoom');
    return {
        shown: !!row && getComputedStyle(row).display !== 'none',
        inRow: !!row && !!sel && row.contains(sel),
        inRail: !!document.querySelector('#ps-sizeview #ps-chart-zoom'),
    };
});
ok(header.shown && header.inRow && !header.inRail,
   'the View zoom sits in the workspace header (Notebook/Layout placement), ' +
   'no longer buried in Size & view');
// Round 2 (Torry, Aug 5 2026): a whole band for one select wasted the
// vertical space low-res screens lack - the zoom rides the TAB ROW.
ok(await page.evaluate(() => {
    const sel = document.getElementById('ps-chart-zoom');
    const tab = document.querySelector('#ps-tabs .ps-tab');
    if (!sel || !tab) return false;
    const sr = sel.getBoundingClientRect(), tr = tab.getBoundingClientRect();
    return sr.top < tr.bottom && sr.bottom > tr.top;
}), 'on the SAME line as the document tabs - no row of its own');
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

console.log('case 2: a chart click reveals the panel that opened below ' +
            'the fold');
const scrollerSel = '#ps-main-workspace';
const barSpot = await page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    const bar = host.querySelector('svg [data-bar-cat]');
    const r = bar.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(60, r.height / 2) };
});
const before2 = await page.evaluate(s =>
    document.querySelector(s).scrollTop, scrollerSel);
await page.mouse.click(barSpot.x, barSpot.y);
await page.waitForTimeout(1600);
const after2 = await page.evaluate((s) => {
    const scroller = document.querySelector(s);
    const panel = document.querySelector('.graphbuilder2-host .gb2-panel');
    const pr = panel ? panel.getBoundingClientRect() : null;
    return { scrollTop: scroller.scrollTop,
             panelBottom: pr ? pr.bottom : null,
             panelH: pr ? pr.height : 0,
             viewH: window.innerHeight };
}, scrollerSel);
ok(after2.panelH > 40, `setup: the click opened a panel (${Math.round(after2.panelH)}px)`);
ok(after2.scrollTop > before2 + 20 &&
   after2.panelBottom <= after2.viewH + 4,
   `the workspace scrolled the panel into view ` +
   `(${Math.round(before2)} -> ${Math.round(after2.scrollTop)}, panel ` +
   `bottom ${Math.round(after2.panelBottom)} vs window ${after2.viewH})`);
ok(await page.evaluate((spot) => {
    const el = document.elementFromPoint(spot.x, 60);
    return true; // geometry probe below is the real check
}, barSpot) && (barSpot.y - (after2.scrollTop - before2)) > 40,
   'the clicked bar is still on screen (anchor bound held)');

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
