#!/usr/bin/env bash
# Copy the Pandion module source into a jamovi source tree so that
# docker/jamovi-Dockerfile can build it into the image.
#
# Docker build contexts do not follow symlinks, so this has to be a real
# copy; re-run it after every change to R/, jamovi/ or inst/.
#
#   bash scripts/sync-to-jamovi-tree.sh [/path/to/jamovi]
#
# Default target is ~/Desktop/jamovi-svg-ftw (the svg-ftw branch checkout).

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ROOT="${1:-$HOME/Desktop/jamovi-svg-ftw}"
DEST="$DEST_ROOT/pandion"

if [ ! -f "$DEST_ROOT/docker/jamovi-Dockerfile" ]; then
    echo "error: $DEST_ROOT does not look like a jamovi source tree" >&2
    exit 1
fi

# Only what jmc needs to build the module. Everything else in the repo
# (website/, standalone/, mockups/, the .jmo, the punchlists) would just
# bloat the docker build context.
mkdir -p "$DEST"
rsync -a --delete \
    --exclude '.DS_Store' \
    "$SRC/R/" "$DEST/R/"
rsync -a --delete \
    --exclude '.DS_Store' \
    "$SRC/jamovi/" "$DEST/jamovi/"
rsync -a --delete \
    --exclude '.DS_Store' \
    "$SRC/inst/" "$DEST/inst/"
cp "$SRC/DESCRIPTION" "$SRC/NAMESPACE" "$DEST/"

echo "synced $(du -sh "$DEST" | cut -f1) to $DEST"
