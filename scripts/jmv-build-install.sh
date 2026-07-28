#!/usr/bin/env bash
# Build pandion's .jmo and side-load it into the local jamovi module dir.
#
# Why not `jmvtools::install()`?  On this machine, jamovi 2.7.32 ships an arm64
# server core (core.cpython-311-darwin.so) that jmvtools drives with an x86_64
# python, so install()'s post-build handoff dies with an "incompatible
# architecture" ImportError ("Failed to start (1)") AND THEN HANGS — the
# Rscript process never returns, which would block any caller (the Stop hook,
# release.sh) indefinitely.
#
# The jamovi-compiler has a `--build` mode that does the IDENTICAL work
# (compile R, install deps against jamovi's bundled R, zip the .jmo) but skips
# the installer.install() server handoff, so it exits cleanly in ~15s. We then
# extract the freshly built .jmo over the module dir ourselves (a running
# jamovi picks it up only on a full restart).
#
# We invoke --build by reusing jmvtools' OWN resolvers (node / jmcPath /
# extraArgs) with the flag swapped from --install to --build, so it adapts if
# jmvtools or the bundled node move, rather than hardcoding their paths.
#
# Usage:
#   scripts/jmv-build-install.sh
#   scripts/jmv-build-install.sh --build-only
# Exit: 0 on a successful build (and, by default, side-load); non-zero
# otherwise. --build-only is the release-preparation path: it creates and
# validates a fresh package without mutating the user's live jamovi modules.

set -uo pipefail

build_only="false"
if [[ $# -gt 1 ]]; then
    echo "Usage: scripts/jmv-build-install.sh [--build-only]" >&2
    exit 2
elif [[ $# -eq 1 ]]; then
    [[ "$1" == "--build-only" ]] || {
        echo "Usage: scripts/jmv-build-install.sh [--build-only]" >&2
        exit 2
    }
    build_only="true"
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))"
cd "$repo_root" || exit 1

# Ship the user guide inside the module: the Basics help tab's "Open the
# user guide" button resolves inst/docs/user-guide.html via system.file()
# (R/widget.R -> payload userGuideUrl). docs/ is the CANONICAL copy;
# inst/docs/ is generated here (and in CI) so the two can never drift,
# and is gitignored. Missing docs/ (e.g. a checkout without the guide)
# just means no button - widget.R omits the payload key.
if [[ -f docs/user-guide.html ]]; then
    mkdir -p inst/docs
    cp -f docs/user-guide.html inst/docs/user-guide.html
    if compgen -G "docs/img/shots/*.png" > /dev/null; then
        mkdir -p inst/docs/img/shots
        cp -f docs/img/shots/*.png inst/docs/img/shots/
    fi
fi

echo "-- jamovi-compiler --build (skips jmvtools' hanging install handoff) --"
build_marker="$(mktemp)"
Rscript -e '
  ns <- getNamespace("jmvtools")
  g  <- function(nm) get(nm, envir = ns)   # inherits=TRUE also resolves imports (node)
  exe   <- g("node")()
  jmc   <- g("jmcPath")()
  xArgs <- g("extraArgs")(NULL, paste0("\"", R.home(component = "bin"), "\""), FALSE)
  quit(status = system2(exe, c(jmc, "--build", "\".\"", xArgs), wait = TRUE))
'
build_rc=$?
if [[ "$build_rc" -ne 0 ]]; then
    rm -f "$build_marker"
    echo "-- build FAILED (rc=$build_rc); module dir left untouched --"
    exit "$build_rc"
fi

moddir="$HOME/Library/Application Support/jamovi/modules/pandion"
jmo="$(find . -maxdepth 1 -name 'pandion_*.jmo' -type f \
    -newer "$build_marker" -print | head -1)"
rm -f "$build_marker"
if [[ -z "$jmo" ]]; then
    echo "-- build reported success but produced no fresh .jmo --"
    exit 1
fi

if [[ "$build_only" == "true" ]]; then
    echo "-- build-only OK: ${jmo#./} --"
    exit 0
fi

echo "-- side-loading $jmo --"
tmpx="$(mktemp -d)"
if unzip -q "$jmo" -d "$tmpx" && [[ -f "$tmpx/pandion/jamovi.yaml" ]]; then
    rm -rf "$moddir"
    mv "$tmpx/pandion" "$moddir"
    touch "$moddir/jamovi.yaml"
    rm -rf "$tmpx"
    echo "-- side-load OK (restart jamovi to pick it up) --"
    exit 0
fi
rm -rf "$tmpx"
echo "-- side-load FAILED (bad/empty extract); module dir left untouched --"
exit 1
