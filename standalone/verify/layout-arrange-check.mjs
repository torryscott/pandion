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
const dup1 = await look('#ps-ctx-duplicate');
ok(!dup1.disabled, 'while the single-item actions stay live');
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

console.log('case 3: the layer buttons gate at the ends of the stack');
const ids = await itemIds();
await page.evaluate((id) => window.PS_SHELL.selectLayoutItems([id]), ids[0]);
await page.waitForTimeout(350);
const backAtBottom = await look('#ps-ctx-back');
ok(backAtBottom.disabled && /back of the stack/i.test(backAtBottom.tip),
   `the bottom item cannot go further back, and the button says so ` +
   `("${backAtBottom.tip}")`);
ok(!(await look('#ps-ctx-forward')).disabled,
   'while forward is available to it');
await page.evaluate((id) => window.PS_SHELL.selectLayoutItems([id]),
                    ids[ids.length - 1]);
await page.waitForTimeout(350);
const fwdAtTop = await look('#ps-ctx-forward');
ok(fwdAtTop.disabled && /front of the stack/i.test(fwdAtTop.tip),
   `and the top item cannot go further forward ("${fwdAtTop.tip}")`);
const orderBefore = await itemIds();
await page.click('#ps-ctx-back');
await page.waitForTimeout(500);
const orderAfter = await itemIds();
ok(orderAfter.join() !== orderBefore.join() &&
   orderAfter.indexOf(ids[ids.length - 1]) === orderBefore.length - 2,
   `Back moves it down one when it HAS somewhere to go ` +
   `(${orderBefore.join()} -> ${orderAfter.join()})`);

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

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT ARRANGE CHECK PASS');
await browser.close();
