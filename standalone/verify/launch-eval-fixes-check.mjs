// The five bugs from the launch-readiness evaluation (Torry, Jul 28 2026),
// pinned. Each records the PRE-FIX behaviour in its message so a
// regression names what came back.
//
// 1. A tooltip outlived its anchor: re-renders remove elements without a
//    pointerout ever firing, so a data-grid type tip stayed on screen over
//    the LAYOUT toolbar after a workspace switch. Fixed by an anchor watch
//    that runs only while a tip is open, plus hideTip on workspace switch.
// 2. The layout status bar and workspace subtitle printed the page size in
//    raw pixels ("1024 x 680", no unit) after every other length in the
//    app converted (t4-45). One formatter now feeds every prose surface.
// 3. Chart names rode the SHARED id counter, so a project with a layout
//    had "Chart 1" then "Chart 3" and Chart 2 never existed. Names now
//    count per kind, max-suffix so deletions can't mint duplicates.
// 4. The layout toolbar overflowed and wrapped ZOOM onto its own line even
//    at 1500px (976px needed, 909 available). The page size group moved to
//    the rail's PAGE section, with Orientation where it belongs; the bar
//    is one row with Zoom holding the right edge.
// 5. Preferences printed "3072.00 MB"; formatBytes now trims and speaks GB.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1600);

console.log('case 1: no tooltip survives a workspace switch');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data'); await s(500);
});
const badge = await page.evaluate(() => {
    const b = document.querySelector('#ps-datagrid th [data-tip]') ||
              document.querySelector('#ps-datagrid th');
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(badge.x, badge.y);
await page.waitForTimeout(900);
ok(await page.evaluate(() =>
       !!document.getElementById('ps-tip')?.hasAttribute('data-open')),
   'setup: hovering a grid type badge really shows a tip');
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(600);
ok(!(await page.evaluate(() =>
       document.getElementById('ps-tip')?.hasAttribute('data-open'))),
   'the tip is gone after the switch (it used to float over the layout ' +
   'toolbar, describing a data-grid element)');

console.log('case 2: the status bar states the page size in the user\'s unit');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await s(1100);
    window.PS_SHELL.setWorkspace('layout'); await s(600);
});
await page.selectOption('#ps-lpage', 'letterp');
await page.waitForTimeout(500);
const status = await page.evaluate(() =>
    document.getElementById('ps-status-context').textContent);
ok(/8\.5 .? 11 in/.test(status),
   `Letter portrait reads "8.5 x 11 in", not "816 x 1056" ("${status}")`);

console.log('case 3: charts and layouts number independently');
const names = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addChart('plotbuilder'); await s(400);
    window.PS_SHELL.addLayout(); await s(400);
    return window.PS_SHELL.project.charts.map(c => c.name);
});
ok(names.indexOf('Chart 2') !== -1 && names.indexOf('Layout 2') !== -1 &&
   names.indexOf('Chart 3') === -1,
   `with a layout in the project the next chart is Chart 2, not Chart 3 ` +
   `(${JSON.stringify(names)})`);

console.log('case 4: the layout toolbar is one finished row');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('layout'); await s(500);
});
const bar = await page.evaluate(() => {
    const row = document.querySelector('#ps-ltoolbar .ps-ltoolbar-row');
    const kids = Array.from(row.children).filter(k =>
        getComputedStyle(k).display !== 'none');
    const tops = kids.map(k => Math.round(k.getBoundingClientRect().top));
    const zoom = document.getElementById('ps-lzoom')
        .closest('.ps-ltool-group');
    return {
        oneRow: Math.max(...tops) - Math.min(...tops) < 8,
        zoomGap: Math.round(row.getBoundingClientRect().right -
                            zoom.getBoundingClientRect().right),
        pageInRail: document.getElementById('ps-inspector-layout')
            .contains(document.getElementById('ps-lpage'))
    };
});
ok(bar.oneRow, 'every toolbar control sits on ONE line (ZOOM used to wrap)');
ok(bar.zoomGap <= 8, `Zoom holds the right edge (${bar.zoomGap}px in)`);
ok(bar.pageInRail,
   'the page size lives in the rail PAGE section, beside Orientation');
// And the size controls still WORK from there: type a width.
await page.evaluate(() => {
    const box = document.getElementById('ps-lpage-w');
    box.value = '6';
    box.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
       Math.round(window.PS_SHELL.chart().page.w)) === 576,
   'typing a width in the rail still resizes the page (6 in = 576px)');

console.log('case 5: storage sizes read like a human wrote them');
await page.evaluate(() => window.PS_SHELL.runCommand('preferences'));
await page.waitForTimeout(1100);
const storage = await page.evaluate(() =>
    (document.getElementById('ps-pref-storage') || {}).textContent || '');
ok(!/\d\.00 MB/.test(storage) && !/\d{4,}(\.\d+)? MB/.test(storage),
   `no "3072.00 MB" style figures survive ` +
   `("...${storage.slice(-42)}")`);
await page.keyboard.press('Escape');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAUNCH EVAL FIXES CHECK PASS');
await browser.close();
