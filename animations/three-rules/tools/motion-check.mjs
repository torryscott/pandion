// Scan the whole film at 60 fps for motion discontinuities: cursor jumps,
// camera jumps, and chart elements that teleport.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(ROOT, 'dev.html')).href + '?static=1&scale=0.1');
await page.waitForTimeout(200);
const res = await page.evaluate(() => {
  const out = [];
  let prev = null;
  for (let i = 0; i <= Math.round(DURATION * 60); i++) {
    const t = i / 60;
    const S = window.__render(t);
    const cur = { x: S.cur.x, y: S.cur.y, vis: S.cur.vis, type: S.cur.type };
    const cam = S.cam;
    if (prev) {
      const d = Math.hypot(cur.x - prev.cur.x, cur.y - prev.cur.y);
      if (d > 45 && cur.vis > 0.05 && prev.cur.vis > 0.05) out.push('cursor jump ' + d.toFixed(0) + 'px at ' + t.toFixed(3));
      const dz = Math.abs(Math.log(cam.z / prev.cam.z));
      if (dz > 0.03) out.push('camera zoom jump ' + dz.toFixed(3) + ' at ' + t.toFixed(3));
      const dc = Math.hypot((cam.x - prev.cam.x) * cam.z, (cam.y - prev.cam.y) * cam.z);
      if (dc > 60) out.push('camera pan jump ' + dc.toFixed(0) + 'px at ' + t.toFixed(3));
    }
    prev = { cur, cam: { x: cam.x, y: cam.y, z: cam.z } };
  }
  return out;
});
console.log(res.length ? res.join('\n') : 'no discontinuities');
await browser.close();
