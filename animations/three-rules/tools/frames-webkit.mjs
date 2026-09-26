import { webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2]);
const times = process.argv.slice(3).map(Number);
fs.mkdirSync(outDir, { recursive: true });
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.join(ROOT, 'dev.html')).href + '?static=1&scale=0.5');
await page.waitForTimeout(300);
for (const t of times) {
  const data = await page.evaluate((t) => { window.__render(t); return document.getElementById('c').toDataURL('image/png'); }, t);
  fs.writeFileSync(path.join(outDir, 't' + t.toFixed(2).padStart(6, '0') + '.png'), Buffer.from(data.split(',')[1], 'base64'));
}
console.log(errors.length ? 'ERRORS ' + errors.join('|') : 'ok');
await browser.close();
