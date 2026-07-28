// Punch list t2-39: the same verb had four different treatments, and the one
// with NO acknowledgement at all was the figure composer.
//
// Layout items wrote style.left/top directly, with no dragging class and no
// cursor:grabbing DESPITE declaring cursor:grab, so a chart panel being
// dragged looked exactly like one sitting still. Tabs already had the right
// treatment (a lifted state with a shadow and a grabbing cursor), so the
// layout adopts that rather than inventing a fifth feel.
//
// PARTIAL, and the remainder is recorded rather than quietly dropped: variable
// chips still use native HTML5 drag-and-drop, which has no touch support at
// all. Replacing that with pointer events is a different and larger job than
// making a drag look like a drag.
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
await page.waitForTimeout(1500);

const built = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const id = window.PS_SHELL.chart().id;
    window.PS_SHELL.createLayoutFromTemplate('presentation');
    await s(1500);
    document.getElementById('ps-laddchart').click();
    await s(300);
    const b = document.querySelector(
        '#ps-lchartmenu button[data-chart="' + id + '"]');
    if (b) b.click();
    await s(1200);
    return document.querySelectorAll('#ps-lcanvas .ps-litem').length;
});
ok(built === 1, `setup: a chart panel on the canvas (${built})`);

console.log('case 1: a drag in the figure composer is acknowledged');
const box = await page.evaluate(() => {
    const el = document.querySelector('#ps-lcanvas .ps-litem');
    const r = el.getBoundingClientRect();
    // The RESTING shadow, because a selected item already has one: asserting
    // only that a shadow exists during the drag passes on the selection
    // outline and proves nothing.
    return { x: r.x + r.width / 2, y: r.y + r.height / 2,
             restShadow: getComputedStyle(el).boxShadow };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.move(box.x + 8, box.y + 6, { steps: 3 });
await page.waitForTimeout(120);
const during = await page.evaluate(() => {
    const el = document.querySelector('#ps-lcanvas .ps-litem');
    const cv = document.getElementById('ps-lcanvas');
    return { lifted: el.classList.contains('ps-litem-dragging'),
             cursor: getComputedStyle(el).cursor,
             canvas: cv.classList.contains('ps-lcanvas-dragging'),
             shadow: getComputedStyle(el).boxShadow };
});
ok(during.lifted,
   'the item carries a dragging class, which it previously never did');
ok(during.cursor === 'grabbing',
   `and the cursor is grabbing rather than the grab it declares at rest ` +
   `(${during.cursor})`);
ok(during.canvas,
   'the canvas carries it too, so the cursor holds while the pointer travels ' +
   'off the item it is carrying');
ok(during.shadow !== box.restShadow,
   `and a shadow it did NOT have at rest, which is the lift the tab strip ` +
   `already used (rest ${JSON.stringify(box.restShadow)} -> ` +
   `${JSON.stringify(during.shadow)})`);

console.log('case 2: and it is put down again');
await page.mouse.move(box.x + 40, box.y + 30, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
    const el = document.querySelector('#ps-lcanvas .ps-litem');
    const cv = document.getElementById('ps-lcanvas');
    return { lifted: el.classList.contains('ps-litem-dragging'),
             canvas: cv.classList.contains('ps-lcanvas-dragging'),
             cursor: getComputedStyle(el).cursor };
});
ok(!after.lifted && !after.canvas,
   'the lift is gone on release');
ok(after.cursor === 'grab',
   `and the resting cursor is back (${after.cursor})`);

console.log('case 3: a plain click is a selection, not a lift');
const clickOnly = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const el = document.querySelector('#ps-lcanvas .ps-litem');
    const r = el.getBoundingClientRect();
    const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
                 bubbles: true, button: 0, pointerId: 1, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ buttons: 1 }, at)));
    await s(120);
    const mid = el.classList.contains('ps-litem-dragging');
    document.dispatchEvent(new PointerEvent('pointerup', Object.assign({ buttons: 0 }, at)));
    await s(300);
    return { mid, after: el.classList.contains('ps-litem-dragging') };
});
ok(!clickOnly.mid && !clickOnly.after,
   'a press that never travels does not lift, so an ordinary click does not ' +
   'flash');

console.log('case 4: Escape mid-drag puts it down too');
const escaped = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const el = document.querySelector('#ps-lcanvas .ps-litem');
    const r = el.getBoundingClientRect();
    const base = { bubbles: true, button: 0, pointerId: 1, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign(
        { clientX: r.x + 20, clientY: r.y + 20, buttons: 1 }, base)));
    document.dispatchEvent(new PointerEvent('pointermove', Object.assign(
        { clientX: r.x + 60, clientY: r.y + 50, buttons: 1 }, base)));
    await s(150);
    const cv = document.getElementById('ps-lcanvas');
    const mid = cv.classList.contains('ps-lcanvas-dragging');
    document.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'Escape', bubbles: true, cancelable: true }));
    await s(500);
    return { mid, canvas: cv.classList.contains('ps-lcanvas-dragging'),
             lifted: document.querySelectorAll(
                 '#ps-lcanvas .ps-litem-dragging').length };
});
ok(escaped.mid,
   'setup: the drag really was lifted before Escape');
ok(!escaped.canvas && escaped.lifted === 0,
   'Escape clears it, which is its OWN path and does not run the release ' +
   'handler, so it has to clear the lift itself');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('DRAG FEEL CHECK PASS');
await browser.close();
