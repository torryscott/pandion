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

console.log('case 4: the Layout tools carry icons, reusing the workspace ' +
            'glyphs (Torry, Aug 6 2026)');
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await sleep(800);
    window.PS_SHELL.setWorkspace('layout'); await sleep(500);
});
const tools = await page.evaluate(() => {
    const sig = el => [...el.querySelectorAll('path,rect,circle')]
        .map(n => n.getAttribute('d') || n.getAttribute('x') ||
                  n.getAttribute('cx') || '').join('|');
    const btnSvg = id => document.querySelector('#' + id + ' svg');
    const wsSvg = ws => document.querySelector(
        '[data-ps-workspace="' + ws + '"] svg');
    return {
        all: ['ps-laddchart', 'ps-laddtext', 'ps-laddpin', 'ps-laddlabel',
              'ps-laddimage'].map(id => !!btnSvg(id)),
        chartMatches: sig(btnSvg('ps-laddchart')) === sig(wsSvg('chart')),
        notebookMatches: sig(btnSvg('ps-laddpin')) === sig(wsSvg('pinboard')),
    };
});
ok(tools.all.every(Boolean),
   'all five Layout tool buttons carry an icon beside their word');
ok(tools.chartMatches && tools.notebookMatches,
   'Add chart and From Notebook REUSE the workspace switcher glyphs, ' +
   'stroke for stroke - one icon per idea');

console.log('case 5: notebook sections join the rail between Charts and ' +
            'Layouts (Torry, Aug 6 2026)');
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.project.pinboards = [
        { id: 'b1', name: 'Results', pins: [] },
        { id: 'b2', name: 'Methods', pins: [] },
    ];
    window.PS_SHELL.project.ui.activeBoard = 'b1';
    window.PS_SHELL.setWorkspace('chart');
    await sleep(400);
});
const nav = await page.evaluate(() => {
    const sig = el => [...el.querySelectorAll('path,rect,circle')]
        .map(n => n.getAttribute('d') || n.getAttribute('x') ||
                  n.getAttribute('cx') || '').join('|');
    return {
        labels: [...document.querySelectorAll(
            '#ps-project-nav .ps-project-group-label')]
            .map(n => n.textContent),
        boards: [...document.querySelectorAll(
            '#ps-project-nav [data-project-board-id]')]
            .map(n => n.textContent.trim()),
        iconMatches: sig(document.querySelector(
            '#ps-project-nav [data-project-board-id] svg')) ===
            sig(document.querySelector(
                '[data-ps-workspace="pinboard"] svg')),
    };
});
ok(JSON.stringify(nav.labels) ===
   JSON.stringify(['Charts', 'Notebook', 'Layouts']),
   `the table of contents reads Charts / Notebook / Layouts ` +
   `(${nav.labels.join(' / ')})`);
ok(JSON.stringify(nav.boards) === JSON.stringify(['Results', 'Methods']) &&
   nav.iconMatches,
   'the sections list by name with the workspace switcher notebook glyph');
await page.click('#ps-project-nav [data-project-board-id="b2"]');
await page.waitForTimeout(500);
const jumped = await page.evaluate(() => ({
    ws: window.PS_SHELL.workspace(),
    board: window.PS_SHELL.project.ui.activeBoard,
    active: !!document.querySelector(
        '#ps-project-nav [data-project-board-id="b2"].ps-project-active'),
}));
ok(jumped.ws === 'pinboard' && jumped.board === 'b2' && jumped.active,
   'clicking a section jumps to the Notebook with THAT section open, ' +
   'row marked active');
// Parity (Torry, Aug 7 2026): the section rows carry the board TAB's
// own context menu - rename lands in the Notebook with the inline
// rename armed; delete works from anywhere.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(400);
await page.evaluate(() => {
    const row = document.querySelector(
        '#ps-project-nav [data-project-board-id="b2"]');
    const r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 20, clientY: r.top + 8 }));
});
await page.waitForTimeout(300);
const menu = await page.evaluate(() =>
    [...document.querySelectorAll('#ps-contextmenu [data-context-action]')]
        .map(b => b.getAttribute('data-context-action')));
ok(menu.includes('board-rename') && menu.includes('board-delete'),
   `the row offers the board tab's own menu (${menu.join(', ')})`);
await page.click('#ps-contextmenu [data-context-action="board-rename"]');
await page.waitForTimeout(500);
ok(await page.evaluate(() => ({
    ws: window.PS_SHELL.workspace(),
    input: !!document.querySelector('input[data-board-rename="b2"]'),
})).then(r => r.ws === 'pinboard' && r.input),
   'Rename jumps to the Notebook with the inline rename armed on that tab');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(300);
await page.evaluate(() => {
    const row = document.querySelector(
        '#ps-project-nav [data-project-board-id="b2"]');
    const r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 20, clientY: r.top + 8 }));
});
await page.waitForTimeout(250);
await page.click('#ps-contextmenu [data-context-action="board-delete"]');
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
       window.PS_SHELL.project.pinboards.length) === 1,
   'Delete section works from the rail, from any workspace');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('RAIL ICONS CHECK PASS');
await browser.close();
