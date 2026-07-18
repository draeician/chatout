# ChatOut

Repository: `ai-export-drae-chrome`

**ChatOut** — browser extension to export AI chat conversations (Markdown, text, image, etc.).

Author: draeician@gmail.com

**Chromium** (Chrome, Edge, Brave, …) and **Firefox/LibreWolf** (via a separate XPI build).

## Install

### Firefox / LibreWolf

```bash
./scripts/build-firefox.sh
```

Then load `dist/chatout-firefox-v<version>.xpi` as a temporary add-on  
(`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**).

Full steps: [docs/LIBREWOLF-INSTALL.md](docs/LIBREWOLF-INSTALL.md).

### Chromium — Option A — Load the git checkout (simplest, like copy-tab-urls)

1. Clone this repo and build runtime files if needed:

   ```bash
   node scripts/build-extension.mjs
   ```

2. Open the extensions page (`chrome://extensions` / `edge://extensions` / `brave://extensions`).
3. Enable **Developer mode**.
4. **Load unpacked** → select the **repository root** (the folder that contains `manifest.json` next to `background.js`).

On Linux, if **Open** only enters folders: press **Ctrl+L**, paste the repo path, Enter, clear any selection so you see `manifest.json`, then confirm to use the **current** folder.

### Chromium — Option B — From a packaged release

```bash
./scripts/package-extension.sh   # Chrome zip + folder
./scripts/build-firefox.sh       # Firefox / LibreWolf XPI
```

Produces:

| Path | Use |
|------|-----|
| `dist/chatout-chrome-v<version>/` | **Load unpacked** this folder directly (Chromium) |
| `dist/chatout-chrome-v<version>.zip` | Flat Chromium zip (`manifest.json` at archive root) |
| `dist/chatout-firefox-v<version>.xpi` | Firefox / LibreWolf add-on |

**From the zip:**

```bash
mkdir -p /tmp/chatout && unzip -o dist/chatout-chrome-v*.zip -d /tmp/chatout
# Load unpacked → /tmp/chatout  (must contain manifest.json at the top)
```

Do **not** load a subfolder (`chunks/`, `content-scripts/`, etc.). The selected folder must contain `manifest.json`.

### GitHub Releases

1. Download the latest `chatout-chrome-v*.zip` (or use the matching unpacked folder if provided).
2. Unzip into an empty directory (flat layout — `manifest.json` is at the top of the archive).
3. **Load unpacked** that directory.

## Commands

```bash
# Rebuild root / content-scripts / chunks artifacts from src/
node scripts/build-extension.mjs

# Package flat zip + ready Load-unpacked folder under dist/ (Chromium)
./scripts/package-extension.sh

# Firefox / LibreWolf XPI under dist/
./scripts/build-firefox.sh
```

## Historical reference

The commit **`1ef4fa14054117480d913e6d8c1e0840d318d992`** is tagged **`old-working-1ef4fa`**: last known-good snapshot before later bundle corruption issues; useful for comparison or bisecting.

## webext-bridge usage

Use the `webext-bridge` API with this call signature:

`sendMessage(messageId, data, destination)`.

Example for sending a message to a content script tab:

`sendMessage("tab-prev", {}, { context: "content-script", tabId })`.

Warning: passing destination as the second argument will default destination to `"background"`.
