// pixel-truth-jamovi-check.mjs - the jamovi half of the pixel-truth
// contract: the same tick-calibrated decoding the standalone gate runs,
// applied to pages rendered through the real module .b.R path (R
// aggregation -> payload -> engine). Fixtures from pixel-truth-render.R
// carry hardcoded data; every expectation is recomputed here
// independently. One shared toolkit measures both hosts, so they can
// never drift apart under different rulers.
// Usage: Rscript scripts/verify/pixel-truth-render.R && node this
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');
import { installToolkit } from '../../standalone/verify/pixel-toolkit.mjs';

const OUT = process.env.GB2_PIXEL_OUT || '/tmp/gb2-pixel-jamovi';
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const se = a => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)) /
    Math.sqrt(a.length);
};
const sortedClose = (got, want, tol, label) => {
  const g = [...got].sort((a, b) => a - b), w = [...want].sort((a, b) => a - b);
  if (g.length !== w.length) {
    ok(false, label + ': ' + g.length + ' marks vs ' + w.length + ' expected');
    return;
  }
  let bad = '';
  for (let i = 0; i < g.length; i++)
    if (Math.abs(g[i] - w[i]) > tol) {
      bad = 'decoded ' + g[i].toFixed(3) + ' vs data ' + w[i].toFixed(3);
      break;
    }
  ok(!bad, label + (bad ? ' - ' + bad : ''));
};

const g1 = [4, 6, 9, 13], g2 = [10, 14, 15, 21], g3 = [2, 3, 4, 3], g4 = [16, 18, 25, 21];
const xs = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];
const ys = [3, 7, 4, 9, 12, 8, 15, 11, 18, 20];

for (const f of ['cg_bar.html', 'cg_dot.html', 'xy_scatter.html']) {
  if (!fs.existsSync(path.join(OUT, f))) {
    console.log('PIXEL TRUTH JAMOVI FAIL (fixture missing: ' + f +
      ' - run pixel-truth-render.R first)');
    process.exit(1);
  }
}

const b = await chromium.launch();
async function open(f) {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('file://' + path.join(OUT, f));
  await page.waitForTimeout(1500);
  // The toolkit scopes to .graphbuilder2-host; jamovi fixture pages
  // render the host div directly.
  await page.evaluate(() => {
    if (!document.querySelector('.graphbuilder2-host')) {
      const w = document.querySelector('[id^="gb2"], body > div');
      if (w) w.classList.add('graphbuilder2-host');
    }
  });
  await installToolkit(page);
  return page;
}

console.log('jamovi fixture 1: grouped bars + error bars');
{
  const page = await open('cg_bar.html');
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate, px, barShapes } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const tops = [], bases = [], ebEnds = [];
    for (const el of barShapes(svg)) {
      const p = px(el);
      tops.push(cal.toData(p.y0));
      bases.push(cal.toData(p.y1));
    }
    for (const el of svg.querySelectorAll('[data-role="error-bar"] line')) {
      const x1 = parseFloat(el.getAttribute('x1')), x2 = parseFloat(el.getAttribute('x2'));
      if (!isFinite(x1) || Math.abs(x1 - x2) > 0.5) continue;
      ebEnds.push(cal.toData(parseFloat(el.getAttribute('y1'))),
                  cal.toData(parseFloat(el.getAttribute('y2'))));
    }
    return { cal: { maxResidual: cal.maxResidual, tol: 1.25 / Math.abs(cal.a) },
             tops, bases, ebEnds };
  });
  ok(!r.error && r.cal.maxResidual < 0.5,
    'jamovi y axis linear (' + (r.error || r.cal.maxResidual.toFixed(3)) + 'px)');
  if (!r.error) {
    const means = [mean(g1), mean(g2), mean(g3), mean(g4)];
    sortedClose(r.tops, means, r.cal.tol, 'jamovi bar tops decode to the means');
    sortedClose(r.bases, [0, 0, 0, 0], r.cal.tol, 'jamovi baselines decode to zero');
    const ends = [];
    [g1, g2, g3, g4].forEach(g => { ends.push(mean(g) + se(g), mean(g) - se(g)); });
    sortedClose(r.ebEnds, ends, r.cal.tol, 'jamovi error bars at mean +/- SE');
  }
  await page.close();
}

console.log('jamovi fixture 2: dot markers');
{
  const page = await open('cg_dot.html');
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const ysv = [];
    for (const el of svg.querySelectorAll('[data-role="line-marker"]')) {
      const cy = parseFloat(el.getAttribute('cy'));
      if (isFinite(cy)) ysv.push(cal.toData(cy));
    }
    return { cal: { tol: 1.25 / Math.abs(cal.a) }, ysv };
  });
  if (!r.error) sortedClose(r.ysv, [mean(g1), mean(g3)], r.cal.tol,
    'jamovi dot markers decode to the means');
  else ok(false, 'jamovi dot: ' + r.error);
  await page.close();
}

console.log('jamovi fixture 3: scatter, both axes');
{
  const page = await open('xy_scatter.html');
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate } = window.__pt;
    const calY = calibrate('y'), calX = calibrate('x');
    if (calY.error || calX.error) return { error: (calY.error || '') + (calX.error || '') };
    const svg = chartSvg();
    const pts = [];
    for (const el of svg.querySelectorAll('[data-role="xy-point"]')) {
      const cx = parseFloat(el.getAttribute('cx')), cy = parseFloat(el.getAttribute('cy'));
      if (isFinite(cx) && isFinite(cy)) pts.push([calX.toData(cx), calY.toData(cy)]);
    }
    return { tolX: 1.25 / Math.abs(calX.a), tolY: 1.25 / Math.abs(calY.a),
             resX: calX.maxResidual, resY: calY.maxResidual, pts };
  });
  ok(!r.error && r.resX < 0.5 && r.resY < 0.5,
    'jamovi scatter axes linear (' + (r.error || (r.resX.toFixed(3) + '/' + r.resY.toFixed(3))) + 'px)');
  if (!r.error) {
    sortedClose(r.pts.map(p => p[0]), xs, r.tolX, 'jamovi point x positions decode');
    sortedClose(r.pts.map(p => p[1]), ys, r.tolY, 'jamovi point y positions decode');
  }
  await page.close();
}

console.log((fail === 0 ? 'PIXEL TRUTH JAMOVI PASS' : 'PIXEL TRUTH JAMOVI FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
