// Two ways a value is destroyed and the app reports success.
//
// Item 9. Type "sixty one" into a Continuous cell and press Enter. The cell
// becomes an em dash, indistinguishable from a cell somebody deliberately
// cleared, and the visually hidden live region announces "Saved score, row 1
// as sixty one." A screen reader user is affirmatively told the value was
// stored in exactly the circumstance where it was not. Note the asymmetry
// that makes it worth fixing. Deliberately CLEARING a cell gets a toast with
// an Undo button, and accidentally voiding one gets silence.
//
// Item 10. Paste a block whose text lands in a Continuous column and the
// toast counts the cells and flags the column that GAINED distinct values,
// while saying nothing about the column where every pasted value went
// missing. The level-explosion census needs its mirror image.
//
// The raw text survives underneath both times and one undo puts it back, so
// nothing is destroyed. The user cannot know that, which is the defect. The
// house answer is already written for this shape in setColType. Do it, say
// what it did, and carry the way back.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);

// The toast nodes live in a stack the app owns. Never remove them to get a
// clean read, because deleting them takes the container, so the next toast
// has nowhere to render and the silence you read is one you caused. Snapshot
// and diff instead.
// The individual pills, not the stack container, whose own text is the
// concatenation of everything in it, so including it makes every read look
// like it changed.
const toastList = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-toast .ps-toast-item'))
    .map(n => n.innerText));
// Toasts append and expire off the front, and the stack is rebuilt whole on
// every push, so a marker attribute would not survive. Take the largest
// overlap between the old list and the head of the new one; whatever is left
// is what fired since. Reads only.
function toastSince(before, after) {
    for (let k = Math.min(before.length, after.length); k >= 0; k--)
        if (after.slice(0, k).every((s, i) => s === before[before.length - k + i]))
            return after.slice(k).join(' | ');
    return after.join(' | ');
}
const liveText = () => page.evaluate(() => {
    const n = document.getElementById('ps-grid-edit-status');
    return n ? n.textContent : '(no live region)';
});
const validOf = c => page.evaluate(cc => {
    const v = window.PS_SHELL.project.table.columns[cc] || [];
    return v.filter(x => x != null).length;
}, c);
const rawAt = (c, r) => page.evaluate(([cc, rr]) =>
    String(window.PS_SHELL.project.table.raw[cc][rr]), [c, r]);
// What a screen reader is told about the cell itself, plus the tooltip a
// sighted user can reach. The hover pseudo-class never matches in headless
// Chromium, so the attributes are read directly.
const cellSignal = (c, r) => page.evaluate(([cc, rr]) => {
    const tds = document.querySelectorAll('#ps-datagrid td[data-gr="' + rr + '"]');
    let td = null;
    for (const n of tds) if (n.getAttribute('data-gc') === cc) td = n;
    if (!td) return '(no cell)';
    const by = td.getAttribute('aria-describedby');
    const desc = by ? (document.getElementById(by) || {}).textContent : '';
    return [td.textContent, td.getAttribute('data-tip') || '', desc || ''].join(' ~ ');
}, [c, r]);

async function load(header, rows) {
    await page.evaluate(([h, r]) => window.PS_SHELL.loadTable('f', h, r),
        [header, rows]);
    await page.waitForTimeout(650);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(250);
}
// A single click selects. Editing is the deliberate second act, so the probe
// takes the keyboard route the app documents, which is select, Enter, type,
// Enter.
async function typeInto(col, row, text) {
    await page.evaluate(([c, r]) =>
        window.PS_SHELL.setGridSelection(c, r, c, r, 'cells'), [col, row]);
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('ps-datagrid').focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.evaluate(t => {
        const i = document.querySelector('#ps-datagrid input.ps-grid-cellinput');
        if (i) i.value = t;
    }, text);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
}

const NUMS = ['61', '58', '73', '44', '67', '52', '80', '39'];
const sample = () => NUMS.map((n, i) => ['g' + (i % 2), n]);

console.log('case 1: an unreadable cell edit is not announced as saved');
await load(['grp', 'score'], sample());
ok((await validOf('score')) === 8, 'eight readable values to begin with');
let before = await toastList();
await typeInto('score', 0, 'sixty one');
ok((await validOf('score')) === 7, 'the typed text did not land, got ' +
   (await validOf('score')) + ' readable of 8');
const live1 = await liveText();
ok(!/^Saved /.test(live1),
   'the live region does not claim a save, got ' + JSON.stringify(live1));
ok(/could not be read/.test(live1) && /score, row 1/.test(live1),
   'it names the cell and says the value could not be read, got ' +
   JSON.stringify(live1));

console.log('case 2: and the sighted user is told too');
const t2 = toastSince(before, await toastList());
ok(/score, row 1/.test(t2) && /could not be read/.test(t2) &&
   /Continuous/.test(t2),
   'a toast names the cell and the type that could not read it, got ' +
   JSON.stringify(t2));
ok(/Cmd\/Ctrl\+Z/.test(t2),
   'and carries the way back, got ' + JSON.stringify(t2));

console.log('case 3: the cell itself carries the reason, after the toast is gone');
const sig3 = await cellSignal('score', 0);
ok(/sixty one/.test(sig3) && /could not be read/.test(sig3),
   'the cell quotes the text it is holding but cannot read, got ' +
   JSON.stringify(sig3));
ok((await rawAt('score', 0)) === 'sixty one',
   'and the text really is still underneath');

console.log('case 4 (control): an ordinary edit still announces a save');
await load(['grp', 'score'], sample());
before = await toastList();
await typeInto('score', 0, '62');
ok((await validOf('score')) === 8, 'the value landed');
const live4 = await liveText();
ok(/^Saved /.test(live4) && /62/.test(live4),
   'the save is announced as before, got ' + JSON.stringify(live4));
ok(!/could (not )?be read/.test(toastSince(before, await toastList())),
   'and nothing is flagged');
ok(!/could not be read/.test(await cellSignal('score', 0)),
   'and the cell carries no complaint');

console.log('case 5 (control): clearing a cell is deliberate, not a failure');
await load(['grp', 'score'], sample());
before = await toastList();
await typeInto('score', 0, '');
ok((await validOf('score')) === 7, 'the cell is empty now');
ok(!/could not be read/.test(await liveText()),
   'emptying is not reported as unreadable, got ' + JSON.stringify(await liveText()));
ok(!/could (not )?be read/.test(toastSince(before, await toastList())),
   'and no toast fires');
ok(!/could not be read/.test(await cellSignal('score', 0)),
   'and the empty cell carries no complaint');

console.log('case 6 (control): a declared missing token is a value, not a failure');
await load(['grp', 'score'], sample());
await page.evaluate(() => window.PS_SHELL.setMissingTokens(['NA']));
await page.waitForTimeout(400);
before = await toastList();
await typeInto('score', 0, 'NA');
ok(!/could not be read/.test(await liveText()),
   'typing a declared missing code is honest, got ' + JSON.stringify(await liveText()));
ok(!/could (not )?be read/.test(toastSince(before, await toastList())),
   'and no toast fires');
await page.evaluate(() => window.PS_SHELL.setMissingTokens([]));
await page.waitForTimeout(300);

console.log('case 7: a paste that voids a column says so');
const wide = [['condition', 'score', 'hours', 'site', 'note']];
for (let i = 0; i < 12; i++)
    wide.push(['c' + (i % 3), 'about ' + (60 + i), String(i), 's' + (i % 2),
               'n' + i]);
await load(['condition', 'score', 'hours', 'site'],
    NUMS.map((n, i) => ['c' + (i % 3), n, String(i), 's' + (i % 2)]));
ok((await validOf('score')) === 8, 'score starts readable');
before = await toastList();
await page.evaluate(m => {
    window.PS_SHELL.setGridSelection('condition', 0, 'condition', 0, 'cells');
    window.PS_SHELL.pasteMatrix(m);
}, wide);
await page.waitForTimeout(800);
ok((await validOf('score')) === 0, 'every value in score is missing now, got ' +
   (await validOf('score')));
const t7 = toastSince(before, await toastList());
ok(/Pasted /.test(t7), 'the paste still reports itself, got ' + JSON.stringify(t7));
ok(/score/.test(t7) && /could (not )?be read/.test(t7),
   'and it names the column whose values did not land, got ' + JSON.stringify(t7));
ok(/Cmd\/Ctrl\+Z/.test(t7), 'and carries the way back, got ' + JSON.stringify(t7));
// What the paste DOES is unchanged.
ok((await page.evaluate(() =>
    window.PS_SHELL.project.table.order.length)) === 5,
   'the paste still created the fifth column');
ok((await rawAt('score', 1)) === 'about 60',
   'and the pasted text is still underneath, got ' + (await rawAt('score', 1)));

console.log('case 8 (control): an ordinary paste stays quiet');
await load(['condition', 'score', 'hours', 'site'],
    NUMS.map((n, i) => ['c' + (i % 3), n, String(i), 's' + (i % 2)]));
before = await toastList();
await page.evaluate(() => {
    const m = [];
    for (let i = 0; i < 6; i++) m.push([String(70 + i)]);
    window.PS_SHELL.setGridSelection('score', 0, 'score', 0, 'cells');
    window.PS_SHELL.pasteMatrix(m);
});
await page.waitForTimeout(700);
ok((await validOf('score')) === 8, 'every value landed');
const t8 = toastSince(before, await toastList());
ok(!/could (not )?be read/.test(t8),
   'so nothing is flagged, got ' + JSON.stringify(t8));

console.log('case 9 (control): one stray value in a paste is not an interruption');
await load(['condition', 'score', 'hours', 'site'],
    NUMS.map((n, i) => ['c' + (i % 3), n, String(i), 's' + (i % 2)]));
before = await toastList();
await page.evaluate(() => {
    const m = [];
    for (let i = 0; i < 8; i++) m.push([i === 3 ? 'oops' : String(70 + i)]);
    window.PS_SHELL.setGridSelection('score', 0, 'score', 0, 'cells');
    window.PS_SHELL.pasteMatrix(m);
});
await page.waitForTimeout(700);
ok((await validOf('score')) === 7, 'one value went missing, got ' +
   (await validOf('score')));
const t9 = toastSince(before, await toastList());
ok(!/could (not )?be read/.test(t9),
   'and it is not announced, matching the type-change restraint, got ' +
   JSON.stringify(t9));
ok(/could not be read/.test(await cellSignal('score', 3)),
   'but that one cell still carries its own reason');

console.log('case 10: a partly voided column is counted, not called empty');
await load(['condition', 'score', 'hours', 'site'],
    NUMS.map((n, i) => ['c' + (i % 3), n, String(i), 's' + (i % 2)]));
before = await toastList();
await page.evaluate(() => {
    const m = [];
    for (let i = 0; i < 8; i++) m.push([i < 6 ? 'about ' + (60 + i) : String(70 + i)]);
    window.PS_SHELL.setGridSelection('score', 0, 'score', 0, 'cells');
    window.PS_SHELL.pasteMatrix(m);
});
await page.waitForTimeout(700);
ok((await validOf('score')) === 2, 'two values survived, got ' +
   (await validOf('score')));
const t10 = toastSince(before, await toastList());
ok(/6 of 8 values pasted into score/.test(t10),
   'the count is what was pasted, not the column length, got ' +
   JSON.stringify(t10));
ok(!/empty/.test(t10),
   'and a column that still holds values is not called empty, got ' +
   JSON.stringify(t10));

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('VOID HONESTY CHECK: ALL GREEN');
await browser.close();
