// Replaying the tour must start clean: nothing from the last run may
// show on the start card. Walks the whole tour (the tour-check actions),
// then presses the player's Replay button and compares the caption corner
// of the start card with a fresh page load's.
// usage: node tools/tour-replay-check.mjs [url] [chromium|webkit]
import { chromium, webkit } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:8883/player-test.html';
const engine = (process.argv[3] || 'chromium') === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
await page.goto(url);
await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').scrollIntoView({ block: 'center' }));
const st = () => page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: a.time, waiting: a.waiting }; });
const waitFor = (id, timeout = 45000) => page.waitForFunction((id) => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === id, id, { timeout }).then(() => true, () => false);
const stageBox = () => page.evaluate(() => { const r = document.querySelector('.ptr-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, p) => [b.x + p[0] / 1920 * b.w, b.y + p[1] / 1080 * b.h];
const center = r => [r[0] + r[2] / 2, r[1] + r[3] / 2];
/* the caption corner: where the chapter chip and caption pill sit */
async function corner() {
  const b = await stageBox();
  const a = toPage(b, [20, 16]), z = toPage(b, [960, 120]);
  const png = await page.screenshot({ clip: { x: a[0], y: a[1], width: z[0] - a[0], height: z[1] - a[1] } });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    /* darkest pixel: the page grid is pale, caption text is navy */
    let min = 255; for (let i = 0; i < d.length; i += 4) min = Math.min(min, (d[i] + d[i + 1] + d[i + 2]) / 3);
    return min;
  }, png.toString('base64'));
}
ok(await waitFor('hub'), 'a fresh page stops on the start card');
await page.waitForTimeout(500);
const fresh = await corner();
ok(fresh > 150, `fresh start card: no caption in the corner (darkest ${fresh.toFixed(0)})`);
await page.click('.ptr-hub-go');
let prev = 'hub';
for (;;) {
  await page.waitForFunction((prev) => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; const e = document.querySelector('.ptr-end'); return (a.waiting && a.waiting !== prev) || (e && !e.hidden); }, prev, { timeout: 45000 });
  if (await page.evaluate(() => !document.querySelector('.ptr-end').hidden)) break;
  const id = (await st()).waiting;
  await page.waitForTimeout(300);
  const g = await page.evaluate((id) => { const G = window.PandionThreeRules.guide; return { shape: G.shape(id), gate: G.gates.find(x => x.id === id) }; }, id);
  const b = await stageBox();
  if (g.gate.kind === 'click') {
    const c = toPage(b, center(g.shape.beacon));
    await page.mouse.move(c[0], c[1], { steps: 4 });
    await page.mouse.down(); await page.mouse.up();
  } else if (g.gate.kind === 'type') {
    await page.keyboard.type('Dose Response', { delay: 20 });
    await page.keyboard.press('Enter');
  } else {
    const grab = center((g.shape.grab || g.shape.hit)[0]);
    const a = toPage(b, grab), d = [g.shape.to[0] - g.shape.from[0], g.shape.to[1] - g.shape.from[1]];
    const e = toPage(b, [grab[0] + d[0] * 1.04, grab[1] + d[1] * 1.04]);
    await page.mouse.move(a[0], a[1], { steps: 3 });
    await page.mouse.down();
    for (let i = 1; i <= 18; i++) { await page.mouse.move(a[0] + (e[0] - a[0]) * i / 18, a[1] + (e[1] - a[1]) * i / 18); await page.waitForTimeout(16); }
    await page.waitForTimeout(120);
    await page.mouse.up();
  }
  await page.waitForFunction((id) => document.querySelector('[data-pandion-three-rules]').__ptr.waiting !== id, id, { timeout: 4000 });
  prev = id;
}
ok(true, 'walked the whole tour to the end card');
/* Replay from the player's own button */
await page.click('.ptr-main');
ok(await waitFor('hub'), 'Replay plays the intro and stops on the start card again');
await page.waitForTimeout(500);
const again = await corner();
ok(again > 150, `replayed start card: no caption left over from the last run (darkest ${again.toFixed(0)})`);
/* and the next rule's title card is clean too */
await page.click('.ptr-hub-go');
ok(await waitFor('r1it'), 'Try it yourself stops at the Rule 1 title');
await page.waitForTimeout(400);
const title = await corner();
ok(title > 150, `Rule 1 title card after a replay: no caption (darkest ${title.toFixed(0)})`);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
console.log(fails ? fails + ' FAILED' : 'all passed');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
