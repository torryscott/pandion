#!/usr/bin/env bash
# Required accessibility evidence for the current source and built delivery
# artifacts. Build standalone + website first. No installations or publishing.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ "${PS_PDF_BASELINE:-0}" != "0" ]]; then
    echo "ERROR: PDF capture-only mode cannot be used for release verification." >&2
    exit 2
fi
evidence_root="${PS_A11Y_OUT:-planning/accessibility-release}"
mkdir -p "$evidence_root"
evidence_root="$(cd "$evidence_root" && pwd)"
exec > >(tee "$evidence_root/run.log") 2>&1

node scripts/verify/accessibility-policy-check.mjs
node standalone/verify/artifact-parity-check.mjs

for surface in source portable hosted; do
    case "$surface" in
        source) app_page=standalone/index.html ;;
        portable) app_page=standalone/dist/pandion-plots.html ;;
        hosted) app_page=website/app/index.html ;;
    esac
    export PS_A11Y_OUT="$evidence_root/$surface"
    export PS_PAGE="$app_page"
    echo "== accessibility: $surface"
    node standalone/verify/axe-state-check.mjs
    node standalone/verify/chart-accessibility-check.mjs
    node standalone/verify/setting-search-accessibility-check.mjs
    node standalone/verify/reflow-accessibility-check.mjs
    node standalone/verify/export-accessibility-check.mjs
    PS_PDF_OUT="$PS_A11Y_OUT/pdf" node standalone/verify/pdf-accessibility-check.mjs
done
unset PS_PAGE

PS_A11Y_OUT="$evidence_root/website" node website/verify-axe.mjs

for bundle in source min; do
    host_out="$evidence_root/host-$bundle"
    GB2_INLINE_BUNDLE=1 GB2_VERIFY_OUT="$host_out" GB2_BUNDLE="$bundle" \
        Rscript scripts/verify/render.R
    GB2_VERIFY_OUT="$host_out" Rscript -e 'source("R/helpmechoose_wizard.R"); writeLines(helpmechoose_html(), file.path(Sys.getenv("GB2_VERIFY_OUT"), "wizard_a11y.html"), useBytes=TRUE)'
    PS_A11Y_OUT="$host_out" GB2_VERIFY_OUT="$host_out" node scripts/verify/a11y-check.mjs
done
echo "ACCESSIBILITY RELEASE GATE: AUTOMATED CHECKS PASS"
echo "Review the open items in $evidence_root; this is not conformance acceptance."
