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

## Export the chat you are viewing

Open a conversation on a supported site and use the ChatOut popup (Markdown, text, or image). The file downloads in the browser. The name looks like `chatgpt_chat_title_20260102T030405.md`. Nothing is uploaded.

Supported chat pages include ChatGPT, Claude, Gemini, Grok, DeepSeek, Poe, AI Studio, Yuanbao, and Tongyi.

## Archive a project

On a **project** page (not a single chat), ChatOut adds an **Archive project** button at the top right.

| Site | Open this kind of page |
|------|------------------------|
| ChatGPT | A project (`/g/g-p-…/project`, or any chat inside that project) |
| Claude | A project (`/project/…`) |
| Gemini | A notebook (`/notebook/…`) |

Click **Archive project**. The button counts through the chats, then the browser saves one zip. Inside the zip, one folder is named after the project. Each chat is a Markdown file:

```text
my_research/2024-05-06_packing_list_11111111.md
my_research/_index.md
```

The filename is a safe lowercase slug plus the day and a short id, so two chats with the same title do not overwrite each other. The Markdown body is the same exporter output as a single-chat Markdown download (with a short header naming the project and id). `_index.md` lists what saved and what failed.

The status line ends with `Exported N, failed M`. One broken chat does not cancel the rest. Chats are fetched one at a time with a short pause so the site is not hammered. The zip is the whole archive: a normal download cannot reliably create a folder, and one file is easier to move than dozens of separate downloads. Chat text is only written into that local zip. The extension does not send it anywhere else. A very large zip that the browser will not accept as a download URL is saved with an ordinary link download of the same file instead.

ChatGPT and Claude are listed from the same logged-in endpoints those sites use for the project sidebar, including later pages. If that list is unavailable, ChatOut uses the chat links on the project page and scrolls to pick up rows that load late. Gemini notebooks are collected from the notebook page (scroll included) and each chat is read with the same Gemini request a single-chat export uses.

## Tests

One command builds the extension, runs the filename/zip checks, and runs the headless browser checks (pass/fail is printed at the end):

```bash
make test-browser
```

The same browser checks alone:

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

`npm test` runs only the filename and zip checks, with no browser.

To archive a real project without clicking, use a Chrome profile that is already logged in. Quit Chrome first so the profile is not locked:

```bash
node tests/browser/live-archive.mjs \
  --profile "$HOME/chatout-profile" \
  --url "https://chatgpt.com/g/g-p-YOURPROJECT/project" \
  --out "$HOME/chatout-archives"
```

How to refresh the saved pages after a site redesign: [tests/browser/CAPTURE.md](tests/browser/CAPTURE.md).
