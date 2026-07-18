#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_PATHS=(
  manifest.json
  popup.html
  options.html
  background.js
  inject-web.js
  chunks
  content-scripts
  assets
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

forbidden_regex='saveai'"\\."'net'
if rg -n --no-heading -i -e "$forbidden_regex" "${EXISTING_PATHS[@]}"; then
  echo "❌ Forbidden domain detected in shipped extension artifacts."
  exit 1
fi

echo "✅ No forbidden domains detected in shipped extension artifacts."
