// Pandion Plots desktop: an Electron window around the SAME single-file
// build every other channel ships. Packaged, it loads
// resources/app/pandion-plots.html (electron-builder copies it in from
// standalone/dist); in a checkout it loads ../dist/pandion-plots.html
// directly. Either way the bytes are the tested portable artifact, so the
// parity story ("the deployed bytes are the tested bytes") extends to the
// desktop app for free.
//
// Deliberately thin. The shell already prefers window.showSaveFilePicker
// (the OS dialog) for Save/Export, and its download-anchor fallback hits
// Electron's default will-download behavior, which is ALSO the OS save
// dialog - so "native file dialogs" needs no bridge code here. What the
// main process must own:
//   1. External links: the shell opens docs/site links with
//      window.open(url, "_blank", "noopener"); unhandled, Electron would
//      spawn a bare chrome-less child window. Route them to the system
//      browser and deny the child.
//   2. The unsaved-work guard: the shell's beforeunload fires only when
//      autosave is FAILING and the project has unsaved changes. Electron
//      surfaces that as will-prevent-unload; translate it to a native
//      sheet instead of silently refusing to close.
//   3. One instance: two windows would share one localStorage autosave
//      and race it. Second launch focuses the first window.
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const SITE = "https://pandionplots.com";

// ---- updates (GitHub Releases feed; packaged builds only) ----
// electron-updater compares app.getVersion() against the latest release's
// metadata (latest-mac.yml / latest.yml, attached by CI), downloads in the
// background, and installs on quit. Startup check is QUIET (an OS
// notification only when an update finished downloading); the Help-menu
// item is the loud, user-initiated path with real dialogs. Dev runs skip
// all of it: there is no update metadata to compare against, and macOS
// refuses to swap an unsigned bundle anyway.
let updaterWired = false;
let updateCheckUserAsked = false;
function wireUpdater() {
  if (updaterWired || !app.isPackaged) return null;
  const { autoUpdater } = require("electron-updater");
  autoUpdater.on("update-available", (info) => {
    if (!updateCheckUserAsked) return;
    dialog.showMessageBox({
      type: "info",
      message: "Version " + info.version + " is available.",
      detail: "It is downloading in the background; you will be asked to " +
        "restart when it is ready.",
    });
  });
  autoUpdater.on("update-not-available", () => {
    if (!updateCheckUserAsked) return;
    updateCheckUserAsked = false;
    dialog.showMessageBox({
      type: "info",
      message: "You're up to date.",
      detail: "Pandion Plots " + app.getVersion() +
        " is the newest version.",
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    updateCheckUserAsked = false;
    const choice = dialog.showMessageBoxSync({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: "Version " + info.version + " is ready to install.",
      detail: "Your work is autosaved; the update installs when the app " +
        "restarts.",
    });
    if (choice === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (err) => {
    if (!updateCheckUserAsked) return;
    updateCheckUserAsked = false;
    dialog.showMessageBox({
      type: "warning",
      message: "Could not check for updates.",
      detail: String((err && err.message) || err) +
        "\n\nThe current version keeps working; try again later or " +
        "download the newest installer from " + SITE + "/download.html",
    });
  });
  updaterWired = true;
  return autoUpdater;
}
function checkForUpdates(userAsked) {
  const updater = wireUpdater();
  if (!updater) return;
  updateCheckUserAsked = !!userAsked;
  updater.checkForUpdates().catch(() => {
    // The error event above already handled user-facing reporting.
  });
}

function appHtmlPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "pandion-plots.html")
    : path.join(__dirname, "..", "dist", "pandion-plots.html");
}

// ---- OS-opened project files (.pand double-click / Open With) ----
// The installer registers the .pand association (build.fileAssociations);
// this is the ingestion half. Main reads the bytes (the sandboxed renderer
// has no fs) and sends {name, bytes} to the preload bridge, which buffers
// until the shell registers its consumer - so a file that arrives DURING
// launch is held here until did-finish-load, and held there until the
// shell boots. The shell then routes it through the SAME loader as a
// drag-drop, so validation and error copy are identical by construction.
const PENDING_OPEN = [];
function openFileFromOS(p) {
  if (!/\.(pand|pnd|pandion)$/i.test(p)) return;
  let bytes;
  try {
    bytes = fs.readFileSync(p);
  } catch (err) {
    dialog.showErrorBox(
      "Could not open file",
      p + "\n\n" + String((err && err.message) || err)
    );
    return;
  }
  const msg = { name: path.basename(p), bytes };
  const w = BrowserWindow.getAllWindows()[0];
  if (w && !w.webContents.isLoading()) w.webContents.send("ps-open-file", msg);
  else PENDING_OPEN.push(msg);
}
function argvProjectFiles(argv, cwd) {
  // Heuristic shared by first launch and second-instance: any argument
  // that names an existing project file. Switches and the dev-mode "."
  // fail the extension test and fall away.
  return argv
    .slice(1)
    .filter((a) => /\.(pand|pnd|pandion)$/i.test(a))
    .map((a) => path.resolve(cwd || process.cwd(), a))
    .filter((a) => fs.existsSync(a));
}

// macOS delivers opened files as an event, possibly before ready - the
// listener must exist from the first tick.
app.on("open-file", (event, p) => {
  event.preventDefault();
  openFileFromOS(p);
});

// Probes (or any parallel test profile) point userData elsewhere. Without
// this, a probe instance shares the user's real profile: it would yield to
// their live session (the single-instance lock is per-profile) and write
// probe state into their real autosave.
if (process.env.PS_DESKTOP_USERDATA) {
  app.setPath("userData", process.env.PS_DESKTOP_USERDATA);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (event, argv, cwd) => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
    // Windows/Linux: double-clicking a .pand while the app runs launches a
    // second process whose argv carries the path; it lands here.
    for (const f of argvProjectFiles(argv, cwd)) openFileFromOS(f);
  });

  app.whenReady().then(() => {
    if (process.platform === "darwin") {
      app.setAboutPanelOptions({
        applicationName: "Pandion Plots",
        applicationVersion: app.getVersion(),
        website: SITE,
      });
    }
    buildMenu();
    createWindow();
    // Quiet startup check (packaged only; a no-op in dev runs).
    checkForUpdates(false);
    // Windows/Linux first launch by double-click: the path rides argv.
    if (process.platform !== "darwin") {
      for (const f of argvProjectFiles(process.argv)) openFileFromOS(f);
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: "Pandion Plots",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      additionalArguments: ["--ps-desktop-version=" + app.getVersion()],
    },
  });

  // 1. External links to the system browser; never a child window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    // The app is a single file:// page; any navigation away is a link
    // that should open outside (or nothing at all).
    if (!url.startsWith("file:")) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // 2. The unsaved-work guard, in the app's own honest terms: the shell
  // prevents unload ONLY when autosave is broken and closing really would
  // lose work, so this dialog is rare by construction. "Stay" is the
  // default; preventing the event here means "let the close proceed".
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Stay", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
      message: "This project has changes that are not saved anywhere.",
      detail:
        "Autosave is not working right now, so closing discards the " +
        "unsaved changes. Use File > Save project first to keep them.",
    });
    if (choice === 1) event.preventDefault();
  });

  win.webContents.on("did-finish-load", () => {
    while (PENDING_OPEN.length) {
      win.webContents.send("ps-open-file", PENDING_OPEN.shift());
    }
  });

  const html = appHtmlPath();
  if (!fs.existsSync(html)) {
    // A checkout without the built artifact: say exactly how to make one
    // rather than showing a blank window.
    dialog.showErrorBox(
      "Pandion Plots build missing",
      "Could not find " + html + "\n\n" +
        "Run: bash standalone/build-dist.sh\n" +
        "then start the desktop app again."
    );
    app.quit();
    return;
  }
  win.loadFile(html);
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  // No OS File menu on purpose: the app's own always-visible menubar is
  // its File UI, and its Cmd/Ctrl+S / O / N shortcuts reach the page
  // because nothing here registers those accelerators. Edit roles are
  // required for clipboard shortcuts on macOS; View deliberately omits
  // Chromium page zoom, which would fight the app's own View zoom model.
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        // NOT the bare paste role: the menu accelerator consumes Cmd+V
        // before the page ever sees it, and webContents.paste() serves
        // only EDITABLE elements - so pasting into the (non-editable)
        // data grid was structurally dead in the desktop app (Torry,
        // Jul 29 2026: "I actually have to double-click on it before I
        // can paste"). This item pastes into text fields exactly as the
        // role did, AND relays to the shell, which handles the grid case
        // itself through its ordinary paste parser.
        {
          id: "ps-paste",
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          click: (item, win) => {
            if (!win) return;
            win.webContents.paste();
            win.webContents.send("ps-menu-paste");
          },
        },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        ...(app.isPackaged
          ? [
              {
                label: "Check for Updates…",
                click: () => checkForUpdates(true),
              },
              { type: "separator" },
            ]
          : []),
        {
          label: "Pandion Plots Website",
          click: () => shell.openExternal(SITE),
        },
        {
          label: "Report a Problem",
          click: () => shell.openExternal(SITE + "/support.html"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
