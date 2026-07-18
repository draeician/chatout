# Insights and preferences (Grok export / extension work)

Notes from the Grok conversation-title fix and related debugging (March 2026). Use this when revisiting DOM scrapers, bundled extensions, or collaboration with this maintainer.

## Technical lessons

### Filename and `getChatGroupTitle`

- Export filenames use `getProviderName()` plus `normalizeFilename(getChatGroupTitle())` plus a timestamp. When the title looks like `grok_grok-_NN`, the **fallback** is firing (`Grok-${seconds}` from dayjs), not the real chat title.
- **Grok’s UI split navigation from history:** `[data-sidebar="menu"] a[data-sidebar="menu-button"]` only matches top nav (Chat, Voice, Imagine). **Conversation rows** are `[data-sidebar] a[href*="/c/"]` with pathname matching the current `/c/{uuid}` URL.
- A **malformed CSS selector** (missing `]`) would have broken `querySelectorAll`; fixing syntax alone was not enough once Grok’s DOM no longer put chat titles on the menu-button links.
- **`document.title`** often follows `{title} - Grok`; parsing that string is a reasonable **secondary fallback** when sidebar nodes are missing or virtualized.

### Bundles and repo layout

- Primary shipped files live under `content-scripts/`; `src/content/content.js` should stay in sync when editing the content bundle.
- The content script is **minified on one line** in places; use small scripted replacements (e.g. Node one-liners) or very precise string matches rather than hand-editing huge lines.
- **`window.__AI_EXPORTER_DEBUG__`** (exposing `getChatGroupTitle` / provider) lets a separate Grok-only script read the same logic as the exporter without duplicating business rules.

### Debug harness pattern

- Gate optional UI with **`localStorage`** (e.g. `aiExporterGrokTitleDebug=1`) so normal users never see overlays.
- Run the debug script at **`document_idle`** on the host only, **after** the main bundle, so hooks exist.
- Ship **structured JSON** (pathname, multiple selector probes, `matchesPath`, optional title substring search) and **Copy JSON** so reports are pasteable into issues or chat.
- Bump **`manifest.json` version** when verifying the browser actually loaded a new build (`chrome://extensions`).

### Gemini (context)

- Earlier work in this arc treated Gemini export as the reference behavior; Grok needed **site-specific** selectors and fallbacks, not copying Gemini’s `.conversation.selected` pattern.

## Interaction preferences

- **Execute, don’t only suggest:** Prefer running commands, inspecting the repo, and applying patches over handing the user a checklist unless blocked.
- **Branches for feature work:** e.g. `fix/grok-chat-export-title` for isolated development before release.
- **Releases are observable:** Version bumps in `manifest.json` matter for unpacked extensions; call out reload steps briefly.
- **Diagnostics before guessing:** When the DOM is unknown, add a temporary harness or use user-supplied JSON (like the sidebar probe output) to confirm selectors before changing production logic.
- **Documentation:** Keep a short markdown record of lessons (this file) when a thread produces reusable knowledge; avoid noisy drive-by refactors elsewhere.
- **Commits and tags:** Use clear commit messages and version tags (`v3.6.12.3`) so “release” is recoverable from git history.

## Quick reference: enable Grok title debug

```js
localStorage.setItem("aiExporterGrokTitleDebug", "1");
location.reload();
```

Disable: remove the key (or use the panel’s “Disable debug & reload”) and reload.

## Quick reference: enable Gemini title debug

```js
localStorage.setItem("aiExporterGeminiTitleDebug", "1");
location.reload();
```

Disable: remove the key (or use the panel’s “Disable debug & reload”) and reload.
