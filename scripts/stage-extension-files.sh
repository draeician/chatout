#!/usr/bin/env bash
# Stage Chromium/Firefox runtime files into $1 (directory must exist or will be created).
# Shared by package-extension.sh and build-firefox.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${1:?stage directory required}"
mkdir -p "$STAGE/content-scripts"

cp "$ROOT/manifest.json" "$ROOT/background.js" "$ROOT/popup.html" "$ROOT/options.html" \
   "$ROOT/inject-web.js" \
   "$ROOT/icon-16.png" "$ROOT/icon-32.png" "$ROOT/icon-48.png" "$ROOT/icon-128.png" \
   "$STAGE/"
cp -r "$ROOT/assets" "$ROOT/chunks" "$ROOT/shared" "$ROOT/rules" "$ROOT/_locales" "$STAGE/"
cp "$ROOT/content-scripts/config.js" \
   "$ROOT/content-scripts/content.js" \
   "$ROOT/content-scripts/content.css" \
   "$ROOT/content-scripts/start.js" \
   "$STAGE/content-scripts/"
# Referenced by manifest content_scripts (debug harnesses; gated in-page)
if [[ -f "$ROOT/content-scripts/grok-title-debug.js" ]]; then
  cp "$ROOT/content-scripts/grok-title-debug.js" "$STAGE/content-scripts/"
fi
if [[ -f "$ROOT/content-scripts/gemini-title-debug.js" ]]; then
  cp "$ROOT/content-scripts/gemini-title-debug.js" "$STAGE/content-scripts/"
fi
