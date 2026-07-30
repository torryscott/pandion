# Pandion Plots desktop (Electron)

A thin native window around the SAME single-file build every other channel
ships. The packaged app contains `standalone/dist/pandion-plots.html`
verbatim, so the desktop app, the portable download, and the hosted app are
one tested artifact in three wrappers.

**Always run `bash standalone/build-dist.sh` before starting or packaging** -
the desktop app loads the built file, not the source tree, and packaging a
stale dist ships stale bytes.

## Develop

```
cd standalone/electron
npm install
npm start
```

`standalone/verify/electron-check.mjs` (wired into the suite; it skips with
exit 2 when `node_modules/electron` is absent) launches the real app and
asserts boot, chart draw from the packaged artifact, external links routed
to the system browser with no child window, the close guard wiring, and
which save-dialog path the shell will take.

## What main.js owns (and what it deliberately does not)

- External links: the shell uses `window.open(url, "_blank", "noopener")`;
  main routes those to the system browser and denies the child window.
- `.pand` file association: `build.fileAssociations` registers the type
  (macOS `CFBundleDocumentTypes` / Windows registry via NSIS); main reads an
  OS-opened file's bytes and relays `{name, bytes}` through the preload
  bridge, which buffers until the shell boots; the shell feeds it to the
  SAME loader as a drag-drop. `PS_DESKTOP_USERDATA` isolates probe profiles
  from a real session (the single-instance lock is per-profile).
- Unsaved-work close guard: the shell's `beforeunload` fires only when
  autosave is failing AND the project has unsaved changes; main translates
  that into a native Stay / Close-anyway sheet.
- Single instance: a second launch focuses the first window (two windows
  would race one localStorage autosave).
- NO file-dialog bridge: `window.showSaveFilePicker` (the shell's preferred
  save path) and `<input type=file>` (its open path) already show OS-native
  dialogs inside Electron, and the download-anchor fallback hits Electron's
  default download behavior, which is also the OS save dialog. Decision:
  Torry, Jul 28 2026 ("native file dialogs, if that's not too much
  trouble") - it was no trouble because it required no code.
- NO OS File menu: the app's own always-visible menubar is its File UI, and
  because nothing registers Cmd/Ctrl+S / O / N as menu accelerators, those
  shortcuts reach the page handler unchanged.
- NO Chromium page zoom in the View menu: it would fight the app's own
  View zoom model (the engine's zoom-aware geometry work).

## Package

### macOS (signed + notarized)

Needs a Developer ID Application certificate in the keychain, plus these
environment variables for notarization:

```
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com > App-Specific Passwords
export APPLE_TEAM_ID="XXXXXXXXXX"
cd standalone/electron
npm run dist:mac
```

Produces a universal (Apple silicon + Intel) `.dmg` and `.zip` in `out/`.
electron-builder signs with the Developer ID identity it finds in the
keychain and submits to Apple's notary service; first notarization takes a
few minutes. Without the env vars it signs but skips notarization -
Gatekeeper will then warn on other people's machines, so notarize anything
that leaves this one.

Icon: `buildres/icon.png` (currently the 512 px app icon; a 1024 px master
would render crisper in the Dock and can simply replace the file).

### Windows

```
npm run dist:win
```

Produces an NSIS installer and a portable `.exe` (x64) in `out/`. Building
Windows targets ON macOS works for unsigned output.

Unsigned executables trip SmartScreen ("Windows protected your PC") until
reputation accrues. Cheapest legitimate signing routes, best first:

1. **Azure Trusted Signing** (~$10/month): Microsoft's own service,
   SmartScreen-friendly, supports individual developers (identity
   validation, no company required). electron-builder supports it via the
   `azureSignOptions` config once the account exists.
2. **Certum Open Source Code Signing** (~EUR 70/year + card reader):
   requires the project be open source (it is).
3. **SSL.com eSigner OV** (~$85+/year, cloud signing, per-signing fees can
   add up).

Or launch unsigned and accept the SmartScreen click-through, which the
download page should then honestly describe.

## Release checklist

1. `bash standalone/build-dist.sh` (fresh artifact)
2. `bash standalone/verify/run.sh` green (includes electron-check)
3. `npm run dist:mac` with notarization env set; `npm run dist:win`
4. Drag-install the dmg on this machine, launch, load an example, save a
   .pand, export a PDF - one manual smoke on the SIGNED artifact
5. Publish installers on the website download page alongside the portable
   file (and update its copy to name all four channels)
