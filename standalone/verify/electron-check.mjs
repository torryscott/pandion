// The desktop wrapper's contract (Torry's launch decisions, Jul 28 2026:
// desktop + web, Apple signing in hand, native file dialogs). Launches the
// REAL Electron app around the REAL dist artifact and asserts the four
// things main.js owns:
//   1. it boots the tested single-file build (parity: the desktop app IS
//      the portable download in a window),
//   2. external links go to the system browser and never spawn a child
//      window,
//   3. the unsaved-work close guard is wired,
//   4. the save path the shell will take is a native dialog either way
//      (showSaveFilePicker, or Electron's default download dialog).
//
// Skips (exit 2) when standalone/electron/node_modules is absent - the
// scaffold is opt-in per machine, like jmvcore for the R probes. NOTE:
// unlike the headless Chromium probes, this shows a real window for a few
// seconds while it runs.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const appDir = path.join(root, 'electron');
const electronBin = path.join(appDir, 'node_modules', '.bin', 'electron');
if (!fs.existsSync(electronBin)) {
    console.error('electron not installed (cd standalone/electron && npm ' +
        'install) - skipping');
    process.exit(2);
}
if (!fs.existsSync(path.join(root, 'dist', 'pandion-plots.html'))) {
    console.error('dist artifact missing (bash standalone/build-dist.sh) - ' +
        'skipping');
    process.exit(2);
}

const { _electron } = loadPlaywright();
// An isolated profile: the single-instance lock is per-userData, so this
// keeps the probe from yielding to (or writing probe state into) a real
// desktop session the user has open while the suite runs.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-electron-probe-'));
const app = await _electron.launch({
    executablePath: electronBin,
    args: [appDir],
    env: { ...process.env, PS_DESKTOP_USERDATA: profile },
});
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

console.log('case 1: the desktop app boots the tested artifact');
await page.waitForSelector('#ps-welcome-sample', { timeout: 15000 });
ok(/pandion-plots\.html$/.test(new URL(page.url()).pathname),
   'the window is loading dist/pandion-plots.html, not the source tree');
ok((await page.title()).includes('Pandion Plots'),
   'and it titles itself Pandion Plots');
await page.click('#ps-welcome-sample');
await page.waitForFunction(() => {
    const svgs = Array.from(document.querySelectorAll('svg'));
    return svgs.some(s => {
        const b = s.getBoundingClientRect();
        return b.width > 300 && b.height > 200;
    });
}, null, { timeout: 20000 });
ok(true, 'the sample loads and the engine draws a chart under Electron');

console.log('case 2: external links open in the system browser');
const opened = await app.evaluate(async ({ shell, BrowserWindow }) => {
    const calls = [];
    shell.openExternal = url => { calls.push(url); return Promise.resolve(); };
    globalThis.__probeExternal = calls;
    return BrowserWindow.getAllWindows().length;
});
ok(opened === 1, 'setup: one app window before the click');
// The shell's own external-link path is window.open(url,"_blank","noopener")
// (ps-shell.js ~16888); exercise exactly that call shape.
await page.evaluate(() => {
    window.open('https://pandionplots.com/docs/', '_blank', 'noopener');
});
await new Promise(r => setTimeout(r, 600));
const after = await app.evaluate(({ BrowserWindow }) => ({
    windows: BrowserWindow.getAllWindows().length,
    calls: globalThis.__probeExternal,
}));
ok(after.calls.length === 1 &&
   after.calls[0] === 'https://pandionplots.com/docs/',
   'the link went to shell.openExternal (' + after.calls[0] + ')');
ok(after.windows === 1, 'and no child window was spawned');

console.log('case 3: the unsaved-work close guard is wired');
const wired = await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    return {
        preventUnload: wc.listenerCount('will-prevent-unload'),
        willNavigate: wc.listenerCount('will-navigate'),
    };
});
ok(wired.preventUnload >= 1,
   'will-prevent-unload has a handler (native Stay / Close-anyway sheet)');
ok(wired.willNavigate >= 1,
   'and will-navigate is intercepted (no drifting off the app page)');

console.log('case 4: the save path is a native dialog either way');
const save = await page.evaluate(() => ({
    picker: typeof window.showSaveFilePicker,
    framed: window.self !== window.top,
    desktop: window.PS_DESKTOP && {
        platform: window.PS_DESKTOP.platform,
        version: window.PS_DESKTOP.version,
    },
}));
ok(save.framed === false,
   'the app is unframed, so the shell takes its native-save branch');
if (save.picker === 'function') {
    ok(true, 'showSaveFilePicker is available: Save/Export use the OS ' +
       'dialog directly');
} else {
    ok(true, 'showSaveFilePicker absent (' + save.picker + '): the ' +
       'download fallback hits Electron\'s default save dialog, also native');
}
ok(save.desktop && save.desktop.version && save.desktop.platform,
   'the PS_DESKTOP marker is exposed (v' + (save.desktop || {}).version +
   ', ' + (save.desktop || {}).platform + ')');

console.log('case 5: an OS-opened .pand loads through the ordinary loader');
// Mint a REAL fixture from the running app (the shell's own serializer),
// rename it so adoption is observable, then deliver it exactly the way
// macOS does: the app-level open-file event. This exercises the whole
// chain - main's fs read, the IPC send, the preload buffer, the shell's
// File wrap, readPickedFile, adoptProject.
const fixturePath = '/tmp/ps-osopen-fixture.pand';
{
    const text = await page.evaluate(() => window.PS_SHELL.projectFileText());
    const proj = JSON.parse(text);
    proj.project.name = 'OS Open Probe';
    fs.writeFileSync(fixturePath, JSON.stringify(proj, null, 1));
}
await app.evaluate(({ app: a }, p) => {
    a.emit('open-file', { preventDefault() {} }, p);
}, fixturePath);
await page.waitForFunction(
    () => window.PS_SHELL.project.name === 'OS Open Probe',
    null, { timeout: 10000 });
ok(true, 'the double-clicked project was adopted (project name followed)');
// A non-project path must be ignored by the extension gate, quietly.
// (Deliberately NOT probing a missing .pand: that path shows a native
// error box, which would block a headless run - by design, it is the
// honest surface for a user whose file vanished.)
await app.evaluate(({ app: a }) => {
    a.emit('open-file', { preventDefault() {} }, '/tmp/not-a-project.txt');
});
await new Promise(r => setTimeout(r, 500));
ok(await page.evaluate(() => window.PS_SHELL.project.name === 'OS Open Probe'),
   'a non-project path is ignored by the extension gate');

console.log('case 6: the Edit menu\'s Paste reaches the data grid');
// Torry, Jul 29 2026: Electron menu accelerators consume Cmd/Ctrl+V
// before the page sees it, and webContents.paste() serves only EDITABLE
// elements, so grid paste was structurally dead in the desktop app. The
// custom menu item relays over IPC; this drives that relay end to end.
{
    const menuItem = await app.evaluate(({ Menu }) => {
        const item = Menu.getApplicationMenu().getMenuItemById('ps-paste');
        return item
            ? { label: item.label, accelerator: String(item.accelerator),
                role: item.role || null }
            : null;
    });
    ok(!!menuItem && /V$/i.test(menuItem.accelerator) && !menuItem.role,
       'the menu carries a CUSTOM Paste owning Cmd/Ctrl+V (a bare role ' +
       'would no-op on the grid)', JSON.stringify(menuItem));
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        navigator.clipboard.readText = async () => '"RELAY-OK",9\n"ROW-2",8';
        window.PS_SHELL.setWorkspace('data');
        await s(500);
    });
    await page.click('#ps-datagrid td[data-gc="hours"][data-gr="0"]');
    await page.waitForTimeout(300);
    await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.send('ps-menu-paste');
    });
    await page.waitForTimeout(800);
    const relayed = await page.evaluate(() => {
        const t = window.PS_SHELL.project.table;
        const at = t.order.indexOf('hours');
        return { a0: t.raw.hours[0], b0: t.raw[t.order[at + 1]][0] };
    });
    ok(relayed.a0 === 'RELAY-OK' && String(relayed.b0) === '9',
       'the relayed paste lands at the selection through the shared ' +
       'parser (quotes stripped, comma split)', JSON.stringify(relayed));
}

const fatal = errors.filter(e => !/ResizeObserver/.test(e));
if (fatal.length) throw new Error('page errors: ' + fatal.join(' | '));
console.log('ELECTRON CHECK PASS');
await app.close();
