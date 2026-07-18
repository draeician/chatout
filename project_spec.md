# Project Specification

Durable scope, stack, and conventions for **ai-export-drae-chrome**.

## Overview

- **Name**: ai-export-drae-chrome
- **Extension name**: ChatOut
- **Summary**: Manifest V3 Chrome extension that exports AI chat conversations (ChatGPT, Claude, Gemini, Grok, DeepSeek, Poe, AI Studio, and others) to Markdown, text, and image.
- **Package / module**: not a published npm package; unpacked extension + zipped releases under `dist/`

## Tech stack

- **Primary language(s)**: JavaScript (ES modules where present; much of the shipped content script is minified)
- **Framework / runtime**: Chrome Manifest V3 (service worker + content scripts + popup/options UI)
- **Notable libs (vendored / bundled)**: React (popup/options/content UI), webext-bridge messaging
- **Packaging**: no bundler in-repo; `scripts/build-extension.mjs` copies `src/` → root / `content-scripts/` / `chunks/` per `scripts/extension-output-manifest.json`
- **Version master**: `manifest.json` → `version` (Chrome-style multi-part, e.g. `3.6.13.5`)
- **Runtime version source**: same `manifest.json` field (no separate package `__version__`)

## Commands

- **Build (smoke)**: `node scripts/build-extension.mjs`
- **Package (Chromium)**: `./scripts/package-extension.sh` → flat zip + Load-unpacked folder under `dist/`
- **Package (Firefox)**: `./scripts/build-firefox.sh` → `dist/chatout-firefox-v<version>.xpi`
- **CI / guards**:
  - `./scripts/check-forbidden-analytics-patterns.sh`
  - `./scripts/check-forbidden-domains.sh`
- **Tests**: no unit/integration test suite configured; verify via build + analytics/domain guards + manual load of unpacked extension at `chrome://extensions`
- **Install / lint**: no package manager or formal linter; edit `src/`, rebuild, reload extension

## Architecture and conventions

- **`src/` is source of truth** (`src/background/`, `src/content/`, `src/popup/`, `src/options/`, `src/shared/`). Always edit `src/`, then run the build script so root artifacts match.
- **Runtime artifacts** Chrome loads: root `background.js`, `content-scripts/*`, `inject-web.js`, `shared/config.js`, `chunks/*`, `manifest.json`, `popup.html`, `options.html`.
- **Provider scraping** lives mainly in the content script (`src/content/content.js` → `content-scripts/content.js`): selectors are fragile; most releases are selector fixes.
- **Debug harnesses**: `grok-title-debug.js` / `gemini-title-debug.js`, gated by `localStorage` flags (see `docs/insights/preferences.md`).
- **Legacy — do not use**: `build_extension.sh`, `content-scripts/split/*.js`, `explode_content.pl`, `fix.bash` (old pipeline).
- **Messaging**: `webext-bridge` — `sendMessage(messageId, data, destination)`. Destination must be the options object, not a bare second arg.

### Forbidden patterns

- Do not ship analytics IDs (`G-...`, `UA-...`) or banned tracking domains.
- Do not reintroduce `saveai.net` or other domains blocked by `check-forbidden-domains.sh`.
- Do not edit only the root/minified artifacts without updating `src/` and rebuilding.
- Do not restore the old split-concat pipeline for normal work.

## Hard rules

- No secrets, credentials, or private conversation dumps in git.
- No `pip install --break-system-packages` (and no unnecessary system package mutations).
- Prefer list-form `subprocess` / shell safety when writing scripts.
- Keep `src/` and built artifacts in sync before packaging or claiming a fix is loadable.
- Minimum change that fixes the issue; do not invent providers or export formats without a task.

## Release process

- Bump `manifest.json` `version` when shipping a fix that must be verified in Chrome.
- Update `CHANGELOG.md` (Keep a Changelog).
- Package with `./scripts/package-extension.sh`.
- Feature branches: `feat/…`, `fix/…`, etc.

## Status

- [x] Bootstrap complete for known stack (Chrome MV3 extension, src-based build)
