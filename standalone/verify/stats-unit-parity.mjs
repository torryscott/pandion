// stats-unit-parity.mjs - external verification for the SHAPE statistics
// the engine computes client-side and no browser table displays as bare
// numbers: box quartiles/whiskers/outlier fences (_computeBoxStats), the
// KDE curves behind density plots and violins (_computeKDEUncached), and
// the scatter 2D-density grid (_xyBandwidthNrd/_xyD2dLims/_xyKde2dClient,
// the MASS::kde2d mirror). Functions are extracted from the SOURCE bundle
// by brace matching (the catstride-unit idiom) and evaluated in Node
// against R references from stats-fuzz.R: quantile(type=7) + Tukey fences
// with the hinge clamp, bw.nrd0 + the definitional kernel sum, and
// MASS::kde2d on identical expanded lims.
// Usage: node stats-unit-parity.mjs [refs.json]
import path from 'node:path';
import fs from 'node:fs';

const REFS = process.argv[2] || '/tmp/gb2-stats-fuzz.json';
const SRC = path.resolve(new URL('.', import.meta.url).pathname,
  '..', '..', 'inst', 'widget', 'graphbuilder2.js');
const refs = JSON.parse(fs.readFileSync(REFS, 'utf8'));
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};

function extract(name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in source');
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

// One shared scope: _xyD2dLims closes over _xyBandwidthNrd.
const names = ['_computeBoxStats', '_computeKDEUncached',
               '_xyBandwidthNrd', '_xyD2dLims', '_xyKde2dClient'];
const fns = new Function(
  names.map(extract).join('\n') +
  '\nreturn {' + names.map(n => n + ':' + n).join(',') + '};')();

const close = (a, b, tol, label) =>
  ok(isFinite(a) && Math.abs(a - b) <= tol, label + ': js ' + a + ' vs R ' + b);
const relClose = (a, b, rel, label) =>
  close(a, b, rel * Math.max(1e-12, Math.abs(b)), label);

// ---- box stats vs quantile(type=7) + clamped Tukey whiskers -------------
let boxCells = 0, kdeCells = 0;
for (const [name, ds] of Object.entries(refs.datasets)) {
  for (const [g, sh] of Object.entries(ds.shapes || {})) {
    if (sh.box) {
      const bs = fns._computeBoxStats(ds.groups[g]);
      ok(!!bs, name + ' ' + g + ': box stats computed');
      if (bs) {
        boxCells++;
        relClose(bs.q1, sh.box.q1, 1e-9, name + ' ' + g + ' q1');
        relClose(bs.median, sh.box.med, 1e-9, name + ' ' + g + ' median');
        relClose(bs.q3, sh.box.q3, 1e-9, name + ' ' + g + ' q3');
        relClose(bs.whiskerLow, sh.box.wlo, 1e-9, name + ' ' + g + ' whisker low');
        relClose(bs.whiskerHigh, sh.box.whi, 1e-9, name + ' ' + g + ' whisker high');
        ok(bs.outliers.length === sh.box.nout,
          name + ' ' + g + ' outlier count: js ' + bs.outliers.length + ' vs R ' + sh.box.nout);
      }
    }
    if (sh.kde) {
      const kd = fns._computeKDEUncached(ds.groups[g], 1, true, 'gaussian');
      ok(!!kd, name + ' ' + g + ': kde computed');
      if (kd) {
        kdeCells++;
        relClose(kd.h, sh.kde.bw, 1e-9, name + ' ' + g + ' bandwidth (bw.nrd0)');
        sh.kde.s.forEach((s, si) => {
          const pt = kd.points[s];
          relClose(pt.v, sh.kde.xs[si], 1e-9, name + ' ' + g + ' kde x@' + s);
          relClose(pt.d, sh.kde.ds[si], 1e-9, name + ' ' + g + ' kde density@' + s);
        });
      }
    }
  }
}
ok(boxCells >= 10, 'box coverage: ' + boxCells + ' cells checked');
ok(kdeCells >= 10, 'kde coverage: ' + kdeCells + ' cells checked');

// ---- alternative kernel pin (epanechnikov, sd-normalized) ---------------
if (refs.datasets.b_negative) {
  const v = refs.datasets.b_negative.groups.G1;
  const kd = fns._computeKDEUncached(v, 1, true, 'epanechnikov');
  // R side of this pin lives inline here (same math as epan_ref):
  const n = v.length;
  const mean = v.reduce((a, x) => a + x, 0) / n;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) * (x - mean), 0) / (n - 1));
  const sorted = [...v].sort((a, b) => a - b);
  const q = p => { const h = p * (n - 1), lo = Math.floor(h); return lo === h ? sorted[lo] : sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]); };
  const bw = 0.9 * Math.min(sd, (q(0.75) - q(0.25)) / 1.34) * Math.pow(n, -0.2);
  const a = bw * Math.sqrt(5);
  for (const s of [64, 192, 320]) {
    const x0 = sorted[0] + (s / 384) * (sorted[n - 1] - sorted[0]);
    let sum = 0;
    for (const vi of v) { const u = (x0 - vi) / a; if (Math.abs(u) < 1) sum += 0.75 * (1 - u * u) / a; }
    relClose(kd.points[s].d, sum / n, 1e-9, 'epanechnikov density@' + s);
  }
}

// ---- 2D density grid vs MASS::kde2d -------------------------------------
const k2 = refs.corrs && refs.corrs.corr01 && refs.corrs.corr01.kde2d;
if (k2) {
  const xs = refs.corrs.corr01.x, ys = refs.corrs.corr01.y;
  const hx = fns._xyBandwidthNrd(xs), hy = fns._xyBandwidthNrd(ys);
  relClose(hx, k2.hx, 1e-9, 'kde2d hx (bandwidth.nrd)');
  relClose(hy, k2.hy, 1e-9, 'kde2d hy (bandwidth.nrd)');
  const lims = fns._xyD2dLims(xs, ys);
  for (let i = 0; i < 4; i++) relClose(lims[i], k2.lims[i], 1e-9, 'kde2d lims[' + i + ']');
  const grid = fns._xyKde2dClient(xs, ys, 25, k2.lims);
  let zmax = 0;
  for (let i = 0; i < 25; i++) for (let j = 0; j < 25; j++)
    if (grid.z[i][j] > zmax) zmax = grid.z[i][j];
  relClose(zmax, k2.zmax, 1e-9, 'kde2d grid max');
  for (const c of k2.cells)
    relClose(grid.z[c.i - 1][c.j - 1], c.z, 1e-9, 'kde2d z[' + c.i + ',' + c.j + ']');
} else {
  console.log('  note: kde2d refs absent (MASS unavailable in the R that generated refs)');
}

console.log((fail === 0 ? 'STATS UNIT PARITY PASS' : 'STATS UNIT PARITY FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
process.exit(fail === 0 ? 0 : 1);
