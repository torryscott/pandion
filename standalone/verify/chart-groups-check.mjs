// Chart groups (planning/CHART-GROUPS-SPEC.md, approved by Torry Jul 31
// 2026, revised by him Aug 10 2026). The structural decision under test
// everywhere here: A GROUP IS A SPACE. The tab strip shows the charts of
// the group you are in and nothing else, the ungrouped charts are a space
// too, and the rail is the space switcher. A project with no groups
// renders ZERO group chrome, on the rail and in the strip alike.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1200);
}
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addChart('plotbuilder');
    window.PS_SHELL.addChart('xyplotbuilder');
    window.PS_SHELL.addChart('distplotbuilder');
    await s(400);
});
const railHeads = () => page.evaluate(() =>
    [...document.querySelectorAll('#ps-project-nav .ps-project-ghead')]
        .map(h => h.textContent.trim()));
const tabOrder = () => page.evaluate(() =>
    [...document.querySelectorAll('.ps-tab[data-chart-id]')]
        .map(t => t.getAttribute('data-chart-id')).join(','));

console.log('case 1: a flat project renders zero group chrome');
ok((await railHeads()).length === 0, 'no headers, nothing to learn until used');

console.log('case 2: move-to-group via the REAL context menu; strip scopes');
const tabsBefore = await tabOrder();
const p2moved = await page.evaluate(() => document.querySelectorAll(
    '#ps-project-nav [data-project-chart-id]')[1]
    .getAttribute('data-project-chart-id'));
await page.locator('#ps-project-nav [data-project-chart-id]').nth(1)
    .click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="move-to-group"]');
await page.waitForTimeout(250);
await page.click('[data-context-action="group-new"]');
await page.waitForTimeout(350);
ok(await page.evaluate(() => {
    const i = document.querySelector('#ps-project-nav input[data-group-rename]');
    return !!i && document.activeElement === i;
}), 'New group arms rename-in-place, focused, never a dialog');
await page.keyboard.type('Extinction');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
ok((await railHeads()).some(h => h.includes('Extinction')),
   'the header renders with the typed name');
ok(await page.evaluate(() =>
       document.querySelectorAll('.ps-project-item-grouped').length) === 1,
   'with its member indented beneath it');
const p2tabs = await tabOrder();
ok(p2tabs === tabsBefore.split(',').filter(id => id !== p2moved).join(','),
   'and the strip shows only the space the ACTIVE chart is in, so the ' +
   'chart that just joined a group has left it (' + p2tabs + ')');

console.log('case 3: collapse hides rows, shows the count, active auto-expands');
// Put a second chart in, then make a NON-member active so collapse hides.
await page.locator('#ps-project-nav [data-project-chart-id]').nth(2)
    .click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="move-to-group"]');
await page.waitForTimeout(250);
await page.click('[data-context-action="group-Extinction"]');
await page.waitForTimeout(350);
await page.evaluate(() => window.PS_SHELL.switchChart(
    window.PS_SHELL.project.charts.filter(c => !c.group)[0].id));
await page.waitForTimeout(300);
await page.click('.ps-project-ghead');
await page.waitForTimeout(300);
const folded = await page.evaluate(() => ({
    members: document.querySelectorAll('.ps-project-item-grouped').length,
    count: (document.querySelector('.ps-project-gcount') || {}).textContent,
    stored: window.PS_SHELL.project.ui.collapsedGroups,
}));
ok(folded.members === 0 && folded.count === '2' && folded.stored.Extinction,
   `collapse hides both rows and badges the count (${JSON.stringify(folded)})`);
// Activate a member: the group renders expanded WITHOUT clearing the fold.
await page.evaluate(() => window.PS_SHELL.switchChart(
    window.PS_SHELL.project.charts.filter(c => c.group === 'Extinction')[0].id));
await page.waitForTimeout(300);
const autoExp = await page.evaluate(() => ({
    members: document.querySelectorAll('.ps-project-item-grouped').length,
    stillStored: !!window.PS_SHELL.project.ui.collapsedGroups.Extinction,
}));
ok(autoExp.members === 2 && autoExp.stillStored,
   'the active chart auto-expands its group without mutating the stored fold');
// THE FIELD BUG (Torry, Jul 31 2026): with the active chart INSIDE the
// group, a header click used to toggle the fold invisibly - the standing
// auto-expand swallowed it and the group read as uncollapsible. An
// explicit click must always win: collapse NOW, active member or not.
await page.click('.ps-project-ghead');
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       document.querySelectorAll('.ps-project-item-grouped').length) === 0,
   'a header click collapses even while the active chart is inside (the ' +
   'uncollapsible-group field bug)');
await page.click('.ps-project-ghead');
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       document.querySelectorAll('.ps-project-item-grouped').length) === 2,
   'and the next click expands again: every click visibly acts');

console.log('case 4: rename rewrites members; a name collision merges');
await page.locator('.ps-project-ghead').first().click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="group-rename"]');
await page.waitForTimeout(300);
await page.evaluate(() => {
    const i = document.querySelector('input[data-group-rename]');
    i.value = 'Extinction curves';
});
await page.keyboard.press('Enter');
await page.waitForTimeout(350);
ok(await page.evaluate(() =>
       window.PS_SHELL.project.charts.filter(
           c => c.group === 'Extinction curves').length) === 2,
   'rename rewrote every member');
// Collision: a second group renamed to "extinction curves" merges, case-
// insensitively, adopting the existing display casing.
await page.locator('#ps-project-nav [data-project-chart-id]').first()
    .click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="move-to-group"]');
await page.waitForTimeout(250);
await page.click('[data-context-action="group-new"]');
await page.waitForTimeout(350);
await page.keyboard.type('extinction curves');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const merged = await page.evaluate(() => ({
    groups: [...new Set(window.PS_SHELL.project.charts
        .filter(c => c.group).map(c => c.group))],
    toast: (document.getElementById('ps-toast') || {}).textContent || '',
}));
ok(merged.groups.length === 1 && merged.groups[0] === 'Extinction curves',
   `case-insensitive collision merged into the existing casing ` +
   `(${JSON.stringify(merged.groups)})`);
ok(/Merged into Extinction curves/.test(merged.toast),
   'and said so in a toast');

console.log('case 5: groups and folds survive the real save/load round trip');
const reloaded = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const text = window.PS_SHELL.projectFileText();
    window.PS_SHELL.readPickedFile(new File([text], 'grouped.pand',
        { type: 'application/json' }));
    await s(1200);
    return {
        name: window.PS_SHELL.project.name,
        groups: window.PS_SHELL.project.charts
            .filter(c => c.group).map(c => c.group),
    };
});
ok(reloaded.groups.length === 3 &&
   reloaded.groups.every(g => g === 'Extinction curves'),
   `a .pand round trip keeps every membership (${reloaded.groups.length})`);
// Backward: a version-3 file with the fields STRIPPED loads flat.
const flatLoad = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const p = JSON.parse(window.PS_SHELL.projectFileText());
    const proj = p.project || p;
    proj.charts.forEach(c => { delete c.group; });
    delete proj.ui.collapsedGroups;
    window.PS_SHELL.readPickedFile(new File([JSON.stringify(p)],
        'pregroups.pand', { type: 'application/json' }));
    await s(1200);
    return {
        headers: document.querySelectorAll('.ps-project-ghead').length,
        charts: window.PS_SHELL.project.charts.length,
    };
});
ok(flatLoad.headers === 0 && flatLoad.charts >= 4,
   'a pre-groups file loads flat with zero chrome (backward compatible)');

console.log('case 6: Ungroup keeps the charts; Delete removes with an undo');
// Rebuild one group on the flat project.
await page.locator('#ps-project-nav [data-project-chart-id]').nth(1)
    .click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="move-to-group"]');
await page.waitForTimeout(250);
await page.click('[data-context-action="group-new"]');
await page.waitForTimeout(350);
await page.keyboard.type('Doomed');
await page.keyboard.press('Enter');
await page.waitForTimeout(350);
const beforeDelete = await page.evaluate(() =>
    window.PS_SHELL.project.charts.length);
await page.locator('.ps-project-ghead').first().click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="group-ungroup"]');
await page.waitForTimeout(350);
ok(await page.evaluate(() => window.PS_SHELL.project.charts.length) ===
   beforeDelete &&
   (await railHeads()).length === 0,
   'Ungroup dissolved the group and kept every chart');
// Delete: group a chart again, delete the group, undo restores.
await page.locator('#ps-project-nav [data-project-chart-id]').nth(1)
    .click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="move-to-group"]');
await page.waitForTimeout(250);
await page.click('[data-context-action="group-new"]');
await page.waitForTimeout(350);
await page.keyboard.type('Doomed');
await page.keyboard.press('Enter');
await page.waitForTimeout(350);
await page.locator('.ps-project-ghead').first().click({ button: 'right' });
await page.waitForTimeout(250);
await page.click('[data-context-action="group-delete"]');
await page.waitForTimeout(400);
ok(await page.evaluate(() => window.PS_SHELL.project.charts.length) ===
   beforeDelete - 1,
   'Delete removed the group and its chart');
await page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item button');
    items[items.length - 1].click();   // the newest toast's Undo
});
await page.waitForTimeout(400);
const undone = await page.evaluate(() => ({
    n: window.PS_SHELL.project.charts.length,
    grouped: window.PS_SHELL.project.charts
        .filter(c => c.group === 'Doomed').length,
}));
ok(undone.n === beforeDelete && undone.grouped === 1,
   `the toast Undo restored the chart and its membership ` +
   `(${JSON.stringify(undone)})`);

console.log('case 7: opening a data file resets groups with the documents');
await page.evaluate(() => {
    window.PS_SHELL.readPickedFile(new File(
        ['a,b\n1,2\n3,4\n'], 'fresh.csv', { type: 'text/csv' }));
});
await page.waitForSelector('#ps-import-use', { state: 'visible',
                                               timeout: 8000 });
await page.click('#ps-import-use');
await page.waitForTimeout(800);
ok(await page.evaluate(() =>
       window.PS_SHELL.project.charts.length === 1 &&
       !window.PS_SHELL.project.charts[0].group) &&
   (await railHeads()).length === 0,
   'a CSV open replaces the documents, groups included (t4-67 extended)');

console.log('case 8: charts group by DRAG, the way every desktop teaches');
// The only way into a group was right-click, Move to group, second menu.
// Now a chart row drops ONTO another chart (the middle band) to form a
// group of the two, named exactly once in place, onto a group header to
// join it, and a grouped chart drops onto the Charts label to leave. The
// row EDGES mean between, which is reorder, case 9. Ring means onto, the
// insertion line means between, one vocabulary across the rail. The menu
// path survives untouched.
await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    while (window.PS_SHELL.charts().filter(c => c.type !== 'layout').length < 3) {
        window.PS_SHELL.addChart(); await w(600);
    }
    // start clean: no groups
    window.PS_SHELL.charts().forEach(c => { delete c.group; });
});
await page.waitForTimeout(800);
const p8ids = await page.evaluate(() =>
    window.PS_SHELL.charts().filter(c => c.type !== 'layout')
        .map(c => c.id).slice(0, 3));
const p8state = () => page.evaluate(() => ({
    groups: window.PS_SHELL.charts().filter(c => c.type !== 'layout')
        .map(c => c.group || ''),
    renameOpen: !!document.querySelector('[data-group-rename]')
}));
const p8mid = id => page.evaluate(x => {
    const n = document.querySelector('[data-project-chart-id="' + x + '"]');
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, id);
let p8a = await p8mid(p8ids[0]), p8b = await p8mid(p8ids[1]);
await page.mouse.move(p8a.x, p8a.y);
await page.mouse.down();
await page.mouse.move(p8a.x + 2, p8a.y + 10, { steps: 2 });
await page.mouse.move(p8b.x, p8b.y, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(600);
const p8c = await p8state();
ok(p8c.groups[0] && p8c.groups[0] === p8c.groups[1] && !p8c.groups[2],
   'dropping one chart on another makes a group of exactly those two (' +
   p8c.groups.join(',') + ')');
ok(p8c.renameOpen,
   "with the name armed for typing in place, the menu path's own idiom");
await page.keyboard.type('Figure pair');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const p8head = await page.evaluate(() => {
    const h = document.querySelector('[data-group-name]');
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2,
             name: h.getAttribute('data-group-name') };
});
ok(p8head.name === 'Figure pair', 'the typed name landed (' + p8head.name + ')');
let p8m = await p8mid(p8ids[2]);
await page.mouse.move(p8m.x, p8m.y);
await page.mouse.down();
await page.mouse.move(p8m.x + 2, p8m.y - 10, { steps: 2 });
await page.mouse.move(p8head.x, p8head.y, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(600);
ok((await p8state()).groups.every(g => g === 'Figure pair'),
   'dropping a third chart on the header joins it');
const p8label = await page.evaluate(() => {
    const l = [...document.querySelectorAll('.ps-project-group-label')]
        .find(x => x.textContent === 'Charts');
    const r = l.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
p8m = await p8mid(p8ids[2]);
await page.mouse.move(p8m.x, p8m.y);
await page.mouse.down();
await page.mouse.move(p8m.x + 2, p8m.y - 10, { steps: 2 });
await page.mouse.move(p8label.x, p8label.y, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(600);
const p8u = await p8state();
ok(p8u.groups[2] === '' && p8u.groups[0] === 'Figure pair',
   'and dropping a member on the Charts label takes it back out (' +
   p8u.groups.join(',') + ')');
const p8was = await page.evaluate(() => window.PS_SHELL.chart().id);
let p8r = await p8mid(p8ids[0]);
await page.mouse.click(p8r.x, p8r.y);
await page.waitForTimeout(500);
ok(await page.evaluate(() => window.PS_SHELL.chart().id) === p8ids[0],
   'a press that never travels is still a click, and activates the chart');

console.log('case 9: the row edges reorder, and the tab strip follows');
// The middle of a row groups; the top and bottom bands are BETWEEN, the
// springboard split. A between-drop reorders PROJECT.charts, which is the
// tab strip's own order, and the chart adopts the group of the row it
// lands beside, so sliding into a group's span joins at that position and
// sliding out to the flat rows leaves. Before the zones, an edge drop
// grouped instead of reordering, and before the sync fix a TAB drag left
// the rail showing the old order.
await page.evaluate(() => {
    window.PS_SHELL.charts().forEach(c => { delete c.group; });
});
await page.waitForTimeout(700);
const p9state = () => page.evaluate(() => ({
    array: window.PS_SHELL.charts().filter(c => c.type !== 'layout')
        .map(c => c.id),
    tabs: [...document.querySelectorAll('#ps-tabs .ps-tab')]
        .map(t => t.getAttribute('data-chart-id')).filter(Boolean),
    rail: [...document.querySelectorAll('[data-project-chart-id]')]
        .map(r => r.getAttribute('data-project-chart-id')),
    groups: window.PS_SHELL.charts().filter(c => c.type !== 'layout')
        .map(c => c.group || '')
}));
const p9rect = id => page.evaluate(x => {
    const n = document.querySelector('[data-project-chart-id="' + x + '"]');
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, bottom: r.bottom,
             midY: r.top + r.height / 2 };
}, id);
const p9s0 = await p9state();
let p9a = await p9rect(p9s0.array[0]);
let p9c = await p9rect(p9s0.array[2]);
await page.mouse.move(p9a.x, p9a.midY);
await page.mouse.down();
await page.mouse.move(p9a.x + 2, p9a.midY + 10, { steps: 2 });
await page.mouse.move(p9c.x, p9c.bottom - 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);
const p9s1 = await p9state();
ok(p9s1.array.join() ===
   [p9s0.array[1], p9s0.array[2], p9s0.array[0]]
       .concat(p9s0.array.slice(3)).join(),
   'an edge drop below the third chart reorders rather than grouping (' +
   p9s1.array.join(',') + ')');
ok(p9s1.groups.every(g => g === ''),
   'and no group was created by it');
ok(p9s1.tabs.join() === p9s1.array.join(),
   'the tab strip shows the same order immediately (' +
   p9s1.tabs.join(',') + ')');
ok(p9s1.rail.join() === p9s1.array.join(),
   'and so does the rail');
// group two, then slide the loose third INTO the group's span by its edge
let p9x = await p9rect(p9s1.array[0]);
let p9y = await p9rect(p9s1.array[1]);
await page.mouse.move(p9x.x, p9x.midY);
await page.mouse.down();
await page.mouse.move(p9x.x + 2, p9x.midY + 10, { steps: 2 });
await page.mouse.move(p9y.x, p9y.midY, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(600);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const p9s2 = await p9state();
const p9loose = p9s2.array[p9s2.groups.indexOf('')];
const p9first = p9s2.array[p9s2.groups.findIndex(g => g !== '')];
let p9l = await p9rect(p9loose);
let p9f = await p9rect(p9first);
await page.mouse.move(p9l.x, p9l.midY);
await page.mouse.down();
await page.mouse.move(p9l.x + 2, p9l.midY - 10, { steps: 2 });
await page.mouse.move(p9f.x, p9f.bottom - 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);
const p9s3 = await p9state();
ok(p9s3.groups.filter(g => g !== '').length === 3 &&
   p9s3.array.indexOf(p9loose) === p9s3.array.indexOf(p9first) + 1,
   'an edge drop inside a group joins it AT that position (' +
   p9s3.array.join(',') + ' with ' + p9s3.groups.join(',') + ')');

console.log('case 10: one container rule for the whole rail');
// A chart group and a Notebook section are the same kind of thing, so
// they read the same way: no chevron, an identity glyph, and the ROW is
// the toggle. The group wears the chart mark with a second chart behind
// it, the section wears its notebook, so they rhyme without being the
// same picture. A chevron on the group and a glyph on the section were
// each tried on the way here and each read as clutter.
const p10 = () => page.evaluate(() => {
    const head = document.querySelector('#ps-project-nav .ps-project-ghead');
    const board = document.querySelector(
        '#ps-project-nav [data-project-board-id]');
    const svg = el => {
        const s = el && el.querySelector('.ps-nav-icon svg');
        return s ? s.innerHTML.replace(/\s+/g, ' ').trim() : null;
    };
    return {
        headChevron: !!(head && head.querySelector('.ps-project-gchev')),
        headGlyph: svg(head), boardGlyph: svg(board),
        headAria: head ? head.getAttribute('aria-expanded') : null,
        members: document.querySelectorAll(
            '.ps-project-item-grouped[data-project-chart-id]').length
    };
});
const p10a = await p10();
ok(!p10a.headChevron,
   'the group header carries no chevron, like the section rows');
ok(p10a.headGlyph && p10a.boardGlyph,
   'both containers carry an identity glyph');
ok(p10a.headGlyph !== p10a.boardGlyph,
   'and the two glyphs differ, so a group is not mistaken for a section');
ok(/rect|path/.test(p10a.headGlyph) && p10a.headGlyph.indexOf('opacity') !== -1,
   'the group glyph is the chart mark with a second chart behind it');
ok(p10a.members > 0 && p10a.headAria === 'true',
   'the group is open and listing its charts (' + p10a.members + ')');
await page.click('#ps-project-nav .ps-project-ghead');
await page.waitForTimeout(400);
const p10b = await p10();
ok(p10b.members === 0 && p10b.headAria === 'false',
   'a click on the row folds it, no chevron needed');
await page.click('#ps-project-nav .ps-project-ghead');
await page.waitForTimeout(400);
ok((await p10()).members === p10a.members,
   'and a second click opens it again');
// The group header used to carry border 0 and an 8px left pad while every
// row carries a 1px transparent border and 12px, so its glyph sat 5px left
// of the section's. Measured against each other, not against a number, so
// the check survives a change to the row padding.
const p10align = await page.evaluate(() => {
    const L = el => el ? +el.getBoundingClientRect().left.toFixed(1) : null;
    const ico = el => el && el.querySelector('.ps-nav-icon');
    const head = document.querySelector('#ps-project-nav .ps-project-ghead');
    const board = document.querySelector(
        '#ps-project-nav [data-project-board-id]');
    const member = document.querySelector(
        '.ps-project-item-grouped[data-project-chart-id]');
    const pin = document.querySelector('[data-project-pin-id]');
    return { groupRow: L(head), sectionRow: L(board),
             groupIcon: L(ico(head)), sectionIcon: L(ico(board)),
             memberRow: L(member), pageRow: L(pin) };
});
ok(p10align.groupRow === p10align.sectionRow,
   'a group header and a section row start on the same vertical (' +
   p10align.groupRow + ' and ' + p10align.sectionRow + ')');
ok(p10align.groupIcon === p10align.sectionIcon,
   'and so do their glyphs, which is what the eye actually reads (' +
   p10align.groupIcon + ' and ' + p10align.sectionIcon + ')');
if (p10align.pageRow !== null)
    ok(p10align.memberRow === p10align.pageRow,
       'grouped charts and notebook pages share one member indent (' +
       p10align.memberRow + ' and ' + p10align.pageRow + ')');

console.log('case 11: a group is a SPACE, so the strip shows one at a time');
// Torry, Aug 10 2026, revising the spec's original rail-only rule. On the
// build before this one the strip listed every chart in the project
// whatever group was active, and eight of the assertions below fail there.
const p11 = () => page.evaluate(() => ({
    order: window.PS_SHELL.charts().filter(c => c.type !== 'layout')
        .map(c => c.id),
    groups: window.PS_SHELL.charts().filter(c => c.type !== 'layout')
        .map(c => c.group || ''),
    tabs: [...document.querySelectorAll('#ps-tabs .ps-tab[data-chart-id]')]
        .map(t => t.getAttribute('data-chart-id')),
    scope: (document.querySelector('.ps-tab-scope-name') || {}).textContent
        || null,
    label: document.querySelector('.ps-tablist-inner')
        .getAttribute('aria-label'),
    active: window.PS_SHELL.chart().id
}));
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.charts().forEach(c => { delete c.group; });
    // Two in and two out, or the scoped list and the whole list coincide
    // and half of this case would pass on the build it is meant to catch.
    while (S.charts().filter(c => c.type !== 'layout').length < 4) {
        S.addChart('plotbuilder');
        await s(400);
    }
    const cs = S.charts().filter(c => c.type !== 'layout');
    cs[0].group = 'Main figures';
    cs[1].group = 'Main figures';
    S.switchChart(cs[0].id);
    await s(500);
});
await page.waitForTimeout(500);
const p11a = await p11();
const p11in = p11a.order.filter((id, i) => p11a.groups[i] === 'Main figures');
const p11out = p11a.order.filter((id, i) => p11a.groups[i] === '');
ok(p11in.length === 2 && p11out.length >= 2,
   'fixture: two charts in a group and at least two outside it');
ok(p11a.tabs.join() === p11in.join(),
   'inside a group the strip shows that group and nothing else (' +
   p11a.tabs.join(',') + ')');
ok(p11a.scope === 'Main figures',
   'and names the space it is showing, since the rail is off to the side');
ok(p11a.label === 'Chart documents in Main figures',
   'the tablist says which space to a screen reader too');
await page.evaluate(async (id) => {
    window.PS_SHELL.switchChart(id);
    await new Promise(r => setTimeout(r, 400));
}, p11out[0]);
await page.waitForTimeout(400);
const p11b = await p11();
ok(p11b.tabs.join() === p11out.join(),
   'the ungrouped charts are a space of their own (' +
   p11b.tabs.join(',') + ')');
ok(p11b.scope === null && p11b.label === 'Chart documents',
   'wearing no tag, so a project with no groups looks exactly as it did');
await page.evaluate(async (id) => {
    const S = window.PS_SHELL;
    S.switchChart(id);
    await new Promise(r => setTimeout(r, 400));
    S.addChart('plotbuilder');
    await new Promise(r => setTimeout(r, 600));
}, p11in[0]);
await page.waitForTimeout(500);
const p11c = await p11();
ok(p11c.groups[p11c.order.indexOf(p11c.active)] === 'Main figures' &&
   p11c.tabs.indexOf(p11c.active) !== -1,
   'a new chart is born in the space you are looking at, so adding one ' +
   'never swaps the strip out from under you');
const p11tab = k => page.evaluate(i => {
    const t = [...document.querySelectorAll(
        '#ps-tabs .ps-tab[data-chart-id]')][i];
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2,
             right: r.right - 3 };
}, k);
const p11d0 = await p11tab(0);
const p11dN = await p11tab(p11c.tabs.length - 1);
await page.mouse.move(p11d0.x, p11d0.y);
await page.mouse.down();
await page.mouse.move(p11d0.x + 8, p11d0.y, { steps: 3 });
await page.mouse.move(p11dN.right, p11d0.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);
const p11d = await p11();
ok(p11d.tabs.join() ===
       p11c.tabs.slice(1).concat(p11c.tabs[0]).join(),
   'a tab drag reorders inside the space (' + p11d.tabs.join(',') + ')');
ok(p11out.every(id =>
       p11d.order.indexOf(id) === p11c.order.indexOf(id)),
   'and leaves every chart outside it at the index it already held');
await page.keyboard.press('Alt+Digit2');
await page.waitForTimeout(500);
const p11e = await p11();
ok(p11e.active === p11e.tabs[1] &&
   p11e.groups[p11e.order.indexOf(p11e.active)] === 'Main figures',
   'Alt+2 picks the second tab in this space, not the second chart in ' +
   'the project');
// Close a chart INSIDE the group while the group still holds others, so
// the replacement is a real choice rather than the only chart left.
const p11last = p11e.order.filter(
    (id, i) => p11e.groups[i] === 'Main figures').pop();
await page.evaluate(async (id) => {
    window.PS_SHELL.switchChart(id);
    await new Promise(r => setTimeout(r, 400));
}, p11last);
await page.waitForTimeout(300);
await page.evaluate(() => {
    document.querySelector('#ps-tabs .ps-tab-active .ps-tab-x').click();
});
await page.waitForTimeout(800);
const p11f = await p11();
ok(p11f.groups[p11f.order.indexOf(p11f.active)] === 'Main figures',
   'closing a tab lands on a neighbour in the same space, never on a ' +
   'chart in another group');
await page.evaluate(async () => {
    const S = window.PS_SHELL;
    S.charts().forEach(c => { delete c.group; });
    S.switchChart(S.chart().id);
    await new Promise(r => setTimeout(r, 400));
});
await page.waitForTimeout(400);
const p11g = await p11();
ok(p11g.tabs.join() === p11g.order.join() && p11g.scope === null,
   'and once the groups are gone the strip is flat again, tag included');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CHART GROUPS CHECK PASS');
await browser.close();
