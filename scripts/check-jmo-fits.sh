#!/bin/bash
# Checks that a built macOS .jmo will load in the jamovi it was built for.
#
#   bash scripts/check-jmo-fits.sh <file.jmo> <jamovi.app> <platform>
#
# platform is macos-arm64 or macos-x64. jamovi loads a module only when the
# module's rVersion stamp equals its own R build stamp exactly
# (server/jamovi/server/modules/modules.py compares the two strings); any
# other file is listed as "installed version needs to be updated" and its
# analyses never appear. That is what an Intel Mac showed with the
# Apple-chip file (Sep 2026). So this checks three things:
#   1. the file's rVersion equals this jamovi's JAMOVI_R_VERSION (env.conf),
#      and carries the platform's chip suffix;
#   2. the module's one compiled library (rsvg, for PDF export) is built for
#      the platform's chip;
#   3. that jamovi's own R loads rsvg and pandion from the file and renders
#      a small PDF.
set -euo pipefail

JMO="${1:?usage: check-jmo-fits.sh <file.jmo> <jamovi.app> <platform>}"
JHOME="${2:?usage: check-jmo-fits.sh <file.jmo> <jamovi.app> <platform>}"
PLATFORM="${3:?usage: check-jmo-fits.sh <file.jmo> <jamovi.app> <platform>}"

case "$PLATFORM" in
    macos-x64) CHIP=x86_64; SUFFIX=-x64 ;;
    macos-arm64) CHIP=arm64; SUFFIX=-arm64 ;;
    *) echo "ERROR: unknown platform $PLATFORM (macos-arm64 or macos-x64)" >&2; exit 2 ;;
esac

CONF="$JHOME/Contents/Resources/env.conf"
[ -f "$CONF" ] || { echo "ERROR: no env.conf at $CONF" >&2; exit 2; }
WANT="$(sed -n 's/^JAMOVI_R_VERSION=//p' "$CONF" | tr -d '\r')"
GOT="$(unzip -p "$JMO" pandion/jamovi.yaml | sed -n 's/^rVersion:[[:space:]]*//p' | tr -d "\r'\"")"
echo "module rVersion: ${GOT:-none} | this jamovi: ${WANT:-none}"
if [ -z "$WANT" ] || [ "$GOT" != "$WANT" ]; then
    echo "ERROR: jamovi would list this module as needing an update" >&2
    exit 1
fi
case "$GOT" in
    *"$SUFFIX") ;;
    *) echo "ERROR: $GOT is not a $PLATFORM build" >&2; exit 1 ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
unzip -q "$JMO" -d "$WORK"
SO="$WORK/pandion/R/rsvg/libs/rsvg.so"
[ -f "$SO" ] || { echo "ERROR: rsvg.so is not in the module" >&2; exit 1; }
ARCHS="$(lipo -archs "$SO")"
echo "rsvg.so is built for: $ARCHS"
echo "$ARCHS" | tr ' ' '\n' | grep -qx "$CHIP" || {
    echo "ERROR: rsvg.so is not built for $CHIP" >&2; exit 1; }

# jamovi's macOS Rscript carries a compiled-in R home; RHOME points it into
# the app bundle (the same fact the jamovi 28 build step rests on). jmvcore
# lives in jamovi's base-modules library, not on R's default path.
R_RES="$JHOME/Contents/Frameworks/R.framework/Versions/Current/Resources"
export RHOME="$R_RES"
export R_LIBS="$WORK/pandion/R:$JHOME/Contents/Resources/modules/base/R"
"$R_RES/bin/Rscript" --vanilla -e '
  suppressPackageStartupMessages({ library(rsvg); library(pandion) })
  svg <- tempfile(fileext = ".svg"); pdf <- tempfile(fileext = ".pdf")
  writeLines(paste0("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" ",
                    "height=\"20\"><rect width=\"40\" height=\"20\" ",
                    "fill=\"#2d5c94\"/></svg>"), svg)
  rsvg::rsvg_pdf(svg, pdf)
  stopifnot(file.size(pdf) > 200)
  cat("R", R.version$arch, "rendered a", file.size(pdf), "byte PDF; pandion",
      as.character(utils::packageVersion("pandion")), "loads\n")'
echo "OK: $(basename "$JMO") fits this jamovi"
