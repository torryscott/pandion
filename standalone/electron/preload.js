// Desktop bridge, kept deliberately small. Two jobs:
//   1. A read-only identity marker so the shell can, when it cares to, say
//      "Desktop app" instead of browser wording.
//   2. The OS-opened-file relay: main reads a double-clicked .pand and
//      sends {name, bytes} over IPC; the shell wraps it in a File and
//      feeds its ordinary loader. Files are BUFFERED here because this
//      preload runs before any page script - main may send the moment the
//      page finishes loading, before the shell has registered a consumer,
//      and the launch-by-double-click file must not be lost to that race.
// No other reach into Node is exposed.
const { contextBridge, ipcRenderer } = require("electron");

let version = "";
for (const a of process.argv) {
  if (a.startsWith("--ps-desktop-version=")) {
    version = a.slice("--ps-desktop-version=".length);
  }
}

const pendingFiles = [];
let deliverFile = null;
ipcRenderer.on("ps-open-file", (event, file) => {
  if (deliverFile) deliverFile(file);
  else pendingFiles.push(file);
});

// Menu-paste relay: the Edit menu's Paste item notifies the shell after
// its native paste, so the non-editable grid (which Electron's role
// paste silently skips) can paste at the current selection. No
// buffering: a paste before the shell boots has nowhere to land.
let deliverPaste = null;
ipcRenderer.on("ps-menu-paste", () => {
  if (deliverPaste) deliverPaste();
});

contextBridge.exposeInMainWorld("PS_DESKTOP", {
  version: version,
  platform: process.platform,
  // The OS-wide color dropper (t4-142): main captures the screen and
  // runs the pick overlay; resolves {ok, hex|reason}. The shell's
  // EyeDropper polyfill prefers this over its in-page sampler.
  pickColor: () => ipcRenderer.invoke("ps-eyedrop-pick"),
  onOpenFile: (cb) => {
    if (typeof cb !== "function") return;
    deliverFile = cb;
    while (pendingFiles.length) cb(pendingFiles.shift());
  },
  onMenuPaste: (cb) => {
    if (typeof cb === "function") deliverPaste = cb;
  },
});
