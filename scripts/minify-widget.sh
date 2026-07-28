#!/usr/bin/env bash
# Build a minified copy of inst/widget/graphbuilder2.js using terser.
# The minified file (inst/widget/graphbuilder2.min.js) is preferred by
# R/widget.R when present — original stays for development /
# debugging. Run this whenever graphbuilder2.js changes. Release preparation
# and CI use --check, so they fail on a stale committed bundle instead of
# downloading tooling or silently rewriting reviewed source. The exact Terser
# version is pinned below so intentional local rebuilds use one compiler.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

SRC="inst/widget/graphbuilder2.js"
DST="inst/widget/graphbuilder2.min.js"
TERSER_VERSION="5.49.0"
HASH_FILE="${DST}.hash"
mode="build"
if [[ $# -gt 1 ]]; then
    echo "Usage: scripts/minify-widget.sh [--check]" >&2
    exit 2
elif [[ $# -eq 1 ]]; then
    [[ "$1" == "--check" ]] || {
        echo "Usage: scripts/minify-widget.sh [--check]" >&2
        exit 2
    }
    mode="check"
fi

if [[ ! -f "$SRC" ]]; then
    echo "Error: $SRC not found" >&2
    exit 1
fi

if command -v md5 >/dev/null 2>&1; then
    src_hash=$(md5 -q "$SRC")
elif command -v md5sum >/dev/null 2>&1; then
    src_hash=$(md5sum "$SRC" | awk '{print $1}')
else
    echo "Error: md5 or md5sum is required." >&2
    exit 1
fi

if [[ "$mode" == "check" ]]; then
    [[ -s "$DST" ]] || {
        echo "Error: $DST is missing or empty; rebuild it before release." >&2
        exit 1
    }
    [[ -f "$HASH_FILE" ]] || {
        echo "Error: $HASH_FILE is missing; rebuild the minified bundle." >&2
        exit 1
    }
    recorded_hash="$(tr -d '[:space:]' < "$HASH_FILE")"
    [[ "$recorded_hash" == "$src_hash" ]] || {
        echo "Error: $DST is stale for $SRC." >&2
        echo "Run bash scripts/minify-widget.sh, review the diff, and commit it." >&2
        exit 1
    }
    node --check "$DST"
    echo "MINIFIED WIDGET CHECK PASS ($src_hash)"
    exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
    echo "Error: npx (Node.js) not on PATH. Install Node and try again." >&2
    exit 1
fi

echo "Minifying $SRC -> $DST"
# --compress = dead code removal, constant folding, etc.
# --mangle   = rename local vars to short names
# Both are safe for IIFE-wrapped code with no external API beyond
# window.GraphBuilder2 (which we tell terser to keep).
# __gb2_* properties are intentionally shared through window and are
# sometimes addressed dynamically (window[key]). Property-mangling can
# see the dot-form references but cannot rewrite those runtime strings,
# which breaks tab/strip navigation in the production bundle. Keep that
# small public-to-the-widget namespace stable; continue shortening other
# private underscore properties.
npx --yes "terser@$TERSER_VERSION" "$SRC" \
    --compress \
    --mangle \
    --mangle-props "regex=/^_(?!_gb2_|.*GraphBuilder2)/" \
    --output "$DST" \
    --comments false 2>&1 | sed 's/^/  /' || {
        # If --mangle-props proves too aggressive (some _foo names
        # are referenced by string elsewhere), fall back to a
        # safer pass without prop-mangling.
        echo "  prop-mangle pass failed; retrying without --mangle-props"
        npx --yes "terser@$TERSER_VERSION" "$SRC" \
            --compress \
            --mangle \
            --output "$DST" \
            --comments false
    }

orig_bytes=$(wc -c < "$SRC")
min_bytes=$(wc -c < "$DST")
ratio=$(awk -v o="$orig_bytes" -v m="$min_bytes" 'BEGIN { printf "%.1f", (1 - m/o) * 100 }')

orig_kb=$(awk -v b="$orig_bytes" 'BEGIN { printf "%.0f", b/1024 }')
min_kb=$(awk -v b="$min_bytes" 'BEGIN { printf "%.0f", b/1024 }')

echo "Original: ${orig_kb} KB"
echo "Minified: ${min_kb} KB  (-${ratio}%)"

# Sidecar hash file so R/widget.R can detect a stale .min.js at
# runtime — it computes the source's MD5 each load and compares
# against the value we write here (the source's MD5 as of the
# most recent minify). When they don't match, the minified bundle
# is out of date (i.e. someone edited graphbuilder2.js without
# re-running this script) and widget.R falls back to the
# un-minified source automatically. Keeps dev iteration painless:
# just edit + `jmvtools::install()`, no need to remember to
# minify each time.
echo "$src_hash" > "$HASH_FILE"
echo "Source hash: $src_hash → $HASH_FILE"
