// Client-side belt: even if a hostile color reaches the browser (from an
// R build that predates the R gate, or from client state), the engine
// must (a) never execute an injected payload, (b) scrub color-named
// data.* fields + store entries at the bridge, and (c) neutralize the
// hover-path tooltip swatch. We inject the hostile blob by re-running the
// top-level render with a poisoned payload, the exact shape a crafted
// .omv would produce after R's echo if the R gate were absent.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const BUNDLE = process.env.GB2_BUNDLE === 'min' ? 'min' : 'src';
const OUT = process.env.GB2_COLORGATE_OUT || '/tmp/gb2-colorgate';
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const page = await (await b.newContext()).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.addInitScript(() => { window.setOption = function () {}; window.__pwned = 0; });
await page.goto(`file://${OUT}/cg_${BUNDLE}.html`);
await page.waitForTimeout(1400);
ok(pageErrors.length === 0, 'clean load: no page errors (' + (pageErrors[0]||'') + ')');

// Pull the payload JSON straight out of the fixture (the render runs in an
// IIFE, so the var is not reachable from the page - we re-drive render()
// against the real global GraphBuilder2 with a poisoned copy instead).
import { readFileSync } from 'node:fs';
const html = readFileSync(`${OUT}/cg_${BUNDLE}.html`, 'utf8');
const pm = html.match(/var __gb2_payload = (\{.*?\});\n/s);
if (!pm) { console.log('  FAIL could not extract payload'); process.exit(1); }
const basePayload = pm[1];

// Re-render with a poisoned payload: hostile chart-wide color, a hostile
// per-group color store entry, and a hostile group NAME (names are
// escaped elsewhere, not color-gated - must still not execute).
await page.evaluate((baseJson) => {
  window.__pwned = 0;
  const p = JSON.parse(baseJson);
  p.barColor = 'red;"><img src=x onerror=window.__pwned=1>';
  p.groupColors = [
    { group: 'G1', color: 'x"><img src=y onerror=window.__pwned=2>' },
    { group: 'G2', color: '#dd7e2b' }
  ];
  p.chartBackground = 'white;"><script>window.__pwned=3<\/script>';
  // ensure a host div exists for this render
  let host = document.querySelector('.graphbuilder2-host');
  if (!host) { host = document.createElement('div'); host.className = 'graphbuilder2-host'; host.id = 'gb2-probe'; document.body.appendChild(host); }
  window.__gb2_lastRenderedHash = null;
  window.GraphBuilder2.render(host.id, p);
}, basePayload);
await page.waitForTimeout(700);

const after = await page.evaluate(() => {
  // Read what the engine actually kept on its live payload after the bridge.
  const svg = [...document.querySelectorAll('svg')].sort(
    (a, z) => (z.clientWidth*z.clientHeight) - (a.clientWidth*a.clientHeight))[0];
  return {
    pwned: window.__pwned,
    injectedImg: document.querySelectorAll('img[src="x"],img[src="y"]').length,
    injectedScript: [...document.querySelectorAll('script')]
      .some((s) => /__pwned=3/.test(s.textContent || '')),
    barFill: svg ? ([...svg.querySelectorAll('path[data-bar-cat],rect[data-bar-cat]')].map(e=>e.getAttribute('fill')).find(f=>/^#|rgb/.test(f||''))||null) : null,
  };
});
ok(after.barFill != null, 'poisoned render actually drew bars (not vacuous)');
ok(after.pwned === 0, 'no injected handler fired (window.__pwned=' + after.pwned + ')');
// CONTROL: prove the harness catches a real breakout. Inject the SAME
// hostile string straight into innerHTML with no gate; __pwned must flip.
await page.evaluate(() => {
  window.__pwned = 0;
  const d = document.createElement('div');
  d.innerHTML = '<span style="background:red;\"><img src=zz onerror=window.__pwned=9></span>';
  document.body.appendChild(d);
});
await page.waitForTimeout(300);
const control = await page.evaluate(() => window.__pwned);
ok(control === 9, 'control: an ungated breakout DOES fire (harness is live)');
ok(after.injectedImg === 0, 'no injected <img> in the DOM');
ok(!after.injectedScript, 'no injected <script> executed');

// Hover the first bar to exercise the tooltip swatch path with a poisoned
// group color still in the store.
await page.evaluate(() => { window.__pwned = 0; });
const bar = await page.$('path[data-bar-cat],rect[data-bar-cat]');
if (bar) { await bar.hover(); await page.waitForTimeout(200); }
const hov = await page.evaluate(() => ({
  pwned: window.__pwned,
  img: document.querySelectorAll('img[src="x"],img[src="y"]').length,
}));
ok(hov.pwned === 0 && hov.img === 0, 'hover tooltip swatch stays inert (pwned='+hov.pwned+' img='+hov.img+')');

console.log(`\n[${BUNDLE}] VERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
