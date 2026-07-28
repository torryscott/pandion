#!/bin/bash
# Standalone Pandion Plots verification: shell probes + feature probes +
# R-parity battery, run on the dev page AND the built single-file dist.
#
# Usage: bash standalone/verify/run.sh
#
# The parity step needs R + jmvcore (it drives the real jamovi marshalling
# to produce expectations); when R is unavailable the shell probes still
# run and the parity step is skipped with a warning.
set -e
cd "$(dirname "$0")/../.."

# Feature probes added by the M4 application-frame work. Each is
# self-contained and honors PS_PAGE (except hardening-dom-check, which
# reads index.html source directly and runs once).
FEATURE_PROBES="branding-check busy-check column-sizing-check \
computed-variables-check coverage-gaps-check \
chart-from-selection-check chart-size-check column-gestures-check chrome-check clipboard-check copy-image-check correctness-check \
data-commandbar-check data-menu-check \
data-undo-check dates-check doclifecycle-check drag-feel-check \
empty-states-check engine-stamp-check flyout-align-check filter-honesty-check examples-check exclusion-bridge-check \
fitpanes-check \
grid-keys-check help-check hierarchy-check \
help-me-choose-check import-errors-check layout-image-check \
layout-arrange-check layout-clipboard-check layout-orientation-check layout-rail-check layout-selectall-check layout-reuse-check layout-undo-check library-bridge-check \
linked-selection-check motion-check narrow-check novice-affordances-check \
overlay-reload-check overlay-restore-check pane-debusy-check percol-missing-check \
perf-check polish-check preferences-check \
probed-bugs-check provenance-check rail-icons-check punchlist-check reachability-check recents-check reshape-check \
row-filters-check \
statusbar-check \
safety-check \
silent-failure-check selection-menus-check spreadsheet-gaps-check teaching-check \
tokens-check tour-check typing-check units-check wizard-parity-check variable-levels-check visuals-check \
xlsx-import-check launch-contract-check"

echo "== m0-check (render + edit round-trip)"
node standalone/verify/m0-check.mjs

echo "== m1-shell-check (import / roles / grid / tabs / layouts / export)"
node standalone/verify/m1-shell-check.mjs

echo "== hardening-dom-check (migration / recovery / quota)"
node standalone/verify/hardening-dom-check.mjs

for p in $FEATURE_PROBES; do
    echo "== $p"
    node "standalone/verify/$p.mjs"
done

echo "== dist build + probes (single-file pandion-plots.html)"
bash standalone/build-dist.sh
echo "== artifact-parity-check (dist / hosted app / portable download)"
node standalone/verify/artifact-parity-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/m0-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/m1-shell-check.mjs
for p in $FEATURE_PROBES; do
    echo "== dist: $p"
    PS_PAGE=standalone/dist/pandion-plots.html node "standalone/verify/$p.mjs"
done

echo "== m1-parity (R expectations)"
if Rscript standalone/verify/m1-parity.R; then
    echo "== m1-parity-check (JS vs R channels)"
    node standalone/verify/m1-parity-check.mjs
else
    if [ "${PS_REQUIRE_R_PARITY:-0}" = "1" ]; then
        echo "ERROR: m1-parity.R is required for a release" >&2
        exit 1
    fi
    echo "WARN: m1-parity.R failed or R/jmvcore unavailable - parity skipped"
fi

# t3-44. Repeated Measures panels have no single R call to compare against
# (the module reaches RM panels through its crossed factor registry, not a
# facetVar role), so the expectation is R's own RM run on each panel's subset.
# t4-18. The level-order divergence is DECIDED (keep first-seen) and pinned
# here, because m1-parity.R declares explicit levels for every factor and is
# structurally incapable of seeing it.
echo "== level-order (R expectations, undeclared factor)"
if Rscript standalone/verify/level-order-render.R; then
    node standalone/verify/level-order-check.mjs
    PS_PAGE=standalone/dist/pandion-plots.html \
        node standalone/verify/level-order-check.mjs
else
    if [ "${PS_REQUIRE_R_PARITY:-0}" = "1" ]; then
        echo "ERROR: level-order-render.R is required for a release" >&2
        exit 1
    fi
    echo "WARN: level-order-render.R failed or R/jmvcore unavailable - skipped"
fi

echo "== rm-panels (R expectations, per panel)"
if Rscript standalone/verify/rm-panels-render.R; then
    echo "== rm-panels-check (JS faceted RM vs R per panel)"
    node standalone/verify/rm-panels-check.mjs
    PS_PAGE=standalone/dist/pandion-plots.html \
        node standalone/verify/rm-panels-check.mjs
else
    if [ "${PS_REQUIRE_R_PARITY:-0}" = "1" ]; then
        echo "ERROR: rm-panels-render.R is required for a release" >&2
        exit 1
    fi
    echo "WARN: rm-panels-render.R failed or R/jmvcore unavailable - skipped"
fi

echo "STANDALONE VERIFY: ALL GREEN"
