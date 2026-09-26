// Screenshot the player page at a given viewport width after N seconds.
// usage: node tools/player-shot.mjs <url> <width> <seconds> <out.png> [clickSound]
import { chromium } from 'playwright';
const [url, width, secs, out, sound] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +width, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url);
if (sound) { await page.waitForTimeout(500); await page.click('.ptr-btn[aria-pressed]'); }
await page.waitForTimeout(+secs * 1000);
const box = await page.evaluate(() => { const r = document.querySelector('.ptr').getBoundingClientRect(); return { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 }; });
await page.screenshot({ path: out, clip: box });
const info = await page.evaluate(() => ({ t: window.PandionThreeRules && document.querySelector('[data-pandion-three-rules]').__ptr.time, pressed: document.querySelector('.ptr-btn[aria-pressed]').getAttribute('aria-pressed') }));
console.log(JSON.stringify(info), errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await browser.close();
