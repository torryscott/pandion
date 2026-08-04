// Punch list 45, 46 and 26: the workspace hierarchy.
//
//   45  every document appeared in the left project rail AND the tab strip, and
//       the active document's name appeared a THIRD time in a 48px workspace
//       heading whose glyph was the identical character as the tab's.
//   46  the properties rail opened with controls used once per document
//       (Document name, Duplicate, Delete) and put the controls used every few
//       seconds - the variable roles - at the bottom, below a 185px scrolling
//       list. On a 1366x768 Chromebook the Panels role was below the fold on a
//       fresh chart.
//   26  the chart pane was a rounded shadowed card floating in a padded scroll
//       region under a blurred sticky header, the marketing site's own recipe,
//       while the two panes beside it were already edge to edge. The same
//       functional element read as a floating pill in Charts and edge to edge
//       in Data, two clicks apart.
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
// The machine the item names, not a desktop: 1366x768 is where the Panels role
// went below the fold.
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);

console.log('case 1: the active document is named once, not three times (45)');
const names = await page.evaluate(() => {
    const heading = document.querySelector('.ps-workspace-heading');
    const tab = Array.from(document.querySelectorAll('#ps-tabs [data-chart-tab]'))
        .filter(t => t.getAttribute('aria-selected') === 'true' ||
                     t.className.indexOf('active') !== -1)[0]
        || document.querySelector('#ps-tabs button');
    const railItems = Array.from(
        document.querySelectorAll('#ps-project-nav .ps-project-item'));
    return { heading: !!heading,
             tabText: tab ? tab.textContent.trim() : null,
             rail: railItems.map(r => r.textContent.trim()),
             project: document.getElementById('ps-doc-name').textContent.trim() };
});
ok(!names.heading,
   'the sticky workspace heading is gone, with its blurred translucent header');
ok(names.tabText && names.rail.length >= 1,
   `the tab strip still names the active document and the rail still lists ` +
   `them (tab "${names.tabText}", rail ${JSON.stringify(names.rail)})`);
ok(names.project && names.project !== names.tabText,
   `and the app bar names the PROJECT, which is a different thing ` +
   `("${names.project}")`);

console.log('case 2: the roles lead; administration lives on the tab menu');
const order = await page.evaluate(() => {
    const slots = document.getElementById('ps-slots');
    const analysis = document.getElementById('ps-module');
    const sv = document.getElementById('ps-sizeview-toggle');
    return { rolesTop: Math.round(slots.getBoundingClientRect().top),
             analysisTop: Math.round(analysis.getBoundingClientRect().top),
             docGone: !document.getElementById('ps-inspector-document'),
             svCollapsed: !!sv &&
                 sv.getAttribute('aria-expanded') === 'false' };
});
ok(order.analysisTop < order.rolesTop,
   `the rail reads analysis, then roles ` +
   `(${order.analysisTop} / ${order.rolesTop})`);
ok(order.docGone,
   'the This-document section is GONE (Torry, Aug 2 2026): rename, ' +
   'duplicate and delete live on the tab and rail menus');
ok(order.svCollapsed,
   'and Size & view folds behind a collapsed disclosure, so the roles ' +
   'own the rail');
// the tab menu really covers what the section used to do
await page.evaluate(() => {
    const tab = document.querySelector('#ps-tabs .ps-tab[data-chart-id]');
    const r = tab.getBoundingClientRect();
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
});
await page.waitForTimeout(250);
const tabMenu = await page.evaluate(() => {
    const cmds = [...document.querySelectorAll(
        '#ps-contextmenu [data-context-command]')]
        .map(b => b.getAttribute('data-context-command'));
    return cmds;
});
ok(['rename-document', 'duplicate-document', 'delete-document']
       .every(c => tabMenu.includes(c)),
   `the tab menu owns rename, duplicate and delete (${tabMenu.join(', ')})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

const fold = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#ps-slots .ps-role-card'));
    const last = cards[cards.length - 1];
    const r = last.getBoundingClientRect();
    return { key: last.getAttribute('data-role-key'),
             bottom: Math.round(r.bottom),
             limit: window.innerHeight,
             count: cards.length };
});
ok(fold.count === 4,
   `setup: a fresh Compare Groups chart offers four roles (${fold.count})`);
ok(fold.bottom <= fold.limit,
   `and the LAST of them fits on a 1366x768 Chromebook without scrolling ` +
   `(${fold.key} ends at ${fold.bottom} of ${fold.limit})`);
ok(fold.limit - fold.bottom >= 8,
   `with real margin rather than a coincidence ` +
   `(${fold.limit - fold.bottom}px to spare)`);

console.log('case 3: the chart pane is a pane, not a card (26)');
const pane = await page.evaluate(() => {
    const main = document.querySelector('.ps-main-workspace');
    const card = document.getElementById('ps-workcard');
    const cs = getComputedStyle(card);
    const mcs = getComputedStyle(main);
    return { padding: mcs.padding, radius: cs.borderRadius,
             shadow: cs.boxShadow, borderW: cs.borderTopWidth,
             hScroll: main.scrollWidth > main.clientWidth,
             cardW: Math.round(card.getBoundingClientRect().width),
             mainW: Math.round(main.getBoundingClientRect().width) };
});
ok(pane.radius === '0px' && (pane.shadow === 'none' || !pane.shadow),
   `the chart pane has no radius and no elevation of its own ` +
   `(${pane.radius}, ${pane.shadow})`);
ok(pane.padding === '0px',
   `and it is not floating inside a padded region (${pane.padding})`);
ok(pane.cardW === pane.mainW,
   `so it fills the pane edge to edge, like the data grid beside it ` +
   `(${pane.cardW} of ${pane.mainW})`);

ok(!pane.hScroll,
   'and at 1366px the pane does not scroll sideways');
// Half of the sideways-scroll band the item names belonged to the PANE
// (#ps-workcard carried min-width: 680px) and is gone. The other half is the
// CHART: the templates ship a fixed 6x4 inch plot, so below about 1240px the
// engine's own 576px svg overflows. That is item 27, measured here rather than
// asserted away, so this probe cannot claim a fix it did not make.
{
    await page.setViewportSize({ width: 900, height: 768 });
    await page.waitForTimeout(500);
    const narrow = await page.evaluate(() => {
        const m = document.querySelector('.ps-main-workspace');
        const card = document.getElementById('ps-workcard');
        const svg = Array.from(document.querySelectorAll(
            '.graphbuilder2-host svg')).sort((a, b) =>
            b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
        return { cardMin: getComputedStyle(card).minWidth,
                 overflow: m.scrollWidth - m.clientWidth,
                 chartW: svg ? Math.round(svg.getBoundingClientRect().width) : 0 };
    });
    ok(narrow.cardMin === '0px',
       `the pane's own 680px min-width is gone (${narrow.cardMin})`);
    ok(narrow.overflow <= 0 || narrow.chartW >= narrow.overflow,
       `and what still overflows at 900px is the engine's fixed-size chart, ` +
       `not the pane (${narrow.overflow}px past the pane, chart ` +
       `${narrow.chartW}px wide: item 27)`);
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('HIERARCHY CHECK PASS');
await browser.close();
