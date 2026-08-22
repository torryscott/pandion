#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: scripts/verify-jmo.sh <pandion.jmo> <x.y.z>" >&2
}

[[ $# -eq 2 ]] || { usage; exit 2; }
jmo="$1"
version="${2#v}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "Invalid release version: $version" >&2
    exit 2
}
[[ -f "$jmo" ]] || { echo "JMO not found: $jmo" >&2; exit 1; }
command -v unzip >/dev/null || { echo "unzip is required" >&2; exit 1; }
# grep, not ripgrep: this runs on GitHub's macOS and Windows runners,
# which ship neither rg nor a way to assume one. -F on the required-member
# check also stops a literal path's dots matching any character.

entries="$(unzip -Z1 "$jmo")"
if grep -qE '(^/|(^|/)\.\.(/|$))' <<<"$entries"; then
    echo "Unsafe absolute or parent path in $jmo" >&2
    exit 1
fi
for required in \
    pandion/jamovi.yaml \
    pandion/R/pandion/DESCRIPTION \
    pandion/R/pandion/widget/graphbuilder2.js \
    pandion/R/pandion/widget/graphbuilder2.min.js \
    pandion/R/pandion/widget/graphbuilder2.min.js.hash \
    pandion/R/pandion/docs/user-guide.html; do
    grep -qxF "$required" <<<"$entries" || {
        echo "Required package member missing: $required" >&2
        exit 1
    }
done

manifest="$(unzip -p "$jmo" pandion/jamovi.yaml)"
grep -qE "^version:[[:space:]]*${version}[[:space:]]*$" <<<"$manifest" || {
    echo "pandion/jamovi.yaml does not declare version $version" >&2
    exit 1
}
description="$(unzip -p "$jmo" pandion/R/pandion/DESCRIPTION)"
grep -qE "^Version:[[:space:]]*${version}[[:space:]]*$" <<<"$description" || {
    echo "Packaged R DESCRIPTION does not declare version $version" >&2
    exit 1
}

if grep -qiE '(^|/)(\.env($|\.)|credentials\.json$|secrets\.json$|id_(rsa|ed25519)$|[^/]+\.(pem|key|p12|pfx)$)' \
    <<<"$entries"; then
    echo "Credential-like file packaged in $jmo" >&2
    exit 1
fi

probe_dir="$(mktemp -d)"
trap 'rm -rf "$probe_dir"' EXIT
unzip -p "$jmo" pandion/R/pandion/widget/graphbuilder2.js \
    > "$probe_dir/graphbuilder2.js"
unzip -p "$jmo" pandion/R/pandion/widget/graphbuilder2.min.js \
    > "$probe_dir/graphbuilder2.min.js"
unzip -p "$jmo" pandion/R/pandion/widget/graphbuilder2.min.js.hash \
    > "$probe_dir/graphbuilder2.min.js.hash"
if command -v md5 >/dev/null 2>&1; then
    source_hash="$(md5 -q "$probe_dir/graphbuilder2.js")"
else
    source_hash="$(md5sum "$probe_dir/graphbuilder2.js" | awk '{print $1}')"
fi
recorded_hash="$(tr -d '[:space:]' < "$probe_dir/graphbuilder2.min.js.hash")"
[[ "$source_hash" == "$recorded_hash" ]] || {
    echo "Packaged minified widget hash is stale for its packaged source" >&2
    exit 1
}
node --check "$probe_dir/graphbuilder2.min.js"

echo "JMO VERIFY PASS ($jmo, version $version)"
