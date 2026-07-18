# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension ("ai-exporter-drae") that exports AI chat conversations (ChatGPT, Claude, Gemini, Grok, DeepSeek, Poe, AI Studio, and others) to Markdown/text/PDF. There is no build tool in this repo (no package.json, no bundler config) — the shipped JS files are pre-built/minified bundles that get copied into place and packaged as a zip.

## Repo layout: `src/` vs. root artifacts

This is the single most important thing to understand before editing anything:

- **`src/`** is the source of truth (`src/background/index.js`, `src/content/*.js`, `src/popup/index.js`, `src/options/index.js`, `src/shared/*`).
- The actual runtime files Chrome loads live at the **repo root and in `content-scripts/`** (`background.js`, `content-scripts/content.js`, `content-scripts/start.js`, `content-scripts/config.js`, `inject-web.js`, `shared/config.js`, `chunks/*`). These are built from `src/` via `scripts/build-extension.mjs`, which reads the `src` → output mapping in `scripts/extension-output-manifest.json` and copies files 1:1 (it does not transpile or bundle — the `src/` files are themselves already-minified bundles, e.g. `src/content/content.js` is a single-line minified blob).
- **Always edit the `src/` copy**, then run the build script so the root artifact matches. The two must stay in sync or the packaged zip will ship stale code.
- Because `content-scripts/content.js` / `src/content/content.js` are minified (often one giant line), prefer precise string replacements or small Node one-liners over manual multi-line edits when patching them.

### Stale/legacy files — do not use

`build_extension.sh`, `content-scripts/split/*.js`, `.cursor/SOP.md`, `explode_content.pl`, and `fix.bash` describe an **older** build pipeline (concatenating `content-scripts/split/*.js` into `content-scripts/content.js`) that was superseded by the `src/` + `scripts/build-extension.mjs` pipeline (see git history around "Add deterministic src-based extension build pipeline"). These files haven't been touched since before that migration — ignore their instructions.

## Commands

```bash
# Rebuild root artifacts (background.js, content-scripts/*.js, chunks/*, etc.) from src/
node scripts/build-extension.mjs

# Package a sideloadable zip into dist/ (version read from manifest.json unless passed as $1)
./scripts/package-extension.sh

# Scan shipped artifacts for forbidden analytics IDs/domains (also runs in CI)
./scripts/check-forbidden-analytics-patterns.sh
./scripts/check-forbidden-domains.sh
```

There is no lint/test/typecheck command configured in this repo. `src/shared/endpoints.ts` is the one `.ts` file present but there is no `tsconfig`/compiler wired up — treat it as reference source copied manually.

After building, reload the unpacked extension at `chrome://extensions` to pick up changes (no dev server / hot reload).

## Architecture

- **`manifest.json`**: MV3 manifest. Content scripts are injected per-provider-domain (see `content_scripts[].matches`) plus a catch-all `start.js` at `document_start` on every page. There are also two provider-specific debug-only content scripts (`grok-title-debug.js`, `gemini-title-debug.js`) that run at `document_idle` and are gated behind `localStorage` flags — see below.
- **`background.js`** (service worker): message routing between popup/content scripts, e.g. `tab-prev` messages via `webext-bridge`. `sendMessage` signature is `sendMessage(messageId, data, destination)` — passing destination positionally instead of in the options object silently defaults destination to `"background"` (see README.md).
- **`content-scripts/content.js`**: the main export logic — per-provider selectors (`getProviderName`, `getChatGroupTitle`) that scrape the DOM for the conversation title and messages, then generate exports. Filename format: `{provider}_{normalized_title}_{timestamp}.{ext}`.
- **`content-scripts/config.js` / `shared/config.js`**: shared config, including `ALLOWED_EXTERNAL_DOMAINS` allowlist. `src/shared/endpoints.ts` documents the same shape (domains, feature flags, fallback text) with placeholder `example.com` values — real endpoint values are filled in at the `src/` level for the actual bundle, not in this stub file.
- **`popup.html` / `chunks/popup-*.js`** and **`options.html` / `chunks/options-*.js`**: the extension's UI surfaces, built from `src/popup/index.js` and `src/options/index.js`.
- **Provider DOM scraping is fragile by design**: each AI provider's web UI changes its DOM/selectors periodically, which is the dominant source of bugs (see CHANGELOG.md — most releases are selector-fix releases for ChatGPT/Gemini/Grok). When a provider breaks, expect to update selectors in `content-scripts/content.js` (and `src/content/content.js`), not architecture.
- **Debug harnesses**: `aiExporterGrokTitleDebug` / `aiExporterGeminiTitleDebug` `localStorage` flags enable on-page debug overlays (defined in `grok-title-debug.js` / `gemini-title-debug.js`) that expose the same title-detection logic as the exporter via `window.__AI_EXPORTER_DEBUG__`, for diagnosing selector breakage without instrumenting production code. See `docs/insights/preferences.md` for the enable/disable snippets and lessons learned from past DOM-breakage fixes.

## Release process

- Version is tracked in `manifest.json` (`version` field) and must be bumped whenever verifying a fix loaded correctly in `chrome://extensions`.
- `CHANGELOG.md` follows Keep a Changelog format — add an entry per release.
- `dist/` holds packaged release zips and release notes, produced by `scripts/package-extension.sh`.
- Feature work happens on branches named like `fix/<short-description>`.

## CI

`.github/workflows/forbidden-analytics-patterns.yml` runs `scripts/check-forbidden-analytics-patterns.sh` and `scripts/check-forbidden-domains.sh` against the shipped artifacts on every push/PR — these guard against accidentally shipping analytics IDs (`G-...`, `UA-...`), tracking domains, or the specific banned `saveai.net` domain.
