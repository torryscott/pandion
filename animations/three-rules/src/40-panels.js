/* Inspector panels + the Add menu, replicated from the live app. Panel
 * coordinates are relative to the panel's top-left corner. */

var PANEL_H = 277;
var QUICK_SWATCHES = ['transparent', '#2d5c94', '#902634', '#e18e4c', '#597b2f', '#faca59', '#32295e',
  '#5bb1ba', '#d35a80', '#000000', '#555555', '#aaaaaa', '#ffffff'];
function swatchX(i) { return 63.5 + i * 25.2; }

function pText(ctx, s, x, y, size, weight, color, align, ls, family) {
  ctx.font = fnt(size, weight, family);
  ctx.fillStyle = color;
  fillSpaced(ctx, s, x, y, ls || 0, align || 'left');
}
function checker(ctx, x, y, w, h, cell) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d6d6d6';
  for (var yy = 0; yy < h; yy += cell) for (var xx = 0; xx < w; xx += cell)
    if (((xx / cell) + (yy / cell)) % 2 === 0) ctx.fillRect(x + xx, y + yy, cell, cell);
  ctx.restore();
}
function hexToHsv(hex) {
  var c = hexToRgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}
function hsvToHex(h, s, v) {
  var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r, g, b;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/* ---------- shared panel pieces ---------- */
function panelHead(ctx, kicker, title, applies) {
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, APP.panel.w, 47);
  ctx.fillStyle = '#e6e9ed';
  ctx.fillRect(0, 47, APP.panel.w, 1);
  pText(ctx, kicker, 12, 21.5, 9, 700, '#626d7b', 'left', 1.08);
  pText(ctx, title, 12, 38, 12.5, 600, '#22364d');
  if (applies) {
    pText(ctx, 'APPLIES TO', applies.x - 8, 29, 9.5, 700, '#626d7b', 'right', 1.0);
    var x = applies.x;
    for (var i = 0; i < applies.items.length; i++) {
      var it = applies.items[i], w = it.w, on = i === applies.active;
      roundRect(ctx, x, 13, w, 22, i === 0 ? [3, 0, 0, 3] : [0, 3, 3, 0]);
      ctx.fillStyle = on ? '#1a5fb4' : '#ffffff'; ctx.fill();
      ctx.strokeStyle = on ? '#1a5fb4' : '#aab3bd'; ctx.lineWidth = 1; ctx.stroke();
      pText(ctx, it.label, x + w / 2, 28.5, 11, on ? 700 : 500, on ? '#ffffff' : '#333333', 'center');
      x += w;
    }
  }
  Glyph.eye(ctx, APP.panel.w - 36, 16, 15, '#1a5fb4');
}
function tabsRow(ctx, tabs, active, y0) {
  y0 = y0 || 48;
  ctx.fillStyle = '#dddddd';
  ctx.fillRect(0, y0 + 26, APP.panel.w, 1);
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i], on = i === active;
    if (on) {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, t.x, y0 + 0.5, t.w, 27, [4, 4, 0, 0]);
      ctx.fill();
      ctx.strokeStyle = '#dddddd'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.x, y0 + 27); ctx.lineTo(t.x, y0 + 4.5); ctx.arcTo(t.x, y0 + 0.5, t.x + 4, y0 + 0.5, 4);
      ctx.lineTo(t.x + t.w - 4, y0 + 0.5); ctx.arcTo(t.x + t.w, y0 + 0.5, t.x + t.w, y0 + 4.5, 4); ctx.lineTo(t.x + t.w, y0 + 27);
      ctx.stroke();
    }
    var col = on ? '#1a5fb4' : '#4a4f55';
    t.icon(ctx, t.x + 9, y0 + 6.5, 14, col);
    pText(ctx, t.label, t.x + 28, y0 + 18, 11, on ? 600 : 500, col);
    if (i < tabs.length - 1 && !on && !(tabs[i + 1] && i + 1 === active)) {
      ctx.fillStyle = '#dadde2';
      ctx.fillRect(t.x + t.w + 3, y0 + 7, 1, 14);
    }
  }
}
function chipBtn(ctx, x, y, w, h, label, icon, active, hover) {
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4);
  ctx.fillStyle = active ? '#e8f0fb' : (hover ? '#f4f8fd' : '#ffffff'); ctx.fill();
  ctx.strokeStyle = active ? '#1a5fb4' : '#aaaaaa'; ctx.lineWidth = 1; ctx.stroke();
  var col = active ? '#1a5fb4' : '#333333';
  icon(ctx, x + w / 2 - 8, y + 7, 16, col);
  pText(ctx, label, x + w / 2, y + 36, 11, 400, col, 'center', 0, CHART_FONT);
}
function slider(ctx, x, y, w, frac) {
  roundRect(ctx, x, y - 3, w, 6, 3);
  ctx.fillStyle = '#e1e4e8'; ctx.fill();
  roundRect(ctx, x, y - 3, w * frac, 6, 3);
  ctx.fillStyle = '#1a73e8'; ctx.fill();
  ctx.beginPath(); ctx.arc(x + w * frac, y, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = '#1a73e8'; ctx.fill();
}
function numBox(ctx, x, y, w, s) {
  roundRect(ctx, x + 0.5, y + 0.5, w, 21, 3);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = '#aab3bd'; ctx.lineWidth = 1; ctx.stroke();
  pText(ctx, s, x + 7, y + 15.5, 12, 400, '#111111');
}
function rowCard(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 3 * (ctx.__pxScale || 1);
  ctx.shadowOffsetY = 1 * (ctx.__pxScale || 1);
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
}

/* HSV picker on the right side of style panels. */
function drawPicker(ctx, x, y, P) {
  var hsv = P.hsv, sqW = 193, sqH = 105;
  /* HSV | Swatches */
  roundRect(ctx, x + 0.5, y + 0.5, 34, 17, [3, 0, 0, 3]);
  ctx.fillStyle = '#e8ecf1'; ctx.fill(); ctx.strokeStyle = '#aab3bd'; ctx.lineWidth = 1; ctx.stroke();
  roundRect(ctx, x + 34.5, y + 0.5, 56, 17, [0, 3, 3, 0]);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
  pText(ctx, 'HSV', x + 17.5, y + 13, 10.5, 500, '#222222', 'center');
  pText(ctx, 'Swatches', x + 62.5, y + 13, 10.5, 500, '#222222', 'center');
  var sy = y + 23;
  var hueHex = hsvToHex(hsv[0], 1, 1);
  ctx.save();
  roundRect(ctx, x, sy, sqW, sqH, 3);
  ctx.clip();
  ctx.fillStyle = hueHex; ctx.fillRect(x, sy, sqW, sqH);
  var g1 = ctx.createLinearGradient(x, 0, x + sqW, 0);
  g1.addColorStop(0, 'rgba(255,255,255,1)'); g1.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g1; ctx.fillRect(x, sy, sqW, sqH);
  var g2 = ctx.createLinearGradient(0, sy, 0, sy + sqH);
  g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g2; ctx.fillRect(x, sy, sqW, sqH);
  ctx.restore();
  var hx = x + hsv[1] * sqW, hy = sy + (1 - hsv[2]) * sqH;
  ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(hx, hy, 7.3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  /* hue slider */
  var hy2 = sy + sqH + 7;
  var gh = ctx.createLinearGradient(x, 0, x + sqW, 0);
  var stops = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'];
  for (var i = 0; i < stops.length; i++) gh.addColorStop(i / 6, stops[i]);
  roundRect(ctx, x, hy2, sqW, 10, 2); ctx.fillStyle = gh; ctx.fill();
  var hxk = x + hsv[0] / 360 * sqW;
  roundRect(ctx, hxk - 2.5, hy2 - 2, 5, 14, 1.5);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#6b7580'; ctx.lineWidth = 1; ctx.stroke();
  /* value slider */
  var vy = hy2 + 17;
  var gv = ctx.createLinearGradient(x, 0, x + sqW, 0);
  gv.addColorStop(0, '#000000'); gv.addColorStop(0.55, hsvToHex(hsv[0], Math.max(0.35, hsv[1]), 0.9)); gv.addColorStop(1, '#ffffff');
  roundRect(ctx, x, vy, sqW, 10, 2); ctx.fillStyle = gv; ctx.fill();
  var vk = x + (0.12 + hsv[2] * 0.6) * sqW;
  roundRect(ctx, vk - 2.5, vy - 2, 5, 14, 1.5);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#6b7580'; ctx.stroke();
  /* current + hex + dropper */
  var by = vy + 18;
  roundRect(ctx, x + 0.5, by + 0.5, 20, 20, 2);
  ctx.fillStyle = P.hex; ctx.fill(); ctx.strokeStyle = '#8a8f95'; ctx.stroke();
  roundRect(ctx, x + 26.5, by + 0.5, 138, 20, 3);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#aab3bd'; ctx.stroke();
  pText(ctx, P.hex, x + 33, by + 14.5, 11, 400, '#111111', 'left', 0.4, 'Menlo, Consolas, monospace');
  roundRect(ctx, x + 170.5, by + 0.5, 22, 20, 3);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#aab3bd'; ctx.stroke();
  Glyph.dropper(ctx, x + 174.5, by + 3, 14, '#333333');
}

/* ---------- panel kinds ---------- */
var BAR_TABS = [
  { label: 'Bars', x: 5, w: 70, icon: function (ctx, x, y, s, c) { ctx.fillStyle = c; ctx.fillRect(x + 1, y + 6, 3, 7); ctx.fillRect(x + 5.5, y + 2, 3, 11); ctx.fillStyle = mixOk(c, '#ffffff', 0.45); ctx.fillRect(x + 10, y + 5, 3, 8); } },
  { label: 'Border', x: 80, w: 76, icon: Glyph.borderSq },
  { label: 'Error bars', x: 164, w: 90, icon: Glyph.ibar },
  { label: 'Gap', x: 262, w: 60, icon: Glyph.gapArrows },
  { label: 'Order', x: 330, w: 68, icon: Glyph.lines3 }
];
function panelBars(ctx, S, P) {
  panelHead(ctx, 'BAR CHART', 'Bars - East', { x: 562, active: 0, items: [{ label: 'East', w: 50 }, { label: 'All bars', w: 60 }] });
  tabsRow(ctx, BAR_TABS, 0);
  var cy = 83;
  chipBtn(ctx, 12, cy, 64, 44, 'Summary', Glyph.summary, false);
  ctx.fillStyle = '#d7d7d7'; ctx.fillRect(84.5, cy + 6, 1, 32);
  chipBtn(ctx, 94, cy, 61, 44, 'Direction', Glyph.rotate, false);
  chipBtn(ctx, 161, cy, 60, 44, 'Color', function (c, x, y, s, col) {
    roundRect(c, x - 3, y + 1, 22, 14, 3); c.fillStyle = P.hex; c.fill(); c.strokeStyle = rgba('#1a5fb4', 0.7); c.lineWidth = 1; c.stroke();
  }, true);
  chipBtn(ctx, 227, cy, 60, 44, 'Pattern', Glyph.pattern, false);
  chipBtn(ctx, 293, cy, 60, 44, 'Opacity', function (c, x, y, s) { Glyph.opacity(c, x, y, s); }, false);
  chipBtn(ctx, 359, cy, 60, 44, 'Corner', Glyph.corner, false);
  /* palette box */
  roundRect(ctx, 12.5, 137.5, 486, 124, 4);
  ctx.fillStyle = '#fafafa'; ctx.fill(); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1; ctx.stroke();
  /* current colour chip */
  roundRect(ctx, 27.5, 150.5, 28, 28, 4);
  ctx.fillStyle = P.hex; ctx.fill(); ctx.strokeStyle = '#888888'; ctx.stroke();
  roundRect(ctx, 24.5, 147.5, 34, 34, 6);
  ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 2; ctx.stroke();
  for (var i = 0; i < QUICK_SWATCHES.length; i++) {
    var sx = swatchX(i), sw = QUICK_SWATCHES[i];
    var hv = P.swHover && P.swHover.i === i ? P.swHover.k : 0;
    var lift = hv * 1.6;
    if (sw === 'transparent') checker(ctx, sx, 153 - lift, 22, 22, 5.5);
    else { ctx.fillStyle = sw; ctx.fillRect(sx, 153 - lift, 22, 22); }
    ctx.strokeStyle = sw === '#ffffff' || sw === 'transparent' ? '#c8c8c8' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, 153.5 - lift, 21, 21);
    var sel = P.swSel && P.swSel[i] ? P.swSel[i] : 0;
    if (sel > 0.001) {
      ctx.save(); ctx.globalAlpha *= sel;
      ctx.strokeStyle = '#1a3f73'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, 154 - lift, 20, 20);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(sx + 2.5, 155.5 - lift, 17, 17);
      ctx.restore();
    }
    if (hv > 0.001) {
      ctx.save(); ctx.globalAlpha *= hv;
      ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 1.5; ctx.strokeRect(sx - 1.5, 151.5 - lift, 25, 25);
      ctx.restore();
    }
  }
  roundRect(ctx, 27.5, 192.5, 74, 21, 3);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#aaaaaa'; ctx.stroke();
  pText(ctx, 'Use palette', 64.5, 207, 11, 400, '#1a5fb4', 'center');
  /* picker */
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(507, 75, 1, PANEL_H - 75);
  drawPicker(ctx, 518, 81, P);
}

function panelText(ctx, S, P) {
  panelHead(ctx, 'BAR CHART', 'Left axis title', { x: 562, active: 0, items: [{ label: 'This text', w: 58 }, { label: 'All text', w: 50 }] });
  /* text field */
  var f = P.focus;
  roundRect(ctx, 12.5, 58.5, 486, 28, 3);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = mixOk('#aab3bd', '#4a90e2', f); ctx.lineWidth = 1 + f; ctx.stroke();
  if (f > 0.001) {
    roundRect(ctx, 10, 56, 491, 33, 5);
    ctx.strokeStyle = rgba('#4a90e2', 0.25 * f); ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.font = fnt(13, 400);
  var tw = textW(ctx, P.value, ctx.font);
  if (P.selAll > 0.001 && P.value) {
    ctx.fillStyle = rgba('#b3d4fc', P.selAll);
    ctx.fillRect(20, 63, tw + 1, 19);
  }
  pText(ctx, P.value, 20.5, 77.5, 13, 400, '#111111');
  if (P.caret) { ctx.fillStyle = '#111111'; ctx.fillRect(21 + tw, 64, 1.2, 17); }
  pText(ctx, 'Shift+Enter for a new line', 12, 104, 11, 400, '#666666');
  /* size row */
  rowCard(ctx, 12, 116, 486, 34);
  ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(29, 133, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(36.5, 133, 3.8, 0, Math.PI * 2); ctx.fill();
  pText(ctx, 'Size', 128, 137.5, 12, 400, '#444444', 'right');
  slider(ctx, 142, 133, 132, 0.42);
  numBox(ctx, 283, 122, 48, '12.9');
  pText(ctx, 'pt', 339, 137.5, 12, 400, '#666666');
  roundRect(ctx, 360.5, 122.5, 22, 21, [3, 0, 0, 3]); ctx.fillStyle = '#1a5fb4'; ctx.fill();
  pText(ctx, 'B', 371.5, 138, 12.5, 700, '#ffffff', 'center');
  roundRect(ctx, 382.5, 122.5, 22, 21, [0, 3, 3, 0]); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#aab3bd'; ctx.stroke();
  ctx.font = 'italic ' + fnt(12.5, 500); ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.fillText('I', 393.5, 138); ctx.textAlign = 'left';
  /* color row */
  rowCard(ctx, 12, 156, 486, 34);
  ctx.beginPath(); ctx.arc(32, 173, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#1a5fb4'; ctx.fill();
  pText(ctx, 'Color', 128, 177.5, 12, 400, '#444444', 'right');
  roundRect(ctx, 138.5, 161.5, 24, 24, 3); ctx.fillStyle = '#000000'; ctx.fill();
  ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 2; roundRect(ctx, 136, 159, 29, 29, 5); ctx.stroke();
  for (var i = 1; i < QUICK_SWATCHES.length; i++) {
    var sx = 146 + i * 22;
    ctx.fillStyle = QUICK_SWATCHES[i]; ctx.fillRect(sx, 163, 18, 20);
    ctx.strokeStyle = QUICK_SWATCHES[i] === '#ffffff' ? '#c8c8c8' : 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, 163.5, 17, 19);
  }
  /* rotate row */
  rowCard(ctx, 12, 196, 486, 34);
  Glyph.rotate(ctx, 24, 205, 16, '#555555');
  pText(ctx, 'Rotate', 128, 217.5, 12, 400, '#444444', 'right');
  slider(ctx, 142, 213, 150, 0.25);
  numBox(ctx, 300, 202, 44, '-90');
  pText(ctx, '°', 348, 212, 11, 400, '#666666');
  pText(ctx, 'Reset to 0°', 362, 217.5, 12, 400, '#1a73e8');
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(507, 48, 1, PANEL_H - 48);
  drawPicker(ctx, 518, 60, { hsv: [0, 0, 0], hex: '#000000' });
}

function panelLegend(ctx, S, P) {
  panelHead(ctx, 'BAR CHART', 'Legend');
  var rows = [['Swatch', '12', 0.5], ['Spacing', '18', 0.25], ['Gap', '6', 0.32]];
  for (var i = 0; i < rows.length; i++) {
    var y = 62 + i * 49;
    rowCard(ctx, 12, y, 690, 36);
    if (i === 0) { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(29, y + 18, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(36.5, y + 18, 3.8, 0, Math.PI * 2); ctx.fill(); }
    else if (i === 1) { ctx.strokeStyle = '#555'; ctx.lineWidth = 1.2; ctx.strokeRect(24.5, y + 11.5, 9, 9); ctx.strokeRect(28.5, y + 15.5, 9, 9); }
    else Glyph.gapArrows(ctx, 23, y + 10, 16, '#555555');
    pText(ctx, rows[i][0], 110, y + 22.5, 12, 400, '#444444', 'right');
    slider(ctx, 124, y + 18, 150, rows[i][2]);
    numBox(ctx, 290, y + 7, 46, rows[i][1]);
    pText(ctx, 'px', 344, y + 22.5, 12, 400, '#666666');
  }
}

var EB_TABS = BAR_TABS;
function panelErrorBars(ctx, S, P) {
  panelHead(ctx, 'BAR CHART', 'Error bars - East', { x: 562, active: 0, items: [{ label: 'East', w: 50 }, { label: 'All bars', w: 60 }] });
  tabsRow(ctx, EB_TABS, 2);
  var cy = 83;
  chipBtn(ctx, 12, cy, 64, 44, 'Type', Glyph.summary, true);
  ctx.fillStyle = '#d7d7d7'; ctx.fillRect(84.5, cy + 6, 1, 32);
  chipBtn(ctx, 94, cy, 60, 44, 'Color', function (c, x, y) { roundRect(c, x - 3, y + 1, 22, 14, 3); c.fillStyle = '#000000'; c.fill(); }, false);
  chipBtn(ctx, 160, cy, 60, 44, 'Width', Glyph.lines3, false);
  chipBtn(ctx, 226, cy, 60, 44, 'Cap', Glyph.summary, false);
  chipBtn(ctx, 292, cy, 66, 44, 'Direction', Glyph.ibar, false);
  /* the "changes the numbers" band */
  roundRect(ctx, 12.5, 137.5, 690, 96, 4);
  ctx.fillStyle = '#f2f6fb'; ctx.fill(); ctx.strokeStyle = '#cfe0f5'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#3573bd'; ctx.fillRect(12.5, 137.5, 3, 96);
  pText(ctx, 'CHANGES · WHAT THE WHISKERS MEAN', 28, 160, 10, 700, '#3573bd', 'left', 1.0);
  var segs = [['SE', 38], ['SD', 38], ['95% CI', 60], ['99% CI', 60], ['Difference-adjusted', 128], ['None', 50]];
  var x = 28;
  for (var i = 0; i < segs.length; i++) {
    var on = i === 0, w = segs[i][1];
    roundRect(ctx, x + 0.5, 170.5, w, 24, 3);
    ctx.fillStyle = on ? '#e8f0fb' : '#ffffff'; ctx.fill();
    ctx.strokeStyle = on ? '#1a5fb4' : '#aab3bd'; ctx.lineWidth = on ? 1.5 : 1; ctx.stroke();
    pText(ctx, segs[i][0], x + w / 2 + 0.5, 187, 11.5, on ? 700 : 400, on ? '#1a5fb4' : '#222222', 'center');
    x += w + 8;
  }
  pText(ctx, 'Applies to the whole chart.', 28, 220, 11.5, 400, '#555555');
}

function panelCatLabels(ctx, S, P) {
  panelHead(ctx, 'BAR CHART', 'X label: Low dose', { x: 562, active: 0, items: [{ label: 'This text', w: 58 }, { label: 'All text', w: 50 }] });
  rowCard(ctx, 12, 62, 486, 34);
  ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(29, 79, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(36.5, 79, 3.8, 0, Math.PI * 2); ctx.fill();
  pText(ctx, 'Size', 128, 83.5, 12, 400, '#444444', 'right');
  slider(ctx, 142, 79, 132, 0.52);
  numBox(ctx, 283, 68, 48, '12.1');
  pText(ctx, 'pt', 339, 83.5, 12, 400, '#666666');
  rowCard(ctx, 12, 102, 486, 34);
  ctx.beginPath(); ctx.arc(32, 119, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#1a5fb4'; ctx.fill();
  pText(ctx, 'Color', 128, 123.5, 12, 400, '#444444', 'right');
  for (var i = 0; i < 9; i++) { ctx.fillStyle = i === 0 ? '#000000' : QUICK_SWATCHES[i]; if (i === 0) ctx.fillStyle = '#000000'; ctx.fillRect(140 + i * 22, 109, 18, 20); }
  rowCard(ctx, 12, 142, 486, 34);
  Glyph.rotate(ctx, 24, 151, 16, '#555555');
  pText(ctx, 'Rotate', 128, 163.5, 12, 400, '#444444', 'right');
  slider(ctx, 142, 159, 150, 0.5);
  numBox(ctx, 300, 148, 44, '0');
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(507, 48, 1, PANEL_H - 48);
  drawPicker(ctx, 518, 60, { hsv: [0, 0, 0], hex: '#000000' });
}

var PANEL_KINDS = { bars: panelBars, ytitle: panelText, legend: panelLegend, errorbars: panelErrorBars, catlabels: panelCatLabels };

function drawInspectorPanel(ctx, S) {
  var A = S.app, h = PANEL_H * Ease.outCubic(A.panelOpen);
  ctx.save();
  ctx.translate(APP.panel.x, APP.panel.y);
  ctx.beginPath(); ctx.rect(-4, 0, APP.panel.w + 8, h + 4); ctx.clip();
  /* frame */
  roundRect(ctx, 0.5, 0.5, APP.panel.w - 1, PANEL_H - 1, [0, 0, 4, 4]);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = '#dddddd'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save();
  roundRect(ctx, 1, 1, APP.panel.w - 2, PANEL_H - 2, [0, 0, 4, 4]); ctx.clip();
  /* the old content clears quickly, then the new content settles in */
  var outA = A.panelPrev ? 1 - clamp(A.panelMix / 0.3, 0, 1) : 0;
  var inA = A.panelPrev ? clamp((A.panelMix - 0.25) / 0.75, 0, 1) : 1;
  if (A.panelPrev && outA > 0.001) {
    ctx.save(); ctx.globalAlpha *= outA;
    PANEL_KINDS[A.panelPrev](ctx, S, A.pstate[A.panelPrev]);
    ctx.restore();
  }
  if (A.panelKind && inA > 0.001) {
    ctx.save(); ctx.globalAlpha *= inA;
    ctx.translate(0, (1 - Ease.outCubic(inA)) * 5);
    PANEL_KINDS[A.panelKind](ctx, S, A.pstate[A.panelKind]);
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

/* ---------- Add menu ---------- */
var ADD_TILES = [
  ['text', 'Text annotation'], ['chartNote', 'Figure note'], ['ovl_errorbars', 'Error bars'],
  ['bracket', 'Sig. bracket'], ['refLine', 'Reference line'], ['drawShapes', 'Draw shapes…'],
  ['grid', 'Grid lines'], ['barOutliers', 'Outliers'], ['showDataPoints', 'Data points'],
  ['barValueLabels', 'Value labels'], ['barNLabels', 'N labels']
];
var MENU = { w: 300, pad: 8, tileW: 90, tileH: 60, gap: 7 };
MENU.x = TB.add.x + TB.add.w - MENU.w;
MENU.y = TB.add.y + TB.add.h + 8;
MENU.h = MENU.pad * 2 + 4 * MENU.tileH + 3 * MENU.gap;
function tileRect(i) {
  var col = i % 3, row = Math.floor(i / 3);
  var gx = (MENU.w - 2 * MENU.pad - 3 * MENU.tileW) / 2;
  return { x: MENU.x + MENU.pad + col * (MENU.tileW + gx), y: MENU.y + MENU.pad + row * (MENU.tileH + MENU.gap), w: MENU.tileW, h: MENU.tileH };
}
function tileCenter(key) {
  for (var i = 0; i < ADD_TILES.length; i++) if (ADD_TILES[i][0] === key) { var r = tileRect(i); return [r.x + r.w / 2, r.y + r.h / 2]; }
  return [0, 0];
}
function drawAddMenu(ctx, S) {
  var A = S.app, o = A.menuOpen, px = ctx.__pxScale || 1;
  var e = Ease.outCubic(o);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, o * 1.6);
  /* grows from the button's corner, the way a menu should */
  var ox = MENU.x + MENU.w - 20, oy = MENU.y;
  var sc = lerp(0.94, 1, e);
  ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.translate(-ox, -oy - (1 - e) * 6);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 12 * px; ctx.shadowOffsetY = 4 * px;
  roundRect(ctx, MENU.x, MENU.y, MENU.w, MENU.h, 5);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
  roundRect(ctx, MENU.x + 0.5, MENU.y + 0.5, MENU.w - 1, MENU.h - 1, 5);
  ctx.strokeStyle = '#b5b5b5'; ctx.lineWidth = 1; ctx.stroke();
  for (var i = 0; i < ADD_TILES.length; i++) {
    var r = tileRect(i), key = ADD_TILES[i][0];
    var st = clamp((o - 0.15 - i * 0.035) / 0.45, 0, 1), ste = Ease.outCubic(st);
    if (ste <= 0) continue;
    var hv = A.tileHover[key] || 0, pr = A.tilePress[key] || 0;
    ctx.save();
    ctx.globalAlpha *= ste;
    ctx.translate(0, (1 - ste) * 5);
    var tcx = r.x + r.w / 2, tcy = r.y + r.h / 2, ts = 1 - pr * 0.04;
    ctx.translate(tcx, tcy); ctx.scale(ts, ts); ctx.translate(-tcx, -tcy);
    roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 8);
    ctx.fillStyle = mixOk('#ffffff', '#eef5fd', hv); ctx.fill();
    ctx.strokeStyle = mixOk('#e3e3e3', '#8fbbe9', hv); ctx.lineWidth = 1; ctx.stroke();
    drawSvgIcon(ctx, key, r.x + r.w / 2 - 19, r.y + 7, 38, 26.9, 48, 34);
    ctx.font = fnt(11.5, 400);
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'center';
    var lbl = ADD_TILES[i][1];
    ctx.fillText(lbl, r.x + r.w / 2, r.y + 49.5);
    ctx.textAlign = 'left';
    ctx.restore();
  }
  ctx.restore();
}
