// pixel-toolkit.mjs - the shared in-page measurement toolkit for the
// pixel-truth gates (standalone and jamovi): the largest-svg finder,
// the tick-label axis calibration with the alignment cluster and the
// linearity fit, the pixel reader, and the bar-shape selector that
// knows hit clones, labels, and role-carrying twins. One source so
// the two hosts can never be measured with different rulers.
export async function installToolkit(page) {
  await page.evaluate(() => {
  window.__pt = {};
  const chartSvg = () => {
    let best = null, area = 0;
    for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
      const r = s.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; best = s; }
    }
    return best;
  };
  // Numeric tick labels on one side of the plot; axis = 'y' reads left
  // labels against their y centers, axis = 'x' reads bottom labels
  // against their x centers. Returns { toPx, toData, maxResidual, n }.
  const calibrate = (axis) => {
    const svg = chartSvg();
    const sr = svg.getBoundingClientRect();
    const ticks = [];
    for (const t of svg.querySelectorAll('text')) {
      const raw = (t.textContent || '').trim().replace('−', '-')
        .replace(/,/g, '');
      if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) continue;
      const r = t.getBoundingClientRect();
      const cx = r.x + r.width / 2 - sr.x, cy = r.y + r.height / 2 - sr.y;
      // Left gutter for y, bottom band for x - generous, then the
      // linearity requirement rejects any stray numeric text that
      // slipped in from elsewhere.
      if (axis === 'y' && cx < sr.width * 0.2)
        ticks.push({ v: parseFloat(raw), p: cy, a: r.x + r.width - sr.x });
      if (axis === 'x' && cy > sr.height * 0.62)
        ticks.push({ v: parseFloat(raw), p: cx, a: cy });
    }
    // Real tick labels share ONE alignment line (right edges for y,
    // baselines for x); a stray numeric text from the OTHER axis's
    // corner does not - cluster on the median alignment and drop the
    // rest, or corner labels poison the fit.
    if (ticks.length >= 3) {
      const as = ticks.map(t => t.a).sort((x, y) => x - y);
      const med = as[Math.floor(as.length / 2)];
      const kept = ticks.filter(t => Math.abs(t.a - med) <= 6);
      if (kept.length >= 3) { ticks.length = 0; ticks.push(...kept); }
    }
    if (ticks.length < 3) return { error: 'only ' + ticks.length + ' ' + axis + ' ticks' };
    // Least-squares line p = a*v + b, then the residual check.
    let sv = 0, sp = 0, svv = 0, svp = 0;
    for (const t of ticks) { sv += t.v; sp += t.p; svv += t.v * t.v; svp += t.v * t.p; }
    const n = ticks.length;
    const a = (n * svp - sv * sp) / (n * svv - sv * sv);
    const bb = (sp - a * sv) / n;
    let maxRes = 0;
    for (const t of ticks) maxRes = Math.max(maxRes, Math.abs(a * t.v + bb - t.p));
    return { a, b: bb, n,
             maxResidual: maxRes,
             toData: p => (p - bb) / a };
  };
  const px = el => {
    const svg = chartSvg();
    const sr = svg.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x0: r.x - sr.x, x1: r.x + r.width - sr.x,
             y0: r.y - sr.y, y1: r.y + r.height - sr.y,
             cx: r.x + r.width / 2 - sr.x, cy: r.y + r.height / 2 - sr.y };
  };
  // One element per bar cell: [data-bar-cat] also matches hit clones
  // (oversized) and labels (text); cluster by cat + center and keep
  // the smallest non-text element - the drawn shape.
  const barShapes = (svg) => {
    const cands = [];
    for (const el of svg.querySelectorAll('[data-bar-cat]')) {
      if (el.getAttribute('data-halo-for')) continue;
      // Error-bar groups, tick lines, and category labels also carry
      // data-bar-cat for click routing; the drawn SHAPE is role-less.
      if (el.getAttribute('data-role')) continue;
      if (String(el.tagName).toLowerCase() === 'text') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      cands.push({ el, r, cat: el.getAttribute('data-bar-cat') });
    }
    // Hit clones and whisker-spanning wrappers CONTAIN the drawn shape
    // (they are the shape plus padding); drop any candidate that fully
    // contains a smaller same-category candidate, orientation-agnostic.
    const contains = (a, b) =>
      a.r.x <= b.r.x + 2 && a.r.y <= b.r.y + 2 &&
      a.r.x + a.r.width >= b.r.x + b.r.width - 2 &&
      a.r.y + a.r.height >= b.r.y + b.r.height - 2 &&
      a.r.width * a.r.height > b.r.width * b.r.height * 1.05;
    const kept = cands.filter(a => !cands.some(b =>
      b !== a && a.cat === b.cat && contains(a, b)));
    // A same-size hit twin shares the shape's exact geometry; keep one
    // element per (category, bbox).
    const seen = new Set();
    return kept.filter(c => {
      const k = c.cat + '|' + Math.round(c.r.x) + '|' + Math.round(c.r.y) +
        '|' + Math.round(c.r.width) + '|' + Math.round(c.r.height);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).map(c => c.el);
  };
  window.__pt = { chartSvg, calibrate, px, barShapes };
});
}
