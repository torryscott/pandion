// Render specific frames of the animation to PNG for review.
// usage: node tools/frames.mjs <outdir> <t1> [t2 ...]   (scale via SCALE env, default 0.5)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'out/frames'));
const times = process.argv.slice(3).map(Number);
const scale = +(process.env.SCALE || 0.5);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(path.join(ROOT, 'dev.html')).href + '?static=1&scale=' + scale);
await page.waitForTimeout(300);
for (const t of times) {
  const data = await page.evaluate((t) => { window.__render(t); return document.getElementById('c').toDataURL('image/png'); }, t);
  const f = path.join(outDir, 't' + t.toFixed(2).padStart(6, '0') + '.png');
  fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  console.log(f);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
