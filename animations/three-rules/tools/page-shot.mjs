// Screenshot a page viewport after N seconds. usage: node page-shot.mjs url width height secs out
import { chromium } from 'playwright';
const [url, w, h, secs, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(+secs * 1000);
await page.screenshot({ path: out });
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no errors');
await browser.close();
