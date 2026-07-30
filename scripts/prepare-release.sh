#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  scripts/prepare-release.sh <x.y.z> [options]

Options:
  --skip-tests       Build artifacts without the browser/R verification suites.
  --skip-jmo         Do not build the local-platform Jamovi package.
  --skip-templates   Do not regenerate standalone payload templates.
  --output DIR       Prepared bundle directory (default: .release/v<x.y.z>).

This command never commits, tags, pushes, publishes, or side-loads into jamovi.
It requires a clean working tree and versions already synchronized with:

  node scripts/release-version.mjs set <x.y.z>

If a build changes committed generated files, preparation stops so those
changes can be reviewed and committed before the command is run again.
EOF
}

[[ $# -ge 1 ]] || { usage; exit 2; }
version="${1#v}"
shift
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "Release version must be numeric x.y.z: $version" >&2
    exit 2
}

skip_tests="false"
skip_jmo="false"
skip_templates="false"
output=".release/v${version}"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-tests) skip_tests="true" ;;
        --skip-jmo) skip_jmo="true" ;;
        --skip-templates) skip_templates="true" ;;
        --output)
            shift
            [[ $# -gt 0 ]] || { echo "--output requires a directory" >&2; exit 2; }
            output="$1"
            ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unexpected argument: $1" >&2; usage; exit 2 ;;
    esac
    shift
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
branch="$(git branch --show-current)"
[[ -n "$branch" ]] || {
    echo "Release preparation requires a branch, not detached HEAD." >&2
    exit 1
}

dirty="$(git status --porcelain --untracked-files=normal)"
[[ -z "$dirty" ]] || {
    echo "Release preparation requires a clean working tree." >&2
    echo "Commit or remove the following changes, then rerun:" >&2
    printf '%s\n' "$dirty" >&2
    exit 1
}
if git rev-parse -q --verify "refs/tags/v${version}" >/dev/null; then
    echo "Tag v${version} already exists locally." >&2
    exit 1
fi
if [[ -e "$output" ]]; then
    echo "Prepared output already exists: $output" >&2
    echo "Choose a different --output path or remove the old generated bundle." >&2
    exit 1
fi

for command_name in node Rscript unzip; do
    command -v "$command_name" >/dev/null || {
        echo "$command_name is required for release preparation." >&2
        exit 1
    }
done

echo "== release source contract"
echo "version: $version"
echo "branch:  $branch"
echo "commit:  $(git rev-parse --short HEAD)"
node scripts/release-version.mjs check "$version"

echo "== verify committed minified shared engine"
bash scripts/minify-widget.sh --check

if [[ "$skip_templates" == "false" ]]; then
    echo "== regenerate standalone payload templates"
    Rscript standalone/build-templates.R
fi

echo "== build portable standalone"
bash standalone/build-dist.sh
echo "== build hosted website artifacts"
bash website/build.sh
echo "== verify generated artifact parity"
node standalone/verify/artifact-parity-check.mjs

# Generated public files are committed deliberately. A release prepared from a
# tree that silently changed during its own build is not reproducible from HEAD.
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Release builds changed committed files." >&2
    echo "Review and commit these deterministic updates, then rerun preparation:" >&2
    git status --short >&2
    exit 1
fi

gates=(version-contract artifact-parity clean-generated-tree)
if [[ "$skip_templates" == "false" ]]; then
    gates+=(templates-regenerated)
else
    gates+=(templates-skipped)
fi

if [[ "$skip_tests" == "false" ]]; then
    echo "== verify shared Jamovi/standalone engine (minified bundle)"
    verify_out="${TMPDIR:-/tmp}/pandion-release-v${version}-min"
    GB2_VERIFY_OUT="$verify_out" scripts/verify/run.sh --min

    echo "== verify standalone source and packaged single file"
    PS_REQUIRE_R_PARITY=1 bash standalone/verify/run.sh
    echo "== verify rendered website and user-guide interactions"
    node website/verify-interactions.mjs
    node website/verify-image-alternatives.mjs
    node website/verify-reflow.mjs
    node website/verify-axe.mjs
    node standalone/verify/artifact-parity-check.mjs
    gates+=(shared-engine-min standalone-source-and-dist website-images-interactions-reflow-and-axe)
else
    echo "WARN: browser/R verification suites skipped"
    gates+=(tests-skipped)
fi

jmo=""
if [[ "$skip_jmo" == "false" ]]; then
    echo "== build Jamovi package without side-loading"
    bash scripts/jmv-build-install.sh --build-only
    jmo="pandion_${version}.jmo"
    [[ -f "$jmo" ]] || {
        echo "Expected Jamovi package not produced: $jmo" >&2
        exit 1
    }
    bash scripts/verify-jmo.sh "$jmo" "$version"
    gates+=(jmo-build jmo-contents)
else
    echo "WARN: local-platform Jamovi package skipped"
    gates+=(jmo-skipped)
fi

mkdir -p "$output"
cp standalone/dist/pandion-plots.html "$output/pandion-plots.html"

if [[ -n "$jmo" ]]; then
    case "$(uname -s)-$(uname -m)" in
        Darwin-arm64) platform="macos-arm64" ;;
        Darwin-x86_64) platform="macos-x64" ;;
        Linux-x86_64) platform="linux-x64" ;;
        Linux-aarch64|Linux-arm64) platform="linux-arm64" ;;
        *) platform="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)" ;;
    esac
    cp "$jmo" "$output/pandion-${platform}.jmo"
fi

state_args=()
for gate in "${gates[@]}"; do
    state_args+=(--gate "$gate")
done
node scripts/release-state.mjs create \
    --version "$version" --output "$output" "${state_args[@]}"
node scripts/release-state.mjs check \
    --version "$version" --output "$output"

echo
echo "RELEASE PREPARATION PASS"
echo "Prepared bundle: $output"
echo "Review release.json and SHA256SUMS before publishing."
