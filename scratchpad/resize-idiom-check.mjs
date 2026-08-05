// Does Pandion's external-resize follow survive the way jamovi ACTUALLY
// resizes results images? jamovi uses CSS `resize: both` on the element
// (main.css:575-582) read back through a ResizeObserver (image.ts:135),
// NOT width/height attribute writes. If Damo copies that proven idiom for
// the Svg element, does our follow fire?
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const page = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await page.addInitScript(() => { window.__c = []; window.setOption = (k, v) => window.__c.push([k, String(v)]); });
await page.goto('file:///tmp/gb2-verify/cg_bar_labels.html');
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const host = document.querySelector('.graphbuilder2-host');
  const wrap = document.createElement('jmv-results-svg');
  host.parentNode.insertBefore(wrap, host);
  wrap.appendChild(host);
  window.__gb2_lastRenderedHash = null;
  const s = [...document.scripts].find((x) => /GraphBuilder2\.render\(/.test(x.textContent || ''));
  (0, eval)(s.textContent);
});
await page.waitForTimeout(900);

const q = () => page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  const dig = (blob) => { try { return JSON.parse(blob).plotWidth; } catch (e) { return undefined; } };
  const po = window.__gb2_pendingOpts || {};
  let pw = po.chartSpec ? dig(po.chartSpec) : po.plotWidth;
  if (pw === undefined) { const c = (window.__c || []).filter((x) => x[0] === 'chartSpec').pop(); if (c) pw = dig(c[1]); }
  return {
    attrW: parseFloat(live.getAttribute('width')),
    rectW: Math.round(live.getBoundingClientRect().width),
    styleW: live.style.width || '(none)',
    bars: [...document.querySelectorAll('jmv-results-svg [data-bar-cat]')].length,
    firstBarX: (() => { const el = document.querySelector('jmv-results-svg [data-bar-cat]'); return el ? Math.round(el.getBoundingClientRect().x) : -1; })(),
    plotWidth: pw === undefined ? null : pw,
  };
});

const before = await q();
console.log('baseline:', JSON.stringify(before));

// --- CASE A: resize the jamovi way (CSS width/height, like `resize: both`) ---
console.log('\nCASE A: CSS resize (jamovi\'s own idiom, resize:both sets inline style)');
await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  live.style.width = (parseFloat(live.getAttribute('width')) + 140) + 'px';
  live.style.height = (parseFloat(live.getAttribute('height')) + 100) + 'px';
});
await page.waitForTimeout(1400);
const afterCss = await q();
console.log('  after CSS resize:', JSON.stringify(afterCss));
ok(afterCss.rectW > before.rectW + 100, 'the element really did get bigger on screen');
ok(afterCss.plotWidth !== null, 'engine FOLLOWED a CSS resize (committed a size)');
ok(afterCss.firstBarX !== before.firstBarX || afterCss.attrW > before.attrW,
   'chart re-laid out to fill the new size (not just stretched)');

// --- CASE B: attribute resize while a pointer is down inside the host ---
// A CSS `resize: both` gripper lives ON the svg, so the press lands inside
// Pandion's host div. Does that suppress the follow?
console.log('\nCASE B: attribute resize while pointer is down inside the host');
await page.evaluate(() => {
  window.__gb2_pendingOpts = {}; window.__c = [];
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  live.style.width = ''; live.style.height = '';
  live.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3, isPrimary: true, buttons: 1, clientX: 5, clientY: 5 }));
});
await page.waitForTimeout(120);
const gate = await page.evaluate(() => !!window.__gb2_widgetPointerDown);
ok(gate === true, 'a press on the svg does set the internal pointer flag (precondition)');
const beforeB = await q();
await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  live.setAttribute('width', parseFloat(live.getAttribute('width')) + 130);
  live.setAttribute('height', parseFloat(live.getAttribute('height')) + 90);
});
await page.waitForTimeout(1400);
const afterB = await q();
console.log('  after attr resize w/ pointer down:', JSON.stringify(afterB));
ok(afterB.plotWidth !== null, 'engine FOLLOWED an attribute resize during a press inside the host');

// --- CASE C: over-drag past the supported range must settle, not spin ---
console.log('\nCASE C: CSS resize far beyond the supported range (loop guard)');
await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  live.style.width = '4000px';
  live.style.height = '3000px';
});
await page.waitForTimeout(1500);
const c1 = await q();
await page.waitForTimeout(1200);
const c2 = await q();
ok(Math.abs(c1.attrW - c2.attrW) < 0.5, `settled, no feedback loop (${c1.attrW} -> ${c2.attrW})`);
ok(c2.attrW <= 14 * 96 + 1, `clamped to the supported max width (${c2.attrW} <= ${14 * 96})`);
ok(Math.abs(parseFloat(c2.styleW) - c2.attrW) < 1.5,
   `inline style was pulled back to the clamp so the box matches the chart (${c2.styleW})`);

console.log(`\nVERDICT: ${pass} pass, ${fail} fail`);
console.log(fail === 0
  ? 'Both jamovi-style resize paths work.'
  : 'At least one jamovi-style resize path is IGNORED by the engine.');
await b.close();
process.exit(fail === 0 ? 0 : 1);
