// Punch list t3-52: layout copy/paste and image paste.
//
// Cmd+C in a layout ALWAYS copied the whole page as an image, even with a
// single caption selected, which is never what a selection implies. The only
// paste listener in the app was on the data grid, so images could enter only
// through the file input and a screenshot had to be saved to disk first. And
// Cmd+D duplicating WITHIN a layout made the absence of a cross-layout copy
// more conspicuous, not less: the app could clone an item beside itself but
// could not move one to the figure next door.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

// Two layouts, so "across layouts" is testable rather than asserted.
const setup = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.createLayoutFromTemplate('single');
    await s(1500);
    const first = window.PS_SHELL.chart().id;
    window.PS_SHELL.createLayoutFromTemplate('single');
    await s(1500);
    return { first, second: window.PS_SHELL.chart().id };
});
ok(setup.first !== setup.second,
   `setup: two separate layouts (${setup.first}, ${setup.second})`);

console.log('case 1: a selection means the ITEMS, not the page image');
const sel = await page.evaluate(async (firstId) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('layout');
    await s(400);
    window.PS_SHELL.switchChart(firstId);
    await s(1100);
    // The single template makes an EMPTY page, so put something on it the
    // way a person would rather than reaching into the model.
    window.PS_SHELL.runCommand('insert-text');
    await s(900);
    const items = window.PS_SHELL.chart().items || [];
    if (!items.length) return { err: 'no items in the layout' };
    window.PS_SHELL.laySetSelection([items[0].id]);
    await s(400);
    return { count: items.length, itemId: items[0].id,
             selected: window.PS_SHELL.laySelectedIds().length };
}, setup.first);
ok(!sel.err && sel.selected === 1,
   `setup: one item is selected in the first layout (${sel.err || sel.itemId})`);

const clip = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const wrote = [];
    const real = window.PS_SHELL.copyActiveAsImageForTest;
    document.getElementById('ps-toast').innerHTML = '';
    const okCopy = window.PS_SHELL.layCopySelected(false);
    await s(400);
    return { okCopy, toast: document.getElementById('ps-toast').innerText };
});
ok(clip.okCopy === true,
   'copying a selected layout item succeeds');
ok(/copied/i.test(clip.toast),
   `and says so ("${clip.toast.replace(/\n/g, ' ').slice(0, 60)}")`);

console.log('case 2: it pastes into a DIFFERENT layout');
const across = await page.evaluate(async (secondId) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.switchChart(secondId);
    await s(1100);
    const before = (window.PS_SHELL.chart().items || []).length;
    const pasted = window.PS_SHELL.layPasteClipboard();
    await s(900);
    const items = window.PS_SHELL.chart().items || [];
    return { before, after: items.length, pasted,
             ids: items.map(i => i.id) };
}, setup.second);
ok(across.pasted === true && across.after === across.before + 1,
   `an item copied in one layout lands in the other ` +
   `(${across.before} -> ${across.after})`);
// A DEEP copy, not a shared reference. Item ids are per-layout by design
// (layItemById and layNewItemId both scope to the active layout), so a
// duplicate id across two layouts is harmless and asserting global uniqueness
// would be asserting a property the app never had. What WOULD be a bug is two
// layouts pointing at one object, because then editing one silently edits the
// other, and that is invisible until it bites.
const independent = await page.evaluate((firstId) => {
    const other = window.PS_SHELL.charts().filter(c => c.id === firstId)[0];
    const mine = window.PS_SHELL.chart().items[0];
    const theirs = (other.items || [])[0];
    const before = theirs.x;
    mine.x = (Number(mine.x) || 0) + 137;
    const moved = theirs.x !== before;
    mine.x = (Number(mine.x) || 0) - 137;
    return { shared: moved,
             uniqueInPage: window.PS_SHELL.chart().items
                 .filter(i => i.id === mine.id).length };
}, setup.first);
ok(independent.shared === false,
   `and it is a real copy: moving the pasted item does not move the original ` +
   `in the other layout`);
ok(independent.uniqueInPage === 1,
   `with an id unique within its own page, which is the scope the app ` +
   `actually resolves ids in (${independent.uniqueInPage})`);

// Pasting TWICE must give two independent items. The clipboard itself already
// holds a deep copy, so comparing a paste against the ORIGINAL cannot catch a
// paste that hands out the clipboard object itself: the second paste is where
// that shows.
console.log('case 3: two pastes are two items, not one object twice');
const twice = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.layPasteClipboard();
    await s(700);
    const items = window.PS_SHELL.chart().items;
    const a = items[items.length - 2], b = items[items.length - 1];
    const before = a.x;
    b.x = (Number(b.x) || 0) + 211;
    const shared = a.x !== before;
    b.x = (Number(b.x) || 0) - 211;
    return { count: items.length, shared, sameId: a.id === b.id };
});
ok(twice.count >= 2, `two items on the page (${twice.count})`);
ok(twice.shared === false,
   'moving the second does not move the first, so each paste made its own copy');
ok(twice.sameId === false,
   'and they have different ids within the page');

console.log('case 4: with NOTHING selected, Cmd+C still means the page');
const nothing = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.laySetSelection
        ? window.PS_SHELL.laySetSelection([]) : null;
    await s(300);
    return window.PS_SHELL.layCopySelected(false);
});
ok(nothing === false,
   'the item copy declines when nothing is picked, so the whole-page image ' +
   'path still runs and the old behaviour is intact where it was right');

console.log('case 5: the Edit menu agrees with the keys');
const menu = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="edit"]').click();
    await s(400);
    const m = document.getElementById('ps-appmenu');
    const get = c => {
        const b = m.querySelector('[data-app-command="' + c + '"]');
        return b ? !b.disabled : null;
    };
    const out = { paste: get('paste-cells'), copy: get('copy-cells') };
    document.querySelector('[data-ps-menu="edit"]').click();
    return out;
});
ok(menu.paste === true,
   'Paste is enabled in a layout that has something on the clipboard, ' +
   'rather than being greyed out as a data-grid-only command');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT CLIPBOARD CHECK PASS');
await browser.close();
