// Runtime accessibility contract for keyboard use of the Layout workspace.
//
// Covers the composite item model, names/state, focus retention, item
// navigation and multi-selection, movement, free/proportional resize, exact
// property entry, layering, text editing/style, context commands, duplicate,
// delete, and live announcements.
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
function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log('  ok  ' + message);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(650);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(650);
}
await page.evaluate(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    window.PS_SHELL.addLayout();
    await sleep(800);
    window.PS_SHELL.setWorkspace('layout');
    await sleep(350);
});
await page.click('#ps-laddchart');
await page.waitForTimeout(80);
await page.click('#ps-lchartmenu button[data-chart]');
await page.waitForTimeout(650);
await page.click('#ps-laddtext');
await page.waitForTimeout(250);
await page.click('#ps-laddlabel');
await page.waitForTimeout(250);

console.log('case 1: the layout is one named composite with semantic items');
await page.focus('#ps-lviewport');
await page.waitForTimeout(100);
let state = await page.evaluate(() => {
    const root = document.getElementById('ps-lviewport');
    const active = document.getElementById(
        root.getAttribute('aria-activedescendant') || '');
    const options = Array.from(root.querySelectorAll('[role="option"]'));
    return {
        role: root.getAttribute('role'),
        multiselect: root.getAttribute('aria-multiselectable'),
        describedby: root.getAttribute('aria-describedby'),
        activeId: active && active.id,
        activeSelected: active && active.getAttribute('aria-selected'),
        activeLabel: active && active.getAttribute('aria-label'),
        labels: options.map(option => option.getAttribute('aria-label')),
        optionCount: options.length,
        selectedCount: options.filter(option =>
            option.getAttribute('aria-selected') === 'true').length,
        positions: options.map(option => [
            option.getAttribute('aria-posinset'),
            option.getAttribute('aria-setsize'),
            option.tabIndex,
        ]),
        nestedTabStops: options.reduce((count, option) => count +
            Array.from(option.querySelectorAll('button,[tabindex]'))
                .filter(node => node.tabIndex >= 0).length, 0),
        focused: document.activeElement && document.activeElement.id,
    };
});
ok(state.role === 'listbox' && state.multiselect === 'true' &&
   state.describedby === 'ps-layout-instructions' &&
   state.optionCount === 3,
   'the viewport exposes one instructed multi-select composite and all three items');
ok(state.activeId && state.activeSelected === 'true' &&
   state.selectedCount === 1 && state.focused === 'ps-lviewport',
   'focus entry selects and exposes one active descendant while focus stays on the composite');
ok(/Chart panel.+item 1 of 3.+layer 1.+x \d+ pixels.+width \d+ pixels/.test(
       state.labels[0]) &&
   state.labels.every(label =>
       /item \d of 3.+layer \d.+x \d+ pixels/.test(label)) &&
   state.positions.every((entry, index) =>
       Number(entry[0]) === index + 1 && Number(entry[1]) === 3 &&
       Number(entry[2]) === -1) &&
   state.nestedTabStops === 0,
   'items expose kind/name, order, layer, geometry, selected state, and no competing tab stops');

console.log('case 2: Arrow/Home/End and Shift create an intentional selection');
await page.keyboard.press('Home');
await page.waitForTimeout(80);
const firstActive = await page.evaluate(() =>
    document.getElementById('ps-lviewport').getAttribute(
        'aria-activedescendant'));
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(80);
state = await page.evaluate(() => {
    const root = document.getElementById('ps-lviewport');
    return {
        active: root.getAttribute('aria-activedescendant'),
        focused: document.activeElement && document.activeElement.id,
        selected: document.querySelectorAll(
            '#ps-lviewport [role="option"][aria-selected="true"]').length,
        live: document.getElementById('ps-layout-live').textContent,
    };
});
ok(state.active !== firstActive && state.focused === 'ps-lviewport' &&
   state.selected === 1 && /selected/.test(state.live),
   'Arrow Down moves the active single selection and keeps composite focus');
await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(80);
state = await page.evaluate(() => ({
    selected: document.querySelectorAll(
        '#ps-lviewport [role="option"][aria-selected="true"]').length,
    live: document.getElementById('ps-layout-live').textContent,
}));
ok(state.selected === 2 && /2 items selected/.test(state.live),
   'Shift+Arrow extends the selection and announces its count');
await page.keyboard.press('Space');
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.querySelectorAll(
    '#ps-lviewport [role="option"][aria-selected="true"]').length) === 1,
   'Space toggles the active item without moving focus');
await page.keyboard.press('Home');
await page.waitForTimeout(80);
state = await page.evaluate(() => {
    const root = document.getElementById('ps-lviewport');
    return {
        active: root.getAttribute('aria-activedescendant'),
        first: root.querySelector('[role="option"]').id,
    };
});
ok(state.active === state.first, 'Home selects the first layout item');
await page.keyboard.press('End');
await page.keyboard.press('Home');

console.log('case 3: keyboard move and both resize modes update geometry');
const geometry = () => page.evaluate(() => {
    const item = window.PS_SHELL.chart().items[0];
    return { x: item.x, y: item.y, w: item.w, h: item.h,
             ratio: item.w / item.h };
});
const beforeMove = await geometry();
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(80);
let after = await geometry();
ok(after.x === beforeMove.x + 1,
   `Alt+Arrow nudges by one pixel (${beforeMove.x} -> ${after.x})`);
await page.keyboard.press('Alt+Shift+ArrowDown');
await page.waitForTimeout(80);
const afterTen = await geometry();
ok(afterTen.y === beforeMove.y + 10,
   `Alt+Shift+Arrow nudges by ten pixels (${beforeMove.y} -> ${afterTen.y})`);
await page.keyboard.press('Control+Alt+ArrowRight');
await page.waitForTimeout(80);
after = await geometry();
ok(after.w === afterTen.w + 1 && after.h === afterTen.h,
   'Ctrl+Alt+Arrow performs a one-axis free resize');
await page.keyboard.down('Alt');
await page.keyboard.press('Equal');
await page.keyboard.up('Alt');
await page.waitForTimeout(80);
const proportional = await geometry();
ok(proportional.w > after.w &&
   Math.abs(proportional.ratio - after.ratio) < 0.001,
   'Alt+Plus grows the item proportionally');
ok(/Resized proportionally/.test(await page.locator('#ps-layout-live').textContent()),
   'resize changes are announced with their resulting geometry');

console.log('case 4: Enter reaches precise fields, and layer commands are keyboard native');
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.activeElement.id) === 'ps-ctx-lx',
   'Enter moves from the selected item to its exact position fields');
await page.fill('#ps-ctx-lx', '1');
await page.locator('#ps-ctx-lx').evaluate(node =>
    node.dispatchEvent(new Event('change', { bubbles: true })));
await page.waitForTimeout(100);
ok((await geometry()).x === 96,
   'the exact X field applies the configured inch value to layout geometry');
await page.focus('#ps-lviewport');
await page.keyboard.press('Home');
const beforeLayer = await page.evaluate(() =>
    window.PS_SHELL.chart().items[0].id);
await page.keyboard.press('Alt+PageUp');
await page.waitForTimeout(80);
const layer = await page.evaluate(id => ({
    index: window.PS_SHELL.chart().items.findIndex(item => item.id === id),
    live: document.getElementById('ps-layout-live').textContent,
}), beforeLayer);
ok(layer.index === 1 && /Moved selection forward/.test(layer.live),
   'Alt+Page Up moves the selected item forward and announces it');

console.log('case 5: text edit/style and command-menu alternatives work from the composite');
const textIndex = await page.evaluate(() =>
    window.PS_SHELL.chart().items.findIndex(item => item.kind === 'text'));
await page.keyboard.press('Home');
for (let index = 0; index < textIndex; index += 1)
    await page.keyboard.press('ArrowDown');
await page.waitForTimeout(50);
let activeKind = await page.evaluate(() => {
    const root = document.getElementById('ps-lviewport');
    const id = root.getAttribute('aria-activedescendant');
    return document.getElementById(id).getAttribute('data-kind');
});
ok(activeKind === 'text', 'keyboard navigation reaches a text item');
await page.keyboard.press('F2');
await page.waitForTimeout(50);
ok(await page.evaluate(() =>
    document.activeElement.classList.contains('ps-ltext-edit') &&
    document.activeElement.getAttribute('aria-label') === 'Edit layout text'),
   'F2 opens a labelled text editor');
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
await page.keyboard.type('Accessible figure note');
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
state = await page.evaluate(() => ({
    text: window.PS_SHELL.chart().items.find(item =>
        item.kind === 'text').text,
    focused: document.activeElement && document.activeElement.id,
    live: document.getElementById('ps-layout-live').textContent,
}));
ok(state.text === 'Accessible figure note' &&
   state.focused === 'ps-lviewport' && state.live === 'Text saved.',
   'text commit returns focus to the composite and announces success');
const textBefore = await page.evaluate(() => {
    const item = window.PS_SHELL.chart().items.find(entry => entry.kind === 'text');
    return { bold: !!item.bold, size: item.fontSize };
});
await page.keyboard.press('Control+b');
await page.keyboard.press('Control+=');
await page.waitForTimeout(100);
const textAfter = await page.evaluate(() => {
    const item = window.PS_SHELL.chart().items.find(entry => entry.kind === 'text');
    return { bold: !!item.bold, size: item.fontSize };
});
ok(textAfter.bold !== textBefore.bold && textAfter.size === textBefore.size + 2,
   'documented keyboard alternatives change text weight and size');
await page.keyboard.press('Shift+F10');
await page.waitForTimeout(80);
state = await page.evaluate(() => ({
    shown: document.getElementById('ps-contextmenu').style.display,
    commands: Array.from(document.querySelectorAll(
        '#ps-contextmenu [data-context-command]')).map(node =>
            node.getAttribute('data-context-command')),
}));
ok(state.shown === 'block' &&
   ['duplicate-selection', 'delete-selection', 'layer-back', 'layer-forward']
       .every(command => state.commands.includes(command)),
   'Shift+F10 exposes the same duplicate/delete/layer commands as right-click');
await page.keyboard.press('Escape');

console.log('case 6: duplicate and delete retain focus and announce the result');
await page.focus('#ps-lviewport');
const countBefore = await page.evaluate(() => window.PS_SHELL.chart().items.length);
await page.keyboard.press('Control+d');
await page.waitForTimeout(100);
let countAfter = await page.evaluate(() => window.PS_SHELL.chart().items.length);
ok(countAfter === countBefore + 1 &&
   await page.evaluate(() => document.activeElement.id) === 'ps-lviewport' &&
   /Duplicated/.test(await page.locator('#ps-layout-live').textContent()),
   'Ctrl+D duplicates, selects the copy, retains focus, and announces it');
await page.keyboard.press('Delete');
await page.waitForTimeout(100);
countAfter = await page.evaluate(() => window.PS_SHELL.chart().items.length);
ok(countAfter === countBefore &&
   await page.evaluate(() => document.activeElement.id) === 'ps-lviewport' &&
   /Removed 1 layout item/.test(await page.locator('#ps-layout-live').textContent()),
   'Delete removes the copy, retains focus, and announces the remaining count');

ok(errors.length === 0,
   `the Layout keyboard matrix produced no page errors (${errors.join(' | ') || 'none'})`);
await browser.close();
console.log('\nSTANDALONE LAYOUT ACCESSIBILITY: PASS');
