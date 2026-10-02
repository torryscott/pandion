// The cell editor has a spreadsheet's two modes (Oct 1 2026, Torry: "It
// should mimic Excel"). Typing over a selected cell starts an edit in ENTER
// mode, where an arrow key saves and moves to the next cell. A click in the
// open cell, a double-click, or F2 gives EDIT mode, where the arrows move
// within the text. Before this, every open editor swallowed the arrows.
// Control: on the tree before the change, case 1 fails because ArrowDown in
// a typed-over cell leaves the editor open and saves nothing.
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
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(600);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(600);

const sel = () => page.evaluate(() => window.PS_SHELL.gridSelection());
const raw = (col, row) => page.evaluate(([c, r]) =>
    String(window.PS_SHELL.project.table.raw[c][r]), [col, row]);
const editor = () => page.evaluate(() => {
    const i = document.querySelector('#ps-datagrid .ps-grid-cellinput');
    return i ? { value: i.value, mode: i.getAttribute('data-edit-mode') || 'edit',
                 caret: i.selectionStart, describedby: i.getAttribute('aria-describedby'),
                 focused: document.activeElement === i } : null;
});
const cellPoint = (col, row) => page.evaluate(([c, r]) => {
    const td = Array.from(document.querySelectorAll('#ps-datagrid td[data-gc]'))
        .find(x => x.getAttribute('data-gc') === c && Number(x.getAttribute('data-gr')) === r);
    const b = td.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}, [col, row]);
async function seat(col, row) {
    const pt = await cellPoint(col, row);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
}
// A numeric column with a neighbour to its right, so every direction exists.
const cols = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const seen = [];
    document.querySelectorAll('#ps-datagrid th[data-grid-col]').forEach(th =>
        seen.push(th.getAttribute('data-grid-col')));
    return { order: seen, types: t.types };
});
const numAt = cols.order.findIndex(c => cols.types[c] === 'continuous' || cols.types[c] === 'numeric');
const C = cols.order[numAt >= 0 ? numAt : 0];
const cAt = cols.order.indexOf(C);
const R = cAt + 1 < cols.order.length ? cols.order[cAt + 1] : null;
const L = cAt > 0 ? cols.order[cAt - 1] : null;
ok(!!C && (!!R || !!L), 'setup: working in column ' + C + ' (neighbours ' + L + ', ' + R + ')');

console.log('case 1: after typing over a cell, an arrow saves and moves');
await seat(C, 2);
ok((await editor()) === null && (await sel()).focusRow === 2, 'setup: a click selected row 3, no editor');
await page.keyboard.type('71');
await page.waitForTimeout(150);
let ed = await editor();
ok(ed && ed.value === '71' && ed.mode === 'enter' && ed.focused,
   'typing opened the editor in Enter mode (' + JSON.stringify(ed) + ')');
ok(ed.describedby === 'ps-grid-editor-instructions-enter' &&
   /arrow key to save and move/.test(await page.evaluate(() =>
       document.getElementById('ps-grid-editor-instructions-enter').textContent)),
   'and its instructions say what the arrows do');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(350);
ok((await editor()) === null, 'ArrowDown closed the editor');
ok(await raw(C, 2) === '71', 'saved the value (' + await raw(C, 2) + ')');
let s = await sel();
ok(s && s.focusCol === C && s.focusRow === 3 && s.anchorRow === 3,
   'and moved the cursor one cell down (' + JSON.stringify(s) + ')');
ok(await page.evaluate(() => document.activeElement === document.getElementById('ps-datagrid')),
   'with the keys back on the grid, so the next thing typed starts the next cell');

console.log('case 2: the same across, and back up');
await page.keyboard.type('72');
await page.keyboard.press(R ? 'ArrowRight' : 'ArrowLeft');
await page.waitForTimeout(350);
s = await sel();
ok(await raw(C, 3) === '72' && s.focusCol === (R || L) && s.focusRow === 3,
   'a sideways arrow saved 72 and moved to ' + s.focusCol);
await page.keyboard.press(R ? 'ArrowLeft' : 'ArrowRight');
await page.keyboard.type('73');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(350);
s = await sel();
ok(await raw(C, 3) === '73' && s.focusRow === 2 && s.focusCol === C,
   'ArrowUp saved 73 and moved up');

console.log('case 3: a click in the open cell gives the arrows to the text');
await page.keyboard.type('456');
await page.waitForTimeout(150);
const inputPt = await page.evaluate(() => {
    const b = document.querySelector('#ps-datagrid .ps-grid-cellinput').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
await page.mouse.click(inputPt.x, inputPt.y);
await page.waitForTimeout(150);
ed = await editor();
ok(ed && ed.mode === 'edit' && ed.describedby === 'ps-grid-editor-instructions',
   'the click switched the editor to Edit mode');
await page.evaluate(() => {
    const i = document.querySelector('#ps-datagrid .ps-grid-cellinput');
    i.setSelectionRange(i.value.length, i.value.length);
});
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(150);
ed = await editor();
ok(ed && ed.value === '456' && ed.caret < 3,
   'the arrows moved the caret and the editor stayed open (caret ' + (ed && ed.caret) + ')');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
ok(await raw(C, 2) === '71', 'Escape abandoned it (' + await raw(C, 2) + ')');

console.log('case 4: double-click is Edit mode; F2 hands the arrows back');
const pt4 = await cellPoint(C, 4);
const before4 = await raw(C, 4);
await page.mouse.click(pt4.x, pt4.y, { clickCount: 2 });
await page.waitForTimeout(300);
ed = await editor();
ok(ed && ed.mode === 'edit', 'a double-click opens the editor in Edit mode');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(120);
ok((await editor()) !== null, 'where an arrow leaves the editor open');
await page.keyboard.press('F2');
await page.waitForTimeout(120);
ed = await editor();
ok(ed && ed.mode === 'enter', 'F2 switches to Enter mode');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(350);
s = await sel();
ok((await editor()) === null && s.focusRow === 3 && await raw(C, 4) === before4,
   'and now ArrowUp leaves the cell unchanged and moves up');

console.log('case 5: Shift with an arrow saves and extends the selection');
await seat(C, 5);
await page.keyboard.type('75');
await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(350);
s = await sel();
ok(await raw(C, 5) === '75' && s.anchorRow === 5 && s.focusRow === 6,
   'saved 75 and selected rows 6 to 7 (' + JSON.stringify(s) + ')');

console.log('case 6: an editor the grid opened for you is in Enter mode');
await seat(C, 7);
await page.keyboard.type('77');
await page.keyboard.press('Enter');
await page.waitForTimeout(350);
ed = await editor();
const before8 = await raw(C, 8);
ok(ed && ed.mode === 'enter' && await raw(C, 7) === '77',
   'Enter saved and opened the next row in Enter mode');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(350);
s = await sel();
ok((await editor()) === null && s.focusRow === 7 && await raw(C, 8) === before8,
   'an arrow from it changes nothing there and moves the cursor');

console.log('case 7: modified arrows stay with the text, and each save is one Undo');
await seat(C, 9);
const before9 = await raw(C, 9);
await page.keyboard.type('123');
await page.keyboard.press('Alt+ArrowLeft');
await page.waitForTimeout(150);
ok((await editor()) !== null, 'Alt with an arrow does not leave the cell');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(350);
ok(await raw(C, 9) === '123', 'setup: saved 123');
await page.keyboard.press(MOD + '+z');
await page.waitForTimeout(500);
ok(await raw(C, 9) === before9, 'one Undo restores the cell (' + await raw(C, 9) + ')');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('GRID ENTER MODE CHECK PASS');
await browser.close();
