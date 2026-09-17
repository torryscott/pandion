// pixel-truth-check.mjs - the last link in the number chain: the DRAWING
// must match the data. Every other gate proves the numbers (R, scipy,
// tables, files); this one proves the pixels. The truth standard is the
// reader's: a chart communicates through its axis, so each axis is
// calibrated from its own rendered tick labels (value printed, pixel
// measured), the calibration must be LINEAR (max residual under half a
// pixel - a nonlinear value map cannot hide behind its own ticks), and
// then every mark must sit where the calibrated axis says its value is:
// bar tops at means, baselines at zero, error-bar extents at mean +/-
// half-width, markers at values, box hinges at type-7 quartiles
// (recomputed here independently), scatter points at their coordinates.
// Matching is by sorted multiset of decoded values, so no assumption
// about DOM order ever hides a swap. Covers vertical and horizontal
// bars, grouped and faceted charts, negative values, dot + error bars,
// box, scatter (both axes), and a line chart under a yMin override.
// Usage: node pixel-truth-check.mjs (PS_PAGE overrides the page)
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');
import { installToolkit } from './pixel-toolkit.mjs';

const PAGE = process.env.PS_PAGE || path.resolve(
  new URL('.', import.meta.url).pathname, '..', 'index.html');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 980 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto('file://' + path.resolve(PAGE));
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

// In-page toolkit: axis calibration from tick labels + mark readers.
await installToolkit(page);

async function loadChart(spec) {
  return page.evaluate(async (spec) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.loadTable('pt', spec.header, spec.rows, spec.types);
    S.setModule(spec.module);
    S.setRoles(spec.module, spec.roles);
    await s(1400);
    for (const [k, v] of Object.entries(spec.options || {})) {
      window.setOption(k, v);
      await s(250);
    }
    await s(900);
    return true;
  }, spec);
}
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
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const se = a => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)) /
    Math.sqrt(a.length);
};
// Data tolerance from pixel tolerance: decoded via the calibration, so
// convert 1.25px through the fitted slope in-page per read instead -
// simpler: assert in DATA units with tol = 1.25 / |a| computed there.

// ---- case 1: grouped vertical bars + error bars -------------------------
console.log('case 1: grouped bars - tops at means, baseline at zero, whiskers at mean +/- SE');
const g1 = [4, 6, 9, 13], g2 = [10, 14, 15, 21], g3 = [2, 3, 4, 3], g4 = [16, 18, 25, 21];
{
  const rows = [];
  const push = (c, g, vals) => vals.forEach(v => rows.push([c, g, v]));
  push('A', 'g1', g1); push('A', 'g2', g2); push('B', 'g1', g3); push('B', 'g2', g4);
  await loadChart({
    header: ['cat', 'grp', 'v'],
    rows, types: { cat: 'nominal', grp: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v', groupVar: 'grp' },
    options: { barCornerRadius: 0 }
  });
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate, px } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const tops = [], bases = [], ebEnds = [];
    for (const el of window.__pt.barShapes(svg)) {
      const p = px(el);
      tops.push(cal.toData(p.y0));
      bases.push(cal.toData(p.y1));
    }
    // Error-bar truth from the SPINE line's own endpoints: bboxes on
    // the role group include hit padding and the horizontal caps.
    // The error bar is a <g> of three lines (vertical spine + two
    // horizontal caps) plus a hit rect; the spine's own endpoints are
    // the exact extents.
    for (const el of svg.querySelectorAll('[data-role="error-bar"] line')) {
      const x1 = parseFloat(el.getAttribute('x1')), x2 = parseFloat(el.getAttribute('x2'));
      const y1 = parseFloat(el.getAttribute('y1')), y2 = parseFloat(el.getAttribute('y2'));
      if (!isFinite(x1) || Math.abs(x1 - x2) > 0.5) continue;  // caps are horizontal
      ebEnds.push(cal.toData(y1), cal.toData(y2));
    }
    return { cal: { maxResidual: cal.maxResidual, n: cal.n, tol: 1.25 / Math.abs(cal.a) },
             tops, bases, ebEnds };
  });
  ok(!r.error && r.cal.maxResidual < 0.5,
    'y axis is linear against its own labels (residual ' +
    (r.error || r.cal.maxResidual.toFixed(3)) + 'px over ' + (r.cal ? r.cal.n : 0) + ' ticks)');
  if (!r.error) {
    const means = [mean(g1), mean(g2), mean(g3), mean(g4)];
    sortedClose(r.tops, means, r.cal.tol, 'bar tops decode to the means');
    sortedClose(r.bases, [0, 0, 0, 0], r.cal.tol, 'bar baselines decode to zero');
    const ends = [];
    [g1, g2, g3, g4].forEach(g => { ends.push(mean(g) + se(g), mean(g) - se(g)); });
    sortedClose(r.ebEnds, ends, r.cal.tol, 'error-bar extents decode to mean +/- SE');
  }
}

// ---- case 2: HORIZONTAL bars --------------------------------------------
console.log('case 2: horizontal bars - ends at means on the x axis');
{
  const r = await page.evaluate(async () => {
    const s = ms => new Promise(r2 => setTimeout(r2, ms));
    window.setOption('chartOrientation', 'horizontal');
    await s(1100);
    const { chartSvg, calibrate, px } = window.__pt;
    const cal = calibrate('x');
    if (cal.error) return cal;
    const svg = chartSvg();
    const ends = [], bases = [];
    for (const el of window.__pt.barShapes(svg)) {
      const p = px(el);
      ends.push(cal.toData(p.x1));
      bases.push(cal.toData(p.x0));
    }
    window.setOption('chartOrientation', 'vertical');
    await s(600);
    return { cal: { maxResidual: cal.maxResidual, tol: 1.25 / Math.abs(cal.a) }, ends, bases };
  });
  ok(!r.error && r.cal.maxResidual < 0.5,
    'x axis is linear against its own labels (' + (r.error || r.cal.maxResidual.toFixed(3)) + 'px)');
  if (!r.error) {
    sortedClose(r.ends, [mean(g1), mean(g2), mean(g3), mean(g4)], r.cal.tol,
      'horizontal bar ends decode to the means');
    sortedClose(r.bases, [0, 0, 0, 0], r.cal.tol, 'horizontal baselines decode to zero');
  }
}

// ---- case 3: faceted bars (shared y axis) -------------------------------
console.log('case 3: faceted bars - every panel decodes on the shared axis');
{
  const rows = [];
  const cells = [['A', 'p1', [3, 5, 7]], ['B', 'p1', [8, 12, 10]],
                 ['A', 'p2', [15, 11, 13]], ['B', 'p2', [6, 2, 4]]];
  cells.forEach(([c, f, vals]) => vals.forEach(v => rows.push([c, f, v])));
  await loadChart({
    header: ['cat', 'panel', 'v'],
    rows, types: { cat: 'nominal', panel: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v', facetVar: 'panel' },
    options: { barCornerRadius: 0 }
  });
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate, px } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const tops = [];
    for (const el of window.__pt.barShapes(svg)) {
      tops.push(cal.toData(px(el).y0));
    }
    return { cal: { maxResidual: cal.maxResidual, tol: 1.25 / Math.abs(cal.a) }, tops };
  });
  ok(!r.error && r.cal.maxResidual < 0.5, 'faceted y axis linear (' +
    (r.error || r.cal.maxResidual.toFixed(3)) + 'px)');
  if (!r.error)
    sortedClose(r.tops, cells.map(c => mean(c[2])), r.cal.tol,
      'all four panel bars decode to their means');
}

// ---- case 4: negative values --------------------------------------------
console.log('case 4: negative bars hang below a zero baseline');
{
  const neg = [['A', [-4, -6, -5]], ['B', [3, 5, 7]]];
  const rows = [];
  neg.forEach(([c, vals]) => vals.forEach(v => rows.push([c, v])));
  await loadChart({
    header: ['cat', 'v'], rows,
    types: { cat: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v' },
    options: { barCornerRadius: 0 }
  });
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate, px } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const spans = [];
    for (const el of window.__pt.barShapes(svg)) {
      const p = px(el);
      spans.push([cal.toData(p.y0), cal.toData(p.y1)]);
    }
    return { cal: { tol: 1.25 / Math.abs(cal.a) }, spans };
  });
  if (!r.error) {
    const flat = r.spans.flat();
    sortedClose(flat, [-5, 0, 0, 5], r.cal.tol,
      'the negative bar spans 0 down to -5, the positive 0 up to 5');
  } else ok(false, 'negative case calibration: ' + r.error);
}

// ---- case 5: dot chart markers ------------------------------------------
console.log('case 5: dot markers sit at the means');
{
  const rows = [];
  [['A', g1], ['B', g3]].forEach(([c, vals]) => vals.forEach(v => rows.push([c, v])));
  await loadChart({
    header: ['cat', 'v'], rows,
    types: { cat: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v' },
    options: { graphType: 'dot' }
  });
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const ys = [];
    for (const el of svg.querySelectorAll('[data-role="line-marker"]')) {
      const cy = parseFloat(el.getAttribute('cy'));
      if (isFinite(cy)) ys.push(cal.toData(cy));
    }
    return { cal: { tol: 1.25 / Math.abs(cal.a) }, ys };
  });
  if (!r.error) sortedClose(r.ys, [mean(g1), mean(g3)], r.cal.tol,
    'dot markers decode to the two means');
  else ok(false, 'dot case: ' + r.error);
}

// ---- case 6: box hinges vs independently computed type-7 quartiles ------
console.log('case 6: box median and hinges at type-7 quartiles');
{
  const vals = [1, 2, 3, 4, 5, 6, 7, 8];
  const rows = vals.map(v => ['A', v]);
  await loadChart({
    header: ['cat', 'v'], rows,
    types: { cat: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v' },
    options: { graphType: 'box' }
  });
  // Independent type-7 (the R default this suite verified the engine
  // against at the unit level).
  const q = (a, p) => {
    const s = [...a].sort((x, y) => x - y), h = p * (s.length - 1);
    const lo = Math.floor(h);
    return lo === h ? s[lo] : s[lo] + (h - lo) * (s[lo + 1] - s[lo]);
  };
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate, px } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const med = svg.querySelector('[data-role="box-median"]');
    // The box primary is a <g> wrapping the whole box + whiskers (its
    // bbox spans min..max); the BODY is the box-fill rect inside it.
    const body = svg.querySelector('[data-role="box-fill"]');
    if (!med || !body) return { error: 'box parts missing' };
    const mp = px(med), bp = px(body);
    return { cal: { tol: 2.5 / Math.abs(cal.a) },
             median: cal.toData(mp.cy),
             q3: cal.toData(bp.y0), q1: cal.toData(bp.y1) };
  });
  if (!r.error) {
    ok(Math.abs(r.median - q(vals, 0.5)) <= r.cal.tol,
      'median line at ' + q(vals, 0.5) + ' (decoded ' + r.median.toFixed(3) + ')');
    ok(Math.abs(r.q1 - q(vals, 0.25)) <= r.cal.tol &&
       Math.abs(r.q3 - q(vals, 0.75)) <= r.cal.tol,
      'box hinges at the quartiles (decoded ' + r.q1.toFixed(3) + ', ' + r.q3.toFixed(3) + ')');
  } else ok(false, 'box case: ' + r.error);
}

// ---- case 7: scatter, both axes -----------------------------------------
console.log('case 7: scatter points decode on both axes at once');
{
  const xs = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];
  const ys = [3, 7, 4, 9, 12, 8, 15, 11, 18, 20];
  await loadChart({
    header: ['x', 'y'], rows: xs.map((x, i) => [x, ys[i]]),
    types: { x: 'continuous', y: 'continuous' },
    module: 'xyplotbuilder', roles: { xvar: 'x', yvar: 'y' }
  });
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate } = window.__pt;
    const calY = calibrate('y'), calX = calibrate('x');
    if (calY.error || calX.error) return { error: (calY.error || '') + (calX.error || '') };
    const svg = chartSvg();
    const pts = [];
    for (const el of svg.querySelectorAll('[data-role="xy-point"]')) {
      const cx = parseFloat(el.getAttribute('cx')), cy = parseFloat(el.getAttribute('cy'));
      if (isFinite(cx) && isFinite(cy))
        pts.push([calX.toData(cx), calY.toData(cy)]);
    }
    return { tolX: 1.25 / Math.abs(calX.a), tolY: 1.25 / Math.abs(calY.a),
             resX: calX.maxResidual, resY: calY.maxResidual, pts };
  });
  ok(!r.error && r.resX < 0.5 && r.resY < 0.5,
    'both scatter axes linear (' + (r.error || (r.resX.toFixed(3) + '/' + r.resY.toFixed(3))) + 'px)');
  if (!r.error) {
    sortedClose(r.pts.map(p => p[0]), xs, r.tolX, 'point x positions decode to the data');
    sortedClose(r.pts.map(p => p[1]), ys, r.tolY, 'point y positions decode to the data');
  }
}

// ---- case 8: a yMin override re-anchors the axis, marks still decode ----
console.log('case 8: under a raised y minimum the calibration and marks agree');
{
  const rows = [];
  [['A', [22, 26, 24]], ['B', [30, 34, 32]]].forEach(([c, vals]) =>
    vals.forEach(v => rows.push([c, v])));
  await loadChart({
    header: ['cat', 'v'], rows,
    types: { cat: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v' },
    options: { graphType: 'line', yMinOverride: true, yMin: 20 }
  });
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
  if (!r.error) sortedClose(r.ysv, [24, 32], r.cal.tol,
    'markers decode to the means on the overridden axis');
  else ok(false, 'override case: ' + r.error);
}

// ---- case 8b: extreme magnitudes ----------------------------------------
// The stats fuzzer's biggest catch was an overflow that only appeared
// at scale; this is the rendering mirror. At 1e9 and 1e-6 the pixel
// math multiplies numbers where floating point misbehaves first, and
// tick labels change format - both must still decode.
console.log('case 8b: extreme magnitudes (1e9 and 1e-6) still decode');
for (const [scale, name] of [[1e9, 'bigscale'], [1e-6, 'tinyscale']]) {
  const A = [2.1, 2.4, 2.9].map(v => v * scale);
  const B = [4.2, 4.8, 4.5].map(v => v * scale);
  const rows = [];
  A.forEach(v => rows.push(['A', v])); B.forEach(v => rows.push(['B', v]));
  await loadChart({
    header: ['cat', 'v'], rows,
    types: { cat: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v' },
    options: { barCornerRadius: 0, graphType: 'bar', yMinOverride: false }
  });
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate, px, barShapes } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const tops = [], bases = [];
    for (const el of barShapes(svg)) {
      const p = px(el);
      tops.push(cal.toData(p.y0));
      bases.push(cal.toData(p.y1));
    }
    return { cal: { maxResidual: cal.maxResidual, tol: 1.25 / Math.abs(cal.a) }, tops, bases };
  });
  ok(!r.error && r.cal.maxResidual < 0.5,
    name + ': axis linear at this magnitude (' + (r.error || r.cal.maxResidual.toFixed(3)) + 'px)');
  if (!r.error) {
    sortedClose(r.tops, [mean(A), mean(B)], r.cal.tol,
      name + ': bar tops decode at magnitude ' + scale);
    sortedClose(r.bases, [0, 0], r.cal.tol, name + ': baselines at zero');
  }
}

// ---- case 8c: the EXPORTED file decodes like the screen -----------------
// Pixel truth on the live DOM proves the drawing; this proves nothing
// shifts in serialization: the exported SVG is mounted and decoded
// with the same toolkit against the same data.
console.log('case 8c: the exported SVG decodes identically');
{
  const rows = [];
  [['A', [3, 5, 7]], ['B', [10, 14, 12]]].forEach(([c, vals]) =>
    vals.forEach(v => rows.push([c, v])));
  await loadChart({
    header: ['cat', 'v'], rows,
    types: { cat: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v' },
    options: { barCornerRadius: 0, graphType: 'bar', yMinOverride: false }
  });
  const r = await page.evaluate(async () => {
    const source = await window.PS_SHELL.exportSource('white');
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;';
    holder.innerHTML = source.svg;
    document.body.appendChild(holder);
    const svg = holder.querySelector('svg');
    const { px } = window.__pt;
    // Recalibrate INSIDE the mounted export (its own ticks).
    const sr = svg.getBoundingClientRect();
    const ticks = [];
    for (const t of svg.querySelectorAll('text')) {
      const raw = (t.textContent || '').trim().replace('−', '-').replace(/,/g, '');
      if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) continue;
      const r2 = t.getBoundingClientRect();
      if (r2.x - sr.x < sr.width * 0.2)
        ticks.push({ v: parseFloat(raw), p: r2.y + r2.height / 2 - sr.y,
                     a: r2.x + r2.width - sr.x });
    }
    const as = ticks.map(t => t.a).sort((x, y) => x - y);
    const med = as[Math.floor(as.length / 2)];
    const kept = ticks.filter(t => Math.abs(t.a - med) <= 6);
    if (kept.length < 3) { holder.remove(); return { error: 'ticks ' + kept.length }; }
    let sv = 0, sp = 0, svv = 0, svp = 0;
    for (const t of kept) { sv += t.v; sp += t.p; svv += t.v * t.v; svp += t.v * t.p; }
    const n = kept.length;
    const a = (n * svp - sv * sp) / (n * svv - sv * sv);
    const bb = (sp - a * sv) / n;
    const toData = pv => (pv - bb) / a;
    const tops = [];
    for (const el of svg.querySelectorAll('[data-bar-cat]')) {
      if (el.getAttribute('data-role')) continue;
      if (String(el.tagName).toLowerCase() === 'text') continue;
      const r3 = el.getBoundingClientRect();
      if (r3.width < 2 || r3.height < 2) continue;
      tops.push(toData(r3.y - sr.y));
    }
    holder.remove();
    return { tol: 1.5 / Math.abs(a), tops };
  });
  ok(!r.error, 'exported SVG mounts with readable ticks (' + (r.error || 'ok') + ')');
  if (!r.error)
    sortedClose(r.tops, [5, 12], r.tol, 'exported bar tops decode to the means');
}

// ---- case 9: the gate's own sensitivity control -------------------------
// Shift every mark 6px while the ticks stay put - the exact class of
// bug this gate exists to catch (a value map moving marks without
// moving the axis). The decoded values must now DISAGREE with the
// data; if they still agree, the gate has gone blind and fails itself.
console.log('case 9: control - a 6px mark shift must be detected');
{
  const rows = [];
  [['A', [3, 5, 7]], ['B', [10, 14, 12]]].forEach(([c, vals]) =>
    vals.forEach(v => rows.push([c, v])));
  await loadChart({
    header: ['cat', 'v'], rows,
    types: { cat: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v' },
    options: { barCornerRadius: 0 }
  });
  const r = await page.evaluate(() => {
    const { chartSvg, calibrate, px, barShapes } = window.__pt;
    const cal = calibrate('y');
    if (cal.error) return cal;
    const svg = chartSvg();
    const shapes = barShapes(svg);
    for (const el of shapes) el.setAttribute('transform', 'translate(0,6)');
    const tops = shapes.map(el => cal.toData(px(el).y0));
    for (const el of shapes) el.removeAttribute('transform');
    return { tol: 1.25 / Math.abs(cal.a), tops };
  });
  if (!r.error) {
    const means = [5, 12].sort((a, b2) => a - b2);
    const g = [...r.tops].sort((a, b2) => a - b2);
    const detected = g.some((v, i) => Math.abs(v - means[i]) > r.tol);
    ok(detected, 'the shifted marks decode WRONG (gate is sensitive): ' +
      g.map(v => v.toFixed(2)).join(',') + ' vs ' + means.join(','));
  } else ok(false, 'control case: ' + r.error);
}

// ---- case 10: resized and re-proportioned charts still decode ----------
// Torry's question (Aug 30 2026): dragging an axis longer changes the
// plot's ratio - does the truth survive? The calibration is re-read
// from the RESIZED chart's own ticks each time, so this asserts the
// whole pipeline reflows together: at a wide-and-short aspect and a
// narrow-and-tall one, linearity must hold and every bar top, baseline,
// and error-bar extent must decode to the same data as before.
console.log('case 10: two warped aspect ratios, marks still decode');
{
  const rows = [];
  const push = (c, g, vals) => vals.forEach(v => rows.push([c, g, v]));
  push('A', 'g1', g1); push('A', 'g2', g2); push('B', 'g1', g3); push('B', 'g2', g4);
  await loadChart({
    header: ['cat', 'grp', 'v'],
    rows, types: { cat: 'nominal', grp: 'nominal', v: 'continuous' },
    module: 'plotbuilder', roles: { xvar: 'cat', yvar: 'v', groupVar: 'grp' },
    // Options PERSIST per module across cases: case 8 left graphType
    // 'line' and yMin 20 behind, and the gate then correctly decoded a
    // truncated-baseline chart as "baselines not at zero" - a live
    // demonstration that it catches the truncation class. Reset
    // explicitly so this case measures what it claims to.
    options: { barCornerRadius: 0, graphType: 'bar', yMinOverride: false }
  });
  for (const [w, h, name] of [[9, 3, 'wide+short'], [4, 6.5, 'narrow+tall']]) {
    await page.evaluate(async ({ w, h }) => {
      const s = ms => new Promise(r => setTimeout(r, ms));
      window.__gb2_setOption('plotWidth', w);
      window.__gb2_setOption('plotHeight', h);
      // The resize rides the debounced commit + shell recompute; wait
      // deterministically until the chart's pixel width matches the
      // requested inches (96 px/in), then let the paint settle - a
      // fixed sleep raced the re-render and read a transitional frame.
      for (let i = 0; i < 60; i++) {
        const svg = window.__pt.chartSvg();
        if (svg && Math.abs(svg.getBoundingClientRect().width - w * 96) < 5) break;
        await s(150);
      }
      // The bars GLIDE to their new geometry while the ticks land
      // instantly, and transforms count in getBoundingClientRect - so
      // wait for STABILITY (two identical consecutive geometry
      // samples), never a fixed sleep, before reading.
      let prev = '';
      for (let i = 0; i < 40; i++) {
        const svg = window.__pt.chartSvg();
        const sig = window.__pt.barShapes(svg).map(el => {
          const r = el.getBoundingClientRect();
          return Math.round(r.y) + ':' + Math.round(r.height);
        }).join('|');
        if (sig && sig === prev) break;
        prev = sig;
        await s(180);
      }
    }, { w, h });
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
      const svgR = svg.getBoundingClientRect();
      return { cal: { maxResidual: cal.maxResidual, tol: 1.25 / Math.abs(cal.a),
                      a: cal.a, b: cal.b, n: cal.n },
               size: Math.round(svgR.width) + 'x' + Math.round(svgR.height),
               tops, bases, ebEnds };
    });
    ok(!r.error && r.cal.maxResidual < 0.5,
      name + ': axis still linear against its labels (' +
      (r.error || (r.cal.maxResidual.toFixed(3) + 'px, a=' + r.cal.a.toFixed(2) +
       ' b=' + r.cal.b.toFixed(1) + ' n=' + r.cal.n + ' size=' + r.size)) + ')');
    if (!r.error) {
      const means = [mean(g1), mean(g2), mean(g3), mean(g4)];
      sortedClose(r.tops, means, r.cal.tol, name + ': bar tops still decode to the means');
      sortedClose(r.bases, [0, 0, 0, 0], r.cal.tol, name + ': baselines still at zero');
      const ends = [];
      [g1, g2, g3, g4].forEach(g => { ends.push(mean(g) + se(g), mean(g) - se(g)); });
      sortedClose(r.ebEnds, ends, r.cal.tol, name + ': error bars still at mean +/- SE');
    }
  }
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'PIXEL TRUTH CHECK PASS' : 'PIXEL TRUTH CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
