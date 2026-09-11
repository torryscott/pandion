#!/usr/bin/env bash
# Mandatory ANOVA references and delivery paths; no dependency-failure skips.
# Requires the current portable artifact (standalone/build-dist.sh), R car,
# jmvcore/R6/jsonlite, Python scipy, Node acorn and Playwright/Chromium.
set -euo pipefail
cd "$(dirname "$0")/../.."
ANOVA_OUT="${PS_ANOVA_VERIFY_OUT:-/tmp/pandion-anova}"
mkdir -p "$ANOVA_OUT"
Rscript standalone/verify/anova-reference.R "$ANOVA_OUT/reference.json"
python3 standalone/verify/anova-precision.py "$ANOVA_OUT/reference.json" "$ANOVA_OUT/precision.json"
node standalone/verify/anova-package-check.mjs "$ANOVA_OUT/reference.json" "$ANOVA_OUT/precision.json" --guard-selftest
Rscript standalone/verify/anova-host.R "$ANOVA_OUT/reference.json" "$ANOVA_OUT/host"
for bundle in source min; do
    PS_ANOVA_BUNDLE="$bundle" PS_ANOVA_OUT="$ANOVA_OUT/standalone-$bundle.json" \
        node standalone/verify/anova-package-check.mjs "$ANOVA_OUT/reference.json" "$ANOVA_OUT/precision.json"
    PS_ANOVA_BUNDLE="$bundle" PS_ANOVA_HOST_DIR="$ANOVA_OUT/host" PS_ANOVA_OUT="$ANOVA_OUT/rhost-$bundle.json" \
        node standalone/verify/anova-package-check.mjs "$ANOVA_OUT/reference.json" "$ANOVA_OUT/precision.json"
done
PS_PAGE=standalone/dist/pandion-plots.html PS_ANOVA_OUT="$ANOVA_OUT/portable.json" \
    node standalone/verify/anova-package-check.mjs "$ANOVA_OUT/reference.json" "$ANOVA_OUT/precision.json"
echo 'ANOVA DELIVERY GATE PASS (75 designs in 5 paths)'
