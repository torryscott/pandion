#!/bin/bash
# t4-142: the desktop dropper probe runs inside electron itself. Skips
# with exit 2 when the electron binary is not installed (a checkout
# without the desktop channel's node_modules), mirroring the jmvcore
# skip convention.
cd "$(dirname "$0")/.." || exit 1
EL="electron/node_modules/.bin/electron"
if [ ! -x "$EL" ]; then
  echo "eyedrop-electron: electron not installed, skipped"
  exit 2
fi
"$EL" verify/eyedrop-electron-check.js
