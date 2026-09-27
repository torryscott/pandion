/* The hands-on tour ("Try it" mode).
 *
 * The film stops just before each action and hands it to the viewer: the
 * film's own cursor hides, the target gets a spotlight and a beacon, and a
 * coach card says what to do. The viewer's click is hit-tested against the
 * replica's own geometry at that moment; on a hit the film continues from
 * the scripted press, so everything the app does in response is the film's
 * own animation. A drag maps the viewer's pointer onto the scripted drag
 * path, so the bars, the legend, the bracket legs and the title's "it."
 * follow the viewer's hand; release past the point where the app would
 * commit and the film completes the drop, release early and it springs
 * back, as the app does. The typing gate takes the viewer's own axis
 * title, which then stays on the chart for the rest of the tour.
 *
 * Everything here is stage space (1920 x 1080) unless named svg or world.
 * The film itself stays a pure function of time: this layer only
 * decorates a frame's state (hovers follow the real pointer, the cursor
 * hides) and draws the hints on top, animated by the page clock. */

var GUIDE = {
  on: false,          /* hands-on mode */
  gate: null,         /* the gate being waited on */
  since: 0,           /* page time the current gate began */
  pointer: null,      /* the viewer's pointer, stage coords, or null */
  rt: 0,              /* page time (s), for the hint animations */
  showFrom: 0,        /* story time a "Show me" demonstration starts */
  showUntil: -1,      /* story time until which the film's cursor shows ("Show me") */
  typed: null,        /* the viewer's axis title, once they type */
  typedAt: Infinity,  /* story time from which it replaces the film's */
  drag: null,         /* a drag in progress: { gate, u, flipK, snapK, ... } */
  clicks: [],         /* [x, y, pageTime] ripples where the viewer clicked */
  miss: -10,          /* page time of the last click that missed */
  hubHover: -1,       /* intro dot under the pointer at the start card */
  capFloor: -1,       /* story time the caption pill shows at least (a stop's settled caption) */
  capFrom: 0,         /* story time of the stop that set it; earlier times ignore it (a replay) */
  reduce: false
};

/* ---------- geometry helpers ---------- */
function gRectW(S, x, y, w, h) {
  var a = worldToStage(S.cam, x, y), b = worldToStage(S.cam, x + w, y + h);
  return [a[0], a[1], b[0] - a[0], b[1] - a[1]];
}
function gRectSvg(S, x, y, w, h) { return gRectW(S, APP.svg.x + x, APP.svg.y + y, w, h); }
function gRectPanel(S, x, y, w, h) { return gRectW(S, APP.panel.x + x, APP.panel.y + y, w, h); }
function gPtSvg(S, x, y) { return worldToStage(S.cam, APP.svg.x + x, APP.svg.y + y); }
function gIn(r, p, pad) { pad = pad || 0; return p && p[0] >= r[0] - pad && p[0] <= r[0] + r[2] + pad && p[1] >= r[1] - pad && p[1] <= r[1] + r[3] + pad; }
function gUnion(rs) {
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (var i = 0; i < rs.length; i++) {
    var r = rs[i];
    x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}
/* pointer (stage) -> the replica's svg coords */
function gSvgOf(S, p) {
  var w = stageToWorld(S.cam, p[0], p[1]);
  return [w[0] - APP.svg.x, w[1] - APP.svg.y];
}
var _gMeasure = null;
function gCtx() {
  if (!_gMeasure) _gMeasure = document.createElement('canvas').getContext('2d');
  return _gMeasure;
}

/* ---------- targets (each returns stage-space shapes at state S) ---------- */
function gtR1It() {
  var L = TL.rules[0].a[1];
  var r = [L.x - 16, TITLE.aY - TITLE.aSize * 0.78, L.w + 32, TITLE.aSize * 0.92];
  return { hit: [r], beacon: r };
}
function gtEastBars(S) {
  var hit = [];
  for (var i = 0; i < CATS.length; i++) {
    var b = barGeom(S, CATS[i], 'East');
    hit.push(gRectSvg(S, b.x, b.y, b.w, b.h));
  }
  return { hit: hit, beacon: hit[0], pad: 8 };
}
function gtTeal(S) {
  var r = gRectPanel(S, swatchX(7), 153, 22, 22);
  return { hit: [r], beacon: r, pad: 7, hitPad: 5 };
}
function gtYTitle(S) {
  var b = yTitleBox(S, gCtx());
  var r = gRectSvg(S, b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  return { hit: [r], beacon: r, pad: 6, hitPad: 8 };
}
function gtInput(S) {
  var r = gRectPanel(S, 12.5, 58.5, 486, 28);
  return { hit: [r], beacon: r, pad: 5 };
}
function gtLegend(S) {
  var b = legendBox(S);
  var r = gRectSvg(S, b.x - 2, b.y - 2, b.w + 8, b.h + 4);
  return { hit: [r], beacon: r, pad: 6 };
}
function gtErrBar(S) {
  var hit = [];
  for (var i = 0; i < CATS.length; i++) {
    for (var g = 0; g < GROUPS.length; g++) {
      var c = CATS[i], gr = GROUPS[g], st = STATS[c][gr], b = barGeom(S, c, gr);
      var top = yOf(st.mean + st.se), bot = yOf(st.mean - st.se);
      hit.push(gRectSvg(S, b.cx - 8, top - 5, 16, bot - top + 10));
    }
  }
  return { hit: hit, beacon: hit[0], pad: 6, hitPad: 4 };
}
function gtCatLabel(S) {
  var ctx = gCtx(), hit = [];
  ctx.font = fnt(CH.catFont, 400, CHART_FONT);
  for (var i = 0; i < CATS.length; i++) {
    var cx = catCenter(S, CATS[i]), w = ctx.measureText(CATS[i]).width;
    hit.push(gRectSvg(S, cx - w / 2 - 5, 440.43 - 15.5, w + 10, 21));
  }
  return { hit: hit, beacon: hit[1], pad: 5, hitPad: 3 };
}
function gtEmpty(S) {
  /* anywhere in the plot that is not a bar, the legend or an error bar */
  var plot = gRectSvg(S, CH.axisX + 4, CH.topY, CH.rightX - CH.axisX - 4, CH.baseY - CH.topY);
  var spot = gRectSvg(S, 190, 62, 130, 70);
  var not = [], i, g;
  for (i = 0; i < CATS.length; i++) for (g = 0; g < GROUPS.length; g++) {
    var b = barGeom(S, CATS[i], GROUPS[g]), st = STATS[CATS[i]][GROUPS[g]];
    var top = Math.min(b.y, yOf(st.mean + st.se)) - 6;
    not.push(gRectSvg(S, b.x - 3, top, b.w + 6, CH.baseY - top));
  }
  var lb = legendBox(S);
  not.push(gRectSvg(S, lb.x - 4, lb.y - 4, lb.w + 10, lb.h + 8));
  return { hit: [plot], not: not, beacon: spot, round: true, pad: 0 };
}
function gtR2It() {
  var L = TL.rules[1].a[1], D = TL.r2Disp;
  var r = [L.x + D[0] - 14, TITLE.aY - TITLE.aSize * 0.78 + D[1], L.w + 28, TITLE.aSize * 0.9];
  var home = [L.x - 14, TITLE.aY - TITLE.aSize * 0.78, L.w + 28, TITLE.aSize * 0.9];
  return { hit: [r], beacon: r, grab: [r], from: TITLE_ANCHORS.r2itStart, to: TITLE_ANCHORS.r2itEnd, drop: home, pad: 6 };
}
function gtBarDrag(S) {
  var hit = [];
  for (var i = 0; i < CATS.length; i++) {
    var b = barGeom(S, CATS[i], 'East');
    hit.push(gRectSvg(S, b.x, b.y, b.w, b.h));
  }
  /* where the grabbed bar lands: the red bar's slot beside it */
  var w = barGeom(S, 'Control', 'West');
  var drop = gRectSvg(S, w.x, w.y, w.w, w.h);
  return { hit: hit, grab: hit, beacon: hit[0], from: gPtSvg(S, DRAG.x0, DRAG.y), to: gPtSvg(S, DRAG.x0 + DRAG.dx, DRAG.y), drop: drop, pad: 8, axis: 'x' };
}
function gtLegendDrag(S) {
  var b = legendBox(S);
  var r = gRectSvg(S, b.x - 2, b.y - 2, b.w + 8, b.h + 4);
  var drop = gRectSvg(S, b.x - 557 - 2, b.y + 4 - 2, b.w + 8, b.h + 4);
  return { hit: [r], grab: [r], beacon: r, from: gPtSvg(S, 664, 64), to: gPtSvg(S, 664 - 557, 64 + 4), drop: drop, pad: 6 };
}
function gtR3Btn() {
  var b = TL.rules[2].btn;
  var r = [b.x, b.y, b.w, b.h];
  return { hit: [r], beacon: r, pad: 8, radius: 34 };
}
function gtAddBtn(S) {
  var r = gRectW(S, TB.add.x, TB.add.y, TB.add.w, TB.add.h);
  return { hit: [r], beacon: r, pad: 6, hitPad: 3 };
}
function gtTile(key) {
  return function (S) {
    for (var i = 0; i < ADD_TILES.length; i++) {
      if (ADD_TILES[i][0] !== key) continue;
      var tr = tileRect(i), r = gRectW(S, tr.x, tr.y, tr.w, tr.h);
      return { hit: [r], beacon: r, pad: 5 };
    }
    return { hit: [], beacon: [0, 0, 0, 0] };
  };
}
function gtLeg(L, key) {
  return function (S) {
    var bx = S.chart.bracket ? S.chart.bracket[key] : L.from;
    var r = gRectSvg(S, bx - 13, BR.y - 12, 26, 34);
    var bar = barGeom(S, L.cat, L.grp);
    var drop = gRectSvg(S, bar.x, bar.y - 10, bar.w, 26);
    return { hit: [r], grab: [r], beacon: r, from: gPtSvg(S, L.from, BR.y + 5), to: gPtSvg(S, L.to, BR.y + 5), drop: drop, pad: 6, axis: 'x' };
  };
}

/* ---------- the gates, in story order ---------- */
/* A drag commits once the pointer has gone this far along its path: the
 * bar drag at the point where the engine would flip the drop slot (the red
 * bar's centre), less a little grace; a bracket leg once it is within
 * snapping range of its bar. */
var DRAG_FLIP_U = (203.2667 - DRAG.x0) / DRAG.dx;
var GATES = (function () {
  var r1 = T.r1, r2 = T.r2, r3 = T.r3, d1 = T.d1, d2 = T.d2, d3 = T.d3;
  var legU = function (L) { return 1 - 26 / Math.abs(L.to - L.from); };
  /* Nine stops (Torry, Sep 26 2026: nineteen "does feel a little long"):
   * each rule's title is a door the viewer opens with that rule's gesture,
   * then the moments that pay off are theirs to do (a bar, the color, their
   * own axis title; the bar drag; the data points and the bracket end that
   * runs the test). Everything between plays on its own, the film's cursor
   * doing it, so every step is still shown. */
  var ALL = {
    hub: { id: 'hub', kind: 'hub', t: 3.4, chap: -1 },
    r1it: { id: 'r1it', kind: 'click', chap: 0, t: r1 + 1.5, at: r1 + 1.58, text: 'Click the word \u201cit.\u201d', tgt: gtR1It, show: r1 + 0.6 },
    bar: { id: 'bar', kind: 'click', chap: 0, t: d1 + 1.8, at: d1 + 1.85, text: 'Click one of the blue bars.', tgt: gtEastBars, show: d1 + 0.9 },
    swatch: { id: 'swatch', kind: 'click', chap: 0, t: d1 + 3.26, at: d1 + 3.32, capT: d1 + 3.7, text: 'Pick the teal swatch.', tgt: gtTeal, show: d1 + 2.3 },
    ytitle: { id: 'ytitle', kind: 'click', chap: 0, t: d1 + 4.9, at: d1 + 4.95, capT: d1 + 5.35, text: 'Click the axis title, \u201cScore.\u201d', tgt: gtYTitle, show: d1 + 4.0 },
    type: { id: 'type', kind: 'type', chap: 0, t: d1 + 6.5, text: 'Type a new axis title, then press Enter.', tgt: gtInput, show: d1 + 6.5, hideFrom: d1 + 6.4 },
    legend: { id: 'legend', kind: 'click', chap: 0, t: d1 + 8.25, at: d1 + 8.3, text: 'Now click the legend.', tgt: gtLegend, show: d1 + 7.55 },
    errbar: { id: 'errbar', kind: 'click', chap: 0, t: d1 + 9.17, at: d1 + 9.22, text: 'Click an error bar.', tgt: gtErrBar, show: d1 + 8.6 },
    catlabel: { id: 'catlabel', kind: 'click', chap: 0, t: d1 + 10.07, at: d1 + 10.12, text: 'Click a category label.', tgt: gtCatLabel, show: d1 + 9.5 },
    empty: { id: 'empty', kind: 'click', chap: 0, t: d1 + 10.45, at: d1 + 11.02, fast: 2.5, text: 'Click an empty spot to close the panel.', tgt: gtEmpty, show: d1 + 10.45 },
    r2it: { id: 'r2it', kind: 'drag', chap: 1, place: 'right', t: r2 + 1.25, press: [r2 + 1.28, r2 + 1.86], path: [r2 + 1.33, r2 + 1.83], commit: 0.55, text: 'Drag \u201cit.\u201d into its place.', tgt: gtR2It, show: r2 + 0.5 },
    bardrag: { id: 'bardrag', kind: 'drag', chap: 1, t: DRAG.down - 0.03, press: [DRAG.down, DRAG.up], path: [DRAG.t0, DRAG.t1], commit: DRAG_FLIP_U - 0.06, text: 'Drag a teal bar past its red neighbor.', tgt: gtBarDrag, show: d2 + 0.15, flip: true },
    legenddrag: { id: 'legenddrag', kind: 'drag', chap: 1, t: d2 + 3.57, press: [d2 + 3.6, d2 + 4.85], path: [d2 + 3.67, d2 + 4.78], commit: 0.5, text: 'Drag the legend to the top left.', tgt: gtLegendDrag, show: d2 + 2.7 },
    r3btn: { id: 'r3btn', kind: 'click', chap: 2, t: r3 + 1.35, at: r3 + 1.4, text: 'Click + Add.', tgt: gtR3Btn, show: r3 + 0.55 },
    add1: { id: 'add1', kind: 'click', chap: 2, t: d3 + 0.95, at: d3 + 1.0, text: 'Click + Add in the toolbar.', tgt: gtAddBtn, show: d3 + 0.05 },
    points: { id: 'points', kind: 'click', chap: 2, t: d3 + 1.95, at: d3 + 2.0, text: 'Choose Data points.', tgt: gtTile('showDataPoints'), show: d3 + 1.25 },
    add2: { id: 'add2', kind: 'click', chap: 2, t: d3 + 3.9, at: d3 + 3.95, text: 'Click + Add again.', tgt: gtAddBtn, show: d3 + 3.3 },
    bracket: { id: 'bracket', kind: 'click', chap: 2, t: d3 + 4.7, at: d3 + 4.75, text: 'Choose Sig. bracket.', tgt: gtTile('bracket'), show: d3 + 4.15 },
    legL: { id: 'legL', kind: 'drag', chap: 2, t: BR.L.down - 0.03, press: [BR.L.down, BR.L.up], path: [BR.L.t0, BR.L.t1], commit: legU(BR.L), text: 'Drag the bracket\u2019s left end onto the first teal bar.', tgt: gtLeg(BR.L, 'x1'), show: d3 + 5.2, snapLeg: BR.L },
    legR: { id: 'legR', kind: 'drag', chap: 2, t: BR.R.down - 0.03, press: [BR.R.down, BR.R.up], path: [BR.R.t0, BR.R.t1], commit: legU(BR.R), text: 'Drag the bracket\u2019s right end onto the last teal bar.', tgt: gtLeg(BR.R, 'x2'), show: d3 + 6.8, snapLeg: BR.R }
  };
  /* the tour, in story order; any other entry above can be added back */
  return ['hub', 'r1it', 'bar', 'swatch', 'type', 'r2it', 'bardrag', 'r3btn', 'points', 'legR'].map(function (k) { return ALL[k]; });
})();
/* In hands-on mode the film's own cursor shows while the film does a step by
 * itself, so nothing happens by magic, and it steps aside for the viewer's
 * steps: hidden from the moment it would set off toward a stop's target
 * until it leaves for its next target. */
var GATE_HIDE = (function () {
  var ways = CW.filter(function (w) { return w.t1 > w.t0; }), out = [];
  for (var i = 0; i < GATES.length; i++) {
    var g = GATES[i];
    if (g.kind === 'hub') continue;
    var from = g.hideFrom, j;
    if (from == null) for (j = 0; j < ways.length; j++) if (ways[j].t1 <= g.t + 0.05) from = ways[j].t0;
    var end = g.kind === 'type' ? typingDone() : g.kind === 'drag' ? g.press[1] : g.at, until = null;
    for (j = 0; j < ways.length; j++) if (ways[j].t0 > end + 0.01) { until = ways[j].t0; break; }
    out.push([from != null ? from : g.t - 0.8, until != null ? until : end + 0.6]);
  }
  return out;
})();
function cursorHiddenK(t) {
  var k = 0;
  for (var i = 0; i < GATE_HIDE.length; i++) {
    var a = GATE_HIDE[i][0], b = GATE_HIDE[i][1];
    k = Math.max(k, clamp((t - (a - 0.2)) / 0.2, 0, 1) * (1 - clamp((t - b) / 0.25, 0, 1)));
  }
  return k;
}
var GUIDE_CHAPTERS = [
  { label: 'Click to change', t: T.r1 - 0.45 },
  { label: 'Drag to move', t: T.r2 - 0.45 },
  { label: 'Click + to add', t: T.r3 - 0.45 }
];
function gateById(id) { for (var i = 0; i < GATES.length; i++) if (GATES[i].id === id) return GATES[i]; return null; }
/* The first gate strictly after story time a and at or before b. */
function gateBetween(a, b, skipId) {
  for (var i = 0; i < GATES.length; i++) {
    var g = GATES[i];
    if (g.t > a + 1e-6 && g.t <= b + 1e-6 && g.id !== skipId) return g;
  }
  return null;
}
function gateShape(g, S) {
  computeTitleLayout(gCtx());
  return g.tgt ? g.tgt(S) : null;
}

/* ---------- hit testing ---------- */
/* minHit: the smallest target (stage px) the player allows, so a tap target
 * never shrinks below a comfortable size however small the picture is drawn */
function gGrow(r, minHit) {
  if (!minHit) return r;
  var w = Math.max(r[2], minHit), h = Math.max(r[3], minHit);
  return [r[0] + r[2] / 2 - w / 2, r[1] + r[3] / 2 - h / 2, w, h];
}
function gateHit(g, S, p, forGrab, minHit) {
  var G = gateShape(g, S);
  if (!G || !p) return false;
  var list = forGrab && G.grab ? G.grab : G.hit, pad = G.hitPad == null ? 2 : G.hitPad;
  var inside = false;
  for (var i = 0; i < list.length; i++) if (gIn(gGrow(list[i], minHit), p, pad)) { inside = true; break; }
  if (inside && G.not) for (var j = 0; j < G.not.length; j++) if (gIn(G.not[j], p, 0)) return false;
  return inside;
}
function hubDotAt(p, minHit) {
  if (!p) return -1;
  var r = Math.max(INTRO_RING * 1.25, (minHit || 0) / 2);
  for (var i = 0; i < 3; i++) {
    var d = INTRO_DOTS[i], dx = p[0] - d[0], dy = p[1] - d[1];
    if (dx * dx + dy * dy <= r * r) return i;
  }
  return -1;
}

/* ---------- drag mapping ---------- */
function invInOutCubic(u) {
  var lo = 0, hi = 1;
  for (var i = 0; i < 30; i++) { var m = (lo + hi) / 2; if (Ease.inOutCubic(m) < u) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/* how far along its path a drag is, from the pointer's travel since the press */
function dragProgress(G, p0, p) {
  var vx = G.to[0] - G.from[0], vy = G.to[1] - G.from[1];
  var dx = p[0] - p0[0], dy = p[1] - p0[1];
  var u = G.axis === 'x' ? dx / vx : (dx * vx + dy * vy) / (vx * vx + vy * vy);
  return clamp(u, 0, 1);
}
function dragTime(g, u) {
  return g.path[0] + invInOutCubic(clamp(u, 0, 1)) * (g.path[1] - g.path[0]);
}

/* ---------- state decoration ---------- */
function guideDecorate(S) {
  if (!GUIDE.on) return S;
  var t = S.time, ch = S.chart, A = S.app;
  /* the film's cursor steps aside for the viewer's steps (and shows while
   * "Show me" demonstrates one) */
  var vis = S.cur.vis;
  var showing = GUIDE.showUntil > 0 && t >= (GUIDE.showFrom || 0) - 0.01 && t <= GUIDE.showUntil + 0.25;
  if (!showing) vis *= 1 - cursorHiddenK(t);
  S.cur = Object.assign({}, S.cur, { vis: vis });
  /* hovers follow the viewer's pointer, as in the app */
  var inDemo = (t > T.d1 + 0.5 && t < T.r2 - 0.5) || (t > T.d2 && t < T.r3 - 0.5) || (t > T.d3 && t < T.recap + 0.4);
  var p = GUIDE.pointer && !GUIDE.drag ? GUIDE.pointer : null;
  S.guideHover = {};
  if (inDemo && S.app.visible > 0.98) {
    var sv = p ? gSvgOf(S, p) : null, wp = p ? stageToWorld(S.cam, p[0], p[1]) : null;
    ch.hover = null;
    if (sv && !ch.gdrag) {
      for (var i = 0; i < CATS.length && !ch.hover; i++) for (var g = 0; g < GROUPS.length; g++) {
        var b = barGeom(S, CATS[i], GROUPS[g]);
        if (sv[0] >= b.x && sv[0] <= b.x + b.w && sv[1] >= b.y && sv[1] <= CH.baseY) { ch.hover = { cat: CATS[i], grp: GROUPS[g], k: 1 }; break; }
      }
    }
    for (var h = 0; h < ch.halos.length; h++) {
      if (ch.halos[h].type !== 'hovertext') continue;
      var yb = yTitleBox(S, gCtx());
      ch.halos[h].k = sv && sv[0] >= yb.x - 6 && sv[0] <= yb.x + yb.w + 6 && sv[1] >= yb.y - 6 && sv[1] <= yb.y + yb.h + 6 && S.app.panelKind !== 'ytitle' ? 1 : 0;
    }
    if (A.pstate && A.pstate.bars) {
      var swH = { i: 7, k: 0 };
      if (wp && A.panelKind === 'bars' && A.panelOpen > 0.9) {
        var px = wp[0] - APP.panel.x, py = wp[1] - APP.panel.y;
        for (var s = 0; s < QUICK_SWATCHES.length; s++) if (px >= swatchX(s) && px <= swatchX(s) + 22 && py >= 151 && py <= 177) swH = { i: s, k: 1 };
      }
      A.pstate.bars = Object.assign({}, A.pstate.bars, { swHover: swH });
    }
    A.addHover = wp && wp[0] >= TB.add.x && wp[0] <= TB.add.x + TB.add.w && wp[1] >= TB.add.y && wp[1] <= TB.add.y + TB.add.h ? 1 : 0;
    var th = {};
    if (wp && A.menuOpen > 0.9) {
      for (var k = 0; k < ADD_TILES.length; k++) {
        var tr = tileRect(k);
        if (wp[0] >= tr.x && wp[0] <= tr.x + tr.w && wp[1] >= tr.y && wp[1] <= tr.y + tr.h) th[ADD_TILES[k][0]] = 1;
      }
    }
    A.tileHover = { showDataPoints: th.showDataPoints || 0, bracket: th.bracket || 0 };
  }
  if (p && t > T.r3 - 0.2 && t < T.r3 + 1.4) {
    var bb = TL && TL.rules[2].btn;
    if (bb) S.guideHover.titleAdd = gIn([bb.x, bb.y, bb.w, bb.h], p, 0) ? 1 : 0;
  }
  /* the viewer's own axis title */
  if (GUIDE.typed != null && t >= GUIDE.typedAt) {
    var v = GUIDE.typed;
    ch.yTitle = v.length ? v : ' ';
    var P = A.pstate.ytitle;
    var typing = GUIDE.gate && GUIDE.gate.kind === 'type';
    var blink = Math.floor((GUIDE.rt - GUIDE.since) / 0.53) % 2 === 0;
    A.pstate.ytitle = { value: v, selAll: 0, focus: P ? P.focus : 1, caret: typing ? blink : (P ? P.caret : false) };
  }
  /* a drag in progress: the parts that animate on their own in the app
   * (the red bars stepping aside, a snapped leg dropping onto its bar)
   * run on the page clock, so they finish even while the pointer rests */
  var D = GUIDE.drag;
  if (D && D.gate.flip && t < DRAG.up) ch.gpos = Object.assign({}, ch.gpos, { West: 1 - CSS_EASE_OUT(clamp(D.flipK, 0, 1)) });
  if (D && D.gate.id === 'legenddrag' && D.phase === 'hold') ch.legend = Object.assign({}, ch.legend, { lift: 1 });
  if (D && D.gate.snapLeg && ch.bracket) {
    var L = D.gate.snapLeg, capKey = L === BR.L ? 'legL' : 'legR';
    ch.bracket = Object.assign({}, ch.bracket);
    ch.bracket[capKey] = lerp(6, bracketAutoCap(L.cat, L.grp), Ease.outCubic(clamp(D.snapK, 0, 1)));
    if (D.snapK > 0) { ch.bracket.snapX = L.to; ch.bracket.snapK = clamp(D.snapK * 3, 0, 1); }
    else { ch.bracket.snapX = null; ch.bracket.snapK = 0; }
  }
  if (GUIDE.gate && GUIDE.gate.kind === 'hub') S.hubHover = GUIDE.hubHover;
  /* captions: a stop shows its caption settled, never caught mid-fade, and
   * holds it after the viewer acts until the film catches up */
  if (GUIDE.capFloor > t && t >= GUIDE.capFrom - 0.01) S.captionT = GUIDE.capFloor;
  return S;
}

/* ---------- drawing the hints ---------- */
function gRoundRect(ctx, r, pad, rad) {
  roundRect(ctx, r[0] - pad, r[1] - pad, r[2] + pad * 2, r[3] + pad * 2, rad);
}
function drawGuide(ctx, S) {
  if (!GUIDE.on) return;
  var rt = GUIDE.rt, g = GUIDE.gate;
  var reduce = GUIDE.reduce;
  if (g && g.kind !== 'hub') {
    var G = gateShape(g, S);
    if (G) {
      var age = rt - GUIDE.since;
      var k = reduce ? 1 : Ease.outCubic(clamp(age / 0.35, 0, 1));
      var pad = G.pad == null ? 8 : G.pad;
      var rad = G.radius || (G.round ? Math.min(G.beacon[2], G.beacon[3]) / 2 + pad : 10);
      /* spotlight: dim the frame a touch around the target (and a drag's path) */
      var focus = g.kind === 'drag' && G.drop ? gUnion([G.beacon, G.drop]) : G.beacon;
      var dim = 0.13 * k * (GUIDE.drag ? 0.35 : 1);
      if (dim > 0.002) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, STAGE_W, STAGE_H);
        var fp = pad + 22;
        roundRect(ctx, focus[0] - fp, focus[1] - fp, focus[2] + fp * 2, focus[3] + fp * 2, 22);
        ctx.fillStyle = rgba(C.navy, dim);
        ctx.fill('evenodd');
        ctx.restore();
      }
      /* the beacon: an outline that breathes, and a ring that ripples out */
      var missK = 1 - clamp((rt - GUIDE.miss) / 0.5, 0, 1);
      var breath = reduce ? 1 : 0.72 + 0.28 * Math.sin(age * 3.6);
      if (!GUIDE.drag) {
        ctx.save();
        ctx.globalAlpha *= k;
        ctx.lineWidth = 4 + 3 * missK;
        ctx.strokeStyle = rgba(missK > 0.01 ? mixOk(C.cobalt, '#c2410c', missK) : C.cobalt, 0.55 + 0.4 * breath);
        gRoundRect(ctx, G.beacon, pad + 2 * missK * Math.sin(rt * 60), rad);
        ctx.stroke();
        if (!reduce) {
          var period = 1.4, ph = ((age % period) + period) % period / period;
          ctx.globalAlpha *= (1 - ph) * 0.55;
          ctx.lineWidth = 3;
          ctx.strokeStyle = C.cobalt;
          gRoundRect(ctx, G.beacon, pad + 6 + 26 * Ease.outCubic(ph), rad + 20 * ph);
          ctx.stroke();
        }
        ctx.restore();
      }
      /* drags: a dotted track, a drop target and a ghost hand showing the move */
      if (g.kind === 'drag' && G.from) {
        var a = G.from, b = G.to;
        ctx.save();
        ctx.globalAlpha *= k * (GUIDE.drag ? 0.5 : 1);
        if (G.drop) {
          ctx.setLineDash([10, 7]);
          ctx.lineDashOffset = reduce ? 0 : -(rt * 24) % 17;
          ctx.lineWidth = 3;
          ctx.strokeStyle = rgba(C.cobalt, 0.85);
          ctx.fillStyle = rgba(C.cobalt, 0.06);
          gRoundRect(ctx, G.drop, 6, 10);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
        }
        var len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        if (len > 30 && !GUIDE.drag) {
          var ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
          ctx.strokeStyle = rgba(C.cobalt, 0.7);
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.setLineDash([2, 12]);
          ctx.beginPath();
          ctx.moveTo(a[0] + ux * 26, a[1] + uy * 26);
          ctx.lineTo(b[0] - ux * 22, b[1] - uy * 22);
          ctx.stroke();
          ctx.setLineDash([]);
          /* arrowhead */
          var hx = b[0] - ux * 12, hy = b[1] - uy * 12;
          ctx.fillStyle = rgba(C.cobalt, 0.8);
          ctx.beginPath();
          ctx.moveTo(hx + ux * 14, hy + uy * 14);
          ctx.lineTo(hx - uy * 11 - ux * 6, hy + ux * 11 - uy * 6);
          ctx.lineTo(hx + uy * 11 - ux * 6, hy - ux * 11 - uy * 6);
          ctx.closePath();
          ctx.fill();
          if (!reduce) {
            /* the ghost hand: press, glide, let go, fade, again */
            var gp = (age % 2.2) / 2.2;
            var m = Ease.minJerk(clamp((gp - 0.18) / 0.5, 0, 1));
            var ga = Math.min(clamp(gp / 0.1, 0, 1), 1 - clamp((gp - 0.78) / 0.14, 0, 1));
            var down = gp > 0.12 && gp < 0.72 ? 1 : 0;
            ctx.globalAlpha *= 0.62 * ga;
            drawHandCursor(ctx, lerp(a[0], b[0], m) + 4, lerp(a[1], b[1], m) + 6, 44, down);
          }
        }
        ctx.restore();
      }
    }
  }
  /* ripples where the viewer clicked */
  var keep = [];
  for (var c = 0; c < GUIDE.clicks.length; c++) {
    var ck = GUIDE.clicks[c], cp = (rt - ck[2]) / 0.55;
    if (cp < 0 || cp > 1) continue;
    keep.push(ck);
    ctx.save();
    ctx.beginPath();
    ctx.arc(ck[0], ck[1], 10 + 34 * Ease.outCubic(cp), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(C.cobalt, 0.55 * (1 - cp));
    ctx.lineWidth = 4 * (1 - cp) + 1;
    ctx.stroke();
    ctx.restore();
  }
  GUIDE.clicks = keep;
}
/* Anything still animating on the page clock (so the player keeps drawing). */
function guideAnimating() {
  return GUIDE.on && (GUIDE.gate != null || GUIDE.drag != null || GUIDE.clicks.length > 0);
}
