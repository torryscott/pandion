/* Vector assets: brand marks, the app's own icon artwork, cursors.
 * The Add-menu and graph-type icons are copied verbatim from the chart
 * engine (graphbuilder2.js) so the replica draws exactly what the app
 * draws. */

var SVG_ICONS = {
  /* graph-type button (viewBox 0 0 56 36) */
  gtBar: '<rect x="6" y="16" width="9" height="18" fill="#85B7EB"/><rect x="18" y="8" width="9" height="26" fill="#378ADD"/><rect x="30" y="20" width="9" height="14" fill="#85B7EB"/><rect x="42" y="13" width="9" height="21" fill="#378ADD"/>',
  /* Add menu tiles (viewBox 0 0 48 34) */
  text: '<rect x="9" y="9" width="30" height="16" rx="2.5" fill="none" stroke="#378ADD" stroke-width="2"/><line x1="14" y1="15" x2="34" y2="15" stroke="#85B7EB" stroke-width="2"/><line x1="14" y1="20" x2="28" y2="20" stroke="#85B7EB" stroke-width="2"/>',
  bracket: '<path d="M12 20 V13 H36 V20" fill="none" stroke="#378ADD" stroke-width="2"/><circle cx="24" cy="7" r="1.7" fill="#378ADD"/>',
  chartNote: '<rect x="9" y="5" width="30" height="13" rx="2" fill="none" stroke="#85B7EB" stroke-width="1.6"/><line x1="9" y1="24" x2="39" y2="24" stroke="#378ADD" stroke-width="2"/><line x1="9" y1="29" x2="27" y2="29" stroke="#378ADD" stroke-width="2"/>',
  refLine: '<line x1="7" y1="17" x2="41" y2="17" stroke="#378ADD" stroke-width="2.4" stroke-dasharray="5 4"/>',
  drawShapes: '<rect x="9" y="10" width="16" height="16" fill="none" stroke="#378ADD" stroke-width="2"/><circle cx="31" cy="20" r="8" fill="none" stroke="#85B7EB" stroke-width="2"/>',
  grid: '<path d="M13 7 V29 M21 7 V29 M29 7 V29 M37 7 V29" stroke="#bcdcf7" stroke-width="1.5"/><path d="M9 12 H41 M9 19 H41 M9 26 H41" stroke="#bcdcf7" stroke-width="1.5"/>',
  barOutliers: '<rect x="17" y="16" width="14" height="11" fill="#85B7EB" stroke="#378ADD" stroke-width="1.3"/><line x1="24" y1="20" x2="24" y2="11" stroke="#378ADD" stroke-width="1.3"/><circle cx="24" cy="8" r="2.2" fill="#E24B4A"/>',
  showDataPoints: '<circle cx="12" cy="23" r="2.3" fill="#378ADD"/><circle cx="18" cy="16" r="2.3" fill="#378ADD"/><circle cx="24" cy="21" r="2.3" fill="#378ADD"/><circle cx="30" cy="14" r="2.3" fill="#378ADD"/><circle cx="36" cy="19" r="2.3" fill="#378ADD"/>',
  barValueLabels: '<rect x="18" y="15" width="12" height="13" fill="#85B7EB"/><rect x="13" y="6" width="22" height="7" rx="2" fill="none" stroke="#378ADD" stroke-width="1.6"/><line x1="17" y1="9.5" x2="31" y2="9.5" stroke="#378ADD" stroke-width="1.6"/>',
  barNLabels: '<rect x="18" y="15" width="12" height="13" fill="#85B7EB"/><circle cx="24" cy="9" r="5.5" fill="none" stroke="#378ADD" stroke-width="1.6"/>',
  ovl_errorbars: '<rect x="11" y="18" width="10" height="10" fill="#85B7EB"/><rect x="27" y="14" width="10" height="14" fill="#85B7EB"/><line x1="16" y1="18" x2="16" y2="8" stroke="#378ADD" stroke-width="1.6"/><line x1="12.5" y1="8" x2="19.5" y2="8" stroke="#378ADD" stroke-width="1.6"/><line x1="32" y1="14" x2="32" y2="5" stroke="#378ADD" stroke-width="1.6"/><line x1="28.5" y1="5" x2="35.5" y2="5" stroke="#378ADD" stroke-width="1.6"/>'
};

var _svgOps = {};
function parseSvgSnippet(src) {
  var ops = [], re = /<(rect|line|circle|path|polyline|ellipse)\b([^>]*?)\/?>/g, m;
  while ((m = re.exec(src))) {
    var a = {}, ar = /([\w-]+)="([^"]*)"/g, am;
    while ((am = ar.exec(m[2]))) a[am[1]] = am[2];
    ops.push({ tag: m[1], a: a });
  }
  return ops;
}
function drawSvgIcon(ctx, key, x, y, w, h, vbW, vbH, alpha) {
  var ops = _svgOps[key] || (_svgOps[key] = parseSvgSnippet(SVG_ICONS[key]));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / vbW, h / vbH);
  if (alpha != null) ctx.globalAlpha *= alpha;
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i], a = o.a, n = function (k, d) { return a[k] != null ? parseFloat(a[k]) : (d || 0); };
    var fill = a.fill, stroke = a.stroke;
    ctx.beginPath();
    if (o.tag === 'rect') {
      if (a.rx) roundRect(ctx, n('x'), n('y'), n('width'), n('height'), n('rx'));
      else ctx.rect(n('x'), n('y'), n('width'), n('height'));
    } else if (o.tag === 'line') {
      ctx.moveTo(n('x1'), n('y1')); ctx.lineTo(n('x2'), n('y2'));
      if (!fill) fill = 'none';
    } else if (o.tag === 'circle') {
      ctx.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
    } else if (o.tag === 'ellipse') {
      ctx.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
    } else if (o.tag === 'polyline') {
      var p = a.points.trim().split(/[\s,]+/).map(parseFloat);
      ctx.moveTo(p[0], p[1]);
      for (var j = 2; j < p.length; j += 2) ctx.lineTo(p[j], p[j + 1]);
    }
    var path = o.tag === 'path' ? (o.p2 || (o.p2 = new Path2D(a.d))) : null;
    if (fill && fill !== 'none') { ctx.fillStyle = fill; if (path) ctx.fill(path); else ctx.fill(); }
    if (stroke && stroke !== 'none') {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = n('stroke-width', 1);
      ctx.setLineDash(a['stroke-dasharray'] ? a['stroke-dasharray'].split(/[\s,]+/).map(parseFloat) : []);
      ctx.lineCap = a['stroke-linecap'] || 'butt';
      ctx.lineJoin = a['stroke-linejoin'] || 'miter';
      if (path) ctx.stroke(path); else ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/* ---------- brand ---------- */
var _p2 = {};
function P2(key) { return _p2[key] || (_p2[key] = new Path2D(BRAND[key])); }

/* Dots and line of the diving mark, in its own viewBox units. */
var MARK = {
  vb: [-8, -8, 136.04, 159.83],
  line: [8, 61.97, 86.07, 128.65],
  dots: [[8, 61.97], [47.53, 95.87], [93.23, 135.1]],
  ringR: 8, dotR: 7.03
};

/* Wing mark, drawn into a box. viewBox 13 9 131 131. */
function drawWingMark(ctx, x, y, size, upper, under) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 131, size / 131);
  ctx.translate(-13, -9);
  ctx.fillStyle = upper || '#152d5e'; ctx.fill(P2('wingUpper'));
  ctx.fillStyle = under || '#1a53cf'; ctx.fill(P2('wingUnder'));
  ctx.restore();
}

/* ---------- cursors (drawn in screen space; size = height in px) ---------- */
var CURSOR_ARROW = new Path2D('M0 0 L0 17.2 L4.75 13.35 L7.7 19.95 L10.25 18.85 L7.35 12.4 L12.6 12.25 Z');
function drawArrowCursor(ctx, x, y, s, press) {
  var k = s / 20 * (press ? 0.9 : 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.shadowColor = 'rgba(15,29,49,0.35)';
  ctx.shadowBlur = 5 * k * (ctx.__pxScale || 1);
  ctx.shadowOffsetY = 1.6 * k * (ctx.__pxScale || 1);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.6;
  ctx.stroke(CURSOR_ARROW);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#111418';
  ctx.fill(CURSOR_ARROW);
  ctx.restore();
}

/* A friendly hand, built from capsules so it reads at small sizes.
 * grip 0 = open (fingers up), 1 = closed (fingers curled). */
function _capsule(ctx, x1, y1, x2, y2, r) {
  var dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  var a = Math.atan2(dy, dx);
  ctx.moveTo(x1 + Math.cos(a + Math.PI / 2) * r, y1 + Math.sin(a + Math.PI / 2) * r);
  ctx.arc(x1, y1, r, a + Math.PI / 2, a + Math.PI * 1.5);
  ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}
function _handShape(ctx, grip) {
  var g = grip;
  var fingers = [
    /* x, top (open), top (closed), bottom */
    [8.2, 2.6, 8.4, 12.5],
    [11.6, 1.2, 7.6, 12.5],
    [15.0, 2.0, 8.0, 12.5],
    [18.2, 4.8, 9.4, 13.2]
  ];
  ctx.beginPath();
  for (var i = 0; i < fingers.length; i++) {
    var f = fingers[i];
    _capsule(ctx, f[0], lerp(f[1], f[2], g), f[0], f[3], 1.65);
  }
  /* thumb */
  var tx1 = lerp(3.2, 5.6, g), ty1 = lerp(9.6, 12.6, g);
  _capsule(ctx, tx1, ty1, 7.4, 16.2, 1.75);
  /* palm */
  roundRectPath(ctx, 5.9, 10.2, 14.1, 11.6, 4.2);
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawHandCursor(ctx, x, y, s, grip) {
  var k = s / 22;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-11.5, -11);
  ctx.shadowColor = 'rgba(15,29,49,0.35)';
  ctx.shadowBlur = 5 * k * (ctx.__pxScale || 1);
  ctx.shadowOffsetY = 1.6 * k * (ctx.__pxScale || 1);
  ctx.lineJoin = 'round';
  _handShape(ctx, grip);
  ctx.strokeStyle = '#111418';
  ctx.lineWidth = 2.3;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  _handShape(ctx, grip);
  ctx.fillStyle = '#ffffff';
  ctx.fill('nonzero');
  /* finger creases */
  ctx.strokeStyle = 'rgba(17,20,24,0.55)';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  var ys = lerp(11.2, 11.6, grip);
  ctx.moveTo(9.9, ys); ctx.lineTo(9.9, ys + 2.6);
  ctx.moveTo(13.3, ys); ctx.lineTo(13.3, ys + 2.6);
  ctx.moveTo(16.6, ys + 0.2); ctx.lineTo(16.6, ys + 2.6);
  ctx.stroke();
  ctx.restore();
}
function drawIBeam(ctx, x, y, s) {
  var k = s / 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineCap = 'round';
  var p = new Path2D('M-3.2 -9 Q0 -9 0 -6.4 Q0 -9 3.2 -9 M0 -6.4 L0 6.4 M-3.2 9 Q0 9 0 6.4 Q0 9 3.2 9 M-2.2 0 L2.2 0');
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.4; ctx.stroke(p);
  ctx.strokeStyle = '#111418'; ctx.lineWidth = 1.4; ctx.stroke(p);
  ctx.restore();
}

/* ---------- small UI glyphs (drawn in a local box, stroke style set by caller) ---------- */
var Glyph = {
  undo: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(5.5, 3.5); ctx.lineTo(2.5, 6.5); ctx.lineTo(5.5, 9.5);
    ctx.moveTo(2.8, 6.5); ctx.lineTo(9.5, 6.5); ctx.bezierCurveTo(12.3, 6.5, 13.8, 8.2, 13.8, 10.2);
    ctx.bezierCurveTo(13.8, 12.2, 12.3, 13.6, 9.8, 13.6); ctx.lineTo(7.5, 13.6); ctx.stroke(); ctx.restore();
  },
  redo: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x + s, y); ctx.scale(-s / 16, s / 16); Glyph.undo(ctx, 0, 0, 16, col); ctx.restore();
  },
  eye: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(1.5, 8); ctx.quadraticCurveTo(8, 1.6, 14.5, 8); ctx.quadraticCurveTo(8, 14.4, 1.5, 8); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(8, 8, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  },
  gear: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.scale(s / 16, s / 16);
    ctx.fillStyle = col; ctx.beginPath();
    for (var i = 0; i < 16; i++) {
      var a = i / 16 * Math.PI * 2, r = (i % 2 === 0) ? 7.2 : 5.6;
      var a2 = a + Math.PI / 16;
      if (i === 0) ctx.moveTo(Math.cos(a - Math.PI / 16) * r, Math.sin(a - Math.PI / 16) * r);
      ctx.lineTo(Math.cos(a - Math.PI / 16) * r, Math.sin(a - Math.PI / 16) * r);
      ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  search: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(6.6, 6.6, 4.6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(14, 14); ctx.stroke(); ctx.restore();
  },
  plus: function (ctx, x, y, s, col, w) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = w || 2.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, 2.5); ctx.lineTo(8, 13.5); ctx.moveTo(2.5, 8); ctx.lineTo(13.5, 8); ctx.stroke(); ctx.restore();
  },
  x: function (ctx, x, y, s, col, w) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = w || 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(12, 12); ctx.moveTo(12, 4); ctx.lineTo(4, 12); ctx.stroke(); ctx.restore();
  },
  folder: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(1.5, 3.5); ctx.lineTo(6, 3.5); ctx.lineTo(7.5, 5); ctx.lineTo(14.5, 5); ctx.lineTo(14.5, 13); ctx.lineTo(1.5, 13); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.5, 7); ctx.lineTo(14.5, 7); ctx.stroke(); ctx.restore();
  },
  disk: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(2.5, 2.5); ctx.lineTo(11.5, 2.5); ctx.lineTo(13.5, 4.5); ctx.lineTo(13.5, 13.5); ctx.lineTo(2.5, 13.5); ctx.closePath(); ctx.stroke();
    ctx.strokeRect(5, 2.5, 5.5, 3.6); ctx.strokeRect(4.5, 8.6, 7, 4.9); ctx.restore();
  },
  gridIcon: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    ctx.strokeRect(1.5, 2.5, 13, 11);
    ctx.beginPath(); ctx.moveTo(1.5, 6.2); ctx.lineTo(14.5, 6.2); ctx.moveTo(1.5, 9.9); ctx.lineTo(14.5, 9.9);
    ctx.moveTo(5.8, 2.5); ctx.lineTo(5.8, 13.5); ctx.moveTo(10.2, 2.5); ctx.lineTo(10.2, 13.5); ctx.stroke(); ctx.restore();
  },
  barsIcon: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, 2.5); ctx.lineTo(2, 13.5); ctx.lineTo(14, 13.5); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(4.5, 8, 2, 4); ctx.fillRect(8, 5.5, 2, 6.5); ctx.fillRect(11.5, 9, 2, 3); ctx.restore();
  },
  notebook: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
    roundRect(ctx, 3.5, 1.8, 10, 12.4, 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 4.5); ctx.lineTo(5, 4.5); ctx.moveTo(2, 8); ctx.lineTo(5, 8); ctx.moveTo(2, 11.5); ctx.lineTo(5, 11.5); ctx.stroke(); ctx.restore();
  },
  layouts: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.3;
    roundRect(ctx, 1.8, 2.3, 12.4, 11.4, 1.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, 2.3); ctx.lineTo(7, 13.7); ctx.moveTo(7, 8); ctx.lineTo(14.2, 8); ctx.stroke(); ctx.restore();
  },
  caret: function (ctx, x, y, s, col) { /* small down triangle */
    ctx.save(); ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.lineTo(x + s / 2, y + s * 0.62); ctx.closePath(); ctx.fill(); ctx.restore();
  },
  chevronDown: function (ctx, x, y, s, col, w) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w || 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s / 2, y + s / 2); ctx.lineTo(x + s, y); ctx.stroke(); ctx.restore();
  },
  nominal: function (ctx, x, y, s) { /* the three-dot nominal badge */
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    var dots = [[5.6, 5.6, '#e0795b'], [10.4, 5.6, '#e9b949'], [8, 10, '#5aa7b8']];
    for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(dots[i][0], dots[i][1], 3.4, 0, Math.PI * 2); ctx.fillStyle = dots[i][2]; ctx.globalAlpha = 0.92; ctx.fill(); }
    ctx.restore();
  },
  ruler: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
    ctx.strokeStyle = col; ctx.lineWidth = 1.1;
    ctx.strokeRect(1, 5, 14, 6);
    ctx.beginPath(); for (var i = 3; i <= 13; i += 2) { ctx.moveTo(i, 5); ctx.lineTo(i, i % 4 === 1 ? 8.6 : 7.4); } ctx.stroke(); ctx.restore();
  },
  borderSq: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3); ctx.restore();
  },
  ibar: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(x + s / 2, y + 1.5); ctx.lineTo(x + s / 2, y + s - 1.5);
    ctx.moveTo(x + s / 2 - 3, y + 1.5); ctx.lineTo(x + s / 2 + 3, y + 1.5);
    ctx.moveTo(x + s / 2 - 3, y + s - 1.5); ctx.lineTo(x + s / 2 + 3, y + s - 1.5); ctx.stroke(); ctx.restore();
  },
  gapArrows: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    var m = y + s / 2;
    ctx.moveTo(x + 1.5, m); ctx.lineTo(x + s - 1.5, m);
    ctx.moveTo(x + 4.5, m - 3); ctx.lineTo(x + 1.5, m); ctx.lineTo(x + 4.5, m + 3);
    ctx.moveTo(x + s - 4.5, m - 3); ctx.lineTo(x + s - 1.5, m); ctx.lineTo(x + s - 4.5, m + 3); ctx.stroke(); ctx.restore();
  },
  lines3: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(x + 2, y + 4); ctx.lineTo(x + s - 2, y + 4);
    ctx.moveTo(x + 2, y + s / 2); ctx.lineTo(x + s - 2, y + s / 2);
    ctx.moveTo(x + 2, y + s - 4); ctx.lineTo(x + s - 5, y + s - 4); ctx.stroke(); ctx.restore();
  },
  summary: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath();
    var m = y + s / 2;
    ctx.moveTo(x + 2, m - 3.5); ctx.lineTo(x + 2, m + 3.5); ctx.moveTo(x + s - 2, m - 3.5); ctx.lineTo(x + s - 2, m + 3.5);
    ctx.moveTo(x + 2, m); ctx.lineTo(x + s - 2, m); ctx.stroke(); ctx.restore();
  },
  rotate: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    var cx = x + s / 2, cy = y + s / 2 + 0.5, r = s * 0.34;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI * 0.35, Math.PI * 1.45); ctx.stroke();
    var ax = cx + Math.cos(-Math.PI * 0.35) * r, ay = cy + Math.sin(-Math.PI * 0.35) * r;
    ctx.beginPath(); ctx.moveTo(ax + 2.6, ay - 2.2); ctx.lineTo(ax - 0.4, ay - 2.8); ctx.lineTo(ax + 0.9, ay + 0.6); ctx.closePath(); ctx.fill(); ctx.restore();
  },
  pattern: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.1;
    ctx.strokeRect(x + 1.5, y + 2.5, s - 3, s - 5);
    ctx.beginPath(); ctx.rect(x + 1.5, y + 2.5, s - 3, s - 5); ctx.clip();
    ctx.beginPath(); for (var i = -s; i < s * 2; i += 3.6) { ctx.moveTo(x + i, y + s); ctx.lineTo(x + i + s * 0.55, y); } ctx.stroke(); ctx.restore();
  },
  opacity: function (ctx, x, y, s) {
    ctx.save(); var g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, '#3a3a3a'); ctx.fillStyle = g;
    ctx.fillRect(x + 1.5, y + 2.5, s - 3, s - 5); ctx.strokeStyle = '#444'; ctx.lineWidth = 0.9; ctx.strokeRect(x + 1.5, y + 2.5, s - 3, s - 5); ctx.restore();
  },
  corner: function (ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(x + 2, y + s - 1.5); ctx.lineTo(x + 2, y + 7); ctx.arcTo(x + 2, y + 2, x + 7, y + 2, 5);
    ctx.lineTo(x + s - 7, y + 2); ctx.arcTo(x + s - 2, y + 2, x + s - 2, y + 7, 5); ctx.lineTo(x + s - 2, y + s - 1.5); ctx.stroke(); ctx.restore();
  },
  dropper: function (ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16); ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(3, 13); ctx.lineTo(4, 10); ctx.lineTo(10.5, 3.5); ctx.lineTo(12.5, 5.5); ctx.lineTo(6, 12); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9.5, 2.5); ctx.lineTo(13.5, 6.5); ctx.stroke(); ctx.restore();
  }
};
