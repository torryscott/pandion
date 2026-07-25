#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/release.sh <version> [commit-message] [--dry-run] [--skip-build]

Examples:
  scripts/release.sh 1.0.10
  scripts/release.sh v1.0.10 "release: v1.0.10"
  scripts/release.sh 1.0.10 --dry-run
  scripts/release.sh 1.0.10 --skip-build

Behavior:
  1) Optionally runs module build/install (scripts/jmv-build-install.sh: jamovi-compiler --build + side-load)
  2) Commits all current changes (if any)
  3) Creates annotated git tag (v<version>)
  4) Pushes current branch and tag to origin

Notes:
  - Requires git auth already configured for origin.
  - Tag push triggers GitHub Actions release workflows configured on v* tags.
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

version=""
commit_msg=""
dry_run="false"
skip_build="false"

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      dry_run="true"
      ;;
    --skip-build)
      skip_build="true"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$version" ]]; then
        version="$arg"
      elif [[ -z "$commit_msg" ]]; then
        commit_msg="$arg"
      else
        echo "Unexpected argument: $arg" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$version" ]]; then
  echo "Version is required." >&2
  usage
  exit 1
fi

if [[ "$version" == v* ]]; then
  tag="$version"
  bare_version="${version#v}"
else
  tag="v$version"
  bare_version="$version"
fi

if [[ -z "$commit_msg" ]]; then
  commit_msg="release: $tag"
fi

run() {
  if [[ "$dry_run" == "true" ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    eval "$@"
  fi
}

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "Repository: $repo_root"
echo "Tag: $tag"
echo "Commit message: $commit_msg"
echo "Dry run: $dry_run"
echo "Skip build: $skip_build"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Error: origin remote is not configured." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "Error: tag '$tag' already exists locally." >&2
  exit 1
fi

# Warn if multiple tag-trigger workflows exist.
workflow_count="$( (rg -l "v\\*" .github/workflows 2>/dev/null || true) | wc -l | tr -d ' ' )"
if [[ "${workflow_count:-0}" -gt 1 ]]; then
  echo "Warning: multiple v* tag workflows detected in .github/workflows."
fi

# Keep the module version in sync with the release tag so the
# built artifact is named pandion_<version>.jmo and jamovi
# treats it as a distinct (newer) version. Two sources of truth
# carry the MODULE version:
#   - jamovi/0000.yaml  ->  `version: <x.y.z>`  (drives the .jmo name)
#   - DESCRIPTION       ->  `Version: <x.y.z>`  (R package version)
# Both are hand-maintained (jmvtools preserves 0000.yaml's version
# across builds), so without this step they silently drift behind
# the git tags. The per-analysis `version:` fields in the .a.yaml
# files are schema versions and intentionally left untouched.
# Run BEFORE the build so install() packages the correct version,
# and unconditionally (even with --skip-build) so the commit below
# carries the bump.
sync_version() {
  local f="$1" key="$2"
  [[ -f "$f" ]] || { echo "  (skip version sync: $f not found)"; return 0; }
  # Portable in-place edit (perl is present on macOS + Linux).
  run "perl -i -pe 's/^${key}:[[:space:]].*/${key}: ${bare_version}/' \"$f\""
}
echo "Syncing module version to $bare_version (jamovi/0000.yaml + DESCRIPTION)"
sync_version "jamovi/0000.yaml" "version"
sync_version "DESCRIPTION" "Version"

# Stamp today's date into jamovi/0000.yaml so the manifest date tracks the
# release instead of drifting stale (jmvtools preserves whatever is there).
release_date="$(date +%Y-%m-%d)"
echo "Stamping release date $release_date (jamovi/0000.yaml)"
run "perl -i -pe \"s/^date:[[:space:]].*/date: '${release_date}'/\" \"jamovi/0000.yaml\""

if [[ "$skip_build" != "true" ]]; then
  # Minify the widget JS first so the smaller bundle is what
  # gets packaged. Falls back gracefully if node/npx isn't
  # available — install() still works on the original .js.
  if command -v npx >/dev/null 2>&1 && [[ -x "scripts/minify-widget.sh" ]]; then
    run "bash scripts/minify-widget.sh"
  else
    echo "npx not on PATH or minify script missing; skipping widget minify"
  fi
  # Build via the jamovi-compiler's --build mode + side-load (NOT
  # jmvtools::install(), whose server handoff hangs under jamovi 2.7.32 —
  # see scripts/jmv-build-install.sh). A non-zero exit aborts before tagging.
  run "bash scripts/jmv-build-install.sh"
fi

# Commit only when there is something to commit.
if ! git diff --quiet || ! git diff --cached --quiet; then
  run "git add -A"
  run "git commit -m \"$commit_msg\""
else
  echo "No changes to commit. Proceeding with tag push."
fi

run "git tag -a \"$tag\" -m \"$commit_msg\""
run "git push origin HEAD"
run "git push origin \"$tag\""

echo "Release flow completed."
echo "If push succeeded, GitHub Actions should now build and publish the release for $tag."
