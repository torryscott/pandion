/* The chart, in the chart's own SVG coordinates (720 x 489.75), laid out
 * exactly like the engine lays out this grouped bar chart. Data is the
 * app's built-in sample (website/assets/tutorial/sample-dose-response.csv). */

var DATA = {
  'Control': { East: [61, 68, 64, 59], West: [55, 58, 52, 66] },
  'Low dose': { East: [70, 66, 72, 77], West: [74, 79, 68, 71] },
  'High dose': { East: [82, 79, 84, 86], West: [88, 91, 77, 90] }
};
var CATS = ['Control', 'Low dose', 'High dose'];
var GROUPS = ['East', 'West'];
var STATS = {};
(function () {
  for (var c in DATA) {
    STATS[c] = {};
    for (var g in DATA[c]) {
      var v = DATA[c][g], n = v.length, m = 0, i;
      for (i = 0; i < n; i++) m += v[i];
      m /= n;
      var ss = 0;
      for (i = 0; i < n; i++) ss += (v[i] - m) * (v[i] - m);
      STATS[c][g] = { mean: m, se: Math.sqrt(ss / (n - 1)) / Math.sqrt(n) };
    }
  }
})();

var CH = {
  slot0: 165.8333, slotW: 189.6667, barW: 74.8667,
  axisX: 71, baseY: 420, topY: 29.5, rightX: 640, pxPerUnit: 3.9,
  tickFont: 15, catFont: 16.1, titleFont: 17.3
};
function yOf(v) { return CH.baseY - v * CH.pxPerUnit; }
function slotX(p) { return CH.slot0 + p * CH.slotW; }
/* Where a category cluster sits. */
function catCenter(S, cat) { return slotX(S.chart.pos[cat]); }
/* Horizontal offset of a group's bar inside its cluster. Slot 0 is the
 * left bar, slot 1 the right one (1 px apart, as the engine draws them).
 * A group being dragged also carries the pointer's offset, the way the
 * engine translates every bar of the dragged group together. */
function groupOffset(S, grp) {
  var ch = S.chart, slot = ch.gpos[grp];
  var off = (slot - 1) * (CH.barW + 1);
  if (ch.gdrag && ch.gdrag.grp === grp) off += ch.gdrag.dx;
  return off;
}
function barGeom(S, cat, grp) {
  var v = STATS[cat][grp].mean, x = catCenter(S, cat) + groupOffset(S, grp);
  return { x: x, y: yOf(v), w: CH.barW, h: CH.baseY - yOf(v), cx: x + CH.barW / 2 };
}
/* Paint order: a dragged group paints last, over its neighbours. */
function groupPaintOrder(S) {
  var g = S.chart.gdrag;
  if (!g) return GROUPS;
  return GROUPS.filter(function (x) { return x !== g.grp; }).concat([g.grp]);
}
function groupAlpha(S, grp) {
  var g = S.chart.gdrag;
  return g && g.grp === grp ? g.alpha : 1;
}
function cellColor(S, grp, cat) {
  if (grp === 'East') return (cat && S.chart.eastByCat && S.chart.eastByCat[cat]) || S.chart.eastColor;
  return S.chart.westColor;
}

function drawChart(ctx, S) {
  var ch = S.chart;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, APP.svg.w, APP.svg.h);

  /* ---- bars (a dragged group paints last, slightly see-through) ---- */
  var gorder = groupPaintOrder(S);
  var i, j, k;
  for (j = 0; j < gorder.length; j++) {
    var grp = gorder[j], ga = groupAlpha(S, grp);
    ctx.save();
    ctx.globalAlpha *= ga;
    for (i = 0; i < CATS.length; i++) {
      var cat = CATS[i], r = barGeom(S, cat, grp);
      var col = cellColor(S, grp, cat);
      var hov = (ch.hover && ch.hover.grp === grp && (ch.hover.cat === cat || ch.hover.cat === '*')) ? ch.hover.k : 0;
      if (hov > 0) col = mixOk(col, '#ffffff', 0.13 * hov);
      ctx.fillStyle = col;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  }

  /* ---- data points ---- */
  if (ch.pointsT > 0) drawDataPoints(ctx, S);

  /* ---- error bars (they belong to their bars and travel with them) ---- */
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.4;
  for (j = 0; j < gorder.length; j++) {
    var g2 = gorder[j];
    ctx.save();
    ctx.globalAlpha *= groupAlpha(S, g2);
    for (i = 0; i < CATS.length; i++) {
      var c2 = CATS[i], st2 = STATS[c2][g2], r2 = barGeom(S, c2, g2);
      var top = yOf(st2.mean + st2.se), bot = yOf(st2.mean - st2.se);
      ctx.beginPath();
      ctx.moveTo(r2.cx, top); ctx.lineTo(r2.cx, bot);
      ctx.moveTo(r2.cx - 3.793, top); ctx.lineTo(r2.cx + 3.793, top);
      ctx.moveTo(r2.cx - 3.793, bot); ctx.lineTo(r2.cx + 3.793, bot);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- axes ---- */
  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CH.axisX, CH.topY); ctx.lineTo(CH.axisX, CH.baseY);
  ctx.moveTo(70.25, CH.baseY); ctx.lineTo(CH.rightX, CH.baseY);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (k = 0; k <= 100; k += 20) { ctx.moveTo(64.25, yOf(k)); ctx.lineTo(70.25, yOf(k)); }
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.font = fnt(CH.tickFont, 400, CHART_FONT);
  ctx.textAlign = 'right';
  for (k = 0; k <= 100; k += 20) ctx.fillText(String(k), 61.25, yOf(k) + 5.25);
  /* category ticks + labels (a group drag leaves them where they are) */
  ctx.textAlign = 'center';
  ctx.font = fnt(CH.catFont, 400, CHART_FONT);
  for (i = 0; i < CATS.length; i++) {
    var c3 = CATS[i], cx3 = catCenter(S, c3);
    ctx.beginPath(); ctx.moveTo(cx3, 420.75); ctx.lineTo(cx3, 426.75); ctx.stroke();
    ctx.fillText(c3, cx3, 440.43);
  }
  /* axis titles */
  ctx.font = fnt(CH.titleFont, 600, CHART_FONT);
  ctx.fillText('condition', 355.5, 473.75);
  ctx.save();
  ctx.translate(18, 225);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(ch.yTitle, 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  /* ---- legend ---- */
  drawLegend(ctx, S);

  /* ---- bracket ---- */
  if (ch.bracket && ch.bracket.k > 0.001) drawBracket(ctx, S);

  /* ---- resize grip ---- */
  ctx.strokeStyle = '#9aa3ad';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1027 - APP.svg.x, 637 - APP.svg.y + 9); ctx.lineTo(1027 - APP.svg.x + 9, 637 - APP.svg.y);
  ctx.moveTo(1027 - APP.svg.x + 4, 637 - APP.svg.y + 9); ctx.lineTo(1027 - APP.svg.x + 9, 637 - APP.svg.y + 4);
  ctx.stroke();

  /* ---- selection indicators ---- */
  drawHalos(ctx, S);
  ctx.restore();
}

/* Deterministic jitter per observation. */
var POINT_JIT = {};
(function () {
  var rnd = mulberry32(20260926);
  for (var i = 0; i < CATS.length; i++) {
    for (var j = 0; j < GROUPS.length; j++) {
      var key = CATS[i] + '|' + GROUPS[j], arr = [];
      for (var k = 0; k < 4; k++) arr.push((rnd() - 0.5) * CH.barW * 0.36);
      POINT_JIT[key] = arr;
    }
  }
})();
function drawDataPoints(ctx, S) {
  var ch = S.chart, T = ch.pointsT, idx = 0;
  for (var i = 0; i < CATS.length; i++) {
    var cat = CATS[i];
    for (var j = 0; j < GROUPS.length; j++) {
      var grp = GROUPS[j], vals = DATA[cat][grp], r = barGeom(S, cat, grp);
      var col = darken(cellColor(S, grp, cat), 0.42);
      var slot = ch.pos[cat];
      for (var k = 0; k < vals.length; k++, idx++) {
        var delay = slot * 0.16 + j * 0.07 + k * 0.045;
        var p = clamp((T - delay) / 0.5, 0, 1);
        if (p <= 0) continue;
        var fall = 1 - Ease.outBack(p);
        var yy = yOf(vals[k]) - fall * 46;
        var a = Math.min(1, p * 3.2);
        var sc = p < 0.999 ? 1 + 0.35 * Math.sin(Math.min(1, p * 1.25) * Math.PI) * (1 - p) : 1;
        ctx.beginPath();
        ctx.arc(r.cx + POINT_JIT[cat + '|' + grp][k], yy, 3.4 * sc, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col, 0.88 * a);
        ctx.fill();
      }
    }
  }
}

var LEGEND = { x: 652, y: 26, w: 57.2, h: 67.4 };
function legendBox(S) {
  var L = S.chart.legend;
  return { x: LEGEND.x + L.dx, y: LEGEND.y + L.dy, w: LEGEND.w, h: LEGEND.h };
}
function drawLegend(ctx, S) {
  var L = S.chart.legend, dx = L.dx, dy = L.dy - L.lift * 4;
  ctx.save();
  if (L.lift > 0.001) {
    var b = legendBox(S);
    ctx.save();
    ctx.shadowColor = 'rgba(25,46,73,' + (0.22 * L.lift).toFixed(3) + ')';
    ctx.shadowBlur = 16 * L.lift * (ctx.__pxScale || 1);
    ctx.shadowOffsetY = 7 * L.lift * (ctx.__pxScale || 1);
    roundRect(ctx, b.x - 2, b.y - 2 - L.lift * 4, b.w + 8, b.h + 4, 5);
    ctx.fillStyle = rgba('#ffffff', 0.96 * L.lift);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#000000';
  ctx.font = fnt(15, 600, CHART_FONT);
  ctx.fillText('site', 656 + dx, 44 + dy);
  /* rows follow the group order: when the groups swap, so do the rows */
  var lk = S.chart.legendK || 0, eY = 18 * lk, wY = -18 * lk;
  ctx.fillStyle = S.chart.eastColor; ctx.fillRect(656 + dx, 58 + dy + eY, 12, 12);
  ctx.fillStyle = S.chart.westColor; ctx.fillRect(656 + dx, 76 + dy + wY, 12, 12);
  ctx.fillStyle = '#000000';
  ctx.font = fnt(13.8, 400, CHART_FONT);
  ctx.fillText('East', 674 + dx, 68.42 + dy + eY);
  ctx.fillText('West', 674 + dx, 86.42 + dy + wY);
  ctx.restore();
}

function drawBracket(ctx, S) {
  var b = S.chart.bracket, a = b.k;
  ctx.save();
  ctx.globalAlpha *= a;
  var x1 = b.x1, x2 = b.x2, y = b.y;
  var sc = lerp(0.9, 1, Ease.outBack(Math.min(1, a)));
  var mx = (x1 + x2) / 2;
  ctx.translate(mx, y); ctx.scale(sc, sc); ctx.translate(-mx, -y);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x1, y + b.legL); ctx.lineTo(x1, y); ctx.lineTo(x2, y); ctx.lineTo(x2, y + b.legR);
  ctx.stroke();
  /* label */
  var pop = b.labelPop;
  ctx.save();
  ctx.translate(mx, y - 5);
  var ls = 1 + 0.45 * Math.sin(Math.PI * clamp(pop, 0, 1)) * (1 - clamp(pop, 0, 1) * 0.3);
  ctx.scale(ls, ls);
  ctx.fillStyle = '#000000';
  ctx.font = fnt(13, 400, CHART_FONT);
  ctx.textAlign = 'center';
  if (b.labelMix < 1) { ctx.globalAlpha *= 1 - b.labelMix; ctx.fillText(b.label0, 0, 0); ctx.globalAlpha /= Math.max(1e-3, 1 - b.labelMix); }
  if (b.labelMix > 0) { ctx.globalAlpha *= b.labelMix; ctx.fillText(b.label1, 0, 0); }
  ctx.restore();
  ctx.restore();
  /* snap guides: the engine flashes thin pink dashed lines at bar centers */
  if (b.snapK > 0.001 && b.snapX != null) {
    ctx.save();
    ctx.strokeStyle = rgba('#e0529c', 0.85 * b.snapK);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(b.snapX, CH.topY); ctx.lineTo(b.snapX, CH.baseY); ctx.stroke();
    ctx.restore();
  }
}

/* The app's selection indicator: #1a5fb4 dashed, marching. */
function haloRect(ctx, S, x, y, w, h, k, opts) {
  opts = opts || {};
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.strokeStyle = rgba(opts.color || C.selBlue, opts.alpha == null ? 0.6 : opts.alpha);
  ctx.lineWidth = opts.width || 1.5;
  ctx.setLineDash(opts.dash || [4.5, 3]);
  ctx.lineDashOffset = -(S.time * 12.5) % 7.5;
  ctx.lineCap = 'round';
  roundRect(ctx, x, y, w, h, opts.r == null ? 4 : opts.r);
  ctx.stroke();
  ctx.restore();
}
function yTitleBox(S, ctx) {
  var w = textW(ctx, S.chart.yTitle || ' ', fnt(CH.titleFont, 600, CHART_FONT));
  return { x: 18 - 13.5, y: 225 - w / 2, w: 17, h: w };
}
function drawHalos(ctx, S) {
  var ch = S.chart, H = ch.halos, i;
  for (i = 0; i < H.length; i++) {
    var h = H[i];
    if (h.k <= 0.001) continue;
    if (h.type === 'bars') {
      for (var c = 0; c < CATS.length; c++) {
        var r = barGeom(S, CATS[c], h.grp);
        haloRect(ctx, S, r.x - 2, r.y - 2, r.w + 4, r.h + 4, h.k);
      }
    } else if (h.type === 'ytitle') {
      var b = yTitleBox(S, ctx);
      haloRect(ctx, S, b.x - 4, b.y - 4, b.w + 8, b.h + 8, h.k, { width: 2, alpha: 1, dash: [5, 3], r: 2 });
      /* rotate handle, as in the app */
      ctx.save();
      ctx.globalAlpha *= h.k;
      ctx.strokeStyle = C.selBlue;
      ctx.lineWidth = 1;
      ctx.setLineDash([1.5, 2]);
      ctx.beginPath(); ctx.moveTo(b.x - 4, 225); ctx.lineTo(b.x - 20, 225); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(b.x - 26, 225, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    } else if (h.type === 'legend') {
      var lb = legendBox(S);
      haloRect(ctx, S, lb.x - 2, lb.y + 12, lb.w + 6, lb.h - 10, h.k, { width: 2, alpha: 0.95, dash: [5, 3], r: 3 });
    } else if (h.type === 'errorbars') {
      for (var c2 = 0; c2 < CATS.length; c2++) {
        var st = STATS[CATS[c2]][h.grp], r2 = barGeom(S, CATS[c2], h.grp);
        var t = yOf(st.mean + st.se), bt = yOf(st.mean - st.se);
        haloRect(ctx, S, r2.cx - 8, t - 5, 16, bt - t + 10, h.k);
      }
    } else if (h.type === 'catlabels') {
      ctx.font = fnt(CH.catFont, 400, CHART_FONT);
      var lblC = h.cat || 'Low dose';
      var w = textW(ctx, lblC, ctx.font), cx = catCenter(S, lblC);
      haloRect(ctx, S, cx - w / 2 - 4, 426, w + 8, 20, h.k, { width: 2, alpha: 1, dash: [5, 3], r: 2 });
    } else if (h.type === 'hovertext') {
      var hb = yTitleBox(S, ctx);
      haloRect(ctx, S, hb.x - 3, hb.y - 3, hb.w + 6, hb.h + 6, h.k, { color: C.hoverBlue, alpha: 0.6, width: 1, dash: [3, 3], r: 1 });
    } else if (h.type === 'bracket') {
      var bb = ch.bracket;
      haloRect(ctx, S, Math.min(bb.x1, bb.x2) - 5, bb.y - 20, Math.abs(bb.x2 - bb.x1) + 10, 32, h.k);
    }
  }
  if (ch.focusRing > 0.001) {
    ctx.save();
    ctx.strokeStyle = rgba('#4f8fe6', 0.9 * ch.focusRing);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, APP.svg.w - 2, APP.svg.h - 2);
    ctx.restore();
  }
}
