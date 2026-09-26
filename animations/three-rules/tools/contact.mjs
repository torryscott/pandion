// Build a contact sheet PNG from a folder of frames.
// usage: node tools/contact.mjs <dir> [cols] [thumbWidth]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = path.resolve(process.argv[2]);
const cols = +(process.argv[3] || 3), tw = +(process.argv[4] || 640);
const files = fs.readdirSync(dir).filter(f => /^t.*\.png$/.test(f)).sort();
const html = `<html><body style="margin:0;background:#222;font:14px sans-serif;color:#eee">
<div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;padding:6px">
${files.map(f => `<div><img src="${pathToFileURL(path.join(dir, f)).href}" style="width:${tw}px;display:block"><div>${f}</div></div>`).join('')}
</div></body></html>`;
const hp = path.join(dir, '_contact.html');
fs.writeFileSync(hp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: cols * (tw + 6) + 6, height: 400 } });
await page.goto(pathToFileURL(hp).href);
await page.waitForTimeout(400);
const out = path.join(dir, 'contact.png');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
