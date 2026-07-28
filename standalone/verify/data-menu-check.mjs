// Punch list t3-45: about 35 data commands existed only behind right-click.
//
// Reshape to wide, Add computed column, Sort, Hide column, Insert column and
// Restore exclusions lived in context menus and nowhere else, so a user who
// did not think to right-click could not reach them at all. The palette was a
// 20-item mirror of the menu bar because commandCatalog builds from
// APP_MENU_DEFS, and there was no way to jump to a document by name, which is
// the classic first use of a palette.
//
// The item's stated fix is one COMMANDS registry that menus, context menus and
// the palette all render from. This takes the leverage without that refactor:
// because the palette ALREADY renders from APP_MENU_DEFS, a Data menu routed
// to the same functions the context menus call fixes both surfaces at once,
// with no second dispatch to keep in step.
//
// PARTIAL: the single-registry refactor itself is not done, and the context
// menus still declare their own buttons.
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
await page.waitForTimeout(1400);

console.log('case 1: the commands are in the menu bar at all');
const menu = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await s(500);
    window.PS_SHELL.selectVariable('score');
    await s(400);
    const btn = document.querySelector('[data-ps-menu="data"]');
    if (!btn) return { err: 'no Data menu' };
    btn.click();
    await s(400);
    const m = document.getElementById('ps-appmenu');
    const items = Array.from(m.querySelectorAll('button')).map(b => ({
        cmd: b.getAttribute('data-app-command'),
        label: b.textContent.trim(), off: b.disabled }));
    btn.click();
    return { items };
});
ok(!menu.err, `there is a Data menu (${menu.err || 'ok'})`);
// The six the item names by name.
for (const want of ['data-reshape', 'data-compute', 'data-sort-asc',
                    'data-hide-col', 'data-insert-left', 'data-restore-excl']) {
    const hit = menu.items.filter(i => i.cmd === want)[0];
    ok(!!hit, `it offers ${want} ("${hit ? hit.label : 'MISSING'}")`);
}
ok(menu.items.filter(i => i.cmd === 'data-sort-asc')[0].off === false,
   'and with a column selected they are enabled');

console.log('case 2: a column command really runs, not just appears');
const sorted = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const before = window.PS_SHELL.project.table.raw.score.slice(0, 4);
    window.PS_SHELL.selectVariable('score');
    await s(300);
    window.PS_SHELL.runCommand('data-sort-asc');
    await s(900);
    const after = window.PS_SHELL.project.table.raw.score.slice(0, 4);
    return { before, after };
});
ok(JSON.stringify(sorted.before) !== JSON.stringify(sorted.after),
   `Sort ascending actually sorts (${JSON.stringify(sorted.before)} -> ` +
   `${JSON.stringify(sorted.after)})`);
ok(Number(sorted.after[0]) <= Number(sorted.after[1]),
   `in the right direction (${JSON.stringify(sorted.after)})`);

console.log('case 3: without a column they are disabled, and say why');
const noSel = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.selectVariable(null);
    await s(400);
    document.querySelector('[data-ps-menu="data"]').click();
    await s(400);
    const m = document.getElementById('ps-appmenu');
    const b = m.querySelector('[data-app-command="data-sort-asc"]');
    const wide = m.querySelector('[data-app-command="data-reshape"]');
    const out = { off: b.disabled, tip: b.getAttribute('data-tip') || '',
                  wideOff: wide.disabled };
    document.querySelector('[data-ps-menu="data"]').click();
    return out;
});
ok(noSel.off,
   'a column-scoped command is disabled with nothing selected, rather than ' +
   'acting on whichever column happens to be first');
ok(/Select a column/.test(noSel.tip),
   `and says what is missing ("${noSel.tip}")`);
ok(!noSel.wideOff,
   'while a whole-table command like Reshape stays available, because it ' +
   'needs no column');

console.log('case 4: the palette gets them for free');
const palette = await page.evaluate(() => {
    const cat = window.PS_SHELL.runCommandCatalog();
    return { total: cat.length,
             data: cat.filter(c => c.command.indexOf('data-') === 0).length,
             groups: Array.from(new Set(cat.map(c => c.group))) };
});
ok(palette.data >= 10,
   `the catalogue carries the data commands (${palette.data} of ` +
   `${palette.total})`);
ok(palette.groups.indexOf('Data') !== -1,
   `under their own group, which is what makes them findable rather than ` +
   `merely present (${JSON.stringify(palette.groups)})`);

console.log('case 5: and documents are findable by name');
const docs = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addChart();
    await s(900);
    const chart = window.PS_SHELL.chart();
    const target = chart.id;
    window.PS_SHELL.runCommand('command-palette');
    await s(500);
    const box = document.getElementById('ps-command-search');
    box.value = chart.name.slice(0, 6);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await s(400);
    const rows = Array.from(
        document.querySelectorAll('#ps-command-results .ps-command-result'))
        .map(b => ({ cmd: b.getAttribute('data-palette-command'),
                     text: b.textContent }));
    return { target, rows: rows.slice(0, 4), name: chart.name };
});
ok(docs.rows.some(r => r.cmd === 'goto-document:' + docs.target),
   `searching a document's name finds the document, which is the classic ` +
   `first use of a palette (${JSON.stringify(docs.rows.map(r => r.cmd))})`);

console.log('case 6: and choosing one goes there');
const went = await page.evaluate(async (targetId) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // Move away first, so "it went there" is not just "it was already there".
    const others = window.PS_SHELL.charts().filter(c => c.id !== targetId);
    window.PS_SHELL.switchChart(others[0].id);
    await s(900);
    const from = window.PS_SHELL.chart().id;
    window.PS_SHELL.runCommand('goto-document:' + targetId);
    await s(1100);
    return { from, to: window.PS_SHELL.chart().id,
             workspace: window.PS_SHELL.workspace() };
}, docs.target);
ok(went.from !== went.to && went.to === docs.target,
   `it switches to the chosen document (${went.from} -> ${went.to})`);
ok(went.workspace === 'chart',
   `and to the workspace that document lives in (${went.workspace})`);

console.log('case 7: Insert offers the panel the layout toolbar already had');
const ins = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="insert"]').click();
    await s(400);
    const m = document.getElementById('ps-appmenu');
    const has = !!m.querySelector('[data-app-command="layout-add-chart"]');
    document.querySelector('[data-ps-menu="insert"]').click();
    return has;
});
ok(ins, 'Insert lists Chart panel');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('DATA MENU CHECK PASS');
await browser.close();
