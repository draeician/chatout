# Firefox / LibreWolf installation

AI Exporter ships a **separate Firefox package** (`.xpi`). The Chrome zip will not install in LibreWolf.

## Build the XPI

From the repo root:

```bash
node scripts/build-extension.mjs   # if src changed
./scripts/build-firefox.sh
```

Outputs:

- `dist/chatout-firefox-v<version>.xpi`
- `dist/chatout-firefox-v<version>/` (unpacked)

## Temporary install (recommended)

1. Open LibreWolf or Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…**
4. Select either:
   - `dist/chatout-firefox-v<version>.xpi`, or
   - `dist/chatout-firefox-v<version>/manifest.json`

The add-on lasts until the browser restarts.

## Permanent install (unsigned)

Unsigned XPIs need the signature check disabled (common on LibreWolf for self-built extensions):

1. `about:config` → `xpinstall.signatures.required` → **false**
2. `about:addons` → gear → **Install Add-on From File…**
3. Choose the `.xpi`

## What differs from the Chrome package

| | Chrome | Firefox XPI |
|--|--------|-------------|
| Background | `service_worker` | `background.scripts` |
| Store update URL | present | removed |
| Gecko id | n/a | `draeician+chatout@gmail.com` |
| Archive | `.zip` (deflate OK) | `.xpi` (store / uncompressed) |

Runtime code is the same built tree; only the manifest is transformed for Gecko.
