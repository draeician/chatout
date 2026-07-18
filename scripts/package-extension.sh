#!/usr/bin/env bash
# Build a sideload package for Chromium (Chrome / Edge / Brave).
#
# Output (under dist/):
#   - chatout-chrome-v<ver>.zip  — flat zip: manifest.json at the archive root
#   - chatout-chrome-v<ver>/     — unpacked folder ready for "Load unpacked"
#
# Install (pick one):
#   A) Load unpacked → select this git repo root (after build; has manifest.json)
#   B) Load unpacked → select dist/chatout-chrome-v<ver>/
#   C) Unzip the flat zip into an empty folder, then Load unpacked that folder
#
# Firefox / LibreWolf: use ./scripts/build-firefox.sh instead (produces .xpi).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VER="${1:-$(node -e "console.log(require('./manifest.json').version)")}"
NAME="chatout-chrome-v${VER}"
OUT_ZIP="${2:-$ROOT/dist/${NAME}.zip}"
OUT_DIR="$ROOT/dist/${NAME}"
mkdir -p "$(dirname "$OUT_ZIP")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGE="$TMP/stage"
mkdir -p "$STAGE"

bash "$ROOT/scripts/stage-extension-files.sh" "$STAGE"

# Flat zip: entries are manifest.json, background.js, … (no wrapper directory)
rm -f "$OUT_ZIP"
(cd "$STAGE" && zip -r -q "$OUT_ZIP" .)

# Ready-to-load directory (no unzip step)
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -a "$STAGE"/. "$OUT_DIR/"

echo "Wrote $OUT_ZIP"
echo "Wrote $OUT_DIR  (Load unpacked → select this folder)"
echo "Or Load unpacked → select the git repo root: $ROOT"
echo "Firefox/LibreWolf: ./scripts/build-firefox.sh"
