/* The film's script: cue times, camera, cursor and every UI state as a
 * pure function of time t (seconds). Music is 100 BPM, so a bar is 2.4 s
 * and every section starts on a downbeat. */

var BAR = 2.4;
var DURATION = 48.6;
var T = {
  /* intro */
  r1: 2 * BAR,            /* 4.8  rule 1 title */
  d1: 3 * BAR,            /* 7.2  demo 1 */
  r2: 8 * BAR,            /* 19.2 rule 2 title */
  d2: 9 * BAR,            /* 21.6 demo 2 */
  r3: 12 * BAR,           /* 28.8 rule 3 title */
  d3: 13 * BAR,           /* 31.2 demo 3 */
  recap: 17 * BAR,        /* 40.8 recap */
  end: DURATION
};
/* The finale lands on the music: dots on beats, the osprey on bar 19. */
var FINALE = { line: 42.0, dots: [42.6, 43.2, 43.8], dive: 44.85, land: 45.6, lockup: 45.95 };
var CHAPTERS = [
  { id: 'intro', label: 'Intro', t: 0 },
  { id: 'click', label: 'Click', t: T.r1 },
  { id: 'drag', label: 'Drag', t: T.r2 },
  { id: 'add', label: 'Add', t: T.r3 },
  { id: 'recap', label: 'Recap', t: T.recap }
];

/* ---------- world anchors ---------- */
function SV(x, y) { return { s: 'w', x: APP.svg.x + x, y: APP.svg.y + y }; }
function PN(x, y) { return { s: 'w', x: APP.panel.x + x, y: APP.panel.y + y }; }
function WP(x, y) { return { s: 'w', x: x, y: y }; }
function STP(x, y) { return { s: 's', x: x, y: y }; }

/* ---------- camera shots (world rects fitted into the action area) ---------- */
var ACTION = { x0: 70, y0: 150, x1: 1850, y1: 1045 };
function shot(x0, y0, x1, y1, zMul) {
  var aw = ACTION.x1 - ACTION.x0, ah = ACTION.y1 - ACTION.y0;
  var z = Math.min(aw / (x1 - x0), ah / (y1 - y0)) * (zMul || 1);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: z, sx: (ACTION.x0 + ACTION.x1) / 2, sy: (ACTION.y0 + ACTION.y1) / 2 };
}
var SHOT = {
  whole: shot(-30, -40, 1470, 1010),
  chart: shot(222, 126, 1094, 690),
  chartTight: shot(292, 178, 1014, 675),
  chartPanel: shot(288, 222, 1018, 884),
  mid: shot(286, 196, 1022, 962),
  addMid: shot(300, 124, 1015, 612),
  bracket: shot(438, 182, 942, 482),
  pull: shot(-120, -120, 1560, 1100)
};
function zmul(sh, k) { var o = Object.assign({}, sh); o.z *= k; return o; }
/* keyframes: [time, shot, ease-in-to-this] */
var CAM_KEYS = [
  [0, SHOT.whole],
  [T.d1 - 0.3, SHOT.whole],
  [T.d1 + 0.8, zmul(SHOT.whole, 1.025), 'lin'],
  [T.d1 + 1.72, SHOT.chart, 'smooth'],
  [T.d1 + 2.05, SHOT.chart],
  [T.d1 + 2.95, SHOT.chartPanel, 'smooth'],
  [T.d1 + 7.4, zmul(SHOT.chartPanel, 1.03), 'lin'],
  [T.d1 + 7.95, SHOT.mid, 'smooth'],
  [T.d1 + 10.4, zmul(SHOT.mid, 1.02), 'lin'],
  [T.d1 + 11.2, SHOT.chart, 'smooth'],
  [T.r2 + 0.2, zmul(SHOT.chart, 1.03), 'lin'],
  [T.d2 - 0.25, SHOT.chartTight, 'smooth'],
  [T.d2 + 6.2, zmul(SHOT.chartTight, 1.04), 'lin'],
  [T.r3 + 0.3, zmul(SHOT.chart, 0.98), 'smooth'],
  [T.d3 - 0.25, SHOT.addMid, 'smooth'],
  [T.d3 + 4.9, zmul(SHOT.addMid, 1.02), 'lin'],
  [T.d3 + 5.55, SHOT.bracket, 'smooth'],
  [T.d3 + 8.6, zmul(SHOT.bracket, 1.02), 'lin'],
  [T.d3 + 9.35, SHOT.chartTight, 'smooth'],
  [T.recap + 0.05, zmul(SHOT.chartTight, 1.01), 'lin'],
  [T.recap + 0.95, SHOT.whole, 'smooth'],
  [DURATION, zmul(SHOT.whole, 0.97), 'lin']
];
function camAt(t) {
  var K = CAM_KEYS, i = 0;
  while (i < K.length - 1 && K[i + 1][0] <= t) i++;
  if (i >= K.length - 1) return K[K.length - 1][1];
  var a = K[i], b = K[i + 1];
  var u = seg(t, a[0], b[0]);
  var ez = Ease[b[2] || 'smooth'] || Ease.smooth;
  u = ez(u);
  var za = Math.log(a[1].z), zb = Math.log(b[1].z);
  var z = Math.exp(lerp(za, zb, u));
  /* keep the point of interest steady while zooming: interpolate the
   * world centre in a zoom-weighted way so pans do not swoop */
  return { x: lerp(a[1].x, b[1].x, u), y: lerp(a[1].y, b[1].y, u), z: z, sx: lerp(a[1].sx, b[1].sx, u), sy: lerp(a[1].sy, b[1].sy, u) };
}

/* ---------- cursor script ---------- */
/* A waypoint: depart at t0 from the previous point, arrive at t1. */
var CW = [];
var PRESS = [];   /* [down, up] */
var CTYPE = [];   /* [t, 'arrow' | 'hand' | 'ibeam'] */
var CVIS = [];    /* [t0, t1, from, to] opacity ramps */
var SFX = [];     /* audio cues */
function way(t0, t1, p, bend, ease) { CW.push({ t0: t0, t1: t1, p: p, bend: bend == null ? 0.08 : bend, ease: ease || 'minJerk' }); }
function click(t, kind) { PRESS.push([t, t + 0.085]); SFX.push({ t: t, k: kind || 'click' }); }
function press(t0, t1) { PRESS.push([t0, t1]); SFX.push({ t: t0, k: 'grab' }); SFX.push({ t: t1, k: 'drop' }); }
function ctype(t, k) { CTYPE.push([t, k]); }
function cue(t, k, v) { SFX.push({ t: t, k: k, v: v }); }

/* Geometry the cursor aims at. */
var TGT = {
  itWord1: STP(0, 0), /* resolved at runtime from the title layout */
  eastBar: SV(127.4, 300),
  tealSwatch: PN(swatchX(7) + 11, 164),
  yTitle: SV(12.5, 214),
  input: PN(236, 73),
  inputRest: PN(170, 94),
  legend: SV(683, 72),
  errBar: SV(127.4, 170),
  catLabel: SV(355.5, 436),
  empty: SV(252, 96),
  lowDoseGrab: SV(522, 250),
  legendGrab: SV(664, 64),
  addBtn: WP(TB.add.x + 29, TB.add.y + 15),
  tilePoints: null,
  tileBracket: null
};

/* Bracket geometry (svg coords). */
var BR = { x1: 300, x2: 420, y: 59.5, westCtl: 165.8333 + 37.4333, westHigh: 165.8333 + 2 * 189.6667 + 37.4333 };

/* ---------- the script ---------- */
(function script() {
  var r1 = T.r1, d1 = T.d1, r2 = T.r2, d2 = T.d2, r3 = T.r3, d3 = T.d3;
  ctype(0, 'arrow');
  CVIS.push([r1 + 0.8, r1 + 1.05, 0, 1]);
  /* Rule 1 title: the cursor clicks the word "it." */
  CW.push({ t0: 0, t1: 0, p: STP(2050, 1180), bend: 0 });
  way(r1 + 0.78, r1 + 1.5, { s: 'title', id: 'r1it' }, 0.1);
  click(r1 + 1.58);
  /* Demo 1 */
  way(d1 + 0.95, d1 + 1.75, TGT.eastBar, -0.06);
  click(d1 + 1.85);
  way(d1 + 2.35, d1 + 3.2, TGT.tealSwatch, 0.07);
  click(d1 + 3.32, 'clickSoft');
  way(d1 + 4.05, d1 + 4.85, TGT.yTitle, -0.08);
  click(d1 + 4.95);
  way(d1 + 5.45, d1 + 6.05, TGT.input, 0.06);
  ctype(d1 + 5.85, 'ibeam');
  click(d1 + 6.15, 'clickSoft');
  way(d1 + 6.45, d1 + 6.9, TGT.inputRest, 0.02);
  ctype(d1 + 7.55, 'arrow');
  way(d1 + 7.6, d1 + 8.2, TGT.legend, -0.08);
  click(d1 + 8.3);
  way(d1 + 8.65, d1 + 9.15, TGT.errBar, 0.08);
  click(d1 + 9.22);
  way(d1 + 9.55, d1 + 10.05, TGT.catLabel, -0.06);
  click(d1 + 10.12);
  way(d1 + 10.5, d1 + 10.95, TGT.empty, 0.06);
  click(d1 + 11.02, 'clickSoft');
  way(d1 + 11.35, r2 + 0.3, STP(2100, 1250), 0.05, 'inOutCubic');
  CVIS.push([r2 - 0.1, r2 + 0.25, 1, 0]);

  /* Rule 2 title: the hand drags "it." home */
  CW.push({ t0: r2 + 0.3, t1: r2 + 0.3, p: STP(1880, 1160), bend: 0 });
  ctype(r2 + 0.3, 'hand');
  CVIS.push([r2 + 0.58, r2 + 0.8, 0, 1]);
  way(r2 + 0.55, r2 + 1.2, { s: 'title', id: 'r2itStart' }, 0.12);
  press(r2 + 1.28, r2 + 1.86);
  way(r2 + 1.33, r2 + 1.83, { s: 'title', id: 'r2itEnd' }, -0.1, 'inOutCubic');
  /* Demo 2 */
  ctype(d2 - 0.05, 'arrow');
  way(d2 + 0.2, d2 + 1.0, TGT.lowDoseGrab, 0.08);
  ctype(d2 + 1.03, 'hand');
  press(d2 + 1.1, d2 + 2.45);
  way(d2 + 1.17, d2 + 2.38, SV(522 - 189.6667, 250), 0.0, 'inOutCubic');
  ctype(d2 + 2.6, 'arrow');
  way(d2 + 2.75, d2 + 3.5, TGT.legendGrab, -0.1);
  ctype(d2 + 3.53, 'hand');
  press(d2 + 3.6, d2 + 4.85);
  way(d2 + 3.67, d2 + 4.78, SV(664 - 557, 64 + 4), -0.12, 'inOutCubic');
  ctype(d2 + 5.0, 'arrow');
  way(d2 + 5.2, r3 + 0.3, STP(2100, 1250), 0.05, 'inOutCubic');
  CVIS.push([r3 - 0.1, r3 + 0.25, 1, 0]);

  /* Rule 3 title: the cursor clicks the + Add button */
  CW.push({ t0: r3 + 0.3, t1: r3 + 0.3, p: STP(1880, 1160), bend: 0 });
  ctype(r3 + 0.3, 'arrow');
  CVIS.push([r3 + 0.62, r3 + 0.85, 0, 1]);
  way(r3 + 0.6, r3 + 1.3, { s: 'title', id: 'r3btn' }, 0.1);
  click(r3 + 1.4);
  /* Demo 3 */
  way(d3 + 0.1, d3 + 0.9, TGT.addBtn, -0.06);
  click(d3 + 1.0);
  way(d3 + 1.3, d3 + 1.9, WP(tileCenter('showDataPoints')[0] + 6, tileCenter('showDataPoints')[1] + 4), 0.07);
  click(d3 + 2.0);
  way(d3 + 3.35, d3 + 3.85, TGT.addBtn, -0.07);
  click(d3 + 3.95);
  way(d3 + 4.2, d3 + 4.65, WP(tileCenter('bracket')[0] + 4, tileCenter('bracket')[1] + 4), 0.06);
  click(d3 + 4.75);
  way(d3 + 5.25, d3 + 5.75, SV(BR.x1, BR.y + 5), 0.08);
  ctype(d3 + 5.78, 'hand');
  press(d3 + 5.85, d3 + 6.62);
  way(d3 + 5.9, d3 + 6.55, SV(BR.westCtl, BR.y + 5), 0.0, 'inOutCubic');
  ctype(d3 + 6.75, 'arrow');
  way(d3 + 6.85, d3 + 7.35, SV(BR.x2, BR.y + 5), -0.08);
  ctype(d3 + 7.38, 'hand');
  press(d3 + 7.45, d3 + 8.3);
  way(d3 + 7.5, d3 + 8.22, SV(BR.westHigh, BR.y + 5), 0.0, 'inOutCubic');
  ctype(d3 + 8.45, 'arrow');
  way(d3 + 8.7, T.recap + 0.6, STP(2150, 1250), 0.05, 'inOutCubic');
  CVIS.push([T.recap + 0.2, T.recap + 0.55, 1, 0]);
})();

/* Title-card anchor points (stage space) filled by the overlay layout. */
var TITLE_ANCHORS = {};

function pointToStage(p, cam) {
  if (p.s === 's') return [p.x, p.y];
  if (p.s === 'title') { var a = TITLE_ANCHORS[p.id]; return a ? [a[0], a[1]] : [960, 540]; }
  return worldToStage(cam, p.x, p.y);
}
function stageToWorld(cam, x, y) { return [cam.x + (x - cam.sx) / cam.z, cam.y + (y - cam.sy) / cam.z]; }

function cursorAt(t, cam) {
  var i = 0;
  while (i < CW.length - 1 && CW[i + 1].t0 <= t) i++;
  var w = CW[i], prev = i > 0 ? CW[i - 1] : w;
  var pos;
  if (t >= w.t1 || i === 0) pos = pointToStage(w.p, cam);
  else {
    var a = pointToStage(prev.p, cam), b = pointToStage(w.p, cam);
    var u = (Ease[w.ease] || Ease.minJerk)(seg(t, w.t0, w.t1));
    pos = arcPoint(a[0], a[1], b[0], b[1], u, w.bend);
  }
  var down = 0, j;
  for (j = 0; j < PRESS.length; j++) {
    var pr = PRESS[j];
    if (t >= pr[0] - 0.03 && t <= pr[1] + 0.05) {
      down = Math.max(down, Math.min(seg(t, pr[0] - 0.03, pr[0] + 0.02), 1 - seg(t, pr[1], pr[1] + 0.05)));
    }
  }
  var type = 'arrow';
  for (j = 0; j < CTYPE.length; j++) if (CTYPE[j][0] <= t) type = CTYPE[j][1];
  var vis = 0;
  for (j = 0; j < CVIS.length; j++) {
    var v = CVIS[j];
    if (t >= v[0]) vis = t >= v[1] ? v[3] : lerp(v[2], v[3], smooth(seg(t, v[0], v[1])));
  }
  var ripples = [];
  for (j = 0; j < PRESS.length; j++) {
    var age = t - PRESS[j][0];
    if (age >= 0 && age < 0.6 && PRESS[j][1] - PRESS[j][0] < 0.2) ripples.push(age);
  }
  return { x: pos[0], y: pos[1], down: down, type: type, vis: vis, ripples: ripples };
}

/* Whether (and how far) the button is held down on a drag interval. */
function holding(t, a, b) { return t >= a && t <= b; }

/* ---------- panel + chart state ---------- */
function panelSwitches(t) {
  var d1 = T.d1;
  var sw = [
    [d1 + 1.9, 'bars'], [d1 + 5.0, 'ytitle'], [d1 + 8.35, 'legend'], [d1 + 9.27, 'errorbars'], [d1 + 10.17, 'catlabels']
  ];
  var kind = null, prev = null, mix = 1, i;
  for (i = 0; i < sw.length; i++) {
    if (t >= sw[i][0]) {
      prev = kind; kind = sw[i][1];
      mix = seg(t, sw[i][0], sw[i][0] + 0.26);
    }
  }
  if (mix >= 1) prev = null;
  return { kind: kind, prev: prev, mix: mix };
}

function haloK(t, on, off, fin, fout) {
  fin = fin || 0.18; fout = fout || 0.14;
  return seg(t, on, on + fin) * (1 - seg(t, off, off + fout));
}

var TYPED = 'Test score';
function typedValue(t) {
  var t0 = T.d1 + 6.55, s = '', i;
  if (t < t0) return null;
  var tt = t0;
  for (i = 0; i < TYPED.length; i++) {
    tt += 0.062 + 0.045 * hash01(i + 7);
    if (TYPED[i] === ' ') tt += 0.05;
    if (t >= tt) s += TYPED[i]; else break;
  }
  return s;
}
function typingDone() {
  var tt = T.d1 + 6.55;
  for (var i = 0; i < TYPED.length; i++) { tt += 0.062 + 0.045 * hash01(i + 7); if (TYPED[i] === ' ') tt += 0.05; }
  return tt;
}

function stateAt(t) {
  var S = { time: t };
  var d1 = T.d1, d2 = T.d2, d3 = T.d3;
  S.cam = camAt(t);
  S.cur = cursorAt(t, S.cam);
  S.curWorld = stageToWorld(S.cam, S.cur.x, S.cur.y);

  /* ---- app visibility + entrance ---- */
  /* the app settles in behind the Rule 1 title (under its wash), so all
   * three titles sit over the same working app */
  var appIn = Ease.emphasized(seg(t, T.r1 - 0.3, T.r1 + 0.7));
  var appOut = Ease.inOutCubic(seg(t, T.recap + 1.0, T.recap + 1.55));
  S.app = {
    visible: appIn * (1 - appOut),
    enterK: appIn, exitK: appOut,
    shadowK: 1,
    panelOpen: 0, panelKind: null, panelPrev: null, panelMix: 1, panelH: PANEL_H,
    pstate: {},
    undoOn: seg(t, d1 + 3.34, d1 + 3.5),
    addHover: 0, addActive: 0, menuOpen: 0, tileHover: {}, tilePress: {}
  };
  /* camera entrance offset: the window rises into place */
  if (appIn < 1) { S.cam = Object.assign({}, S.cam); S.cam.y -= (1 - appIn) * 140 / S.cam.z; S.cam.z *= lerp(0.94, 1, appIn); }
  if (appOut > 0) { S.cam = Object.assign({}, S.cam); S.cam.z *= lerp(1, 0.93, appOut); S.cam.y += appOut * 30 / S.cam.z; }

  /* ---- chart ---- */
  var ch = S.chart = {
    pos: { 'Control': 0, 'High dose': 1, 'Low dose': 2 },
    dragCat: null, dragX: null, dragLift: 0,
    eastColor: C.east, westColor: C.west,
    hover: null, halos: [],
    yTitle: 'score',
    legend: { dx: 0, dy: 0, lift: 0 },
    pointsT: 0,
    bracket: null,
    focusRing: 0
  };
  /* colour change */
  var cT = d1 + 3.34;
  ch.eastColor = mixOk(C.east, C.teal, Ease.outCubic(seg(t, cT + 0.03, cT + 0.42)));
  /* the recolour ripples across the series, left to right */
  ch.eastByCat = {};
  for (var ci = 0; ci < CATS.length; ci++) {
    var cc = CATS[ci], delay = ch.pos[cc] * 0.07;
    ch.eastByCat[cc] = mixOk(C.east, C.teal, Ease.outCubic(seg(t, cT + 0.03 + delay, cT + 0.4 + delay)));
  }
  /* y title */
  var tv = typedValue(t);
  if (tv !== null && tv.length) ch.yTitle = tv;
  else if (tv !== null && t > d1 + 6.55) ch.yTitle = 'score';

  /* hovers */
  var hb = seg(t, d1 + 1.55, d1 + 1.72) * (1 - seg(t, d1 + 2.4, d1 + 2.6));
  if (hb > 0) ch.hover = { cat: 'Control', grp: 'East', k: hb };

  /* halos (selection indicators) */
  ch.halos.push({ type: 'bars', grp: 'East', k: haloK(t, d1 + 1.9, d1 + 5.0) });
  ch.halos.push({ type: 'hovertext', k: seg(t, d1 + 4.6, d1 + 4.8) * (1 - seg(t, d1 + 4.95, d1 + 5.0)) });
  ch.halos.push({ type: 'ytitle', k: haloK(t, d1 + 5.0, d1 + 8.35) });
  ch.halos.push({ type: 'legend', k: haloK(t, d1 + 8.35, d1 + 9.27) });
  ch.halos.push({ type: 'errorbars', grp: 'East', k: haloK(t, d1 + 9.27, d1 + 10.17) });
  ch.halos.push({ type: 'catlabels', k: haloK(t, d1 + 10.17, d1 + 11.07) });
  ch.focusRing = haloK(t, d1 + 5.0, d1 + 8.35) * 0.9;

  /* panel */
  var ps = panelSwitches(t);
  S.app.panelKind = ps.kind; S.app.panelPrev = ps.prev; S.app.panelMix = ps.mix;
  S.app.panelOpen = Ease.outCubic(seg(t, d1 + 1.93, d1 + 2.33)) * (1 - Ease.inOutCubic(seg(t, d1 + 11.07, d1 + 11.4)));
  var hsvBlue = hexToHsv(C.east), hsvTeal = hexToHsv(C.teal), pk = Ease.inOutCubic(seg(t, cT + 0.02, cT + 0.38));
  var swHov = seg(t, d1 + 3.0, d1 + 3.18) * (1 - seg(t, d1 + 3.7, d1 + 3.9));
  var selSw = [];
  selSw[1] = 1 - seg(t, cT, cT + 0.12);
  selSw[7] = seg(t, cT, cT + 0.12);
  S.app.pstate.bars = {
    hex: pk < 0.5 ? C.east : C.teal,
    hsv: [lerp(hsvBlue[0], hsvTeal[0], pk), lerp(hsvBlue[1], hsvTeal[1], pk), lerp(hsvBlue[2], hsvTeal[2], pk)],
    swHover: { i: 7, k: swHov }, swSel: selSw
  };
  if (pk > 0 && pk < 1) S.app.pstate.bars.hex = mixOk(C.east, C.teal, pk);
  var focus = seg(t, d1 + 6.15, d1 + 6.3);
  var tvp = typedValue(t);
  var selAll = seg(t, d1 + 6.2, d1 + 6.32) * (tvp && tvp.length ? 0 : 1);
  var done = typingDone();
  var caretOn = focus > 0.5 && (t < done + 0.1 || Math.floor((t - done) / 0.53) % 2 === 1);
  S.app.pstate.ytitle = { value: tvp && tvp.length ? tvp : 'score', selAll: selAll, focus: focus, caret: caretOn && !(selAll > 0.5) };
  S.app.pstate.legend = {};
  S.app.pstate.errorbars = {};
  S.app.pstate.catlabels = {};

  /* ---- demo 2: reorder + legend ---- */
  var gA = d2 + 1.1, gB = d2 + 2.45;
  if (t >= gA - 0.02) {
    var lifted = seg(t, gA, gA + 0.14) * (1 - seg(t, gB, gB + 0.22));
    var grabOff = 522 - 545.1667;
    if (t < gB) {
      ch.dragCat = 'Low dose';
      ch.dragX = S.curWorld[0] - APP.svg.x - grabOff;
      ch.dragLift = lifted;
    } else {
      /* settle into slot 1 */
      var st = t - gB;
      var from = 522 - 189.6667 - grabOff;
      var sp = spring(st, 3.2, 0.62);
      ch.dragCat = st < 0.6 ? 'Low dose' : null;
      ch.dragX = lerp(from, slotX(1), sp);
      if (st >= 0.6) ch.dragX = null;
      ch.dragLift = lifted;
    }
    /* High dose parts to make room once the dragged pair passes the midpoint */
    /* the neighbour slides aside as the dragged pair travels over it */
    var travel = t >= gB ? 1 : clamp((545.1667 - (ch.dragX == null ? slotX(1) : ch.dragX)) / 189.6667, 0, 1);
    ch.pos['High dose'] = 1 + smoother(clamp((travel - 0.05) / 0.5, 0, 1));
    ch.pos['Low dose'] = t >= gB ? 1 : 2;
  }
  var lA = d2 + 3.6, lB = d2 + 4.85;
  if (t >= lA - 0.02) {
    var lLift = seg(t, lA, lA + 0.14) * (1 - seg(t, lB, lB + 0.2));
    var gx = 664, gy = 64;
    if (t < lB) {
      var cw = S.curWorld;
      ch.legend.dx = (cw[0] - APP.svg.x) - gx;
      ch.legend.dy = (cw[1] - APP.svg.y) - gy;
    } else {
      var st2 = spring(t - lB, 3.4, 0.6);
      ch.legend.dx = lerp(-557, -557, st2);
      ch.legend.dy = 4;
    }
    ch.legend.lift = lLift;
  }
  /* Rule-2 title card hand: nothing in the app */

  /* ---- demo 3: add menu, points, bracket ---- */
  var aHov = seg(t, d3 + 0.75, d3 + 0.95) * (1 - seg(t, d3 + 1.35, d3 + 1.55)) +
             seg(t, d3 + 3.7, d3 + 3.9) * (1 - seg(t, d3 + 4.25, d3 + 4.45));
  S.app.addHover = Math.min(1, aHov);
  var m1 = seg(t, d3 + 1.02, d3 + 1.4) * (1 - seg(t, d3 + 2.02, d3 + 2.22));
  var m2 = seg(t, d3 + 3.97, d3 + 4.3) * (1 - seg(t, d3 + 4.77, d3 + 4.97));
  S.app.menuOpen = Math.max(m1, m2);
  S.app.addActive = Math.max(seg(t, d3 + 1.0, d3 + 1.1) * (1 - seg(t, d3 + 2.02, d3 + 2.2)), seg(t, d3 + 3.95, d3 + 4.05) * (1 - seg(t, d3 + 4.77, d3 + 4.95)));
  S.app.tileHover.showDataPoints = seg(t, d3 + 1.72, d3 + 1.88) * (1 - seg(t, d3 + 2.1, d3 + 2.2));
  S.app.tilePress.showDataPoints = pulse(t, d3 + 2.0, d3 + 2.04, d3 + 2.08, d3 + 2.16);
  S.app.tileHover.bracket = seg(t, d3 + 4.5, d3 + 4.66) * (1 - seg(t, d3 + 4.85, d3 + 4.95));
  S.app.tilePress.bracket = pulse(t, d3 + 4.75, d3 + 4.79, d3 + 4.83, d3 + 4.9);
  ch.pointsT = Math.max(0, t - (d3 + 2.18));

  var bA = d3 + 4.95;
  if (t >= bA) {
    var b = ch.bracket = {
      k: Ease.outCubic(seg(t, bA, bA + 0.3)),
      x1: BR.x1, x2: BR.x2, y: BR.y, legL: 6, legR: 6,
      label0: '*', label1: '***', labelMix: 0, labelPop: 0, snapX: null, snapK: 0
    };
    /* left leg drag */
    var L0 = d3 + 5.85, L1 = d3 + 6.62;
    if (t >= L0) {
      if (t < L1) {
        var lx = S.curWorld[0] - APP.svg.x;
        if (Math.abs(lx - BR.westCtl) < 6) { lx = BR.westCtl; }
        b.x1 = lx;
      } else b.x1 = BR.westCtl;
      var near = 1 - clamp(Math.abs(b.x1 - BR.westCtl) / 30, 0, 1);
      b.snapX = BR.westCtl;
      b.snapK = (t < L1 + 0.35) ? Math.pow(near, 2) * (1 - seg(t, L1 + 0.05, L1 + 0.35)) : 0;
    }
    var R0 = d3 + 7.45, R1 = d3 + 8.3;
    if (t >= R0) {
      if (t < R1) {
        var rx = S.curWorld[0] - APP.svg.x;
        if (Math.abs(rx - BR.westHigh) < 6) rx = BR.westHigh;
        b.x2 = rx;
      } else b.x2 = BR.westHigh;
      var near2 = 1 - clamp(Math.abs(b.x2 - BR.westHigh) / 30, 0, 1);
      b.snapX = BR.westHigh;
      b.snapK = (t < R1 + 0.35) ? Math.pow(near2, 2) * (1 - seg(t, R1 + 0.05, R1 + 0.35)) : 0;
    }
    /* once both legs sit on bars, the engine computes the test */
    var lab = R1 + 0.08;
    b.labelMix = seg(t, lab, lab + 0.12);
    b.labelPop = seg(t, lab, lab + 0.45);
    ch.halos.push({ type: 'bracket', k: haloK(t, bA + 0.05, d3 + 9.3) * 0.9 });
  }
  return S;
}

/* Sound cues derived from the UI (in addition to the cursor presses). */
(function uiCues() {
  var d1 = T.d1, d3 = T.d3;
  cue(T.r2 - 0.42, 'whoosh');
  cue(T.r3 - 0.42, 'whoosh');
  cue(T.r3 + 1.45, 'burst');
  cue(d1 + 1.93, 'panelOpen');
  cue(d1 + 3.36, 'shimmer');
  for (var i = 0; i < TYPED.length; i++) {
    var tt = d1 + 6.55, k;
    for (k = 0; k <= i; k++) { tt += 0.062 + 0.045 * hash01(k + 7); if (TYPED[k] === ' ') tt += 0.05; }
    cue(tt, 'key', i);
  }
  cue(d1 + 11.07, 'panelClose');
  cue(d3 + 1.02, 'menuOpen');
  cue(d3 + 3.97, 'menuOpen');
  /* data points: a plink per observation, in landing order */
  var order = [];
  var slots = { 'Control': 0, 'Low dose': 1, 'High dose': 2 };
  for (var c = 0; c < CATS.length; c++) for (var g = 0; g < 2; g++) for (var j = 0; j < 4; j++) {
    var delay = slots[CATS[c]] * 0.16 + g * 0.07 + j * 0.045;
    order.push({ t: d3 + 2.18 + delay + 0.26, v: DATA[CATS[c]][GROUPS[g]][j] });
  }
  order.sort(function (a, b) { return a.t - b.t; });
  for (var q = 0; q < order.length; q++) cue(order[q].t, 'plink', { i: q, v: order[q].v });
  cue(d3 + 4.95, 'pop');
  cue(d3 + 6.62 - 0.02, 'snap');
  cue(d3 + 8.3 - 0.02, 'snap');
  cue(d3 + 8.38, 'chime');
})();
