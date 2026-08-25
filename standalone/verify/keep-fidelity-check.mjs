// A kept Notebook page is a RECORD, so it must show the chart at rest.
// Found on the live site (Aug 4 2026): the Keep paths take a plain
// cloneNode of the LIVE svg, so a pointer resting on a mark baked its
// hover highlight into the page. The engine strips hover from its own
// export harvest; these shell-side Keep paths did not.
//
// THE DISCRIMINATING DETAIL, learned by writing the probe wrong twice:
// the chart right-click does NOT reproduce this, because walking the
// mouse to the menu item fires a natural mouseleave first. The Sigma
// Keep button does, because the pointer never has to leave the mark.
// A probe aimed at the right-click passes with the bug still present.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}

console.log('case 1: the Sigma Keep button, pointer parked on a mark');
await page.evaluate(() =>
    document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(900);
await page.evaluate(() =>
    document.querySelector('[data-st-pane="pairs"] tr[data-link]').click());
await page.waitForTimeout(700);
ok(await page.locator('[data-ps-moment-keep]').count() === 1,
   'setup: a comparison is pinned and the Keep button is live');

const box = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const r = svg.querySelector('[data-bar-cat]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
       document.querySelectorAll('.graphbuilder2-host [style*="brightness"], ' +
           '.graphbuilder2-host [filter^="url(#gb2-hb-"]')
           .length) >= 1,
   'setup: the mark under the pointer is genuinely hovered ' +
   '(style filter or the Aug 24 2026 gb2-hb defs-filter attribute)');

// synthetic click: the pointer never leaves the mark, which is the path
// a keyboard user takes and the one that actually bakes the highlight in
await page.evaluate(() =>
    document.querySelector('[data-ps-moment-keep]').click());
await page.waitForTimeout(1400);
const kept = await page.evaluate(() => {
    const pins = (window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins);
    const pin = pins[pins.length - 1];
    const txt = decodeURIComponent(pin.src.slice(pin.src.indexOf(',') + 1));
    return { n: pins.length, hasChart: txt.indexOf('data-bar-cat') >= 0,
             brightness: (txt.match(/brightness\(/g) || []).length +
                         (txt.match(/gb2-hb-/g) || []).length };
});
ok(kept.n >= 1 && kept.hasChart, 'the Keep landed a page carrying the chart');
ok(kept.brightness === 0,
   `and the page carries NO hover highlight in either form, style filter ` +
   `or gb2-hb defs reference: the record shows the chart at rest ` +
   `(${kept.brightness} hover residues stored)`);
ok(await page.evaluate(() =>
       document.querySelectorAll('.graphbuilder2-host [data-bar-cat]').length) > 0,
   'and the live chart is undamaged: the strip runs on the copy only');

console.log('case 2: the chart right-click path is clean too');
await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + 40 }));
});
await page.waitForTimeout(350);
await page.evaluate(() => {
    const it = document.querySelector('[data-context-action^="pin-chart"]');
    if (it) it.click();
});
await page.waitForTimeout(350);
// The Aug 5 2026 shape: Keep opens the section submenu first.
await page.evaluate(() => {
    const row = document.querySelector(
        '#ps-contextmenu [data-context-action^="keep-to-"]');
    if (row) row.click();
});
await page.waitForTimeout(1100);
ok(await page.evaluate(() => {
    const pins = (window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins);
    const txt = decodeURIComponent(pins[pins.length - 1].src
        .slice(pins[pins.length - 1].src.indexOf(',') + 1));
    return (txt.match(/brightness\(/g) || []).length === 0 &&
           (txt.match(/gb2-hb-/g) || []).length === 0;
}), 'a chart pinned from the right-click carries no hover state either');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('KEEP FIDELITY CHECK PASS');
await browser.close();
