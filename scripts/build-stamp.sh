#!/bin/bash
# Print the build stamp the standalone shells carry in
# <meta name="pandion-build">, e.g. "2026-08-30T18:16Z 8efa502".
#
# It names the CODE, not the artifact: the commit date (UTC, to the
# minute) and short sha of the last commit that touched the shipped
# sources, with a trailing "*" when those sources have uncommitted
# changes at build time. Two properties follow from that choice:
#   - regenerating artifacts from an unchanged tree reproduces the same
#     bytes, so the artifact commit never changes its own stamp and
#     prepare-release.sh's clean-generated-tree gate converges;
#   - a stamp resolves to a commit, so an exported figure or a saved
#     project can be traced to the exact code that produced it, and to
#     the rows of NUMERICAL-CHANGES.md that were live in it.
# The version number alone cannot do that: the hosted app deploys from
# main ahead of tagged releases, so one version covers weeks of builds.
set -e
cd "$(dirname "$0")/.."
SRC=(standalone/index.html standalone/js standalone/templates
     standalone/vendor inst/widget/graphbuilder2.min.js)
# The stamp is the last commit that touched these paths, which a shallow
# clone cannot know (it reports HEAD instead): refuse rather than mis-stamp.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
    echo "build-stamp: shallow clone; fetch full history (fetch-depth: 0)" >&2
    exit 1
fi
stamp="$(TZ=UTC git log -1 --date=format-local:%Y-%m-%dT%H:%MZ \
             --format='%cd %h' -- "${SRC[@]}")"
[ -n "$stamp" ] || {
    echo "build-stamp: no git history for the shipped sources" >&2
    exit 1
}
dirty=""
[ -z "$(git status --porcelain -- "${SRC[@]}")" ] || dirty="*"
echo "${stamp}${dirty}"
