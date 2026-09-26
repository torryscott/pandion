/* Frame renderer: draws the whole film at time t into a canvas whose
 * transform maps the 1920 x 1080 stage onto its pixels. */

function applyCamera(ctx, cam) {
  ctx.translate(cam.sx, cam.sy);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
}
function camView(cam) {
  return {
    x0: cam.x - cam.sx / cam.z, x1: cam.x + (STAGE_W - cam.sx) / cam.z,
    y0: cam.y - cam.sy / cam.z, y1: cam.y + (STAGE_H - cam.sy) / cam.z
  };
}
function worldToStage(cam, x, y) {
  return [cam.sx + (x - cam.x) * cam.z, cam.sy + (y - cam.y) * cam.z];
}

function renderFrame(ctx, t, pxScale) {
  computeTitleLayout(ctx);
  var S = stateAt(t);
  ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  ctx.__pxScale = pxScale;
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  drawBackground(ctx, S);
  drawIntroLayer(ctx, S, pxScale);
  if (S.app.visible > 0.001) {
    ctx.save();
    ctx.globalAlpha = S.app.visible;
    var cam = S.cam;
    applyCamera(ctx, cam);
    ctx.__pxScale = pxScale * cam.z;
    drawAppWindow(ctx, S, camView(cam));
    ctx.restore();
    ctx.__pxScale = pxScale;
  }
  drawOverlays(ctx, S, pxScale);
  drawCursor(ctx, S, pxScale);
  drawEndLayer(ctx, S, pxScale);
  return S;
}
