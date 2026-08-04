// textScale (Torry, Jul 31 2026): the standalone ships payload.textScale =
// 1.15 and the engine multiplies DEFAULT font sizes by it, below every
// explicit user size in the resolution order. Three contracts:
//   1. a default-styled text renders scaled (axis title: 15 -> 17.3),
//   2. a size the user SET renders exactly as set, unscaled,
//   3. the scale is defaults-only machinery: clearing the override returns
//      to the scaled default, so the two paths stay distinct.
// jamovi never ships the key; its byte-identity is structural (absent key
// means scale 1 and the raw default object passes through untouched) and
// is exercised by the jamovi battery, not here.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1500);
}

console.log('case 1: the payload carries the host scale');
const scale = await page.evaluate(() => window.PS_SHELL.buildPayload().textScale);
ok(scale === 1.15, `buildPayload ships textScale ${scale}`);

// The y-axis title defaults to fontSize 15; 15 * 1.15 = 17.25, and the
// engine rounds scaled defaults to one decimal: 17.3.
function titleSize() {
    return page.evaluate(() => {
        const svgs = [...document.querySelectorAll('svg')];
        let best = null, area = 0;
        for (const s of svgs) {
            const b = s.getBoundingClientRect();
            if (b.width * b.height > area) { area = b.width * b.height; best = s; }
        }
        const texts = [...best.querySelectorAll('text')];
        const t = texts.find(x => (x.textContent || '').trim() === 'score');
        return t ? parseFloat(getComputedStyle(t).fontSize) : null;
    });
}

console.log('case 2: a default-styled text renders scaled');
const scaled = await titleSize();
ok(scaled !== null && Math.abs(scaled - 17.3) < 0.05,
   `the default y-axis title renders at 17.3px, not the stock 15 (${scaled})`);

console.log('case 3: an explicit user size is NOT scaled');
await page.evaluate(() => {
    window.setOption('textStyles', [{ id: 'yTitle', fontSize: 15 }]);
});
await page.waitForTimeout(900);
const explicit = await titleSize();
ok(explicit !== null && Math.abs(explicit - 15) < 0.05,
   `a user-set 15 renders at exactly 15 (${explicit})`);

console.log('case 4: clearing the override returns to the scaled default');
await page.evaluate(() => { window.setOption('textStyles', []); });
await page.waitForTimeout(900);
const back = await titleSize();
ok(back !== null && Math.abs(back - 17.3) < 0.05,
   `back to 17.3 once the override is gone (${back})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('TEXTSCALE CHECK PASS');
await browser.close();
