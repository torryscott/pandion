// Chart groups (planning/CHART-GROUPS-SPEC.md, approved by Torry Jul 31
// 2026). The structural decision under test everywhere here: grouping is a
// RAIL concept only - tabs, Alt+number, and every keyboard path stay flat -
// and a project with no groups renders ZERO group chrome.
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

console.log('case 2: move-to-group via the REAL context menu; tabs stay flat');
const tabsBefore = await tabOrder();
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
ok(await tabOrder() === tabsBefore,
   'and the TAB STRIP is untouched: grouping is rail-only');

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

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CHART GROUPS CHECK PASS');
await browser.close();
