// Review probe: after a host CSS-resize (inline style set on the svg,
// follow settled, committed), does Pandion's OWN corner grip still
// visibly resize the chart, or does the lingering inline style override
// the engine's attribute writes until the next R echo rebuilds the svg?
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const page = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
await page.addInitScript(() => { window.setOption = function () {}; });
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

// host CSS-resize, in range, follow settles
await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  live.style.width = (parseFloat(live.getAttribute('width')) + 96) + 'px';
  live.style.height = (parseFloat(live.getAttribute('height')) + 48) + 'px';
});
await page.waitForTimeout(900);
const mid = await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  return { attrW: parseFloat(live.getAttribute('width')), styleW: live.style.width,
           rectW: Math.round(live.getBoundingClientRect().width) };
});
console.log('after host CSS drag:', JSON.stringify(mid));
ok(Math.abs(mid.attrW - mid.rectW) < 2, 'follow settled, attr and rect agree');
const styleLingers = /px$/.test(mid.styleW || '');
console.log('  inline style still present:', mid.styleW);

// now drag OUR OWN corner grip +100 x +60 with a real mouse
const grip = await page.evaluate(() => {
  const g = [...document.querySelectorAll('div')].find((d) => d.style.cursor === 'nwse-resize');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!grip) { console.log('NO GRIP FOUND'); process.exit(1); }
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
await page.mouse.move(grip.x + 50, grip.y + 30, { steps: 5 });
await page.mouse.move(grip.x + 100, grip.y + 60, { steps: 5 });
const during = await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  return { attrW: parseFloat(live.getAttribute('width')), styleW: live.style.width,
           rectW: Math.round(live.getBoundingClientRect().width) };
});
await page.mouse.up();
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  return { attrW: parseFloat(live.getAttribute('width')), styleW: live.style.width,
           rectW: Math.round(live.getBoundingClientRect().width) };
});
console.log('mid-grip-drag:', JSON.stringify(during));
console.log('after release:', JSON.stringify(after));
ok(during.attrW > mid.attrW + 80, 'engine attribute followed our grip drag');
ok(Math.abs(during.rectW - during.attrW) < 2,
   `VISIBLE size followed our grip too (rect ${during.rectW} vs attr ${during.attrW})` +
   (styleLingers ? ' despite the lingering inline style' : ''));
ok(Math.abs(after.rectW - after.attrW) < 2, 'agreement holds after release');

console.log(`\nVERDICT: ${pass} pass, ${fail} fail`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
