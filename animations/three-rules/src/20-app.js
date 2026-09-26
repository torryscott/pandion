/* The app window replica, in WORLD units = CSS px of the real app at a
 * 1440 px wide window. Positions and type sizes come from measuring the
 * live app (website/app) with Playwright, so the replica matches it. */

var APP = {
  w: 1440, h: 1000,
  barH: 34, cmdH: 43,
  railW: 205, setupX: 1110,
  statusH: 25,
  card: { x: 210, y: 77, w: 895 },
  strip: { x: 224, y: 132, w: 867, h: 42 },
  svg: { x: 292.5, y: 183, w: 720, h: 489.75 },
  panel: { x: 298.5, w: 716, gap: 0 }
};
APP.statusY = APP.h - APP.statusH;
APP.panel.y = APP.svg.y + APP.svg.h + APP.panel.gap;

/* Toolbar button boxes (world coords). */
var TB = {
  bar: { x: 234.5, y: 139.5, w: 80, h: 28 },
  theme: { x: 322, y: 139.5, w: 110, h: 28 },
  undo: { x: 492, y: 146, s: 15 },
  redo: { x: 526, y: 146, s: 15 },
  stats: { x: 559, y: 139.5, w: 58, h: 28 },
  show: { x: 628, y: 139.5, w: 92, h: 28 },
  settings: { x: 731, y: 139.5, w: 80, h: 28 },
  find: { x: 823, y: 139.5, w: 58, h: 28 },
  add: { x: 888, y: 139.5, w: 58, h: 28 },
  fit: { x: 960, y: 139, w: 107, h: 29 }
};

function worldVisible(view, x, y, w, h) {
  return !(x > view.x1 || x + w < view.x0 || y > view.y1 || y + h < view.y0);
}

function drawAppWindow(ctx, S, view) {
  var A = S.app;
  /* window shadow + frame */
  var px = ctx.__pxScale || 1;
  ctx.save();
  ctx.shadowColor = 'rgba(25,46,73,' + (0.18 * A.shadowK).toFixed(3) + ')';
  ctx.shadowBlur = 60 * px;
  ctx.shadowOffsetY = 24 * px;
  roundRect(ctx, 0, -26, APP.w, APP.h + 26, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, 0, -26, APP.w, APP.h + 26, 12);
  ctx.clip();
  /* browser-ish shot bar, like the site's product shots */
  ctx.fillStyle = '#eef2f7';
  ctx.fillRect(0, -26, APP.w, 26);
  ctx.fillStyle = '#cdd7e2';
  for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(16 + i * 14, -13, 4.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, APP.w, APP.h);

  drawAppBar(ctx, S, view);
  drawCommandBar(ctx, S, view);
  if (worldVisible(view, 0, 77, APP.railW, APP.h)) drawRail(ctx, S);
  if (worldVisible(view, APP.setupX, 77, APP.w - APP.setupX, APP.h)) drawSetup(ctx, S);
  drawWorkCard(ctx, S, view);
  drawStatusBar(ctx, S, view);
  ctx.restore();
  /* hairline frame */
  ctx.save();
  roundRect(ctx, 0.5, -25.5, APP.w - 1, APP.h + 25, 12);
  ctx.strokeStyle = 'rgba(25,46,73,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawAppBar(ctx, S) {
  ctx.fillStyle = C.appbar;
  ctx.fillRect(0, 0, APP.w, APP.barH);
  ctx.fillStyle = C.appbarLine;
  ctx.fillRect(0, APP.barH - 1, APP.w, 1);
  drawWingMark(ctx, 11, 6, 22, '#ffffff', '#6b9de8');
  ctx.fillStyle = '#ffffff';
  ctx.font = fnt(13, 700);
  ctx.textBaseline = 'alphabetic';
  fillSpaced(ctx, 'Pandion Plots', 37, 22, 0.05);
  ctx.font = fnt(12, 400);
  ctx.fillStyle = '#c9d6e8';
  var menus = [['File', 140, 38], ['Edit', 178, 40], ['Data', 218, 44], ['View', 262, 45], ['Insert', 307, 50], ['Help', 358, 44]];
  ctx.textAlign = 'center';
  for (var i = 0; i < menus.length; i++) ctx.fillText(menus[i][0], menus[i][1] + menus[i][2] / 2, 21.5);
  ctx.fillStyle = '#ffffff';
  ctx.font = fnt(12, 700);
  ctx.fillText('Dose response study', 871.5, 15);
  ctx.font = fnt(10, 400);
  ctx.fillStyle = '#9db1cc';
  ctx.fillText('1 document · local project', 871.5, 27.5);
  ctx.textAlign = 'right';
  ctx.font = fnt(10.5, 400);
  ctx.fillText('Autosaved locally', 1428, 21);
  ctx.textAlign = 'left';
}

function drawCommandBar(ctx, S) {
  var y = APP.barH;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, y, APP.w, APP.cmdH);
  ctx.fillStyle = C.border;
  ctx.fillRect(0, y + APP.cmdH - 1, APP.w, 1);
  Glyph.folder(ctx, 20, 47.5, 14, '#303b47');
  Glyph.disk(ctx, 94, 47.5, 14, '#303b47');
  ctx.fillStyle = C.btnText;
  ctx.font = fnt(11.5, 600);
  ctx.fillText('Open', 40, 59.5);
  ctx.fillText('Save project', 114, 59.5);
  ctx.fillStyle = C.border;
  ctx.fillRect(203, 44, 1, 23);
  ctx.fillStyle = C.muted;
  ctx.font = fnt(10.5, 400);
  ctx.fillText('sample-dose-response - 24 rows x 4 columns', 216, 59);
  ctx.fillStyle = C.btnText;
  ctx.font = fnt(11.5, 600);
  ctx.textAlign = 'center';
  ctx.fillText('Reset styling', 1285, 59.5);
  roundRect(ctx, 1337, 40, 93, 30, 6);
  ctx.fillStyle = '#2f6db5';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Export chart', 1383.5, 59.5);
  ctx.textAlign = 'left';
}

function railLabel(ctx, s, x, y, ls) {
  ctx.fillStyle = C.muted;
  ctx.font = fnt(10, 700);
  fillSpaced(ctx, s.toUpperCase(), x, y, ls);
}
function drawRail(ctx, S) {
  var x0 = 0, y0 = 77, w = APP.railW;
  ctx.fillStyle = C.rail;
  ctx.fillRect(x0, y0, w, APP.statusY - y0);
  ctx.fillStyle = C.border;
  ctx.fillRect(w - 1, y0, 1, APP.statusY - y0);
  railLabel(ctx, 'Workspaces', 15, 101.5, 0.55);
  var items = [['Data', 109, 'gridIcon'], ['Charts', 141, 'barsIcon'], ['Notebook', 174, 'notebook'], ['Layouts', 207, 'layouts']];
  for (var i = 0; i < items.length; i++) {
    var it = items[i], active = it[0] === 'Charts';
    if (active) {
      roundRect(ctx, 8.5, it[1] + 0.5, 187, 30, 6);
      ctx.fillStyle = '#dfeaf7'; ctx.fill();
      ctx.strokeStyle = '#c9d6e8'; ctx.lineWidth = 1; ctx.stroke();
    }
    var col = active ? '#174f8c' : '#3d4a58';
    Glyph[it[2]](ctx, 18, it[1] + 8, 15, col);
    ctx.fillStyle = col;
    ctx.font = fnt(12, active ? 600 : 500);
    ctx.fillText(it[0], 42, it[1] + 19.5);
  }
  ctx.fillStyle = C.border;
  ctx.fillRect(10, 251, 186, 1);
  railLabel(ctx, 'Documents', 15, 276, 0.55);
  Glyph.plus(ctx, 170, 264, 16, '#4b6682', 2);
  railLabel(ctx, 'Charts', 15, 300, 0.4);
  roundRect(ctx, 8, 305, 188, 28, 6);
  ctx.fillStyle = '#e6e9ee'; ctx.fill();
  Glyph.barsIcon(ctx, 22, 311.5, 14, '#174f8c');
  ctx.fillStyle = '#174f8c';
  ctx.font = fnt(11.5, 600);
  ctx.fillText('Chart 1', 46, 323.5);
  railLabel(ctx, 'Notebook', 15, 354, 0.4);
  Glyph.notebook(ctx, 22, 366, 14, '#3d4a58');
  ctx.fillStyle = '#3d4a58';
  ctx.font = fnt(11.5, 500);
  ctx.fillText('Section 1', 46, 377.5);
  railLabel(ctx, 'Layouts', 15, 408, 0.4);
  ctx.fillStyle = C.muted;
  ctx.font = fnt(11, 400);
  ctx.fillText('No layouts yet', 20, 428);
}

function setupRoleCard(ctx, y, label, varName, kind, chipW) {
  roundRect(ctx, 1123.5, y + 0.5, 304, 43, 6);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#3d4a58';
  ctx.font = fnt(12, 700);
  ctx.fillText(label, 1134, y + 26);
  var cx = 1356 - chipW;
  roundRect(ctx, cx, y + 9.5, chipW, 25, 5);
  ctx.fillStyle = '#eef4fb'; ctx.fill();
  ctx.strokeStyle = '#c9d6e8'; ctx.stroke();
  if (kind === 'nominal') Glyph.nominal(ctx, cx + 8, y + 14, 15);
  else Glyph.ruler(ctx, cx + 8, y + 14, 15, '#8a4b5a');
  ctx.fillStyle = C.ink;
  ctx.font = fnt(11.5, 600);
  ctx.fillText(varName, cx + 27, y + 26);
  Glyph.x(ctx, cx + chipW - 22, y + 14.5, 13, C.muted, 1.7);
  ctx.fillStyle = '#174f8c';
  ctx.font = fnt(10.5, 600);
  ctx.fillText('Change', 1370, y + 26);
}
function drawSetup(ctx, S) {
  var x0 = APP.setupX, y0 = 77;
  ctx.fillStyle = C.setup;
  ctx.fillRect(x0, y0, APP.w - x0, APP.statusY - y0);
  ctx.fillStyle = C.border;
  ctx.fillRect(x0, y0, 1, APP.statusY - y0);
  ctx.fillStyle = C.wash;
  ctx.fillRect(x0 + 1, y0, APP.w - x0, 50);
  ctx.fillStyle = C.line;
  ctx.fillRect(x0 + 1, y0 + 49, APP.w - x0, 1);
  ctx.fillStyle = '#303b47';
  ctx.font = fnt(12, 700);
  ctx.fillText('Chart setup', 1124, 99.5);
  ctx.fillStyle = C.muted;
  ctx.font = fnt(10, 400);
  ctx.fillText('Data roles; select chart parts to style below', 1124, 114.5);
  ctx.fillStyle = '#666677';
  ctx.font = fnt(10.5, 700);
  fillSpaced(ctx, 'ANALYSIS', 1123, 156, 0.4);
  roundRect(ctx, 1186.5, 138.5, 147, 29, 4);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = '#b9c3cf'; ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.font = fnt(12.5, 400);
  ctx.fillText('Compare Groups', 1195, 157.5);
  Glyph.caret(ctx, 1316, 150, 8, '#44505c');
  ctx.fillStyle = C.muted;
  ctx.font = fnt(10.5, 400);
  ctx.fillText('Compare a numeric outcome across categories.', 1125, 181);
  function sectionRule(lbl, y) {
    ctx.fillStyle = C.muted;
    ctx.font = fnt(10, 700);
    fillSpaced(ctx, lbl, 1123, y, 0.45);
    var w = spacedW(ctx, lbl, ctx.font, 0.45);
    ctx.fillStyle = C.line;
    ctx.fillRect(1123 + w + 10, y - 4, 1428 - (1123 + w + 10), 1);
  }
  sectionRule('AXES', 206);
  setupRoleCard(ctx, 214, 'Category axis', 'condition', 'nominal', 114);
  setupRoleCard(ctx, 264, 'Value axis', 'score', 'numeric', 100);
  sectionRule('SPLIT THE CHART', 327);
  setupRoleCard(ctx, 335, 'Color / group', 'site', 'nominal', 86);
  var plusRows = [['Panels', 395], ['Data points', 437]];
  for (var i = 0; i < plusRows.length; i++) {
    var py = plusRows[i][1];
    ctx.beginPath(); ctx.arc(1143, py + 9, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#e8f0fb'; ctx.fill();
    Glyph.plus(ctx, 1136, py + 2, 14, '#1a5fb4', 2);
    ctx.fillStyle = C.muted;
    ctx.font = fnt(12, 600);
    ctx.fillText(plusRows[i][0], 1160, py + 13.5);
  }
  var boxes = [['AVAILABLE VARIABLES (1)', 475], ['SIZE & VIEW', 517]];
  for (var j = 0; j < boxes.length; j++) {
    roundRect(ctx, 1123.5, boxes[j][1] + 0.5, 304, 29, 6);
    ctx.fillStyle = '#fafbfc'; ctx.fill();
    ctx.strokeStyle = C.line; ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = fnt(9, 700);
    ctx.fillText('▸', 1134, boxes[j][1] + 19);
    ctx.font = fnt(10, 700);
    fillSpaced(ctx, boxes[j][0], 1146, boxes[j][1] + 19.5, 0.45);
  }
}

function drawStatusBar(ctx, S) {
  var y = APP.statusY;
  ctx.fillStyle = C.wash;
  ctx.fillRect(0, y, APP.w, APP.statusH);
  ctx.fillStyle = C.btnBorder;
  ctx.fillRect(0, y, APP.w, 1);
  ctx.font = fnt(10.5, 400);
  ctx.fillStyle = '#3d4a58';
  ctx.fillText('Compare Groups · condition × score × site', 10, y + 16.5);
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  ctx.fillText('24 cases · 3 categories · 2 groups', 1256, y + 16.5);
  ctx.fillStyle = '#4f718f';
  ctx.fillText('Autosaved just now', 1430, y + 16.5);
  ctx.textAlign = 'left';
}

function drawWorkCard(ctx, S, view) {
  var A = S.app;
  var cardBottom = lerp(687, APP.panel.y + A.panelH + 16, A.panelOpen);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(APP.card.x, APP.card.y, APP.card.w, cardBottom - APP.card.y);
  /* tabs row */
  ctx.fillStyle = C.tabBlue;
  ctx.font = fnt(12.5, 600);
  ctx.fillText('Chart 1', 238, 110);
  Glyph.x(ctx, 294, 98, 14, C.muted, 1.8);
  ctx.fillRect(226, 119.5, 88, 2.2);
  ctx.fillStyle = C.line;
  ctx.fillRect(224, 121.5, 867, 1);
  Glyph.plus(ctx, 328, 97, 16, '#3573bd', 2.1);
  drawToolbar(ctx, S);
  /* chart */
  ctx.save();
  ctx.translate(APP.svg.x, APP.svg.y);
  drawChart(ctx, S);
  ctx.restore();
  /* inspector panel */
  if (A.panelOpen > 0.001) drawInspectorPanel(ctx, S);
  /* menus float above everything in the card */
  if (A.menuOpen > 0.001) drawAddMenu(ctx, S);
}

function tbLabelButton(ctx, box, label, glyph, hover, active) {
  var col = active ? C.selBlue : C.toolText;
  if (hover > 0.01 || active > 0.01) {
    var a = Math.max(hover * 0.75, active);
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fillStyle = rgba('#e3eefb', a);
    ctx.fill();
    ctx.strokeStyle = rgba('#b8cfeb', a);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (active > 0.01) col = mixOk(C.toolText, C.selBlue, active);
  }
  var gx = box.x + 10;
  glyph(gx, box.y + 7, col);
  ctx.fillStyle = col;
  ctx.font = fnt(12, 500);
  fillSpaced(ctx, label, gx + 16, box.y + 18.5, 0.2);
}

function drawToolbar(ctx, S) {
  var A = S.app, s = APP.strip;
  ctx.save();
  ctx.shadowColor = 'rgba(25,40,57,0.06)';
  ctx.shadowBlur = 2 * (ctx.__pxScale || 1);
  ctx.shadowOffsetY = 1 * (ctx.__pxScale || 1);
  roundRect(ctx, s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1, 6);
  ctx.fillStyle = C.wash; ctx.fill();
  ctx.restore();
  roundRect(ctx, s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1, 6);
  ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke();

  /* graph type button */
  var b = TB.bar;
  roundRect(ctx, b.x, b.y, b.w, b.h, 6);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = C.btnBorder; ctx.stroke();
  drawSvgIcon(ctx, 'gtBar', b.x + 9, b.y + 6, 25, 16, 56, 36);
  ctx.fillStyle = C.btnText;
  ctx.font = fnt(11.5, 600);
  ctx.fillText('Bar', b.x + 40, b.y + 18.5);
  Glyph.caret(ctx, b.x + 64.5, b.y + 12.5, 6.5, '#666666');
  /* theme button */
  b = TB.theme;
  roundRect(ctx, b.x, b.y, b.w, b.h, 6);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = C.btnBorder; ctx.stroke();
  ctx.save();
  roundRect(ctx, b.x + 11, b.y + 6.5, 29, 15, 2.5);
  ctx.clip();
  var cols = [S.chart.eastColor, S.chart.westColor, '#e18e4c', '#597b2f', '#faca59'];
  for (var i = 0; i < 5; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(b.x + 11 + i * 5.8, b.y + 6.5, 6, 15); }
  ctx.restore();
  ctx.fillStyle = C.btnText;
  ctx.font = fnt(11.5, 600);
  ctx.fillText('Theme', b.x + 52, b.y + 18.5);
  Glyph.caret(ctx, b.x + 95, b.y + 12.5, 6.5, '#666666');
  /* undo / redo */
  var undoCol = mixOk('#b9c2cc', '#546372', A.undoOn);
  Glyph.undo(ctx, TB.undo.x, TB.undo.y, TB.undo.s, undoCol);
  Glyph.redo(ctx, TB.redo.x, TB.redo.y, TB.redo.s, '#b9c2cc');
  /* labelled tools */
  tbLabelButton(ctx, TB.stats, 'Stats', function (x, y, col) {
    ctx.fillStyle = col; ctx.font = fnt(13, 600); ctx.fillText('Σ', x, y + 11.5);
  }, 0, 0);
  tbLabelButton(ctx, TB.show, 'Show/hide', function (x, y, col) { Glyph.eye(ctx, x - 1, y, 14, col); }, 0, 0);
  tbLabelButton(ctx, TB.settings, 'Settings', function (x, y, col) { Glyph.gear(ctx, x - 1, y, 14, col); }, 0, 0);
  tbLabelButton(ctx, TB.find, 'Find', function (x, y, col) { Glyph.search(ctx, x - 1, y, 14, col); }, 0, 0);
  tbLabelButton(ctx, TB.add, 'Add', function (x, y, col) { Glyph.plus(ctx, x - 2, y - 0.5, 15, col, 2.2); }, A.addHover, A.addActive);
  /* fit window select */
  b = TB.fit;
  roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w, b.h, 6);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = '#9aa6b2'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.font = fnt(12, 400);
  ctx.fillText('Fit window', b.x + 12, b.y + 19);
  Glyph.chevronDown(ctx, b.x + b.w - 20, b.y + 12, 9, '#22364d', 1.8);
}
