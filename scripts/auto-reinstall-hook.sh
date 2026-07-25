#!/usr/bin/env bash
# Stop-hook helper: rebuild + reinstall the pandion jamovi module after
# Claude edits module source, so changes go live in jamovi without a manual
# build. Wired into .claude/settings.local.json as a "Stop" hook.
#
# Self-gates: runs only when something under R/, jamovi/, or inst/widget/
# changed since the last successful install (timestamp marker below), so plain
# conversation turns cost nothing. Always exits 0 so a build hiccup never
# blocks the session; details go to the log file.
#
# The actual build+install is delegated to scripts/jmv-build-install.sh, which
# uses the jamovi-compiler's --build mode plus a manual side-load instead of
# jmvtools::install() — under jamovi 2.7.32 install()'s server handoff dies on
# an arm64/x86_64 mismatch AND HANGS (never returns), which would otherwise
# block this hook forever. See that script's header for the details.

set -uo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))"
cd "$repo_root" || exit 0

marker=".git/.last-jmv-install"
log=".git/.last-jmv-install.log"

# Reinstall only if module source changed since the last install.
if [[ -f "$marker" ]]; then
    changed="$(find R jamovi inst/widget -type f -newer "$marker" -print -quit 2>/dev/null || true)"
else
    changed="first-run"
fi
[[ -z "$changed" ]] && exit 0

{
    echo "=== auto-reinstall $(date) ==="
    echo "trigger: ${changed}"
    # Refresh the minified widget bundle if its source is newer than the
    # bundle (R/widget.R also falls back to source via MD5, so this is
    # belt-and-suspenders).
    if [[ "inst/widget/graphbuilder2.js" -nt "inst/widget/graphbuilder2.min.js" ]]; then
        echo "-- minifying widget bundle --"
        bash scripts/minify-widget.sh || echo "(minify failed; relying on MD5 source fallback)"
    fi
    # Build the .jmo and side-load it into the module dir. This delegates to
    # the shared helper, which uses `jamovi-compiler --build` (no install
    # handoff -> cannot hang the way jmvtools::install() does on 2.7.32).
    if bash scripts/jmv-build-install.sh; then
        touch "$marker"
        echo "-- reinstall OK (restart jamovi to pick it up) --"
    else
        echo "-- reinstall FAILED (see above); marker left so the next turn retries --"
    fi
} >>"$log" 2>&1

exit 0
