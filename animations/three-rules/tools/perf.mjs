// Measure per-frame render cost in Chromium or WebKit at a given backing width.
import { chromium, webkit } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = process.argv[2] || 'chromium';
const width = +(process.argv[3] || 2064);
const B = engine === 'webkit' ? webkit : chromium;
const browser = await B.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(pathToFileURL(path.join(ROOT, 'dev.html')).href + '?static=1&scale=' + (width / 1920));
await page.waitForTimeout(300);
const r = await page.evaluate(() => {
  const times = [];
  for (let t = 0; t < DURATION; t += 0.2) {
    const a = performance.now(); window.__render(t); times.push([t, performance.now() - a]);
  }
  times.sort((x, y) => y[1] - x[1]);
  const avg = times.reduce((s, x) => s + x[1], 0) / times.length;
  return { avg, worst: times.slice(0, 6) };
});
console.log(engine, 'width', width, 'avg ms', r.avg.toFixed(2), 'worst', r.worst.map(w => w[0].toFixed(1) + 's:' + w[1].toFixed(1)).join(' '));
if (errs.length) console.log('ERRORS', errs);
await browser.close();
