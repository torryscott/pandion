// Punch list t4-142: the desktop app's OS-wide dropper (eyedrop.js).
// Runs INSIDE electron (standalone/verify/run-eyedrop-electron.sh wraps
// it); drives the real overlay window with a SYNTHETIC frame whose
// regions have known colors, so pixel mapping is asserted exactly and
// no TCC permission state is touched. Exit 0 = pass.
"use strict";
const { app, nativeImage } = require("electron");
const eyedrop = require("../electron/eyedrop");

function fail(msg) {
  console.error("FAIL: " + msg);
  app.exit(1);
}
function ok(cond, msg) {
  if (!cond) { fail(msg); throw new Error(msg); }
  console.log("  ok  " + msg);
}

// A 400x300 BGRA bitmap: left half #0000ff, right half #ffa500.
function testFrame() {
  const w = 400, h = 300;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x < w / 2) { buf[i] = 255; buf[i + 1] = 0; buf[i + 2] = 0; }
      else { buf[i] = 0; buf[i + 1] = 165; buf[i + 2] = 255; }
      buf[i + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

const DISPLAY = {
  id: "probe",
  bounds: { x: 60, y: 60, width: 400, height: 300 },
  size: { width: 400, height: 300 },
  scaleFactor: 1,
};

function drive(overlay, actions) {
  // Input is sent only once the overlay says the frame is sampleable
  // (window.__edReady) - a blind delay raced the Image decode, and a
  // too-early click correctly resolves cancel, failing the case.
  const t0 = Date.now();
  const poll = () => {
    overlay.webContents.executeJavaScript("!!window.__edReady").then(
      (ready) => {
        if (ready) {
          for (const a of actions) overlay.webContents.sendInputEvent(a);
        } else if (Date.now() - t0 < 6000) setTimeout(poll, 80);
        else console.error("drive: overlay never became ready");
      },
      () => { if (Date.now() - t0 < 6000) setTimeout(poll, 80); }
    );
  };
  poll();
}

// The overlay is this harness's ONLY window, so between cases the
// window count hits zero and Electron's default quit-on-all-closed
// would tear down the NEXT case's overlay mid-flight (case 2 read
// as a spurious cancel). Production always has the main window.
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  try {
    console.log("case 1: a click reports the exact pixel under it");
    let r = await eyedrop.pickColor({
      permission: () => "granted",
      capture: async () => testFrame(),
      display: DISPLAY,
      onOverlay: (o) => drive(o, [
        { type: "mouseMove", x: 100, y: 150 },
        { type: "mouseDown", x: 100, y: 150, button: "left", clickCount: 1 },
        { type: "mouseUp", x: 100, y: 150, button: "left", clickCount: 1 },
      ]),
    });
    ok(r.ok === true && r.hex === "#0000ff",
      "left region picks #0000ff (got " + JSON.stringify(r) + ")");

    console.log("case 2: the letterbox mapping holds on the other side");
    r = await eyedrop.pickColor({
      permission: () => "granted",
      capture: async () => testFrame(),
      display: DISPLAY,
      onOverlay: (o) => drive(o, [
        { type: "mouseMove", x: 300, y: 150 },
        { type: "mouseDown", x: 300, y: 150, button: "left", clickCount: 1 },
        { type: "mouseUp", x: 300, y: 150, button: "left", clickCount: 1 },
      ]),
    });
    ok(r.ok === true && r.hex === "#ffa500",
      "right region picks #ffa500 (got " + JSON.stringify(r) + ")");

    console.log("case 3: Escape cancels");
    r = await eyedrop.pickColor({
      permission: () => "granted",
      capture: async () => testFrame(),
      display: DISPLAY,
      onOverlay: (o) => drive(o, [
        { type: "keyDown", keyCode: "Escape" },
        { type: "keyUp", keyCode: "Escape" },
      ]),
    });
    ok(r.ok === false && r.reason === "cancel",
      "Escape resolves cancel, never a color (got " + JSON.stringify(r) + ")");

    console.log("case 4: a denied permission explains and reports itself");
    let explained = 0;
    r = await eyedrop.pickColor({
      permission: () => "denied",
      explain: async () => { explained++; },
      capture: async () => { throw new Error("must not capture"); },
      display: DISPLAY,
    });
    ok(r.ok === false && r.reason === "permission" && explained === 1,
      "denied -> one explainer, reason permission, and NO capture attempt");

    console.log("case 5: an empty capture is an error, not a hang");
    r = await eyedrop.pickColor({
      permission: () => "granted",
      capture: async () => null,
      display: DISPLAY,
    });
    ok(r.ok === false && r.reason === "error",
      "a null frame resolves error (got " + JSON.stringify(r) + ")");

    console.log("EYEDROP ELECTRON CHECK PASS");
    app.exit(0);
  } catch (e) {
    fail(String(e && e.message || e));
  }
});
