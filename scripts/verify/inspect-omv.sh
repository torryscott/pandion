#!/usr/bin/env bash
# What did jamovi actually store in a saved .omv?
#
# Under the Svg results element, jamovi harvests each chart to an SVG inside
# the file, and THAT is what a machine without Pandion renders. This unpacks
# them and reports whether each one is the real chart, whether any editing
# chrome leaked in, and whether it came from our own export sanitizer.
#
#   bash scripts/verify/inspect-omv.sh ~/Documents/whatever.omv

set -euo pipefail
OMV="${1:?usage: inspect-omv.sh <file.omv>}"
[ -f "$OMV" ] || { echo "no such file: $OMV" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$OMV" -d "$TMP"

found=0
bad=0
while IFS= read -r svg; do
    found=$((found + 1))
    name="${svg#$TMP/}"
    bytes=$(wc -c < "$svg" | tr -d ' ')
    vb=$( { grep -o 'viewBox="[^"]*"' "$svg" || true; } | head -1 | sed 's/viewBox=//;s/"//g')

    # our sanitizer's fingerprints
    ours=no
    grep -q 'gb2-export-title' "$svg" && ours=yes || true

    # editing chrome that must never be in a saved picture
    chrome=0
    for pat in 'sel-halo' 'inspector-indicator' 'anatomy-' 'stats-link-halo' \
               'hover-highlight' 'draw-capture' 'brightness' 'marquee'; do
        # grep exits 1 on no-match, which set -e would treat as fatal
        n=$( { grep -o "$pat" "$svg" || true; } | wc -l | tr -d ' ')
        chrome=$((chrome + n))
    done

    # would it actually be VISIBLE when jamovi drops it back into the page?
    # (a clone parked off-screen for measurement once shipped its own
    # position:absolute;left:-99999px into every saved file, and the markup
    # looked perfect the whole time)
    offscreen=no
    grep -qE 'left: *-[0-9]{4}|top: *-[0-9]{4}|display: *none|visibility: *hidden' "$svg" && offscreen=yes
    hidden=no
    grep -q 'aria-hidden="true"' "$svg" && hidden=yes

    echo "── $name"
    echo "     size        ${bytes} bytes"
    echo "     viewBox     ${vb:-(none)}"
    echo "     sanitized   ${ours}   (yes = came from our exporter)"
    if [ "$offscreen" = yes ]; then
        echo "     ** OFF-SCREEN or HIDDEN: this will load fine and draw nowhere"
        bad=$((bad + 1))
    fi
    if [ "$hidden" = yes ]; then
        echo "     ** aria-hidden on the root: screen readers will skip the chart"
        bad=$((bad + 1))
    fi
    if [ "$bytes" -lt 2000 ]; then
        echo "     ** SUSPICIOUS: too small to be a chart - probably a toolbar icon"
        bad=$((bad + 1))
    fi
    if [ "$chrome" -gt 0 ]; then
        echo "     ** CHROME LEAKED: ${chrome} matches (selection/hover/overlay)"
        bad=$((bad + 1))
    fi
    if [ "$ours" = "no" ]; then
        echo "     ** NOT SANITIZED: jamovi cloned the live chart directly"
        bad=$((bad + 1))
    fi
done < <(find "$TMP" -name '*.svg' | sort)

echo
if [ "$found" -eq 0 ]; then
    echo "No harvested SVGs found. Either no chart analyses in this file, or the"
    echo "widget items are still type: Html."
elif [ "$bad" -eq 0 ]; then
    echo "OK - ${found} chart(s), all clean, all from our exporter."
else
    echo "${bad} problem(s) across ${found} chart(s) - see the ** lines above."
    exit 1
fi
