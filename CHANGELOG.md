# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.7.0.14] - 2026-10-04

### Fixed
- Grok roles follow the live turn: `data-testid="user-message"` / `aria-label="You"` (and `items-end` / `bg-surface-user-bubble`) versus `assistant-message` / `aria-label="Grok"` (and `items-start`). Both sides contain `.response-content-markdown`, so that class is no longer the role decision.
- Grok full-export dedup no longer collapses turns that share the same text. Identity is a real per-turn id when one exists; otherwise document Y, with about 24px of tolerance only when the text also matches. `user-message` / `assistant-message` are role selectors, not ids.
- Grok scroll harvest prefers `[data-testid="chat-transcript-scroller"]`.

The signed-in Markdown check of this build was done while the manifest still said `3.7.0.13` (content script only; the version number itself was bumped after that export).

## [3.7.0.13] - 2026-10-04

### Fixed
- Grok full-conversation export: scroll-harvest mounted `.message-bubble` turns so long chats are not truncated to the visible viewport.
- Grok role labeling: replace the stale ChatGPT-copied `.sr-only`/`"chatgpt"` heuristic with Tailwind cues (`.response-content-markdown`, `bg-surface-l1`, `max-w-none`) plus aria/sr-only fallbacks.

## [3.7.0.12] - 2026-07-29

### Fixed
- ChatGPT **shared conversation** URLs (`/s/t_…` and classic `/share/{uuid}`) are recognized as chat pages in the popup (previously blocked with “go to chat page”). Share pages also try `/backend-api/share/{id}` before DOM fallback, and filename title falls back to `document.title` when the sidebar has no active item.

## [3.7.0.11] - 2026-07-18

### Changed
- Loadable packaging bump for the SaveAI scrub, Notion/PDF archive, and gecko id work below (3.7.0.7–3.7.0.9).

## [3.7.0.9] - 2026-07-17

### Changed
- Firefox/LibreWolf gecko id is now the Gmail alias `draeician+chatout@gmail.com` (delivers to `draeician@gmail.com`); removed unused `chatout@draeician.dev`.

## [3.7.0.8] - 2026-07-17

### Removed
- Archived and removed **Notion** save implementation and **pdfmake** local PDF stack from the live extension into `archive/notion-and-pdf/` (with restoration notes). Markdown, text, image, and clipboard export unchanged.

## [3.7.0.7] - 2026-07-17

### Changed
- **Full SaveAI scrub**: rename bridge id to `chatout-extension-content`, context to `__CHATOUT_CTX`, remove `saveai.net` cookie domains (config-driven, empty by default), replace Feishu feedback with author mailto, drop original CWS id from DNR rules, delete legacy split/backup files that still contained SaveAI strings.

## [3.7.0.6] - 2026-07-17

### Removed
- Dead tutorial/guide popup code (book icon, styles, i18n) after the tutorial button was removed; no other behavior changed.

## [3.7.0.5] - 2026-07-17

### Fixed
- Image export now uses the same **full-content** extraction as Markdown/TXT (`c5`) so long ChatGPT threads are not limited to mounted DOM turns (missing final messages). Light-card capture + text fallback retained.

## [3.7.0.4] - 2026-07-17

### Fixed
- Image export was solid black in ChatGPT dark mode: always capture on a **light** card (white bg / dark text), clone nodes off-page, reject mostly-black canvases, and fall back to plain text render when needed.

## [3.7.0.3] - 2026-07-17

### Changed
- Exporting toast: light text on dark page backgrounds (contrasting bubble).
- Success toast text/icon about 2× larger.

## [3.7.0.2] - 2026-07-17

### Fixed
- **Image export blank PNGs**: ChatGPT full-image now captures live DOM turns (not detached API HTML); capture host uses off-screen solid canvas (`alpha: false`), scale 1, and multi-part download under size limits.

## [3.7.0.1] - 2026-07-17

### Fixed
- Long chat **Image** export: solid capture host, safer scaling, multi-part PNGs under canvas limits (no empty/transparent strips).
- Content-script export reliability and larger **Exporting…** toast (~3×).

## [3.7.0.0] - 2026-07-16

### Changed
- **Rebrand to ChatOut**: extension display name, popup/options titles, locales, and package artifact names (`chatout-chrome-v*`, `chatout-firefox-v*`).
- New ChatOut icons (`icon-16/32/48/128.png`) and UI logo (`assets/logo-B73kTQtN.png`) from the provided brand artwork.
- Author contact set to `draeician@gmail.com` (removed original SaveAI social/email/store success links).
- Firefox/LibreWolf gecko id: `draeician+chatout@gmail.com`.

### Removed
- Normal chat PDF export (including remote SaveAI PDF API path). Markdown, text, image, copy, and Notion remain.

## [3.6.13.13] - 2026-07-16

### Added

- Firefox / LibreWolf package: `./scripts/build-firefox.sh` produces a flat `.xpi` (and unpacked folder) with a Gecko manifest (`background.scripts`, `browser_specific_settings.gecko`, no Chrome `update_url`). Install notes in `docs/LIBREWOLF-INSTALL.md`.

## [3.6.13.12] - 2026-07-16

### Changed

- Packaging matches the simple Copy Tab URLs workflow: `scripts/package-extension.sh` now writes a **flat** zip (`manifest.json` at the archive root) plus a ready **`dist/ai-exporter-drae-chrome-v<ver>/`** folder for Load unpacked. README documents loading the **git repo root** as the easiest path. Still Chromium-only (not a Firefox/LibreWolf XPI).

## [3.6.13.11] - 2026-07-16

### Added

- Popup and Settings: show the extension version at the bottom of each UI, read live from `manifest.json` via `chrome.runtime.getManifest().version` (settings sidebar no longer shows a stale hardcoded version).

## [3.6.13.10] - 2026-07-16

### Added

- ChatGPT: pasted/uploaded documents that appear only as UI chips (e.g. empty `<button aria-label="Pasted text(180).txt">`) are now represented in exports as `[Pasted document: …]` / `[Attached file: …]`. The API path reads attachment metadata from the conversation mapping and attempts to download text file bodies when the backend allows; if content is unavailable, the marker still records that a document was attached. DOM scroll fallback injects the same markers from attachment button `aria-label`s.

## [3.6.13.9] - 2026-07-16

### Fixed

- ChatGPT API export: consecutive assistant nodes from one model turn (status updates, tool JSON, final text) no longer each get their own `## ChatGPT Replied:` header. Same-role messages are merged into a single turn, and pure tool/browser JSON payloads (`search_query`, `open`, `find`, etc.) plus non-`all` recipients / hidden channels are dropped as noise.

## [3.6.13.8] - 2026-07-16

### Fixed

- Settings: changing the code default for export filename format was not enough for existing installs — the value is persisted in `chrome.storage.local` (`ai-exporter-general-settings`), so a reload kept showing whatever was already saved (often **Gemini Timestamp Title**). One-time migration `ai-exporter-filename-format-default-v2` now writes **Use AI name and date** (`aINameAndDate`) on first settings/export load after this version. Re-select another format afterward if you prefer it. Dropdown order also puts AI name and date first.

## [3.6.13.7] - 2026-07-16

### Changed

- Settings: default export filename format is now **Use AI name and date** (`aINameAndDate`) instead of chat-name-only. Existing saved preferences are unchanged; this applies to fresh installs and resets.

## [3.6.13.6] - 2026-07-16

### Fixed

- ChatGPT: full-conversation export no longer relies solely on programmatic scrolling of the virtualized message list. PageProbe evidence on a real long thread showed `div[data-scroll-root]` geometry moves under synthetic scroll but mounted `[data-message-author-role]` item keys do **not** turn over (`programmaticScrollRemountsItems: false`), which matches the hard ~23-message cap seen in multi-pass DOM harvest. `getChatHtmlsAsync(includeAll)` now tries ChatGPT's same-origin `/backend-api/conversation/{id}` (session token from `/api/auth/session`) first, walks `mapping`/`current_node` for the active branch, and builds export HTML from message text parts. Falls back to the existing multi-pass DOM scroll collector if the API path fails or returns zero messages.
- ChatGPT: DOM scroll fallback now prefers the PageProbe-confirmed scroller `div[data-scroll-root]` before the ancestor-walk probe.

## [3.6.13.5] - 2026-07-16

### Reverted

- ChatGPT: reverted the 3.6.13.4 synthetic wheel-event dispatch. User observed the scroll visibly stall exactly at the message following a file upload attachment after this change landed — plausibly the synthetic wheel event triggered unrelated drop-zone/file-attachment UI behavior near that turn. Back to plain `scrollTop` assignment while this is investigated with debug logging enabled.

## [3.6.13.4] - 2026-07-16

### Changed

- ChatGPT: user confirmed via manual scrolling that real conversation content exists beyond where the multi-pass auto-scroll deterministically capped out (repeatable across 3 full passes, same scrollHeight ceiling both times). Now dispatches a synthetic `wheel` event alongside each `scrollTop` change, in case the virtualizer's "load more" logic is gated on wheel/scroll gestures rather than direct `scrollTop` assignment. Experimental — not yet confirmed to fix the gap.

## [3.6.13.3] - 2026-07-16

### Fixed

- Popup: the "Debug log" checkbox reset to unchecked every time the popup closed (switching tabs/windows), since it was plain component state that unmounts with the popup. It's now persisted via `chrome.storage.local` and restored on open.

### Added

- ChatGPT: when debug mode is on, the exported filename now gets a `_debug` suffix before the extension (e.g. `..._debug.md`) so debug exports are distinguishable at a glance.

## [3.6.13.2] - 2026-07-16

### Fixed

- ChatGPT: comparing debug logs across repeated exports of the same long conversation showed the scroll container's `scrollHeight` is an unstable virtualizer estimate (33180 vs 51416 vs 51432 in separate runs on identical content), and a run with a *smaller* measured height actually captured *more* real conversation than one with a larger height — a single top-to-bottom scroll pass isn't reliable. `collectAllTurnElements` now does up to 4 full passes (scroll to top, walk to bottom, collect throughout each time), stopping early once a full pass adds zero new messages.
- ChatGPT: fixed a duplicate-block bug where the same message could be captured twice with identical text — `_dedupeKey` previously preferred the `data-message-id` attribute, which was observed to differ across virtualization remounts of the same logical message. Deduplication is now purely content-based.

## [3.6.13.1] - 2026-07-16

### Fixed

- ChatGPT: the debug-log feature immediately paid for itself — its captured trace showed `scrollHeight` repeatedly plateauing for 2-3 polls and then growing again (later messages still rendering/streaming in), so the "stable for 2 polls (~400ms)" threshold declared the export done before the final assistant reply had actually mounted, silently dropping it. Now requires 6 consecutive stable polls (~1.5s) while at the bottom, then one longer 700ms confirmation re-check before stopping; if `scrollHeight` grew during that confirmation, it keeps scrolling instead of stopping.

## [3.6.13.0] - 2026-07-16

### Added

- Popup: "Debug log" checkbox next to Quick Exports. When checked, Markdown/Text export clears the console, captures everything logged during the export (including the `[ChatGPT-AutoScroll]`/`[Exporter]` traces), and appends it as a fenced `## Debug Log` section at the end of the saved file — so diagnosing export issues no longer requires manually copying DevTools console output.

## [3.6.12.13] - 2026-07-16

### Fixed

- ChatGPT: 3.6.12.12's scrollability probe only tested nudging `scrollTop` upward, which fails to detect a real scroll container that's already at (or near) its maximum `scrollTop` — exactly the case when exporting from the bottom of a long conversation, which is why every ancestor (up to `<html>`) was rejected. The probe now tests both directions with a larger 50px delta. Also added a full-document-scan fallback (largest-overflow scrollable element, not just ancestors) in case the real container ever isn't a strict ancestor of the message elements, and switched candidate logging to `JSON.stringify` so details survive copy-pasting from DevTools instead of collapsing to opaque `Array(4)` stubs.

## [3.6.12.12] - 2026-07-16

### Fixed

- ChatGPT: 3.6.12.11's container detection could pick a false-positive ancestor (a wrapper div with a few px of incidental `scrollHeight - clientHeight` overflow from padding/rounding, not an actual clipped/scrollable viewport) — confirmed via console evidence showing `scrollTop` silently refusing to move for 250 straight steps. `_findScrollContainer` now probes each overflow-qualifying candidate by nudging `scrollTop` and checking it actually moved before accepting it as the scroll container.

## [3.6.12.11] - 2026-07-16

### Fixed

- ChatGPT: the 3.6.12.9 auto-scroll-and-collect logic never actually scrolled anything. Console evidence (`[ChatGPT-AutoScroll]` logs) showed the ancestor walk was capped at 12 levels and exhausted before finding a real scrollable ancestor, landing on an unrelated 0x0 `display:contents` wrapper div, which trivially looked "already at the bottom" every time. `_findScrollContainer` now walks the full ancestor chain (capped at 60 as a safety bound, not a functional limit) and picks the closest ancestor with genuine `scrollHeight - clientHeight` overflow, instead of gating on an exact `overflow-y: auto|scroll` computed-style match.

## [3.6.12.10] - 2026-07-16

### Debug

- ChatGPT: added `[ChatGPT-AutoScroll]` console logging around the 3.6.12.9 auto-scroll-and-collect export path (chosen scroll container, per-step mounted/collected counts) to diagnose why testing showed no observable change on a real long conversation.

## [3.6.12.9] - 2026-07-16

### Fixed

- ChatGPT: long conversations exported with earlier turns (including entire user questions) silently missing, because ChatGPT virtualizes/unmounts message DOM nodes that are scrolled out of view and the exporter only queried whatever was currently mounted. Full-conversation exports (`includeAll`) now scroll the conversation container through its entire scroll range first, incrementally collecting and deduplicating every turn encountered (by `data-message-id` where present, falling back to a text fingerprint) before building the export, instead of relying on a single point-in-time DOM query.

## [3.6.12.8] - 2026-07-16

### Fixed

- ChatGPT: fixed exports mislabeling every turn (including assistant replies) as "You asked:". `detectChatType` now reads the `data-message-author-role` attribute value directly (`user` vs `assistant`) instead of sniffing ancestor `.sr-only` accessibility text for the literal substring "chatgpt", which no longer matches after an OpenAI UI change. Falls back to the old sr-only sniff only if the attribute is absent.

## [3.6.12.7] - 2026-05-23

### Fixed

- Popup: on "Receiving end does not exist", auto-inject content scripts via `scripting.executeScript` and retry the export action.
- Popup: keep the popup open briefly on error so the toast is visible (no longer closed in `finally` before the user can read it).

## [3.6.12.6] - 2026-05-23

### Fixed

- Popup: await `tabs.sendMessage` and show a toast when the content script is unreachable (e.g. chat tab not refreshed after extension reload).
- Content script: surface export failures via on-page toast instead of only `console.error`.

## [3.6.12.5] - 2026-05-23

### Fixed

- Gemini: restore export filenames from conversation title after sidebar DOM change. `getChatGroupTitle` now matches `a[href*="/app/"]` by pathname, falls back to `aria-current="page"`, then `document.title` (`{title} - Gemini`).

### Added

- Optional Gemini title debug overlay (`localStorage.setItem("aiExporterGeminiTitleDebug", "1")` then reload), mirroring the Grok debug harness.

## [3.6.12.4] - 2026-03-24

### Fixed

- ChatGPT: relaxed the message bubble selector from `main article > div.text-base [data-message-author-role]` to `main [data-message-author-role]` so Markdown (and related exports) find messages again after the web UI DOM change.

## [3.6.12] - 2026-03-24

### Fixed
- Restored corrupted PDFKit / XMP metadata segment in the content-script bundle (fixes `SyntaxError: missing ) after argument list` and broken Markdown export on Gemini and related hosts).
- Removed duplicate webpack chunk in the Google Search export tail; kept configurable remote PDF endpoint.

### Added
- `scripts/package-extension.sh` to build a sideload zip (`dist/ai-exporter-drae-chrome-v<version>.zip`).

## [3.6.7] - 2026-01-20

### Fixed
- Fixed critical syntax error in filename generation function (missing closing brace)
- Export functionality now works properly with provider prefix and timestamp

### Added
- Helper functions `normalizeFilename()` and `getProviderName()` for better filename generation
- URL-based provider detection as fallback when `Cn.aiName` is unavailable
- Normalized filenames (lowercase, spaces to underscores, special chars removed)

### Changed
- Filename format: `{provider}_{normalized_title}_{timestamp}.{ext}` (e.g., `gemini_my_conversation_20260120T143052.md`)
- Timestamp format: ISO 8601 with seconds (YYYYMMDDTHHMMSS)
- Provider names normalized to lowercase

## [3.6.6] - Previous Version
- Previous release
