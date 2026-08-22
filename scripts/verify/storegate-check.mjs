// Layer 2 for the two routes storegate-render.R covers. The R gate already
// strips these (the render script asserts that), so here the hostile value
// is injected CLIENT-side, which is what an older build's persisted state
// or a future ungated path would look like.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const B = process.env.GB2_BUNDLE === 'min' ? 'min' : 'src';
const OUT = process.env.GB2_STOREGATE_OUT || '/tmp/gb2-storegate';
const b = await chromium.launch();
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok   ' + m); else { console.log('  FAIL ' + m); fails++; } };

const H = 'red;"><img src=zz onerror=window.__PWNED=(window.__PWNED||0)+1>';
const page = await (await b.newContext()).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.addInitScript(() => { window.setOption = function () {}; window.__PWNED = 0; });
await page.goto(`file://${OUT}/xy_${B}.html`);
await page.waitForTimeout(1700);

const clean = await page.evaluate(() => ({
  drew: document.querySelectorAll('[data-role="xy-point"]').length,
  pwned: window.__PWNED,
}));
ok(clean.drew > 0, `scatter rendered (${clean.drew} points)`);
ok(clean.pwned === 0, 'the R-cleaned fixture executes nothing');

// Now poison the live payload the way an older build's saved value would,
// and open the point style panel, which reads the store back out.
const injected = await page.evaluate((h) => {
  const gs = JSON.stringify({ G1: { color: h, outlineColor: h },
                              G2: { color: h, outlineColor: h } });
  const d = window.gb2_undo && window.gb2_undo.getData ? window.gb2_undo.getData() : null;
  if (!d) return 'no data handle';
  for (const k of ['xyPointGroupStyles','xyEllipseGroupStyles','xyRugGroupStyles',
                   'xyDensity2DGroupStyles','xyMarginalGroupStyles']) d[k] = gs;
  const pt = document.querySelector('[data-role="xy-point"]');
  if (!pt) return 'no point';
  const r = pt.getBoundingClientRect();
  window.__ptXY = [r.x + r.width / 2, r.y + r.height / 2];
  return 'poisoned';
}, H);
ok(/poisoned/.test(injected), injected);
// A REAL gesture: this engine swallows synthetic clicks that carry detail 0
// or no pointer sequence, so a dispatched click never reaches the sink.
const xy = await page.evaluate(() => window.__ptXY);
if (xy) { await page.mouse.move(xy[0], xy[1]); await page.mouse.click(xy[0], xy[1]); }
await page.waitForTimeout(1400);
const post = await page.evaluate(() => ({
  pwned: window.__PWNED,
  img: document.querySelectorAll('img[src="zz"]').length,
  panel: !!document.querySelector('[data-role="inspector-title"]'),
}));
ok(post.panel, 'a style panel opened (the sink was reached)');
ok(post.pwned === 0, `nothing executed from the poisoned store (pwned=${post.pwned})`);
ok(post.img === 0, `no injected <img> (${post.img})`);
ok(errs.length === 0, 'no page errors (' + (errs[0] || '') + ')');

console.log(`\n[${B}] STORE GATE: ${fails === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
