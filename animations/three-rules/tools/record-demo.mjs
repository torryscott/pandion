// Record a walkthrough of the hands-on tour as video: a scripted visitor
// reads each step, moves a visible cursor to the target at a human pace,
// clicks, drags and types. Playwright records the page (WebM); ffmpeg
// turns it into an H.264 MP4 for sharing.
// usage: node tools/record-demo.mjs [out.mp4]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'out', 'Pandion three rules, hands-on (walkthrough).mp4'));
const W = 1280, H = 800;
/* a page that shows only the player, centred */
const recPage = path.join(ROOT, 'out', 'record.html');
fs.writeFileSync(recPage, `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#eef2f7;overflow:hidden}
.w{width:1180px;margin:24px auto 0}
#cur{position:fixed;left:0;top:0;width:34px;height:34px;pointer-events:none;z-index:99;transform:translate(-3px,-2px);transition:opacity .2s}
#cur svg{width:34px;height:34px;display:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
#cur[data-k="arrow"] .a,#cur[data-k="over"] .p,#cur[data-k="grab"] .h,#cur[data-k="grabbing"] .g{display:block}
.rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(55,92,160,.7);pointer-events:none;z-index:98;animation:rip .5s ease-out forwards}
@keyframes rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.2);opacity:0}}
</style></head><body><div class="w"><div data-pandion-three-rules></div></div>
<div id="cur" data-k="arrow">
<svg class="a" viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.2-4.1 2.7 6.2 3.1-1.3-2.7-6.1h5.9z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>
<svg class="p" viewBox="0 0 24 24"><path d="M9.5 3.2a1.6 1.6 0 0 1 3.2 0v6.2l4.5.9a2.2 2.2 0 0 1 1.8 2.5l-.9 5.6a3 3 0 0 1-3 2.6h-4.6a3 3 0 0 1-2.4-1.2L4.4 15a1.6 1.6 0 0 1 2.4-2.1l2.7 2.3z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>
<svg class="h" viewBox="0 0 24 24"><path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5V4a1.5 1.5 0 0 1 3 0v6m0-.5V5.5a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-6.5 6.5h-.8a6 6 0 0 1-4.8-2.4l-2.8-3.9a1.5 1.5 0 0 1 2.3-1.9L8 14" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
<svg class="g" viewBox="0 0 24 24"><path d="M8 11.5V9a1.5 1.5 0 0 1 3 0v1.5M11 10V8.5a1.5 1.5 0 0 1 3 0V10m0 0V9a1.5 1.5 0 0 1 3 0v5a6.5 6.5 0 0 1-6.5 6.5h-.8a6 6 0 0 1-4.8-2.4l-1.6-2.3A1.6 1.6 0 0 1 6 13.5l2 1.5" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
</div>
<script src="../dist/pandion-three-rules.js"></script>
<script>
var cur = document.getElementById('cur');
document.addEventListener('mousemove', function (e) { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
document.addEventListener('mousedown', function (e) { var r = document.createElement('div'); r.className = 'rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(function () { r.remove(); }, 600); }, true);
setInterval(function () {
  var s = document.querySelector('.ptr-stage'); if (!s) return;
  var k = s.classList.contains('ptr-grabbing') ? 'grabbing' : s.classList.contains('ptr-grab') ? 'grab' : s.classList.contains('ptr-over') ? 'over' : 'arrow';
  var el = document.elementFromPoint(parseFloat(cur.style.left) || 0, parseFloat(cur.style.top) || 0);
  if (el && el.closest && el.closest('button,a')) k = 'over';
  cur.setAttribute('data-k', k);
}, 30);
</script></body></html>`);
const vdir = path.join(ROOT, 'out', 'video-tmp');
fs.rmSync(vdir, { recursive: true, force: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } } });
const page = await context.newPage();
await page.goto(pathToFileURL(recPage).href);
let mx = W - 60, my = H - 60;
await page.mouse.move(mx, my);
const api = () => page.evaluate(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting);
const waitGate = (prev) => page.waitForFunction((prev) => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; const e = document.querySelector('.ptr-end'); return (a.waiting && a.waiting !== prev) || (e && !e.hidden); }, prev, { timeout: 30000 });
const box = () => page.evaluate(() => { const r = document.querySelector('.ptr-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const P = (b, p) => [b.x + p[0] / 1920 * b.w, b.y + p[1] / 1080 * b.h];
/* a human-ish move: eased, with a slight arc, about 40 frames a second */
async function glide(x, y, ms = 650) {
  const x0 = mx, y0 = my, n = Math.max(8, Math.round(ms / 25));
  const dx = x - x0, dy = y - y0, bend = 0.08 * Math.hypot(dx, dy);
  for (let i = 1; i <= n; i++) {
    const u = i / n, e = u * u * u * (10 - 15 * u + 6 * u * u);
    const px = x0 + dx * e - dy / (Math.hypot(dx, dy) || 1) * bend * Math.sin(Math.PI * u);
    const py = y0 + dy * e + dx / (Math.hypot(dx, dy) || 1) * bend * Math.sin(Math.PI * u);
    await page.mouse.move(px, py);
    await page.waitForTimeout(25);
  }
  mx = x; my = y;
}
async function clickAt(x, y) { await glide(x, y); await page.waitForTimeout(220); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); }
const center = r => [r[0] + r[2] / 2, r[1] + r[3] / 2];
await page.waitForFunction(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'hub', null, { timeout: 20000 });
await page.waitForTimeout(1600);
const go = await page.evaluate(() => { const r = document.querySelector('.ptr-hub-go').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await clickAt(go[0], go[1]);
let prev = 'hub';
for (;;) {
  await waitGate(prev);
  const id = await api();
  const ended = await page.evaluate(() => !document.querySelector('.ptr-end').hidden);
  if (ended) break;
  await page.waitForTimeout(1300);   /* read the step */
  const g = await page.evaluate((id) => ({ shape: window.PandionThreeRules.guide.shape(id), gate: window.PandionThreeRules.guide.gates.find(x => x.id === id) }), id);
  const b = await box();
  if (g.gate.kind === 'click') {
    const c = P(b, center(g.shape.beacon));
    await clickAt(c[0], c[1]);
  } else if (g.gate.kind === 'type') {
    await page.waitForTimeout(300);
    await page.keyboard.type('Dose Response', { delay: 95 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
  } else if (g.gate.kind === 'drag') {
    const grab = center((g.shape.grab || g.shape.hit)[0]);
    const a = P(b, grab), d = [g.shape.to[0] - g.shape.from[0], g.shape.to[1] - g.shape.from[1]];
    const e = P(b, [grab[0] + d[0] * 1.03, grab[1] + d[1] * 1.03]);
    await glide(a[0], a[1]);
    await page.waitForTimeout(250);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await glide(e[0], e[1], 900);
    await page.waitForTimeout(200);
    await page.mouse.up();
  }
  await page.waitForFunction((id) => document.querySelector('[data-pandion-three-rules]').__ptr.waiting !== id, id, { timeout: 5000 });
  prev = id;
  /* rest the pointer out of the way while the film plays on */
}
await page.waitForTimeout(2200);
const again = await page.evaluate(() => { const r = document.querySelector('.ptr-end-app').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await glide(again[0], again[1], 800);
await page.waitForTimeout(1500);
const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();
const r = spawnSync(ffmpeg, ['-y', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' });
fs.rmSync(vdir, { recursive: true, force: true });
console.log(r.status === 0 ? 'wrote ' + out : 'ffmpeg failed');
