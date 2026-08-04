// "Copy the moment" (Torry, Jul 31 2026): he was screenshotting two ringed
// bars plus the Sigma focus card so the stats kept their context. One click
// now copies that as ONE composed image. The contracts:
//   1. the button appears on the focus card the moment a comparison is
//      pinned (shell-injected; the engine is untouched),
//   2. the composed image is the chart PLUS the card: taller than the
//      chart alone, same width,
//   3. the selection rings ride along - the deliberate opposite of every
//      export path, which strips transient state,
//   4. the whole pipeline really encodes (a multi-kilobyte PNG reached the
//      clipboard write), which also proves the foreignObject composition
//      does not taint the canvas.
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
    await page.waitForTimeout(1600);
}

console.log('case 1: pinning a comparison surfaces the button');
await page.evaluate(() => {
    const b = document.querySelector(
        '.graphbuilder2-host button[aria-label="Statistics"]');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(900);
// Pin the first comparison row on the pairs pane.
await page.evaluate(() => {
    const pane = document.querySelector('[data-st-pane="pairs"]');
    const row = pane.querySelector('tr[data-link]');
    row.click();
});
await page.waitForTimeout(700);
ok(await page.locator('[data-role="st-focus-card"]').count() === 1,
   'the focus card appeared for the pinned row');
await page.waitForTimeout(300);
ok(await page.locator('[data-ps-moment-copy]').count() === 1,
   'with the shell-injected "Copy with chart" button on it');

console.log('case 2: the copy composes chart + card, rings included');
const chartH = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('.graphbuilder2-host svg')];
    let best = null, area = 0;
    for (const s of svgs) {
        const r = s.getBoundingClientRect();
        if (r.width * r.height > area) { area = r.width * r.height; best = s; }
    }
    return Math.round(parseFloat(best.getAttribute('height')));
});
await page.evaluate(() => {
    // Headless has no clipboard permission; the write is stubbed and
    // everything upstream of it - the composition, the rasterize, the PNG
    // encode - runs for real.
    window.__psWrites = 0;
    navigator.clipboard.write = () => { window.__psWrites++; return Promise.resolve(); };
});
await page.click('[data-ps-moment-copy]');
await page.waitForFunction(() => window.__psMomentLast, null, { timeout: 15000 });
const moment = await page.evaluate(() => window.__psMomentLast);
const scale = 2;   // COPY_IMAGE_DPI 192 = 2x
ok(moment.rings >= 2,
   `the live chart carried the pair's rings at copy time (${moment.rings})`);
ok(moment.h > chartH * scale + 40,
   `the composed image is taller than the chart alone: the card is IN it ` +
   `(${moment.h}px vs chart ${chartH * scale}px)`);
ok(moment.blobSize > 20000,
   `a real PNG reached the clipboard write (${moment.blobSize} bytes): the ` +
   `pure-SVG card composition encodes cleanly on file://, where a ` +
   `foreignObject would have tainted the canvas (measured)`);
ok(await page.evaluate(() => window.__psWrites) === 1,
   'exactly one clipboard write happened');
const toast = await page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item');
    return items.length ? items[items.length - 1].textContent : '';
});
ok(/Comparison copied with its chart/.test(toast),
   'and the toast says what traveled together');

console.log('case 3: the button follows the pin to a new comparison');
await page.evaluate(() => {
    const pane = document.querySelector('[data-st-pane="pairs"]');
    const rows = pane.querySelectorAll('tr[data-link]');
    rows[1].click();
});
await page.waitForTimeout(700);
ok(await page.locator('[data-ps-moment-copy]').count() === 1,
   'the rebuilt card carries exactly one button (no stacking)');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('COPY MOMENT CHECK PASS');
await browser.close();
