// Torry, Jul 27 2026: "We updated the icons under Workspaces but not under
// Project. Was that on purpose, or should those match?" It was not on
// purpose - the cohesion pass moved the WORKSPACES rows to inline SVG and
// left the project list on the old Unicode glyphs (a striped square for
// charts, a boxed plus for layouts). The layouts pair happened to resemble
// each other, so only the charts one looked wrong.
//
// One kind of thing, one icon. This compares the RENDERED geometry of the
// two surfaces rather than the source strings, so a future edit to either
// one alone fails here.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);
// A layout as well as a chart, so both project rows exist.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout();
    await s(900);
});

console.log('case 1: the project list draws icons, not text glyphs');
const shape = await page.evaluate(() => {
    const sig = el => {
        if (!el) return null;
        const svg = el.querySelector('svg');
        if (!svg) return { text: (el.textContent || '').trim() };
        // Geometry, not markup: every shape command in document order.
        return { svg: Array.from(svg.querySelectorAll('path, rect, circle'))
            .map(n => n.tagName + ':' + (n.getAttribute('d') ||
                 [n.getAttribute('x'), n.getAttribute('y'),
                  n.getAttribute('width'), n.getAttribute('height')].join(',')))
            .join('|') };
    };
    const wsChart = document.querySelector(
        '[data-ps-workspace="chart"] .ps-nav-icon');
    const wsLayout = document.querySelector(
        '[data-ps-workspace="layout"] .ps-nav-icon');
    const items = Array.from(document.querySelectorAll(
        '#ps-project-nav .ps-project-item'));
    const projChart = items.find(b => !/Layout/.test(b.textContent || ''));
    const projLayout = items.find(b => /Layout/.test(b.textContent || ''));
    return {
        wsChart: sig(wsChart && wsChart), wsLayout: sig(wsLayout),
        projChart: sig(projChart && projChart.querySelector('.ps-nav-icon')),
        projLayout: sig(projLayout && projLayout.querySelector('.ps-nav-icon')),
        counts: items.length
    };
});
ok(shape.counts >= 2, `setup: the project list has a chart and a layout ` +
   `(${shape.counts} rows)`);
ok(shape.projChart && shape.projChart.svg,
   'a project CHART row draws a real icon rather than a text glyph');
ok(shape.projLayout && shape.projLayout.svg,
   'so does a project LAYOUT row');

console.log('case 2: chart rows carry their OWN analysis glyph');
// Torry, Jul 28 2026: with generic "Chart 2" names, the rail saying WHAT
// each chart is earns the glyphs. A Compare Groups row still matches the
// switcher's shared bar icon; other analyses draw their own; layouts keep
// the one layout icon everywhere.
ok(shape.projChart.svg === shape.wsChart.svg,
   'a Compare Groups row uses the shared bar glyph, same as the switcher');
ok(shape.projLayout.svg === shape.wsLayout.svg,
   'layout rows match the switcher layout icon');
ok(shape.wsChart.svg !== shape.wsLayout.svg,
   'while charts and layouts still read as different things');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addChart('xyplotbuilder'); await s(300);
    window.PS_SHELL.addChart('corrplotbuilder'); await s(500);
});
const perModule = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(
        '#ps-project-nav .ps-project-item'));
    const sig = b => {
        const svg = b.querySelector('.ps-nav-icon svg');
        return svg ? svg.innerHTML : '';
    };
    return rows.map(sig);
});
const unique = new Set(perModule.filter(Boolean));
ok(unique.size >= 3,
   `different analyses draw different glyphs ` +
   `(${unique.size} distinct icons across ${perModule.length} rows)`);

console.log('case 3: the icons inherit the row colour like the rest');
const inherits = await page.evaluate(() => {
    const svg = document.querySelector(
        '#ps-project-nav .ps-project-item .ps-nav-icon svg');
    return { stroke: svg.getAttribute('stroke'),
             w: Math.round(svg.getBoundingClientRect().width) };
});
ok(inherits.stroke === 'currentColor' && inherits.w >= 12 &&
   inherits.w <= 18,
   `it takes the row's own colour and sits at icon size ` +
   `(${inherits.stroke}, ${inherits.w}px)`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('RAIL ICONS CHECK PASS');
await browser.close();
