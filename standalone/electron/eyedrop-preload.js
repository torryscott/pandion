// Preload for the dropper's overlay window only: receives the captured
// frame, reports the picked pixel (or null for cancel). Nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("PS_EYEDROP", {
  onFrame: (cb) => {
    if (typeof cb !== "function") return;
    ipcRenderer.on("ps-eyedrop-frame", (event, frame) => cb(frame));
  },
  done: (hexOrNull) => ipcRenderer.send("ps-eyedrop-done", hexOrNull),
});
