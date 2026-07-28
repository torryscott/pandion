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

console.log('case 1: a disabled button looks disabled and says why');
await select(1);
await page.waitForTimeout(350);
const align1 = await look('[data-ctx-align="left"]');
const dup1 = await look('#ps-ctx-duplicate');
ok(align1.disabled && !dup1.disabled,
   'with one item selected, Align is inert while Duplicate is live');
ok(align1.color !== dup1.color || align1.bg !== dup1.bg,
   `and it READS as inert rather than looking identical to a live button ` +
   `(${align1.color} on ${align1.bg} vs ${dup1.color} on ${dup1.bg})`);
ok(/two or more/i.test(align1.tip),
   `its tooltip states the requirement ("${align1.tip}")`);
const dist1 = await look('[data-ctx-distribute="horizontal"]');
ok(dist1.disabled && /three or more/i.test(dist1.tip),
   `Distribute says what IT needs, which is different ("${dist1.tip}")`);

console.log('case 2: they come alive at the counts they need, and act');
await select(2);
await page.waitForTimeout(350);
const align2 = await look('[data-ctx-align="left"]');
ok(!align2.disabled, 'two selected: Align is live');
ok((await look('[data-ctx-distribute="horizontal"]')).disabled,
   'while Distribute still waits for a third');
const xsBefore = await page.evaluate(() =>
    (window.PS_SHELL.chart().items || []).slice(0, 2).map(i => Math.round(i.x)));
await page.click('[data-ctx-align="left"]');
await page.waitForTimeout(500);
const xsAfter = await page.evaluate(() =>
    (window.PS_SHELL.chart().items || []).slice(0, 2).map(i => Math.round(i.x)));
ok(xsAfter[0] === xsAfter[1],
   `and clicking it really aligns them (${JSON.stringify(xsBefore)} -> ` +
   `${JSON.stringify(xsAfter)})`);
await select(3);
await page.waitForTimeout(350);
ok(!(await look('[data-ctx-distribute="horizontal"]')).disabled,
   'three selected: Distribute is live too');

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
