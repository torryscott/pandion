// "Set as default for new charts" must hold on every route into a chart,
// and for every chart in a session - not just the first one, on the one
// route the older probe happened to drive.
//
// TWO GATES, both of which had to be open and only one of which was.
//
// 1. THE SHELL GATE. The library bridge sets payload.styleAutoApply from
//    `libDoc.styleStamp === false`. An ABSENT stamp deliberately means "an
//    older saved document, never silently restyle it" - that guard is right
//    and case 5 pins it. But only newChart() ever set the flag, so the
//    first chart built by loadSample() and by resetDocumentsForNewData()
//    looked like an old document. A starred default applied on the "+" tab
//    route and did nothing after an import or an example dataset, which is
//    every route a real user takes into their first chart.
//
// 2. THE ENGINE GATE, which is why fixing the first alone would not have
//    worked. graphbuilder2.js guards the apply with the window-global
//    __gb2_styleAutoApplyDone. In jamovi an analysis owns its window, so
//    once per window IS once per chart. Here one window hosts every chart
//    for the whole session, so the SECOND eligible chart onwards was
//    skipped even after the bridge had said yes - measured before the fix,
//    chart 3 reported styleAutoApply true and received nothing. The shell
//    re-arms the flag per eligible chart at its own render call site; no
//    engine change, and jamovi is untouched.
//
// Case 2 is the one that would have caught gate 2 on its own.
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

const STYLE_INK = '#8b1a1a';   // nothing on a stock chart is this colour
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(Number(process.env.PS_BOOT || 1200));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1700);

const machineId = await page.evaluate(() =>
    window.PS_SHELL.libraries().machineId);
await page.evaluate(([mid, ink]) => {
    window.setOption('styleLibrary', JSON.stringify({
        kind: 'savedefault', name: 'Routes probe style',
        groups: ['text'], opts: { chartTextColor: ink },
        machineId: mid, timestamp: Date.now()
    }));
}, [machineId, STYLE_INK]);
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
    window.PS_SHELL.buildPayload().styleDefaultId === 'Routes probe style'),
   'a default style is starred, so every case below has something to apply');

// A chart with no variables builds no payload, so each freshly created
// chart gets its two roles first. setRoles is the shell's own accessor and
// runs the full validateRoles / persist / syncAll / render path.
const withRoles = async (x, y) => {
    await page.evaluate(([xv, yv]) => window.PS_SHELL.setRoles('plotbuilder',
        { xvar: xv, yvar: yv }), [x, y]);
    await page.waitForTimeout(1600);
};
// The user-facing fact, not the internal flag: did the starred style's ink
// reach the chart? Read from the payload the engine draws from AND from
// the pixels, so this cannot pass on bookkeeping alone.
const applied = () => page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const p = window.PS_SHELL.buildPayload();
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.getBoundingClientRect().width -
                        a.getBoundingClientRect().width)[0];
    const t = svg && svg.querySelector('text');
    return { id: c.id,
             hasOwnStamp:
                 Object.prototype.hasOwnProperty.call(c, 'styleStamp'),
             ink: (p && p.chartTextColor) || '',
             drawn: t ? getComputedStyle(t).fill : null };
});
const openLoader = () => page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
        .find(x => /^\s*Open\s*$/.test(x.textContent) &&
                   x.getBoundingClientRect().width > 0);
    b.click();
});
const addChartTab = async () => {
    await page.click('.ps-tab-add');
    await page.waitForTimeout(400);
    await page.click('#ps-analysis-grid [data-analysis-module="plotbuilder"]');
    await page.waitForTimeout(400);
};

console.log('case 1: the "+" tab route (the one the old probe covered)');
await addChartTab();
await withRoles('condition', 'score');
const plus = await applied();
ok(plus.ink === STYLE_INK,
   `a chart from the + tab takes the default style (${plus.ink})`);
ok(plus.drawn === 'rgb(139, 26, 26)',
   `and it is on the pixels, not just the payload (${plus.drawn})`);

console.log('case 2: a SECOND chart in the same session (the window one-shot)');
await addChartTab();
await withRoles('condition', 'score');
const second = await applied();
ok(second.id !== plus.id, `it really is a different chart (${second.id})`);
ok(second.ink === STYLE_INK,
   'the second eligible chart takes it too, so the apply is once per ' +
   'chart and not once per browser tab');

console.log('case 3: a pasted dataset, the route that replaces the project');
await openLoader();
await page.waitForTimeout(500);
await page.fill('#ps-paste', 'grp,val\nAlpha,3\nAlpha,5\nBeta,8\nBeta,9\n');
await page.click('#ps-paste-use');
await page.waitForTimeout(700);
await page.click('button:has-text("Import data")');
await page.waitForTimeout(1600);
ok(await page.evaluate(() =>
    window.PS_SHELL.project.table.order.join(',')) === 'grp,val',
   'the paste really replaced the project data');
await withRoles('grp', 'val');
ok((await applied()).ink === STYLE_INK,
   'the first chart after replacing the data takes it');

console.log('case 4: an example dataset');
await openLoader();
await page.waitForTimeout(500);
await page.click('#ps-sample');
await page.waitForTimeout(2000);
ok((await applied()).ink === STYLE_INK,
   'the first chart of an example dataset takes it');

console.log('case 5: a RESTORED older project is still never silently restyled');
// The complement, and the reason this is not just "stamp everything". A
// version-2 snapshot predates the bridge, so its chart may already carry a
// look chosen by hand. Driven the real way: put one in storage and reload,
// which is how a returning user meets it.
await page.evaluate(() => {
    localStorage.setItem('psstandalone.project.v2', JSON.stringify({
        version: 2, id: 'p_old', name: 'Old project',
        module: 'plotbuilder', roles: { xvar: 'a', yvar: 'b' }, options: {},
        table: { name: 'old', order: ['a', 'b'],
                 columns: { a: ['x', 'x', 'y', 'y'], b: [1, 2, 3, 4] },
                 types: { a: 'nominal', b: 'continuous' },
                 raw: { a: ['x', 'x', 'y', 'y'], b: ['1', '2', '3', '4'] } }
    }));
});
await page.reload();
await page.waitForTimeout(Number(process.env.PS_BOOT || 1200));
await page.evaluate(() => {
    const c = document.getElementById('ps-welcome-continue') ||
              document.getElementById('ps-welcome-close');
    if (c && c.getBoundingClientRect().width > 0) c.click();
});
await page.waitForTimeout(2200);
const old = await applied();
ok(await page.evaluate(() => window.PS_SHELL.project.name) === 'Old project',
   'the v2 project really was migrated and opened');
ok(old.hasOwnStamp === false,
   'a migrated v2 chart carries no stamp, so the bridge never clears it');
ok(old.ink !== STYLE_INK,
   `and it keeps its own look (${old.ink || 'engine default'})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('DEFAULT STYLE ROUTES: PASS');
await browser.close();
