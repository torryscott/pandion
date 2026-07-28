#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  scripts/release.sh <x.y.z> [--output DIR] [--message TEXT] [--publish]

Without --publish, this command performs a read-only publication preflight.
With --publish, it creates an annotated tag and atomically pushes the current
branch plus tag. It never edits versions, builds, stages, or commits files.

Required preparation:
  node scripts/release-version.mjs set <x.y.z>
  # review and commit the version/generated-file changes
  scripts/prepare-release.sh <x.y.z>
  scripts/release.sh <x.y.z>             # read-only preflight
  scripts/release.sh <x.y.z> --publish   # explicit publication
EOF
}

[[ $# -ge 1 ]] || { usage; exit 2; }
version="${1#v}"
shift
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "Release version must be numeric x.y.z: $version" >&2
    exit 2
}

output=".release/v${version}"
message="release: v${version}"
publish="false"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)
            shift
            [[ $# -gt 0 ]] || { echo "--output requires a directory" >&2; exit 2; }
            output="$1"
            ;;
        --message)
            shift
            [[ $# -gt 0 ]] || { echo "--message requires text" >&2; exit 2; }
            message="$1"
            ;;
        --publish) publish="true" ;;
        --dry-run) publish="false" ;; # Backward-compatible safe behavior.
        -h|--help) usage; exit 0 ;;
        *) echo "Unexpected argument: $1" >&2; usage; exit 2 ;;
    esac
    shift
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
branch="$(git branch --show-current)"
[[ -n "$branch" ]] || {
    echo "Publishing requires a branch, not detached HEAD." >&2
    exit 1
}
dirty="$(git status --porcelain --untracked-files=normal)"
[[ -z "$dirty" ]] || {
    echo "Publishing requires a clean working tree:" >&2
    printf '%s\n' "$dirty" >&2
    exit 1
}
git remote get-url origin >/dev/null 2>&1 || {
    echo "The origin remote is not configured." >&2
    exit 1
}

echo "== publication source contract"
node scripts/release-version.mjs check "$version"

echo "== verified preparation receipt"
node scripts/release-state.mjs check --version "$version" --output "$output" \
    --require-gate version-contract \
    --require-gate artifact-parity \
    --require-gate clean-generated-tree \
    --require-gate templates-regenerated \
    --require-gate shared-engine-min \
    --require-gate standalone-source-and-dist \
    --require-gate jmo-build \
    --require-gate jmo-contents

tag="v${version}"
head="$(git rev-parse HEAD)"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    tag_head="$(git rev-list -n 1 "$tag")"
    [[ "$tag_head" == "$head" ]] || {
        echo "Local tag $tag points to $tag_head, not HEAD $head." >&2
        exit 1
    }
fi
if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
    echo "Remote tag $tag already exists; refusing to republish." >&2
    exit 1
fi

echo
echo "PUBLICATION PREFLIGHT PASS"
echo "branch:   $branch"
echo "commit:   $head"
echo "tag:      $tag"
echo "artifacts: $output"

if [[ "$publish" != "true" ]]; then
    echo
    echo "No tag or push performed."
    echo "After reviewing the receipt and checksums, rerun with --publish."
    exit 0
fi

if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    git tag -a "$tag" -m "$message"
fi
git push --atomic origin HEAD "refs/tags/$tag"

echo "PUBLISHED $tag"
echo "GitHub Actions will build and attach the platform release artifacts."
