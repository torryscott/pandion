// Punch list t3-54: Recents capped silently and lost the file association.
//
// Two separate defects behind one symptom.
//
//   The cap was a consequence of the SHAPE. Each entry embedded the entire
//   project snapshot, so anything past 900 KB could not be listed AT ALL and
//   the feature simply looked broken for exactly the projects most worth
//   returning to. But too big to CARRY is not too big to LIST: the metadata
//   is a few hundred bytes whatever the project weighs.
//
//   openRecentProject nulled FILE_HANDLE and FILE_SAVED_REV, so reopening a
//   file-backed project arrived detached and the next Save silently became a
//   Save As. A FileSystemFileHandle is not JSON but IS structured-cloneable,
//   so IndexedDB can hold it.
//
// The 3-slot cap is a documented M4b ruling and is deliberately unchanged.
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 920 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

console.log('case 1: a project too big to carry is still LISTED');
const big = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // Comfortably past the 900 KB budget. 17,000 rows x 6 columns of real
    // digits, not a padded string, so the size comes from the same place a
    // user's would.
    const header = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rows = [];
    for (let i = 0; i < 17000; i++)
        rows.push(header.map((_, k) => String((i * 7919 + k * 104729) % 100000)));
    window.PS_SHELL.loadTable('big study', header, rows);
    await s(2500);
    const list = window.PS_SHELL.recentProjects();
    const hit = list.filter(r => /big study|Untitled/.test(r.name))[0] || list[0];
    return { count: list.length,
             name: hit && hit.name,
             rows: hit && hit.rows,
             bytes: hit && hit.bytes,
             carried: !!(hit && hit.snapshot) };
});
ok(big.count >= 1,
   `the oversized project appears in Recents at all, which is the whole ` +
   `complaint (${big.count} entries)`);
ok(big.rows === 17000,
   `with its real row count, so the entry is informative rather than a stub ` +
   `(${big.rows})`);
ok(big.bytes > 900000,
   `and it really is past the budget, so this is not a vacuous pass ` +
   `(${big.bytes} bytes)`);
ok(!big.carried,
   'while the snapshot itself is dropped, which is what the budget is for');

console.log('case 2: and the list SAYS which kind it is');
const shown = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.showWelcome(true);
    await s(600);
    const items = Array.from(document.querySelectorAll('#ps-recent-list .ps-recent-item'));
    const out = items.map(b => ({
        name: (b.querySelector('.ps-recent-name') || {}).textContent,
        meta: (b.querySelector('.ps-recent-meta') || {}).textContent,
        tip: b.getAttribute('data-tip') || '' }));
    document.getElementById('ps-welcome-close').click();
    await s(400);
    return out;
});
const bigRow = shown[0];
ok(/too large to keep a copy|opens from its file/.test(bigRow.meta),
   `the entry states why it cannot reopen in place, instead of looking ` +
   `identical to one that can ("${bigRow.meta}")`);
ok(/too large/.test(bigRow.tip),
   `with the fuller explanation on hover ("${bigRow.tip.slice(0, 80)}")`);

console.log('case 3: File > Open recent is a FLYOUT submenu');
// Torry, Aug 2 2026, overruling t3-54's inline list with field
// experience: one trigger row; the recents pop out beside it on hover,
// click, or ArrowRight.
const menu = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="file"]').click();
    await s(400);
    const m = document.getElementById('ps-appmenu');
    const trigger = m.querySelector('[data-app-submenu="recent"]');
    const inlineEntries = m.querySelectorAll('[data-recent-menu]').length;
    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await s(150);
    const sm = document.getElementById('ps-appsubmenu');
    const out = {
        trigger: !!trigger,
        triggerExpanded: trigger.getAttribute('aria-expanded'),
        haspopup: trigger.getAttribute('aria-haspopup'),
        inlineEntries,
        flyoutShown: sm.style.display === 'block',
        flankRight: sm.getBoundingClientRect().left >
            trigger.getBoundingClientRect().left + 40,
        entries: Array.from(sm.querySelectorAll('[data-recent-menu]'))
            .map(b => b.textContent.trim()) };
    document.querySelector('[data-ps-menu="file"]').click();
    return out;
});
ok(menu.trigger && menu.haspopup === 'menu' && menu.inlineEntries === 0,
   'one trigger row replaces the inline list (aria-haspopup declared)');
ok(menu.flyoutShown && menu.triggerExpanded === 'true' && menu.flankRight,
   'hovering it opens the flyout BESIDE the menu, aria-expanded tracking');
// One entry, not three: loadTable edits the SAME project, so Recents
// correctly holds one. Asserting "at least two" here would have been
// asserting a bug in the probe's own setup.
ok(menu.entries.length >= 1,
   `listing the real projects (${JSON.stringify(menu.entries)})`);
ok(menu.entries.some(e => /from file|name only/.test(e)),
   `and marking an entry that cannot reopen in place, same wording as the ` +
   `start centre (${JSON.stringify(menu.entries)})`);

console.log('case 3b: dismissal closes both; the Mac chord switches workspaces');
const closed = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // menu was toggled shut above; both panels must be gone
    const gone = document.getElementById('ps-appsubmenu').style.display !==
        'block' && document.getElementById('ps-appmenu').style.display !==
        'block';
    // the macOS chord: plain Ctrl+3 lands on the Notebook (Cmd+Shift+3 is
    // the SYSTEM screenshot there and never reaches the page)
    const isMac = /Mac/.test(navigator.platform || '');
    let chord = 'skipped';
    if (isMac) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            code: 'Digit3', key: '3', ctrlKey: true, bubbles: true,
            cancelable: true }));
        await s(300);
        chord = window.PS_SHELL.workspace();
        window.PS_SHELL.setWorkspace('data');
        await s(200);
    }
    return { gone, isMac, chord };
});
ok(closed.gone, 'closing the File menu retires the flyout with it');
ok(!closed.isMac || closed.chord === 'pinboard',
   `on a Mac, plain Ctrl+3 reaches the Notebook (${closed.chord}) - ` +
   `Cmd+Shift+3 is the system screenshot there`);
const chordLabel = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="view"]').click();
    await s(300);
    const rows = [...document.querySelectorAll(
        '#ps-appmenu .ps-menu-shortcut')].map(n => n.textContent);
    document.querySelector('[data-ps-menu="view"]').click();
    return { isMac: /Mac/.test(navigator.platform || ''), rows };
});
ok(!chordLabel.isMac ? chordLabel.rows.some(r => r === 'Cmd/Ctrl+Shift+3')
                     : chordLabel.rows.some(r => r === 'Ctrl+3'),
   `the View menu advertises the chord that actually works here ` +
   `(${chordLabel.rows.filter(r => /3/.test(r)).join(', ')})`);

console.log('case 4: opening it explains rather than doing nothing');
const opened = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const id = window.PS_SHELL.recentProjects()[0].id;
    document.getElementById('ps-toast').innerHTML = '';
    window.PS_SHELL.openRecentProject(id);
    await s(900);
    return { toast: document.getElementById('ps-toast').innerText,
             loader: getComputedStyle(document.getElementById('ps-loader'))
                 .display !== 'none' };
});
ok(/too large to keep a copy|open its file/i.test(opened.toast),
   `it says what happened ("${opened.toast.replace(/\n/g, ' ').slice(0, 90)}")`);
ok(opened.loader,
   'and opens the loader, which is the one thing that would actually help');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('case 5: a normal project still reopens in place');
const normal = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('small', ['x', 'y'],
        [['a', '1'], ['b', '2'], ['c', '3']]);
    await s(1200);
    const before = window.PS_SHELL.recentProjects()[0];
    return { name: before.name, carried: !!before.snapshot, rows: before.rows };
});
ok(normal.carried,
   `a project inside the budget still carries its snapshot ` +
   `(${normal.rows} rows)`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('RECENTS CHECK PASS');
await browser.close();
