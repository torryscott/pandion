// Walk the hands-on tour end to end in a real browser, the way a visitor
// would: wait at each stop, click or drag the real target (from the
// player's own gate geometry), type an axis title, and screenshot every
// stop plus the middle of every drag.
// usage: node tools/tour-check.mjs [url] [outDir] [chromium|webkit] [width]
import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] || 'http://127.0.0.1:8883/player-test.html';
const out = path.resolve(process.argv[3] || path.join(ROOT, 'out/tour'));
const engine = (process.argv[4] || 'chromium') === 'webkit' ? webkit : chromium;
const vw = +(process.argv[5] || 1280);
fs.mkdirSync(out, { recursive: true });
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').scrollIntoView({ block: 'center' }));
const api = () => page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: a.time, waiting: a.waiting, playing: a.playing, dragging: a.dragging }; });
/* Try it yourself turns the sound on: the narrated tour runs through the film's pauses */
const waitGate = async (prev, timeout = 45000) => {
  const t0 = Date.now();
  for (;;) {
    const s = await api();
    if (s.waiting && s.waiting !== prev) return s;
    const endShown = await page.evaluate(() => { const e = document.querySelector('.ptr-end'); return !!e && !e.hidden; });
    if (endShown) return { end: true, ...s };
    if (Date.now() - t0 > timeout) throw new Error('no gate after ' + prev + ' (t=' + s.t.toFixed(2) + ')');
    await page.waitForTimeout(60);
  }
};
const stageBox = () => page.evaluate(() => { const r = document.querySelector('.ptr-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, p) => [b.x + p[0] / 1920 * b.w, b.y + p[1] / 1080 * b.h];
const center = r => [r[0] + r[2] / 2, r[1] + r[3] / 2];
const shot = async (name) => { const el = await page.$('.ptr'); await el.screenshot({ path: path.join(out, name + '.png') }); };
const log = [];
let n = 0;
let s = await waitGate(null);
if (s.waiting !== 'hub') throw new Error('expected the start card, got ' + s.waiting);
await shot(String(n++).padStart(2, '0') + '-hub');
log.push('hub at t=' + s.t.toFixed(2));
await page.click('.ptr-hub-go');
let prev = 'hub';
for (;;) {
  s = await waitGate(prev);
  if (s.end) { await page.waitForTimeout(400); await shot(String(n++).padStart(2, '0') + '-end'); log.push('end card at t=' + s.t.toFixed(2)); break; }
  const id = s.waiting;
  await page.waitForTimeout(450);   /* let the coach card and beacon settle */
  await shot(String(n++).padStart(2, '0') + '-' + id);
  const g = await page.evaluate((id) => { const G = window.PandionThreeRules.guide; return { shape: G.shape(id), gate: G.gates.find(x => x.id === id) }; }, id);
  const b = await stageBox();
  const t0 = Date.now();
  if (g.gate.kind === 'click') {
    const c = toPage(b, center(g.shape.beacon));
    await page.mouse.move(c[0], c[1], { steps: 4 });
    await page.mouse.down(); await page.mouse.up();
  } else if (g.gate.kind === 'type') {
    await page.waitForTimeout(150);
    await page.keyboard.type('Dose Response', { delay: 40 });
    await shot(String(n++).padStart(2, '0') + '-typed');
    await page.keyboard.press('Enter');
  } else if (g.gate.kind === 'drag') {
    const grab = center((g.shape.grab || g.shape.hit)[0]);
    const a = toPage(b, grab), d = [g.shape.to[0] - g.shape.from[0], g.shape.to[1] - g.shape.from[1]];
    const e = toPage(b, [grab[0] + d[0] * 1.04, grab[1] + d[1] * 1.04]);
    await page.mouse.move(a[0], a[1], { steps: 3 });
    await page.mouse.down();
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(a[0] + (e[0] - a[0]) * i / steps, a[1] + (e[1] - a[1]) * i / steps);
      await page.waitForTimeout(16);
      if (i === Math.round(steps * 0.6)) await shot(String(n++).padStart(2, '0') + '-' + id + '-mid');
    }
    await page.waitForTimeout(120);
    await page.mouse.up();
  }
  /* the film must move on from this stop */
  await page.waitForFunction((id) => document.querySelector('[data-pandion-three-rules]').__ptr.waiting !== id, id, { timeout: 4000 })
    .catch(() => { throw new Error('stuck at ' + id); });
  log.push(`${id.padEnd(11)} t=${s.t.toFixed(2)}  answered in ${Date.now() - t0} ms`);
  prev = id;
}
console.log(log.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
