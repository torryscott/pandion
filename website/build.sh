#!/bin/bash
# Refresh the deployable website folder from the repo sources.
#
#   bash website/build.sh
#
# - Copies the current standalone single-file build into app/ (the
#   "Try it in your browser" target). Run standalone/build-dist.sh
#   first if the standalone sources changed.
# - Assets (brand mark, hero art, product screenshot) are committed
#   files; regenerate the screenshot with the playwright snippet in
#   the session notes when the app UI changes meaningfully.
#
# The website/ folder itself is what gets deployed to Cloudflare
# Pages - there is no build step on the Pages side.
set -e
cd "$(dirname "$0")/.."

if [ ! -f standalone/dist/pandion-plots.html ]; then
    echo "standalone/dist/pandion-plots.html missing - run standalone/build-dist.sh first" >&2
    exit 1
fi
cp standalone/dist/pandion-plots.html website/app/index.html
echo "website/app/index.html refreshed ($(du -h website/app/index.html | cut -f1))"

# Installability. The app's <link rel="manifest"> is relative, so the manifest
# and its icons have to sit beside index.html in app/. Chrome needs HTTPS plus
# 192px and 512px icons, so this only does anything for the hosted copy: the
# portable download ignores a manifest it cannot fetch.
cp standalone/manifest.json website/app/manifest.json
mkdir -p website/app/icons
cp standalone/icons/pandion-192.png standalone/icons/pandion-512.png website/app/icons/
echo "website/app/manifest.json + icons refreshed"

# The "Download HTML" button serves this from our own origin. Depending on
# a GitHub release asset broke: CI attaches only *.jmo, so the link 404'd.
cp standalone/dist/pandion-plots.html website/pandion-plots.html
echo "website/pandion-plots.html refreshed (portable download)"

# Docs: the canonical guide is docs/user-guide.html; the site serves a copy
# at /docs/ so the two can never drift.
mkdir -p website/docs
cp docs/user-guide.html website/docs/index.html
rsync -a --exclude '.DS_Store' --exclude 'README.md' docs/img/ website/docs/img/
echo "website/docs refreshed ($(du -sh website/docs | cut -f1))"

# Version-drift guard: the site advertises a release number in several
# places. Warn loudly rather than quietly serving a stale one.
VERSION=$(grep '^Version:' DESCRIPTION | awk '{print $2}')
DRIFT=0
for page in website/index.html website/about.html website/download.html; do
    grep -q "$VERSION" "$page" || { echo "WARN: $page does not mention version $VERSION" >&2; DRIFT=1; }
done
grep -q "version: \"$VERSION\"" CITATION.cff || {
    echo "WARN: CITATION.cff is not at version $VERSION" >&2; DRIFT=1; }
# The app reports its own version in Help and diagnostics; about.html
# tells users to look there, so it must agree with the site.
grep -q "APP_VERSION = \"$VERSION\"" website/app/index.html || {
    echo "WARN: the app bundle does not declare APP_VERSION = $VERSION" >&2; DRIFT=1; }
[ "$DRIFT" = "0" ] && echo "version $VERSION consistent across the site + CITATION.cff"
