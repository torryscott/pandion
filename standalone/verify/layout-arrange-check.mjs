// Torry, Jul 27 2026: "None of those buttons do anything for me at all"
// (the whole Arrange cluster), and separately: right-click "Move backward"
// does nothing, while "Move forward" works - and backward only starts
// working after a forward.
//
// BOTH reports were the same defect, and the logic was never wrong:
//   - Align correctly needs 2+ items and Distribute 3+, so with one item
//     selected eight of the twelve buttons were disabled - but .ps-btn had
//     NO :disabled rule, so they rendered exactly like live controls and
//     carried no tooltip. Clicking did nothing and explained nothing.
//   - Back/Forward were never disabled, so "move backward" on the item
//     already at the back was a silent no-op. Moving it forward first gave
//     it somewhere to go, which is why backward then "started working".
// An inert control that looks live is indistinguishable from a broken one.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await s(1200);
    window.PS_SHELL.setWorkspace('layout'); await s(700);
});
await page.click('#ps-laddtext'); await page.waitForTimeout(450);
await page.click('#ps-laddlabel'); await page.waitForTimeout(450);
await page.click('#ps-laddtext'); await page.waitForTimeout(450);

const itemIds = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#ps-lcanvas .ps-litem'))
        .map(e => e.getAttribute('data-item-id')));
const select = (n) => page.evaluate((count) => {
    const els = Array.from(document.querySelectorAll('#ps-lcanvas .ps-litem'));
    window.PS_SHELL.selectLayoutItems(
        els.slice(0, count).map(e => e.getAttribute('data-item-id')));
}, n);
const look = (sel) => page.evaluate((s) => {
    const b = document.querySelector(s);
    const cs = getComputedStyle(b);
    return { disabled: b.disabled, color: cs.color, bg: cs.backgroundColor,
             tip: b.getAttribute('data-tip') || '' };
}, sel);

console.log('case 1: align is HIDDEN until it can do anything');
// Torry, Jul 29 2026: "I'm a big fan of progressive disclosure... I don't
// think that's really necessary to see unless you select multiple charts."
// Six greyed buttons under Arrange at every selection became a row that
// appears when a second item is selected. Distribute across / Distribute
// down were removed entirely the same day ("I just don't quite see the
// utility in it").
const alignRowShown = () => page.evaluate(() => {
    const row = document.querySelector('.ps-inspector-align');
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { display: getComputedStyle(row).display,
             onScreen: r.width > 0 && r.height > 0 };
});
await select(1);
await page.waitForTimeout(350);
const one = await alignRowShown();
ok(one && one.display === 'none' && !one.onScreen,
   'with one item selected the align row is not shown at all',
   JSON.stringify(one));
// Aug 5 2026 (Torry): the Arrange button cluster is GONE from the rail -
// every one of its four actions duplicated the item right-click, which is
// now the single home for arrangement (plus Delete and Cmd/Ctrl+D on the
// keyboard).
ok(await page.evaluate(() =>
       ['ps-ctx-duplicate', 'ps-ctx-back', 'ps-ctx-forward', 'ps-ctx-delete']
           .every(id => !document.getElementById(id))),
   'the rail carries NO arrange buttons any more (menu-only, Aug 5 2026)');
ok(await page.evaluate(() =>
       document.getElementById('ps-layout-align-section')
           .style.display === 'none'),
   'and with one item selected the whole Align section stays away, not ' +
   'just its row');
ok(await page.evaluate(() =>
       document.querySelectorAll('[data-ctx-distribute]').length === 0),
   'and Distribute across / Distribute down are gone from the app');

console.log('case 2: it appears on a second selection, live, and acts');
await select(2);
await page.waitForTimeout(350);
const two = await alignRowShown();
ok(two && two.display !== 'none' && two.onScreen,
   'selecting a second item reveals the align row', JSON.stringify(two));
const align2 = await look('[data-ctx-align="left"]');
ok(!align2.disabled,
   'and every button in it is live - nothing visible here is inert');
const xsBefore = await page.evaluate(() =>
    (window.PS_SHELL.chart().items || []).slice(0, 2).map(i => Math.round(i.x)));
await page.click('[data-ctx-align="left"]');
await page.waitForTimeout(500);
const xsAfter = await page.evaluate(() =>
    (window.PS_SHELL.chart().items || []).slice(0, 2).map(i => Math.round(i.x)));
ok(xsAfter[0] === xsAfter[1],
   `clicking it really aligns them (${JSON.stringify(xsBefore)} -> ` +
   `${JSON.stringify(xsAfter)})`);
await select(1);
await page.waitForTimeout(350);
ok((await alignRowShown()).display === 'none',
   'and dropping back to one selection hides it again');

console.log('case 3: layer moves gate at the ends, from the menu');
// Case 2 leaves the first two items aligned on the same x, and placement now
// puts every toolbar-added text item on one row at the same y, so those two
// are exactly stacked and a right-click at either centre is ambiguous by
// construction. This case is about layer ORDER, so it spreads them down the
// page first and aims at a known item. Aligning items that share a y really
// does stack them, for the user too; that belongs to align, not to this case.
await page.evaluate(() => {
    const items = window.PS_SHELL.chart().items;
    for (let i = 0; i < items.length; i++) items[i].y = 32 + i * 90;
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(400);
const ids = await itemIds();
const menuFor = async (id) => {
    await page.evaluate((x) => window.PS_SHELL.selectLayoutItems([x]), id);
    await page.waitForTimeout(250);
    const box = await page.evaluate((x) => {
        const el = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="' + x + '"]');
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, id);
    await page.mouse.click(box.x, box.y, { button: 'right' });
    await page.waitForTimeout(350);
    return page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(
            '#ps-contextmenu button[data-context-command]'));
        const get = c => {
            const b = rows.find(r =>
                r.getAttribute('data-context-command') === c);
            return b ? { disabled: b.disabled,
                         tip: b.getAttribute('data-tip') || '',
                         label: b.textContent } : null;
        };
        return { back: get('layer-back'), forward: get('layer-forward'),
                 backmost: get('layer-backmost'), front: get('layer-front') };
    });
};
const bottomMenu = await menuFor(ids[0]);
ok(bottomMenu.back.disabled && bottomMenu.backmost.disabled &&
   /back of the stack/i.test(bottomMenu.back.tip) &&
   /back of the stack/i.test(bottomMenu.backmost.tip),
   'the bottom item cannot go further back - one step OR to the back - ' +
   'and both entries say so');
ok(!bottomMenu.forward.disabled && !bottomMenu.front.disabled &&
   bottomMenu.front.label === 'Move to front' &&
   bottomMenu.backmost.label === 'Move to back',
   'while Move forward and Move to front are live, with the Aug 5 labels');
// Move to front really jumps the whole way, not one step.
const orderBefore = await itemIds();
await page.click('#ps-contextmenu [data-context-command="layer-front"]');
await page.waitForTimeout(500);
const orderAfter = await itemIds();
ok(orderAfter[orderAfter.length - 1] === ids[0] &&
   orderAfter.length === orderBefore.length,
   `Move to front sends the bottom item to the very top in one step ` +
   `(${orderBefore.join()} -> ${orderAfter.join()})`);
// And undo brings the stack back in ONE step (same history label as the
// one-step moves).
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(500);
ok((await itemIds()).join() === orderBefore.join(),
   'one undo restores the stacking order');

console.log('case 4: the right-click menu tells the same truth');
await page.evaluate((id) => window.PS_SHELL.selectLayoutItems([id]),
                    (await itemIds())[0]);

await page.waitForTimeout(300);
const box = await page.evaluate(() => {
    const el = document.querySelector('#ps-lcanvas .ps-litem');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(box.x, box.y, { button: 'right' });
await page.waitForTimeout(400);
const menu = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(
        '#ps-contextmenu button[data-context-command]'));
    const get = c => {
        const b = rows.find(r => r.getAttribute('data-context-command') === c);
        return b ? { disabled: b.disabled,
                     tip: b.getAttribute('data-tip') || '' } : null;
    };
    return { back: get('layer-back'), forward: get('layer-forward') };
});
ok(menu.back && menu.back.disabled && /back of the stack/i.test(menu.back.tip),
   `"Move backward" is offered as unavailable, not as a no-op ` +
   `("${menu.back.tip}")`);
ok(menu.forward && !menu.forward.disabled,
   'while "Move forward" stays available');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 5: Cmd/Ctrl+scroll zooms the layout canvas smoothly');
// Aug 6 2026: the chart gesture, on the Layouts workspace, with the
// layout's own 25-150% clamps.
await page.evaluate(() => {
    const sel = document.getElementById('ps-lzoom');
    sel.value = '1';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(400);
const layWheel = async (deltaY, ctrl) => page.evaluate(([dy, c]) => {
    const vp = document.getElementById('ps-lviewport');
    const r = vp.getBoundingClientRect();
    vp.dispatchEvent(new WheelEvent('wheel', { bubbles: true,
        cancelable: true, clientX: r.left + 120, clientY: r.top + 120,
        deltaY: dy, ctrlKey: c }));
    return window.PS_SHELL.chart().view.zoom;
}, [deltaY, ctrl]);
ok(String(await layWheel(-240, false)) === '1',
   'a plain wheel scrolls; only the modifier zooms');
const lAtDispatch = await layWheel(-240, true);
ok(String(lAtDispatch) === '1',
   'the notch does not jump: the canvas is unchanged at dispatch (easing)');
await page.waitForFunction(() =>
    Number(window.PS_SHELL.chart().view.zoom) > 1.3, null,
    { timeout: 4000 });
await page.waitForTimeout(200);
const lz = await page.evaluate(() =>
    Number(window.PS_SHELL.chart().view.zoom));
const lState = await page.evaluate(() => {
    const sel = document.getElementById('ps-lzoom');
    const dyn = sel.querySelector('option[data-ps-custom]');
    return { dyn: dyn ? dyn.textContent : null,
             selected: dyn ? sel.value === dyn.value : false };
});
ok(lz > 1.3 && lz < 1.5 && lState.selected && /^\d+%$/.test(lState.dyn),
   `Ctrl+wheel settles between steps and the select shows it ` +
   `(${Math.round(lz * 100)}%, "${lState.dyn}")`);
for (let i = 0; i < 40; i++) await layWheel(300, true);
await page.waitForFunction(() =>
    Number(window.PS_SHELL.chart().view.zoom) === 0.25, null,
    { timeout: 4000 });
ok(await page.evaluate(() => Number(window.PS_SHELL.chart().view.zoom))
   === 0.25,
   "and it clamps at the layout's own 25% floor");
await page.evaluate(() => {
    const sel = document.getElementById('ps-lzoom');
    sel.value = 'fit';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const sel = document.getElementById('ps-lzoom');
    return !sel.querySelector('option[data-ps-custom]') &&
        sel.value === 'fit';
}), 'picking Fit removes the dynamic option');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT ARRANGE CHECK PASS');
await browser.close();
