#!/bin/bash

# 1. Kill the Analytics Endpoint
# We replace the google-analytics URL with an empty string. 
# This causes the fetch to fail instantly and safely without running the complex logic.
sed -i 's|https://www.google-analytics.com/mp/collect||g' background.js

# 2. Kill the "Install" Popup
# We replace the deprecated-web-domain URL with an empty string.
sed -i 's|https://www.deprecated-web-domain||g' background.js

# 3. Fix the "Invalid Name" in the Options JS
# We replace the illegal dot-notation key with the clean one we made.
grep -r "filename_opt_gemini_timestamp" .
# Find files containing the old key and replace it
find . -type f -exec sed -i 's/filename_opt_gemini_timestamp/filename_opt_gemini_timestamp/g' {} +

echo "✅ Analytics neutralized and keys updated."
