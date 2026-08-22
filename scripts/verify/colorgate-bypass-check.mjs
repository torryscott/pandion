// Round-2 bypasses found by the Aug 2026 adversarial pass. Each case
// pairs a hostile payload with the specific defence that closes it.
//   1. malformed chartSpec must not DISARM the colour scrub (the scrub
//      used to sit inside the bridge's try, so a JSON.parse throw left
//      every colour ungated while the render carried on)
//   2. annotation colours (annotationsJson is its own persisted option)
//   3. heatmap ramp stops (colour-valued keys whose names never say so)
//   4. __proto__ / constructor passing the chartSpec allowlist
//   5. chartFontFamily reaching a <style> element
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const BUNDLE = process.env.GB2_BUNDLE === 'min' ? 'min' : 'src';
const OUT = process.env.GB2_COLORGATE_OUT || '/tmp/gb2-colorgate';
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const html = readFileSync(`${OUT}/cg_${BUNDLE}.html`, 'utf8');
const basePayload = html.match(/var __gb2_payload = (\{.*?\});\n/s)[1];

const page = await (await b.newContext()).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.addInitScript(() => { window.setOption = function () {}; window.__pwned = 0; });
await page.goto(`file://${OUT}/cg_${BUNDLE}.html`);
await page.waitForTimeout(1400);

async function render(mutate) {
  return page.evaluate(([baseJson, fnSrc]) => {
    window.__pwned = 0;
    const p = JSON.parse(baseJson);
    (0, eval)('(' + fnSrc + ')')(p);
    window.__gb2_probeData = p;
    let host = document.querySelector('.graphbuilder2-host');
    if (!host) { host = document.createElement('div'); host.className = 'graphbuilder2-host'; host.id = 'gb2-probe'; document.body.appendChild(host); }
    window.__gb2_lastRenderedHash = null;
    window.GraphBuilder2.render(host.id, p);
  }, [basePayload, mutate.toString()]);
}
const state = () => page.evaluate(() => ({
  pwned: window.__pwned,
  img: document.querySelectorAll('img[src="x"],img[src="y"],img[src="zz"]').length,
  drew: document.querySelectorAll('path[data-bar-cat],rect[data-bar-cat]').length,
}));

// --- 1. malformed chartSpec must not disarm the scrub -------------------
await render((p) => {
  p.chartSpec = '{ this is not valid json';   // makes JSON.parse throw
  p.barColor = 'red;"><img src=x onerror=window.__pwned=1>';
  p.groupColors = [{ group: 'G1', color: 'q"><img src=y onerror=window.__pwned=2>' }];
});
await page.waitForTimeout(700);
let s = await state();
ok(s.drew > 0, 'malformed chartSpec: chart still renders (not vacuous)');
// Assert the INVARIANT the fix guarantees rather than one sink: after a
// malformed blob, no colour-valued field may still hold a breakout
// string. (Pre-fix these survive verbatim - verified by re-nesting the
// scrub, where this assertion goes red. The individual sinks reached in
// this configuration happen to be separately gated at their call sites
// or resolved through the palette, so a sink-based assertion would pass
// either way and prove nothing.)
const live = await page.evaluate(() => ({
  barColor: window.__gb2_probeData ? window.__gb2_probeData.barColor : null,
  gc0: window.__gb2_probeData && window.__gb2_probeData.groupColors
    ? window.__gb2_probeData.groupColors[0].color : null,
}));
ok(!/[<>"]/.test(live.barColor || ''),
   'malformed chartSpec: chart-wide colour still scrubbed (' + JSON.stringify(live.barColor) + ')');
ok(!/[<>"]/.test(live.gc0 || ''),
   'malformed chartSpec: per-group colour still scrubbed (' + JSON.stringify(live.gc0) + ')');
ok(s.pwned === 0 && s.img === 0, 'malformed chartSpec renders with nothing injected');

// --- 2. annotation colours ---------------------------------------------
await render((p) => {
  p.annotations = [{
    id: 'a1', kind: 'refline', x: 0, y: 0,
    color: 'red;"><img src=x onerror=window.__pwned=3>',
    lineColor: 'red;"><img src=y onerror=window.__pwned=4>',
    fillColor: 'red;"><img src=zz onerror=window.__pwned=5>',
  }];
});
await page.waitForTimeout(700);
s = await state();
ok(s.pwned === 0 && s.img === 0, 'annotation colours cannot inject');

// --- 3. heatmap ramp stops ---------------------------------------------
await render((p) => {
  p.xyBinCustomLow = 'red;"><img src=x onerror=window.__pwned=6>';
  p.xyBinCustomMid = 'red;"><img src=y onerror=window.__pwned=7>';
  p.xyBinCustomHigh = 'red;"><img src=zz onerror=window.__pwned=8>';
});
await page.waitForTimeout(700);
s = await state();
ok(s.pwned === 0 && s.img === 0, 'heatmap ramp stops cannot inject');

// --- 4. allowlist prototype read ---------------------------------------
const proto = await page.evaluate(([baseJson]) => {
  const p = JSON.parse(baseJson);
  p.specKeys = ['barColor'];
  p.specRealKeys = ['graphType'];
  p.chartSpec = JSON.stringify({ __proto__: { polluted: 1 }, constructor: 'x', bars: 'WIPED' });
  const host = document.querySelector('.graphbuilder2-host');
  window.__gb2_lastRenderedHash = null;
  window.GraphBuilder2.render(host.id, p);
  return { polluted: ({}).polluted !== undefined, barsOk: Array.isArray(p.bars) };
}, [basePayload]);
ok(!proto.polluted, 'allowlist: no Object.prototype pollution');
ok(proto.barsOk, 'allowlist: a non-style key cannot overwrite computed payload');

// --- 5. font family into <style> ---------------------------------------
await render((p) => {
  p.chartFontFamily = 'Arial; } body { display:none } .x {';
});
await page.waitForTimeout(700);
const font = await page.evaluate(() => {
  const els = [...document.querySelectorAll('style')].map((e) => e.textContent || '').join('');
  return { injected: /body\s*\{\s*display:none/.test(els),
           bodyVisible: getComputedStyle(document.body).display !== 'none' };
});
ok(!font.injected, 'font family cannot inject a second CSS rule');
ok(font.bodyVisible, 'page not defaced by the font value');

// --- 6. a real palette must survive the gate (the data-loss regression:
// customPalette is a comma-joined LIST, so a per-colour cap applied to
// the whole string wiped any palette of 9+ colours, and the loss was
// then persisted back into chartSpec by the next style commit) ---------
const P12 = '#2d5c94,#902634,#e18e4c,#597b2f,#faca59,#32295e,#5bb1ba,#d35a80,#4478ad,#6fb3ad,#266741,#976d76';
await render((p) => { p.customPalette = '#2d5c94,#902634,#e18e4c,#597b2f,#faca59,#32295e,#5bb1ba,#d35a80,#4478ad,#6fb3ad,#266741,#976d76'; });
await page.waitForTimeout(400);
const pal = await page.evaluate(() => window.__gb2_probeData.customPalette);
ok(pal === P12, 'a 12-colour custom palette survives the colour gate intact');
await render((p) => { p.customPalette = '#2d5c94,#902634,bad"><img src=x>,#597b2f'; });
await page.waitForTimeout(400);
const pal2 = await page.evaluate(() => window.__gb2_probeData.customPalette);
ok(pal2 === '#2d5c94,#902634,,#597b2f',
   'one hostile slot degrades alone, the other colours survive (' + pal2 + ')');

ok(errs.length === 0, 'no page errors across all cases (' + (errs[0] || '') + ')');
console.log(`\n[${BUNDLE}] VERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
