#!/usr/bin/env bash
# Build a Firefox / LibreWolf XPI (flat archive, manifest.json at root).
#
# Output:
#   dist/chatout-firefox-v<ver>.xpi
#   dist/chatout-firefox-v<ver>/   (unpacked; temporary load via about:debugging)
#
# Temporary install (recommended for testing):
#   about:debugging#/runtime/this-firefox → Load Temporary Add-on
#   → select the .xpi OR any file inside the unpacked folder (e.g. manifest.json)
#
# Permanent (unsigned, LibreWolf/Firefox Developer/ESR with pref):
#   about:config → xpinstall.signatures.required = false
#   about:addons → gear → Install Add-on From File → .xpi
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f background.js || ! -f content-scripts/content.js ]]; then
  echo "Runtime artifacts missing; running build…"
  node scripts/build-extension.mjs
fi

VER="${1:-$(node -e "console.log(require('./manifest.json').version)")}"
NAME="chatout-firefox-v${VER}"
OUT_XPI="${2:-$ROOT/dist/${NAME}.xpi}"
OUT_DIR="$ROOT/dist/${NAME}"
mkdir -p "$(dirname "$OUT_XPI")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGE="$TMP/stage"
mkdir -p "$STAGE"

echo "Staging extension files…"
bash "$ROOT/scripts/stage-extension-files.sh" "$STAGE"

echo "Writing Firefox manifest…"
node "$ROOT/scripts/build-firefox-manifest.mjs" "$STAGE/manifest.json" "$STAGE/manifest.json"

# Uncompressed zip (store) for maximum add-on install compatibility (same as copy-tab-urls)
rm -f "$OUT_XPI"
(cd "$STAGE" && zip -0 -q -r "$OUT_XPI" .)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -a "$STAGE"/. "$OUT_DIR/"

echo "Wrote $OUT_XPI"
echo "Wrote $OUT_DIR"

# Integrity checks
if ! unzip -t "$OUT_XPI" >/dev/null; then
  echo "XPI integrity check failed" >&2
  exit 1
fi
if ! unzip -p "$OUT_XPI" manifest.json | node -e "
  let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{
    const m=JSON.parse(s);
    if (!m.browser_specific_settings?.gecko?.id) throw new Error('missing gecko.id');
    if (m.background?.service_worker) throw new Error('still has service_worker');
    if (!Array.isArray(m.background?.scripts)) throw new Error('missing background.scripts');
    if (m.update_url) throw new Error('update_url must be removed');
    console.log('manifest OK');
    console.log('  version:', m.version);
    console.log('  gecko.id:', m.browser_specific_settings.gecko.id);
    console.log('  background:', JSON.stringify(m.background));
  });
"; then
  echo "Manifest validation failed" >&2
  exit 1
fi

# First entry should be at archive root (not nested wrapper)
TOP="$(unzip -Z1 "$OUT_XPI" | head -1)"
if [[ "$TOP" == */* && "$TOP" != manifest.json && "$TOP" != */ ]]; then
  # allow paths like chunks/foo but not wrapper/manifest
  :
fi
if ! unzip -Z1 "$OUT_XPI" | grep -qx 'manifest.json'; then
  echo "manifest.json not at XPI root" >&2
  unzip -Z1 "$OUT_XPI" | head -10 >&2
  exit 1
fi

echo ""
echo "LibreWolf / Firefox install:"
echo "  Temporary: about:debugging#/runtime/this-firefox → Load Temporary Add-on → $OUT_XPI"
echo "  Or select: $OUT_DIR/manifest.json"
echo "  Permanent: about:config xpinstall.signatures.required=false, then Install Add-on From File"
