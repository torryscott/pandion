// A true OS-wide color dropper for the desktop app (punch list t4-142).
//
// Electron 33 does not expose the web EyeDropper API at all (verified:
// typeof window.EyeDropper is undefined), so the renderer's polyfill was
// sampling in-app only and the way to other windows was the screen-share
// snapshot Torry disliked. The main process has no such boundary: it can
// capture the screen directly through desktopCapturer - no share dialog.
//
// The flow mirrors what Chrome's own dropper does internally: one instant
// full-resolution screenshot of the display the cursor is on, shown 1:1
// in a frameless always-on-top overlay window; the pointer hovers the
// still with a magnifier loupe, a click reports the pixel, Escape
// cancels. Animated content freezes for the moment of picking, exactly
// as it does in Chrome's dropper.
//
// macOS gates reading other apps' pixels behind the Screen Recording
// permission (the same toggle Digital Color Meter needs). Flow:
// not-determined -> capture anyway, which makes macOS show its own
// one-time prompt; denied -> an explainer dialog with a button that
// opens the exact System Settings pane, and the caller falls back to
// in-app sampling. Windows and Linux need no permission.
//
// Injection points (capture / permission / explain / display / onOverlay)
// exist so the probe can drive the whole overlay with a synthetic frame
// and no TCC state; production callers pass nothing.
"use strict";

const path = require("path");
const {
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} = require("electron");

function screenPermission() {
  if (process.platform !== "darwin") return "granted";
  try {
    return systemPreferences.getMediaAccessStatus("screen");
  } catch (e) {
    return "granted";
  }
}

async function explainPermission(parent) {
  const choice = await dialog.showMessageBox(parent || null, {
    type: "info",
    buttons: ["Open System Settings", "Not now"],
    defaultId: 0,
    cancelId: 1,
    message: "Picking colors from other apps needs Screen Recording permission.",
    detail:
      "macOS treats reading another app's pixels as screen recording, " +
      "so the color dropper can only reach outside this window after " +
      "you allow it once for Pandion Plots in System Settings > Privacy " +
      "& Security > Screen Recording. Until then the dropper samples " +
      "inside the app. You may need to reopen the app after allowing it.",
  });
  if (choice.response === 0) {
    shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security" +
        "?Privacy_ScreenCapture"
    );
  }
}

// One full-resolution frame of the given display, as a NativeImage.
async function captureDisplay(display) {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    },
  });
  if (!sources.length) return null;
  const match = sources.find(
    (s) => String(s.display_id) === String(display.id)
  );
  const img = (match || sources[0]).thumbnail;
  return img && !img.isEmpty() ? img : null;
}

// Resolves {ok:true, hex} | {ok:false, reason:"cancel"|"permission"|"error"}.
async function pickColor(opts) {
  opts = opts || {};
  const perm = (opts.permission || screenPermission)();
  if (perm === "denied" || perm === "restricted") {
    await (opts.explain || explainPermission)(
      BrowserWindow.getAllWindows()[0] || null
    );
    return { ok: false, reason: "permission" };
  }
  const display =
    opts.display ||
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  let frame = null;
  try {
    frame = await (opts.capture || captureDisplay)(display);
  } catch (e) {
    frame = null;
  }
  if (!frame) {
    // A first-ever capture on macOS triggers the system prompt but this
    // attempt may come back empty; a later click succeeds once granted.
    if (screenPermission() !== "granted" && !opts.permission) {
      return { ok: false, reason: "permission" };
    }
    return { ok: false, reason: "error" };
  }

  const size = frame.getSize();
  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#000000",
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, "eyedrop-preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The frame is sent and decoded before show(); a throttled
      // hidden renderer must not stall that.
      backgroundThrottling: false,
    },
  });
  // Above the menu bar and every normal window while it lives.
  overlay.setAlwaysOnTop(true, "screen-saver");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("ps-eyedrop-done", onDone);
      try {
        overlay.destroy();
      } catch (e) {}
      resolve(result);
    };
    const onDone = (event, hex) => {
      if (event.sender !== overlay.webContents) return;
      finish(
        typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex)
          ? { ok: true, hex: hex.toLowerCase() }
          : { ok: false, reason: "cancel" }
      );
    };
    ipcMain.on("ps-eyedrop-done", onDone);
    overlay.on("closed", () => finish({ ok: false, reason: "cancel" }));
    overlay.webContents.on("did-finish-load", () => {
      overlay.webContents.send("ps-eyedrop-frame", {
        png: frame.toDataURL(),
        w: size.width,
        h: size.height,
      });
      overlay.show();
      overlay.focus();
      if (opts.onOverlay) opts.onOverlay(overlay);
    });
    overlay.loadFile(path.join(__dirname, "eyedrop-overlay.html"));
  });
}

function wire() {
  ipcMain.handle("ps-eyedrop-pick", () => pickColor());
}

module.exports = { pickColor, wire };
