#!/usr/bin/env bash
# Render + check the full Graph Builder verification battery.
#
# Usage:  scripts/verify/run.sh [--min] [--extras]
#   --min     verify the minified bundle (default: the source bundle)
#   --extras  after the battery, also run the accessibility audit
#             (axe-core; skipped if not installed), the
#             aggregation-cache behavioral test (needs jmvcore;
#             skipped if missing), the summary-table smoke suites,
#             the pedagogy panel probe (chooser/lint/anatomy/wizard
#             copy + rules), and the listener-leak probe
#
# Env:
#   GB2_VERIFY_OUT  output dir (default /tmp/gb2-verify, or
#                   /tmp/gb2-verify-min with --min)
#   GB2_NODE_BASE   a directory whose node_modules contains playwright
#
# One-time setup for the checker:
#   cd /tmp && npm i playwright axe-core && npx playwright install chromium

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== release pipeline contract"
node "$HERE/release-pipeline-check.mjs"

# The browser battery opens generated fixtures over file://, where jamovi's
# module/<asset> route does not exist. Embed the same bundle for those visual
# fixtures. scriptsrc-probe.R explicitly clears this switch while it verifies
# that real analysis wrappers use script-src by default, then separately
# verifies this rollback path.
export GB2_INLINE_BUNDLE=1

BUNDLE=source
EXTRAS=0
for arg in "$@"; do
    case "$arg" in
        --min)    BUNDLE=min ;;
        --extras) EXTRAS=1 ;;
        *) echo "unknown argument: $arg" >&2; exit 2 ;;
    esac
done
OUT="${GB2_VERIFY_OUT:-}"
if [ -z "$OUT" ]; then
    OUT=/tmp/gb2-verify
    [ "$BUNDLE" = "min" ] && OUT=/tmp/gb2-verify-min
fi

# Find a node_modules that has playwright. ESM `import` ignores
# NODE_PATH, so check.mjs resolves it via createRequire from
# GB2_NODE_BASE (plus its own fallback bases).
if [ -z "${GB2_NODE_BASE:-}" ]; then
    npm_base="$(npm root -g 2>/dev/null || true)"
    [ -n "$npm_base" ] && npm_base="$(dirname "$npm_base")"
    for base in "$HERE/../.." /tmp /private/tmp "$npm_base"; do
        if [ -n "$base" ] && [ -e "$base/node_modules/playwright" ]; then
            export GB2_NODE_BASE="$base"
            break
        fi
    done
fi
if [ -z "${GB2_NODE_BASE:-}" ]; then
    echo "playwright not found; see the one-time setup note at the top of $0" >&2
    exit 2
fi

echo "== render ($BUNDLE bundle) -> $OUT"
GB2_VERIFY_OUT="$OUT" GB2_BUNDLE="$BUNDLE" Rscript "$HERE/render.R"

echo "== check"
GB2_VERIFY_OUT="$OUT" node "$HERE/check.mjs"

echo "== independent-width X/Y axis junction"
GB2_VERIFY_OUT="$OUT" node "$HERE/axis-junction-check.mjs"

echo "== suite-wide centered Cartesian axes + zero ticks"
GB2_VERIFY_OUT="$OUT" node "$HERE/cartesian-axis-check.mjs"

echo "== lower-panel naming + compact-width interactions"
GB2_VERIFY_OUT="$OUT" node "$HERE/naming-check.mjs"

echo "== control consistency (Order / RM nesting / shapes / line styles)"
GB2_VERIFY_OUT="$OUT" node "$HERE/control-consistency-check.mjs"

echo "== color inheritance, reset, picker-target, and swatch parity"
GB2_VERIFY_OUT="$OUT" node "$HERE/color-consistency-check.mjs"

echo "== dimensional control parity (presets / sliders / numeric fields)"
GB2_VERIFY_OUT="$OUT" node "$HERE/dimensional-control-consistency-check.mjs"

echo "== semantic control parity (ranges / units / reset language / order)"
GB2_VERIFY_OUT="$OUT" node "$HERE/semantic-consistency-check.mjs"

echo "== graph-aware Find a setting command palette"
GB2_VERIFY_OUT="$OUT" node "$HERE/setting-search-check.mjs"

echo "== Frequencies lower-panel persistence across chart types"
GB2_VERIFY_OUT="$OUT" node "$HERE/freq-panel-persistence-check.mjs"

echo "== sigma-panel parity (CI / cumulative % / all-pairs / per-level % / copy-to-Word)"
GB2_VERIFY_OUT="$OUT" node "$HERE/sigma-parity-check.mjs"

echo "== undo/redo completeness (generic tracking: edit->undo->redo per module + denylist)"
GB2_VERIFY_OUT="$OUT" node "$HERE/undo-check.mjs"

echo "== hover must not bake into an export (harvest fires each hovered element's leave twin)"
GB2_VERIFY_OUT="$OUT" node "$HERE/hover-export-check.mjs"

echo "== crowded-category label thinning: the stride decision (pure unit)"
node "$HERE/catstride-unit.mjs"

echo "== installed export surface (syntax-mode wrappers stay public)"
if Rscript "$HERE/export-surface-check.R"; then :; else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: module not installed here"; else exit "$rc"; fi
fi

echo "== the snapshot image renders from the option (no duplicate copy in state)"
if Rscript "$HERE/snapshot-render-check.R"; then :; else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: jmvcore or rsvg not available"; else exit "$rc"; fi
fi

echo "== R-side gates survive option values that are not the expected shape"
if Rscript "$HERE/secgate-check.R"; then :; else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: jsonlite not available"; else exit "$rc"; fi
fi

echo "== the left-panel tip is found by its marker, not a copied string"
if Rscript "$HERE/paneltip-check.R"; then :; else exit $?; fi

echo "== the Svg-element handover waits for our switch, not jamovi's schedule"
if GB2_HANDOVER_OUT="$OUT-handover" GB2_BUNDLE="$BUNDLE" Rscript "$HERE/handover-render.R"; then
    GB2_HANDOVER_OUT="$OUT-handover" GB2_BUNDLE="$BUNDLE" node "$HERE/handover-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: jmvcore not available"; else exit "$rc"; fi
fi

echo "== JSON-string stores and annotation ids cannot inject"
if GB2_STOREGATE_OUT="$OUT-storegate" GB2_BUNDLE="$BUNDLE" \
       Rscript "$HERE/storegate-render.R"; then
    GB2_STOREGATE_OUT="$OUT-storegate" GB2_BUNDLE="$BUNDLE" node "$HERE/storegate-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: jmvcore not available"; else exit "$rc"; fi
fi

echo "== saved palette/style libraries cannot inject through a colour"
if GB2_XSS_OUT="$OUT-libgate" R_USER_CONFIG_DIR="$OUT-libgate-cfg" \
       Rscript "$HERE/libgate-poison.R" &&
   GB2_XSS_OUT="$OUT-libgate" R_USER_CONFIG_DIR="$OUT-libgate-cfg" GB2_BUNDLE="$BUNDLE" \
       Rscript "$HERE/libgate-render.R"; then
    GB2_XSS_OUT="$OUT-libgate" GB2_BUNDLE="$BUNDLE" node "$HERE/libgate-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: jmvcore not available"; else exit "$rc"; fi
fi

echo "== colour gate: a shared .omv cannot inject through a colour (pure R)"
if Rscript "$HERE/colorgate-check.R"; then :; else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: jsonlite not available"; else exit "$rc"; fi
fi

echo "== pareto totals survive a category named with the panel separator"
if Rscript "$HERE/facetsep-check.R"; then :; else
    rc=$?
    if [ "$rc" -eq 2 ]; then echo "   skipped: jmvcore not available"; else exit "$rc"; fi
fi

echo "== colour gate, end to end (hostile .omv values through R into the engine)"
if GB2_COLORGATE_OUT="$OUT-colorgate" GB2_BUNDLE="$BUNDLE" Rscript "$HERE/colorgate-render.R"; then
    GB2_COLORGATE_OUT="$OUT-colorgate" GB2_BUNDLE="$BUNDLE" node "$HERE/colorgate-client-check.mjs"
    GB2_COLORGATE_OUT="$OUT-colorgate" GB2_BUNDLE="$BUNDLE" node "$HERE/colorgate-bypass-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "   skipped: jmvcore not available in this R library"
    else
        exit "$rc"
    fi
fi

echo "== chartSpec migration (route style commits -> one blob; explode; per-key undo)"
if GB2_CHARTSPEC_OUT="$OUT-chartspec" GB2_BUNDLE="$BUNDLE" Rscript "$HERE/chartspec-render.R"; then
    GB2_CHARTSPEC_OUT="$OUT-chartspec" node "$HERE/chartspec-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "   skipped: jmvcore not available in this R library"
    else
        exit "$rc"
    fi
fi

echo "== suite-wide script-src contract (all analyses payload-only; cached path parked)"
if Rscript "$HERE/scriptsrc-probe.R"; then
    :
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "   skipped: required R packages or graphbuilder2.min.js not available"
    else
        exit "$rc"
    fi
fi

echo "== engine-boot handshake (placeholder ships+stores bundle -> data render goes cached)"
if GB2_BOOT_OUT="$OUT-boot" Rscript "$HERE/boot-probe.R"; then
    GB2_BOOT_OUT="$OUT-boot" node "$HERE/boot-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "   skipped: jmvcore or graphbuilder2.min.js not available"
    else
        exit "$rc"
    fi
fi

echo "== failure diagnostics (silent-blank self-reporting: no-script / parse-error / render-throw)"
if GB2_DIAG_OUT="$OUT-diag" Rscript "$HERE/diag-probe.R"; then
    GB2_DIAG_OUT="$OUT-diag" node "$HERE/diag-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "   skipped: jmvcore not available"
    else
        exit "$rc"
    fi
fi

echo "== static-snapshot fallback (chartSnapshot: commit -> sanitize -> embed -> module-less reveal)"
if GB2_SNAP_OUT="$OUT-snap" Rscript "$HERE/snapshot-probe.R"; then
    GB2_SNAP_OUT="$OUT-snap" node "$HERE/snapshot-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "   skipped: jmvcore not available"
    else
        exit "$rc"
    fi
fi

echo "== fresh-analysis delivery stability (Group By -> first snapshot -> native Image)"
if GB2_SNAPCHURN_OUT="$OUT-snapchurn" GB2_BUNDLE="$BUNDLE" Rscript "$HERE/snapchurn-render.R"; then
    GB2_SNAPCHURN_OUT="$OUT-snapchurn" node "$HERE/snapchurn-check.mjs"
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "   skipped: jmvcore not available"
    else
        exit "$rc"
    fi
fi

if [ "$EXTRAS" = "1" ]; then
    echo "== extras: accessibility audit (axe-core, WCAG A/AA)"
    # The wizard is not a battery page (helpmechoose has no chart);
    # render it here so the audit covers it too.
    Rscript -e "source('$HERE/../../R/helpmechoose_wizard.R'); con <- file('$OUT/wizard_a11y.html', open='wb'); writeLines(helpmechoose_html(), con, useBytes=TRUE); close(con)"
    if GB2_VERIFY_OUT="$OUT" node "$HERE/a11y-check.mjs"; then
        :
    else
        rc=$?
        if [ "$rc" -eq 2 ]; then
            echo "   skipped: axe-core not installed (cd /tmp && npm i axe-core)"
        else
            exit "$rc"
        fi
    fi
    echo "== extras: aggregation-cache behavioral test"
    if GB2_BUNDLE="$BUNDLE" Rscript "$HERE/aggcache-test.R"; then
        :
    else
        rc=$?
        if [ "$rc" -eq 2 ]; then
            echo "   skipped: jmvcore not available in this R library"
        else
            exit "$rc"
        fi
    fi
    echo "== extras: summary-table smoke suites"
    for t in "$HERE"/summary-smoke-*.R; do
        if Rscript "$t"; then
            :
        else
            rc=$?
            if [ "$rc" -eq 2 ]; then
                echo "   skipped: jmvcore not available in this R library"
                break
            else
                echo "   FAIL: $(basename "$t")"
                exit "$rc"
            fi
        fi
    done
    echo "== extras: pedagogy panel probe"
    if GB2_PEDAGOGY_OUT="$OUT-pedagogy" GB2_BUNDLE="$BUNDLE" Rscript "$HERE/pedagogy-render.R"; then
        GB2_PEDAGOGY_OUT="$OUT-pedagogy" node "$HERE/pedagogy-check.mjs"
    else
        rc=$?
        if [ "$rc" -eq 2 ]; then
            echo "   skipped: jmvcore not available in this R library"
        else
            exit "$rc"
        fi
    fi
    echo "== extras: glossary accuracy contract"
    node "$HERE/glossary-audit.mjs"
    echo "== extras: stats-suite probe (brackets + Sigma panel, ~240 checks)"
    if Rscript "$HERE/stats-probe.R" > /dev/null; then
        node "$HERE/stats-probe.mjs"
    else
        rc=$?
        if [ "$rc" -eq 2 ]; then
            echo "   skipped: jmvcore not available in this R library"
        else
            exit "$rc"
        fi
    fi
    echo "== extras: chart-styles library probe"
    GB2_VERIFY_OUT="$OUT" node "$HERE/styles-check.mjs"
    echo "== extras: Small Wins fix probe (corr count, sort, labels)"
    GB2_VERIFY_OUT="$OUT" node "$HERE/smallwins-check.mjs"
    echo "== extras: missing-data note smoke"
    if Rscript "$HERE/smallwins-missing-note.R"; then
        :
    else
        rc=$?
        if [ "$rc" -eq 2 ]; then
            echo "   skipped: jmvcore not available in this R library"
        else
            exit "$rc"
        fi
    fi
    echo "== extras: listener-leak probe"
    GB2_VERIFY_OUT="$OUT" GB2_BUNDLE="$BUNDLE" Rscript "$HERE/leak-probe.R"
    GB2_VERIFY_OUT="$OUT" node "$HERE/check-extras.mjs"
fi
