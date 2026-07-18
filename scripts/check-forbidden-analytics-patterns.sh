#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_PATHS=(
  background.js
  inject-web.js
  manifest.json
  popup.html
  options.html
  chunks
  assets
  content-scripts
  _locales
  rules
)

EXISTING_PATHS=()
for path in "${ARTIFACT_PATHS[@]}"; do
  if [[ -e "$path" ]]; then
    EXISTING_PATHS+=("$path")
  fi
done

if [[ ${#EXISTING_PATHS[@]} -eq 0 ]]; then
  echo "No extension artifacts found to scan."
  exit 1
fi

ID_PATTERNS=(
  '\bG-[A-Z0-9]{4,}\b'
  '\bUA-[0-9]{4,}-[0-9]+\b'
)

for pattern in "${ID_PATTERNS[@]}"; do
  if rg -n --no-heading -e "$pattern" "${EXISTING_PATHS[@]}"; then
    echo "❌ Forbidden analytics pattern found in emitted extension artifacts (pattern: $pattern)."
    exit 1
  fi
done

DOMAIN_PATTERNS=(
  'google-analytics\.com'
  'googletagmanager\.com'
)

for pattern in "${DOMAIN_PATTERNS[@]}"; do
  if rg -n --no-heading -i -e "$pattern" "${EXISTING_PATHS[@]}"; then
    echo "❌ Forbidden analytics pattern found in emitted extension artifacts (pattern: $pattern)."
    exit 1
  fi
done

echo "✅ No forbidden analytics patterns found in emitted extension artifacts."
