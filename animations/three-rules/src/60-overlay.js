/* Stage-space layers: background, intro, rule title cards, chapter chip,
 * captions, the osprey finale and the cursor. */

var END_Y = 32;
var MARKPOS = { x0: 1150, y0: 172 + END_Y, s: 4.4 };
function markPt(vx, vy) { return [MARKPOS.x0 + (vx - MARK.vb[0]) * MARKPOS.s, MARKPOS.y0 + (vy - MARK.vb[1]) * MARKPOS.s]; }
var DOT_STAGE = [markPt(MARK.dots[0][0], MARK.dots[0][1]), markPt(MARK.dots[1][0], MARK.dots[1][1]), markPt(MARK.dots[2][0], MARK.dots[2][1])];
var RING_R = MARK.ringR * MARKPOS.s, DOT_R = MARK.dotR * MARKPOS.s;
/* The intro shows the three points (no bird yet), larger and centred on
 * the right half; the finale returns to the true mark proportions. */
var INTRO = { s: 6.0, cx: 1400, cy: 560 };
function introPt(vx, vy) { return [INTRO.cx + (vx - 49.59) * INTRO.s, INTRO.cy + (vy - 97.65) * INTRO.s]; }
var INTRO_DOTS = [introPt(MARK.dots[0][0], MARK.dots[0][1]), introPt(MARK.dots[1][0], MARK.dots[1][1]), introPt(MARK.dots[2][0], MARK.dots[2][1])];
var INTRO_RING = MARK.ringR * INTRO.s;

var HEAVY = 800;
/* Set by the player: compact = the film is shown small (phones). Then the
 * captions move out of the picture into a real text line under it. */
var RENDER_OPTS = { compact: false };
function heavy(size) { return fnt(size, HEAVY); }

/* ---------- background ---------- */
var _bgCache = null;
function drawBackground(ctx, S) {
  var g = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, C.wash);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.save();
  ctx.translate(STAGE_W * 0.86, -STAGE_H * 0.1);
  ctx.scale(1, 500 / 1100);
  var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1100);
  rg.addColorStop(0, 'rgba(232,240,250,1)');
  rg.addColorStop(0.6, 'rgba(232,240,250,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(-1300, -1300, 2600, 2600);
  ctx.restore();
  /* graph-paper texture, faint, drifting slowly with the camera */
  var z = S.cam ? Math.pow(S.cam.z, 0.12) : 1;
  var step = 64 * z, ox = ((S.time || 0) * 6) % step, oy = ((S.time || 0) * 3.5) % step;
  ctx.save();
  ctx.strokeStyle = 'rgba(55,92,160,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = -ox; x < STAGE_W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, STAGE_H); }
  for (var y = -oy; y < STAGE_H; y += step) { ctx.moveTo(0, y); ctx.lineTo(STAGE_W, y); }
  ctx.stroke();
  /* soften the texture toward the edges */
  var vg = ctx.createRadialGradient(STAGE_W / 2, STAGE_H / 2, 200, STAGE_W / 2, STAGE_H / 2, 1250);
  vg.addColorStop(0, 'rgba(255,255,255,0)');
  vg.addColorStop(1, 'rgba(244,247,251,0.85)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
}

/* ---------- badge: a mark dot carrying a rule icon ---------- */
function drawRuleIcon(ctx, which, cx, cy, r, alpha) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  var k = r / 32;
  if (which === 0) {
    /* pointer with click rays */
    ctx.save();
    ctx.translate(cx - 4 * k, cy - 11 * k);
    ctx.scale(1.3 * k, 1.3 * k);
    ctx.fill(CURSOR_ARROW);
    ctx.restore();
    ctx.lineWidth = 3 * k; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 9.5 * k, cy - 14 * k); ctx.lineTo(cx - 14.5 * k, cy - 19 * k);
    ctx.moveTo(cx - 12 * k, cy - 5.5 * k); ctx.lineTo(cx - 19 * k, cy - 5.5 * k);
    ctx.moveTo(cx - 3 * k, cy - 16.5 * k); ctx.lineTo(cx - 3 * k, cy - 23 * k);
    ctx.stroke();
  } else if (which === 1) {
    ctx.save();
    ctx.translate(cx + 0.5 * k, cy + 1.5 * k);
    ctx.scale(1.55 * k, 1.55 * k);
    ctx.translate(-12, -12);
    _handShape(ctx, 0);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.lineWidth = 5.6 * k; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14.5 * k); ctx.lineTo(cx, cy + 14.5 * k);
    ctx.moveTo(cx - 14.5 * k, cy); ctx.lineTo(cx + 14.5 * k, cy);
    ctx.stroke();
  }
  ctx.restore();
}
function drawBadge(ctx, cx, cy, ringR, which, iconA, scale, shadow) {
  drawBadgeRing(ctx, cx, cy, ringR, scale, shadow);
  drawBadgeDot(ctx, cx, cy, ringR, which, iconA, scale);
}
function drawBadgeDot(ctx, cx, cy, ringR, which, iconA, scale) {
  if (scale <= 0.001) return;
  var dr = ringR * scale * (MARK.dotR / MARK.ringR);
  ctx.beginPath(); ctx.arc(cx, cy, dr, 0, Math.PI * 2);
  ctx.fillStyle = C.dot; ctx.fill();
  drawRuleIcon(ctx, which, cx, cy, dr, iconA);
}
function drawBadgeRing(ctx, cx, cy, ringR, scale, shadow) {
  if (scale <= 0.001) return;
  var rr = ringR * scale;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(25,46,73,' + (0.18 * shadow).toFixed(3) + ')';
    ctx.shadowBlur = 22 * (ctx.__pxScale || 1) * scale;
    ctx.shadowOffsetY = 8 * (ctx.__pxScale || 1) * scale;
  }
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
}

/* ---------- kinetic type ---------- */
/* Draw a line of words that rise into place from behind a mask. */
function riseWords(ctx, words, x, y, font, ls, t0, t, stagger, dur, colors) {
  ctx.font = font;
  var cx = x, out = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i], ww = spacedW(ctx, w, font, ls);
    var p = Ease.outQuint(seg(t, t0 + i * stagger, t0 + i * stagger + dur));
    out.push({ x: cx, w: ww, p: p });
    cx += ww + textW(ctx, ' ', font) + ls;
  }
  return out;
}

/* ---------- title-card layout (computed once) ---------- */
var TL = null;
var RULES = [
  { n: 1, kicker: 'RULE 1', q: 'Want to change something?', a: ['Click', 'it.'], chip: 'Click to change' },
  { n: 2, kicker: 'RULE 2', q: 'Want to move something?', a: ['Drag', 'it.'], chip: 'Drag to move' },
  { n: 3, kicker: 'RULE 3', q: 'Want to add something?', a: ['Click'], chip: 'Click + to add' }
];
var TITLE = { x: 176, badgeY: 372, qY: 520, aY: 712, qSize: 80, aSize: 172, kSize: 30 };
var CHIP = { x: 44, y: 40, h: 66 };
function computeTitleLayout(ctx) {
  if (TL) return TL;
  TL = { rules: [] };
  for (var r = 0; r < RULES.length; r++) {
    var R = RULES[r], L = {};
    var af = heavy(TITLE.aSize), ls = -TITLE.aSize * 0.022;
    ctx.font = af;
    var x = TITLE.x - 6;
    L.a = [];
    for (var i = 0; i < R.a.length; i++) {
      var w = spacedW(ctx, R.a[i], af, ls);
      L.a.push({ x: x, w: w });
      x += w + textW(ctx, ' ', af) * 0.95;
    }
    L.aEnd = x;
    if (r === 2) {
      /* the + Add button as a word */
      var bh = 138, bw = 0;
      ctx.font = fnt(100, 700);
      bw = 112 + textW(ctx, 'Add', ctx.font) + 52;
      L.btn = { x: x + 6, y: TITLE.aY - 122, w: bw, h: bh };
    }
    ctx.font = fnt(TITLE.kSize, HEAVY);
    L.chipW = 0;
    TL.rules.push(L);
  }
  /* anchors the cursor aims at */
  var it1 = TL.rules[0].a[1];
  TITLE_ANCHORS.r1it = [it1.x + it1.w * 0.42, TITLE.aY - TITLE.aSize * 0.3];
  var it2 = TL.rules[1].a[1];
  TL.r2Disp = [300, 150, 0.2];
  TITLE_ANCHORS.r2itEnd = [it2.x + it2.w * 0.38, TITLE.aY - TITLE.aSize * 0.28];
  TITLE_ANCHORS.r2itStart = [TITLE_ANCHORS.r2itEnd[0] + TL.r2Disp[0], TITLE_ANCHORS.r2itEnd[1] + TL.r2Disp[1]];
  var b = TL.rules[2].btn;
  TITLE_ANCHORS.r3btn = [b.x + b.w * 0.56, b.y + b.h * 0.58];
  return TL;
}

/* ---------- intro ---------- */
function drawMarkLine(ctx, progress, alpha, intro) {
  if (progress <= 0 || alpha <= 0) return;
  var P = intro ? introPt : markPt, sc = intro ? INTRO.s : MARKPOS.s;
  var a = P(MARK.line[0], MARK.line[1]), b = P(MARK.line[2], MARK.line[3]);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = C.slate;
  ctx.lineWidth = 4 * sc;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(lerp(a[0], b[0], progress), lerp(a[1], b[1], progress));
  ctx.stroke();
  ctx.restore();
}
function drawBird(ctx, dx, dy, alpha, scale, rot) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  var pivot = markPt(93.23, 135.1);
  ctx.translate(dx, dy);
  if (scale != null && scale !== 1 || rot) {
    ctx.translate(pivot[0], pivot[1]);
    if (rot) ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-pivot[0], -pivot[1]);
  }
  ctx.translate(MARKPOS.x0 - MARK.vb[0] * MARKPOS.s, MARKPOS.y0 - MARK.vb[1] * MARKPOS.s);
  ctx.scale(MARKPOS.s, MARKPOS.s);
  ctx.fillStyle = BRAND_FILLS.birdBody; ctx.fill(P2('birdBody'));
  ctx.fillStyle = BRAND_FILLS.birdWing; ctx.fill(P2('birdWing'));
  ctx.fillStyle = BRAND_FILLS.birdLeg; ctx.fill(P2('birdLeg'));
  ctx.fillStyle = BRAND_FILLS.birdEye; ctx.fill(P2('birdEye'));
  ctx.restore();
}

function drawIntroLayer(ctx, S) {
  var t = S.time;
  if (t > T.r1 + 0.3) return;
  computeTitleLayout(ctx);
  var out = Ease.inOutCubic(seg(t, 4.08, 4.5));
  /* line + dots */
  var lineP = Ease.inOutCubic(seg(t, 0.35, 1.25));
  drawMarkLine(ctx, lineP, 1 - Ease.inOutCubic(seg(t, 4.0, 4.4)), true);
  var pops = [0.6, 0.9, 1.2];
  for (var i = 0; i < 3; i++) {
    var d = INTRO_DOTS[i];
    var sc = spring(t - pops[i], 2.6, 0.45);
    var icon = Ease.outBack(seg(t, 1.5 + i * 0.14, 1.9 + i * 0.14));
    if (i === 0) continue; /* dot 1 is drawn by the flying badge */
    var fade = 1 - Ease.inOutCubic(seg(t, 4.0 + i * 0.06, 4.4 + i * 0.06));
    drawBadge(ctx, d[0], d[1] + (1 - fade) * 20, INTRO_RING, i, icon, sc * fade, 0.6 * fade);
  }
  /* one word per point, so the poster frame explains itself */
  var words = ['Click', 'Drag', 'Add'];
  for (var wi = 0; wi < 3; wi++) {
    var wp = Ease.outQuart(seg(t, 1.72 + wi * 0.14, 2.25 + wi * 0.14));
    var wf = 1 - Ease.inOutCubic(seg(t, 3.98 + wi * 0.05, 4.3 + wi * 0.05));
    if (wp * wf <= 0.001) continue;
    var dd = INTRO_DOTS[wi];
    ctx.save();
    ctx.globalAlpha *= wp * wf;
    ctx.font = fnt(40, HEAVY);
    ctx.fillStyle = C.navy;
    fillSpaced(ctx, words[wi], dd[0] + INTRO_RING + 22 + (1 - wp) * 18, dd[1] + 14, -0.4);
    ctx.restore();
  }
  /* type */
  var x = TITLE.x, fade2 = 1 - out;
  ctx.save();
  ctx.globalAlpha *= fade2;
  ctx.translate(0, -out * 40);
  var kp = Ease.outQuart(seg(t, 0.5, 1.0));
  ctx.globalAlpha *= kp;
  ctx.font = fnt(28, HEAVY);
  ctx.fillStyle = C.kicker;
  fillSpaced(ctx, 'HOW PANDION WORKS', x + 4, 400 + (1 - kp) * 14, 4.2);
  ctx.globalAlpha /= Math.max(kp, 1e-4);
  var hf = heavy(126), hls = -126 * 0.022;
  var lines = [[['Three', 'rules.'], 0.8, C.navy, 540], [['Every', 'chart.'], 1.3, C.wing, 680]];
  for (var l = 0; l < lines.length; l++) {
    var L = riseWords(ctx, lines[l][0], x - 5, lines[l][3], hf, hls, lines[l][1], t, 0.1, 0.7);
    for (var w = 0; w < L.length; w++) {
      if (L[w].p <= 0) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(L[w].x - 20, lines[l][3] - 130, L[w].w + 60, 162); ctx.clip();
      ctx.fillStyle = lines[l][2];
      ctx.font = hf;
      fillSpaced(ctx, lines[l][0][w], L[w].x, lines[l][3] + (1 - L[w].p) * 150, hls);
      ctx.restore();
    }
  }
  var sp = Ease.outQuart(seg(t, 2.05, 2.6)) * (RENDER_OPTS.compact ? 0 : 1);
  ctx.globalAlpha *= sp;
  ctx.fillStyle = C.muted;
  ctx.font = fnt(38, 500);
  ctx.fillText('Learn them in under a minute.', x, 772 + (1 - sp) * 16);
  ctx.restore();
}

/* ---------- title cards ---------- */
function ruleStart(r) { return [T.r1, T.r2, T.r3][r]; }
function drawTitleCard(ctx, S, r) {
  var t = S.time, R0 = ruleStart(r), R = RULES[r], L = computeTitleLayout(ctx).rules[r];
  if (t < R0 - 1.0 || t > R0 + 3.2) return;
  var exitP = Ease.inCubic(seg(t, R0 + 2.08, R0 + 2.4));
  var kx = TITLE.x + 104;
  /* white wash over the app for rules 2 and 3 */
  {
    var wash = seg(t, R0 - 0.45, R0 - 0.05) * (1 - Ease.inOutCubic(seg(t, R0 + 2.1, R0 + 2.7)));
    if (wash > 0) {
      ctx.save();
      ctx.fillStyle = rgba('#fbfcfe', 0.9 * wash);
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.restore();
    }
  }
  /* kicker + question */
  var qa = 1 - exitP;
  ctx.save();
  ctx.globalAlpha *= qa;
  ctx.translate(0, -exitP * 30);
  var kp = Ease.outQuart(seg(t, R0 + 0.08, R0 + 0.5));
  ctx.save();
  ctx.globalAlpha *= kp;
  ctx.font = fnt(TITLE.kSize, HEAVY);
  ctx.fillStyle = C.kicker;
  fillSpaced(ctx, R.kicker, kx, TITLE.badgeY + 11 + (1 - kp) * 12, 4.6);
  ctx.restore();
  var qf = heavy(TITLE.qSize), qls = -TITLE.qSize * 0.02;
  var qw = R.q.split(' ');
  var Q = riseWords(ctx, qw, TITLE.x - 3, TITLE.qY, qf, qls, R0 + 0.16, t, 0.055, 0.6);
  for (var i = 0; i < Q.length; i++) {
    if (Q[i].p <= 0) continue;
    ctx.save();
    ctx.beginPath(); ctx.rect(Q[i].x - 12, TITLE.qY - 86, Q[i].w + 30, 110); ctx.clip();
    ctx.fillStyle = C.navy; ctx.font = qf;
    fillSpaced(ctx, qw[i], Q[i].x, TITLE.qY + (1 - Q[i].p) * 96, qls);
    ctx.restore();
  }
  ctx.restore();
  /* answer */
  var af = heavy(TITLE.aSize), als = -TITLE.aSize * 0.022;
  ctx.save();
  /* the answer shrinks toward the chip as the demo begins */
  var cx0 = TITLE.x, cy0 = TITLE.aY;
  var sh = Ease.inOutCubic(seg(t, R0 + 2.08, R0 + 2.45));
  ctx.globalAlpha *= Math.max(0, 1 - sh * 1.7);
  ctx.translate(lerp(0, CHIP.x + 70 - cx0 * 0.25, sh), lerp(0, CHIP.y + 50 - cy0 * 0.25, sh));
  ctx.scale(lerp(1, 0.25, sh), lerp(1, 0.25, sh));
  for (var j = 0; j < L.a.length; j++) {
    var p = Ease.outQuint(seg(t, R0 + 0.52 + j * 0.12, R0 + 1.25 + j * 0.12));
    var word = R.a[j];
    var isIt = word === 'it.';
    var col = C.navy;
    if (isIt) col = mixOk(C.navy, C.wing, r === 0 ? Ease.outCubic(seg(t, R0 + 1.6, R0 + 1.95)) : Ease.outCubic(seg(t, R0 + 1.84, R0 + 2.1)));
    var wx = L.a[j].x, wy = TITLE.aY;
    if (r === 1 && isIt) {
      /* displaced "it." that the hand drags home */
      var D = TL.r2Disp, pA = R0 + 1.28, pB = R0 + 1.86;
      var off = [D[0], D[1]], rot = D[2];
      if (t >= pA && t < pB) {
        var cp = [S.cur.x, S.cur.y];
        off = [cp[0] - TITLE_ANCHORS.r2itEnd[0], cp[1] - TITLE_ANCHORS.r2itEnd[1]];
        rot = D[2] * (1 - Ease.inOutCubic(seg(t, pA, pB)));
      } else if (t >= pB) {
        off = [0, 0];
        rot = 0;
      }
      var lift = t >= pA && t < pB ? 1 : 0;
      ctx.save();
      var pv = Ease.outBack(seg(t, R0 + 0.64, R0 + 1.1));
      if (pv <= 0) { ctx.restore(); continue; }
      ctx.globalAlpha *= Math.min(1, pv * 1.4);
      var ccx = wx + L.a[j].w / 2 + off[0], ccy = wy - TITLE.aSize * 0.33 + off[1];
      ctx.translate(ccx, ccy); ctx.rotate(rot); ctx.scale(pv, pv); ctx.translate(-ccx, -ccy);
      /* object outline, like a selectable chart part */
      var hk = 1 - seg(t, pB + 0.1, pB + 0.45);
      if (hk > 0.01) {
        ctx.save();
        ctx.globalAlpha *= hk;
        ctx.strokeStyle = rgba(C.selBlue, 0.75);
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -(t * 30) % 20;
        roundRect(ctx, wx + off[0] - 14, wy - TITLE.aSize * 0.78 + off[1], L.a[j].w + 28, TITLE.aSize * 0.9, 10);
        ctx.stroke();
        ctx.restore();
      }
      if (lift) {
        ctx.shadowColor = 'rgba(25,46,73,0.22)';
        ctx.shadowBlur = 30 * (ctx.__pxScale || 1);
        ctx.shadowOffsetY = 14 * (ctx.__pxScale || 1);
      }
      ctx.font = af; ctx.fillStyle = col;
      fillSpaced(ctx, word, wx + off[0], wy + off[1], als);
      ctx.restore();
      continue;
    }
    if (p <= 0) continue;
    ctx.save();
    ctx.beginPath(); ctx.rect(wx - 16, wy - 180, L.a[j].w + 40, 230); ctx.clip();
    ctx.font = af; ctx.fillStyle = col;
    var bump = 1;
    if (r === 0 && isIt) bump = 1 + 0.06 * Math.sin(Math.PI * seg(t, R0 + 1.58, R0 + 1.9));
    var ccx2 = wx + L.a[j].w / 2, ccy2 = wy - TITLE.aSize * 0.3;
    ctx.translate(ccx2, ccy2); ctx.scale(bump, bump); ctx.translate(-ccx2, -ccy2);
    fillSpaced(ctx, word, wx, wy + (1 - p) * 200, als);
    ctx.restore();
    /* rule 1: the click selects "it." */
    if (r === 0 && isIt) {
      var hk2 = seg(t, R0 + 1.58, R0 + 1.72) * (1 - seg(t, R0 + 2.05, R0 + 2.3));
      if (hk2 > 0.001) {
        ctx.save();
        ctx.globalAlpha *= hk2;
        ctx.strokeStyle = C.selBlue;
        ctx.lineWidth = 3.5;
        ctx.setLineDash([13, 8]);
        ctx.lineDashOffset = -(t * 30) % 21;
        roundRect(ctx, wx - 16, wy - TITLE.aSize * 0.78, L.a[j].w + 32, TITLE.aSize * 0.92, 8);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  if (r === 2) drawTitleAddButton(ctx, S, L, R0);
  ctx.restore();
}
function drawTitleAddButton(ctx, S, L, R0) {
  var t = S.time, b = L.btn;
  var pv = spring(t - (R0 + 0.72), 2.4, 0.5);
  if (pv <= 0.001) return;
  var hov = seg(t, R0 + 1.15, R0 + 1.3);
  var act = seg(t, R0 + 1.4, R0 + 1.47);
  var press = pulse(t, R0 + 1.38, R0 + 1.42, R0 + 1.48, R0 + 1.6);
  ctx.save();
  var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  var sc = pv * (1 - 0.04 * press);
  ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  ctx.save();
  ctx.shadowColor = 'rgba(25,46,73,0.14)';
  ctx.shadowBlur = 26 * (ctx.__pxScale || 1);
  ctx.shadowOffsetY = 10 * (ctx.__pxScale || 1);
  roundRect(ctx, b.x, b.y, b.w, b.h, 28);
  ctx.fillStyle = mixOk('#ffffff', '#e3eefb', Math.max(hov * 0.6, act));
  ctx.fill();
  ctx.restore();
  roundRect(ctx, b.x, b.y, b.w, b.h, 28);
  ctx.strokeStyle = mixOk('#cbd5e1', '#8fb4e3', Math.max(hov, act));
  ctx.lineWidth = 4;
  ctx.stroke();
  var col = mixOk('#546372', C.selBlue, Math.max(hov * 0.5, act));
  Glyph.plus(ctx, b.x + 32, b.y + 36, 66, col, 2.7);
  ctx.fillStyle = col;
  ctx.font = fnt(100, 700);
  ctx.fillText('Add', b.x + 112, b.y + 106);
  ctx.restore();
  /* the menu's tiles burst out: things you can add */
  var bt = t - (R0 + 1.45);
  if (bt > 0 && bt < 1.1) {
    var keys = ['showDataPoints', 'bracket', 'text', 'refLine', 'ovl_errorbars'];
    for (var i = 0; i < keys.length; i++) {
      var ang = -0.95 + i * 0.36, dist = 230 + 110 * (i % 2);
      var p = Ease.outCubic(clamp(bt / 0.75, 0, 1));
      var fx = b.x + b.w + 20 + Math.cos(ang) * dist * p, fy = cy + Math.sin(ang) * dist * p - 20 * p;
      var a = 1 - seg(bt, 0.55, 1.05);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(fx, fy);
      ctx.rotate((i - 2) * 0.12 * p);
      var s = lerp(0.4, 1, Ease.outBack(clamp(bt / 0.4, 0, 1)));
      ctx.scale(s, s);
      ctx.save();
      ctx.shadowColor = 'rgba(25,46,73,0.16)';
      ctx.shadowBlur = 16 * (ctx.__pxScale || 1);
      ctx.shadowOffsetY = 6 * (ctx.__pxScale || 1);
      roundRect(ctx, -54, -38, 108, 76, 14);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
      roundRect(ctx, -54, -38, 108, 76, 14);
      ctx.strokeStyle = '#d7e3f2'; ctx.lineWidth = 2; ctx.stroke();
      drawSvgIcon(ctx, keys[i], -34, -24, 68, 48, 48, 34);
      ctx.restore();
    }
  }
}

/* ---------- chapter chip + captions ---------- */
var CAPTIONS = [
  [T.d1 + 0.35, T.d1 + 3.2, 'Click any bar. Its settings open below the chart.'],
  [T.d1 + 3.2, T.d1 + 4.85, 'Pick a color. Every East bar follows.'],
  [T.d1 + 4.85, T.d1 + 7.5, 'Click a title, then type a new one.'],
  [T.d1 + 7.5, T.d1 + 11.6, 'Legends, error bars, labels: click anything.'],
  [T.d2 + 0.1, T.d2 + 2.7, 'Drag a bar past its neighbor. Every pair swaps.'],
  [T.d2 + 2.7, T.d2 + 6.2, 'Drag the legend to wherever it fits.'],
  [T.d3 + 0.1, T.d3 + 2.05, 'Everything you can add lives under + Add.'],
  [T.d3 + 2.05, T.d3 + 4.8, 'Add the data points.'],
  [T.d3 + 4.8, T.d3 + 6.7, 'Add a significance bracket,'],
  [T.d3 + 6.7, T.d3 + 8.36, 'then drag its ends onto two bars.'],
  [T.d3 + 8.36, T.d3 + 9.35, 'It runs the test for you.']
];
function chipWindow(r) {
  var R0 = ruleStart(r);
  var endT = r < 2 ? ruleStart(r + 1) - 0.35 : T.recap + 0.35;
  return [R0 + 2.3, endT];
}
var PILL_FONT_LABEL = null, PILL_FONT_CAP = null;
function drawChipAndCaption(ctx, S) {
  var t = S.time;
  if (RENDER_OPTS.compact) return;
  var labelF = fnt(29, 700), capF = fnt(29, 500);
  for (var r = 0; r < 3; r++) {
    var win = chipWindow(r);
    if (t < win[0] - 0.4 || t > win[1] + 0.5) continue;
    var inP = Ease.outCubic(seg(t, win[0], win[0] + 0.45));
    var outP = Ease.inOutCubic(seg(t, win[1], win[1] + 0.4));
    var a = inP * (1 - outP);
    if (a <= 0.001) continue;
    var labelW = textW(ctx, RULES[r].chip, labelF);
    var baseW = 70 + labelW + 30;
    /* captions that belong to this rule */
    var caps = [], wsum = 0, asum = 0;
    for (var c = 0; c < CAPTIONS.length; c++) {
      var cp = CAPTIONS[c];
      if (cp[0] < win[0] - 0.5 || cp[0] > win[1]) continue;
      var ci = Ease.outCubic(seg(t, cp[0] + 0.1, cp[0] + 0.46));
      var co = Ease.inCubic(seg(t, cp[1] - 0.04, cp[1] + 0.1));
      var ca = ci * (1 - co);
      if (ca <= 0.001) continue;
      var cw = textW(ctx, cp[2], capF);
      caps.push({ text: cp[2], a: ca, ci: ci, co: co, w: cw });
      wsum += ca * cw; asum += ca;
    }
    var capW = asum > 0 ? wsum / asum : 0;
    var capVis = Math.min(1, asum);
    var w = baseW + (capW + 52) * Ease.inOutCubic(capVis);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(0, -(1 - inP) * 14 - outP * 14);
    ctx.save();
    ctx.shadowColor = 'rgba(25,46,73,0.13)';
    ctx.shadowBlur = 28 * (ctx.__pxScale || 1);
    ctx.shadowOffsetY = 9 * (ctx.__pxScale || 1);
    roundRect(ctx, CHIP.x, CHIP.y, w, CHIP.h, CHIP.h / 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
    roundRect(ctx, CHIP.x + 0.5, CHIP.y + 0.5, w - 1, CHIP.h - 1, CHIP.h / 2);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    drawBadge(ctx, CHIP.x + 33, CHIP.y + CHIP.h / 2, 25, r, 1, 1, 0);
    ctx.fillStyle = C.navy;
    ctx.font = labelF;
    ctx.fillText(RULES[r].chip, CHIP.x + 70, CHIP.y + 43);
    if (capVis > 0.001) {
      var dx = CHIP.x + baseW + 2;
      ctx.fillStyle = rgba(C.navy, 0.16 * capVis);
      ctx.fillRect(dx, CHIP.y + 19, 2, 28);
      ctx.save();
      roundRect(ctx, CHIP.x, CHIP.y, w, CHIP.h, CHIP.h / 2);
      ctx.clip();
      for (var k = 0; k < caps.length; k++) {
        var q = caps[k];
        ctx.save();
        ctx.globalAlpha *= q.a;
        ctx.fillStyle = '#2b3f57';
        ctx.font = capF;
        ctx.fillText(q.text, dx + 24, CHIP.y + 43 + (1 - q.ci) * 14 - q.co * 8);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

/* The badge that travels: intro dot 1 -> rule 1 title -> chip. Rules 2/3
 * pop their badge at the title, then fly it to the chip. */
function drawTitleBadges(ctx, S) {
  var t = S.time, tx = TITLE.x + 44, ty = TITLE.badgeY;
  for (var r = 0; r < 3; r++) {
    var R0 = ruleStart(r);
    if (t < R0 - (r === 0 ? 4.8 : 0.4) || t > R0 + 2.75) continue;
    var x, y, rad, sc = 1, iconA = 1, sh = 0.9;
    var fly = Ease.inOutCubic(seg(t, R0 + 2.08, R0 + 2.6));
    if (r === 0 && t < R0) {
      /* intro: dot 1 pops on the line, then flies to the title position */
      var d = INTRO_DOTS[0];
      sc = spring(t - 0.6, 2.6, 0.45);
      iconA = Ease.outBack(seg(t, 1.5, 1.9));
      var f = Ease.inOutCubic(seg(t, 4.02, 4.78));
      var pt = arcPoint(d[0], d[1], tx, ty, f, -0.22);
      x = pt[0]; y = pt[1]; rad = lerp(INTRO_RING, 44, f);
      sh = lerp(0.6, 0.9, f);
    } else {
      if (r > 0) sc = spring(t - R0, 2.5, 0.48);
      x = tx; y = ty; rad = 44;
    }
    if (fly > 0) {
      var p2 = arcPoint(tx, ty, CHIP.x + 33, CHIP.y + CHIP.h / 2, fly, 0.12);
      x = p2[0]; y = p2[1]; rad = lerp(44, 25, fly);
      sh = 0.9 * (1 - fly);
      if (fly >= 1) continue;
    }
    drawBadge(ctx, x, y, rad, r, iconA, sc, sh);
  }
}

function drawOverlays(ctx, S) {
  computeTitleLayout(ctx);
  for (var k = 0; k < 3; k++) drawTitleCard(ctx, S, k);
  drawTitleBadges(ctx, S);
  drawChipAndCaption(ctx, S);
}

/* ---------- finale: the three dots take their rules, the osprey arrives ---------- */
var END_LABELS = ['Click to change.', 'Drag to move.', 'Click + to add.'];
function drawEndLayer(ctx, S) {
  var t = S.time, F = FINALE;
  var pops = F.dots;
  if (t < pops[0] - 0.1) return;
  /* the line connects the dots as they appear, like a trend being plotted */
  var U2 = 0.507;
  var lineP = t < pops[1] ? U2 * Ease.inOutCubic(seg(t, pops[0] + 0.05, pops[1])) : U2 + (1 - U2) * Ease.inOutCubic(seg(t, pops[1] + 0.02, pops[2]));
  var shadowK = 0.5 * (1 - seg(t, F.land, F.land + 0.6));
  var sc = [], i;
  for (i = 0; i < 3; i++) sc.push(spring(t - pops[i], 2.6, 0.45));
  /* white rings sit under everything, like the SVG */
  for (i = 0; i < 3; i++) drawBadgeRing(ctx, DOT_STAGE[i][0], DOT_STAGE[i][1], RING_R, sc[i], shadowK);
  drawMarkLine(ctx, lineP, 1);
  var iconFade = function (j) { return 1 - Ease.inOutCubic(seg(t, F.land + 0.3 + j * 0.06, F.land + 0.75 + j * 0.06)); };
  drawBadgeDot(ctx, DOT_STAGE[2][0], DOT_STAGE[2][1], RING_R, 2, iconFade(2), sc[2]);
  /* the osprey dives along the line and seizes the final point */
  if (t >= F.dive) {
    var ux = DOT_STAGE[2][0] - DOT_STAGE[0][0], uy = DOT_STAGE[2][1] - DOT_STAGE[0][1];
    var dl = Math.sqrt(ux * ux + uy * uy); ux /= dl; uy /= dl;
    var D = 1250;
    var bp = seg(t, F.dive, F.land);
    var dist = (1 - Ease.outQuart(bp)) * D;
    /* a small settle after the catch */
    if (t > F.land) dist = -9 * Math.sin(Math.min(1, (t - F.land) / 0.42) * Math.PI) * Math.exp(-(t - F.land) * 3);
    if (bp < 1) {
      for (var g = 5; g >= 1; g--) {
        var lagP = clamp(bp - g * 0.035, 0, 1);
        var lag = (1 - Ease.outQuart(lagP)) * D;
        if (lag - dist < 8) continue;
        drawBird(ctx, -ux * lag, -uy * lag, 0.09 * (6 - g) / 5 * (1 - bp * 0.6), 1, 0);
      }
    }
    drawBird(ctx, -ux * dist, -uy * dist, Math.min(1, seg(t, F.dive, F.dive + 0.12)), 1, 0);
    /* impact ring on the seized point */
    var ip = seg(t, F.land - 0.02, F.land + 0.7);
    if (ip > 0 && ip < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(DOT_STAGE[2][0], DOT_STAGE[2][1], RING_R * (1 + 2.6 * Ease.outCubic(ip)), 0, Math.PI * 2);
      ctx.strokeStyle = rgba(C.dot, 0.35 * (1 - ip));
      ctx.lineWidth = 6 * (1 - ip) + 1;
      ctx.stroke();
      ctx.restore();
    }
  }
  for (i = 0; i < 2; i++) drawBadgeDot(ctx, DOT_STAGE[i][0], DOT_STAGE[i][1], RING_R, i, iconFade(i), sc[i]);
  /* labels beside the dots */
  var lf = heavy(66), lls = -66 * 0.02;
  for (var k = 0; k < 3; k++) {
    var p = Ease.outQuart(seg(t, pops[k] + 0.06, pops[k] + 0.66));
    if (p <= 0) continue;
    var dd = DOT_STAGE[k];
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.font = lf;
    var tw = spacedW(ctx, END_LABELS[k], lf, lls);
    var rx = dd[0] - RING_R - 34 + (1 - p) * 40;
    ctx.fillStyle = C.navy;
    fillSpaced(ctx, END_LABELS[k], rx - tw, dd[1] + 23, lls);
    ctx.restore();
  }
  /* lockup, top left: the flow runs corner to corner with the dive */
  var lk = Ease.outQuart(seg(t, F.lockup, F.lockup + 0.65));
  if (lk > 0) {
    ctx.save();
    ctx.globalAlpha *= lk;
    ctx.translate(0, (1 - lk) * 16);
    drawWingMark(ctx, TITLE.x - 6, END_Y + 142, 78);
    ctx.fillStyle = C.navy;
    ctx.font = fnt(58, HEAVY);
    fillSpaced(ctx, 'Pandion Plots', TITLE.x + 86, END_Y + 201, -0.6);
    var tg = Ease.outQuart(seg(t, F.lockup + 0.25, F.lockup + 0.9)) * (RENDER_OPTS.compact ? 0 : 1);
    ctx.globalAlpha *= tg;
    ctx.font = fnt(31, 600);
    ctx.fillStyle = C.navy;
    var pre = 'Clear statistical figures ';
    ctx.fillText(pre, TITLE.x, END_Y + 262);
    ctx.fillStyle = C.wing;
    ctx.fillText('without the struggle.', TITLE.x + textW(ctx, pre, ctx.font), END_Y + 262);
    ctx.restore();
  }
}

/* ---------- cursor ---------- */
function cursorSize(S) {
  var t = S.time, z = S.cam.z;
  var demo = clamp(22 * z, 29, 42);
  var big = 58;
  var w = 0;
  var wins = [[T.r1 + 0.5, T.d1 + 0.7], [T.r2 + 0.3, T.d2 + 0.05], [T.r3 + 0.3, T.d3 + 0.4]];
  for (var i = 0; i < wins.length; i++) w = Math.max(w, seg(t, wins[i][0], wins[i][0] + 0.01) * (1 - smooth(seg(t, wins[i][1] - 0.6, wins[i][1]))));
  return lerp(demo, big, w);
}
function drawCursor(ctx, S) {
  var c = S.cur;
  if (c.vis <= 0.001) return;
  var s = cursorSize(S);
  ctx.save();
  ctx.globalAlpha *= c.vis;
  for (var i = 0; i < c.ripples.length; i++) {
    var age = c.ripples[i], p = age / 0.6;
    ctx.beginPath();
    ctx.arc(c.x, c.y, s * (0.25 + 1.05 * Ease.outCubic(p)), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(C.cobalt, 0.5 * (1 - p));
    ctx.lineWidth = s * 0.11 * (1 - p) + 0.5;
    ctx.stroke();
    if (p < 0.35) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, s * 0.42 * Ease.outCubic(p / 0.35), 0, Math.PI * 2);
      ctx.fillStyle = rgba(C.cobalt, 0.16 * (1 - p / 0.35));
      ctx.fill();
    }
  }
  if (c.type === 'hand') drawHandCursor(ctx, c.x, c.y, s * 1.08, c.down);
  else if (c.type === 'ibeam') drawIBeam(ctx, c.x, c.y, s * 0.95);
  else drawArrowCursor(ctx, c.x, c.y, s, c.down > 0.5);
  ctx.restore();
}

/* The words on screen at time t, for the caption line under the picture. */
function captionForTime(t) {
  if (t < T.r1) return { lead: 'How Pandion works', text: 'Three rules. Every chart.' };
  var titles = [[T.r1, 'Rule 1', 'Want to change something? Click it.'], [T.r2, 'Rule 2', 'Want to move something? Drag it.'], [T.r3, 'Rule 3', 'Want to add something? Click + Add.']];
  for (var i = 0; i < 3; i++) {
    if (t >= titles[i][0] && t < titles[i][0] + 2.4) return { lead: titles[i][1], text: titles[i][2] };
  }
  if (t >= T.recap) return { lead: 'The three rules', text: 'Click to change. Drag to move. Click + to add.' };
  var r = t < T.r2 ? 0 : t < T.r3 ? 1 : 2, text = '';
  for (var c = 0; c < CAPTIONS.length; c++) if (t >= CAPTIONS[c][0] && t < CAPTIONS[c][1]) text = CAPTIONS[c][2];
  return { lead: RULES[r].chip, text: text };
}
