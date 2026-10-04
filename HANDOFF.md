# ChatOut OpenCode Handoff

Branch: `fix/cross-browser-and-grok`
Repository: `draeician/chatout`

## Goal

Make ChatOut reliably work on Chromium-based browsers and Firefox/LibreWolf, while fixing the known Grok export regression.

## Working rules

1. Pull the latest `origin/fix/cross-browser-and-grok`.
2. Read `AGENTS.md`, `project_spec.md`, `.crules/modes/CODER.md`, `.crules/modes/GIT_POLICY.md`, this file, and `.crules/tasks/wip/cross-browser-and-grok.md`.
3. Always edit `src/` first. Rebuild emitted artifacts after source changes.
4. Complete only the first unchecked task below unless a prerequisite requires a small adjacent fix.
5. Verify the change completely.
6. Update this file and the WIP task with what changed, verification results, remaining risk, and the next unchecked task.
7. Commit using Conventional Commits and push to `origin/fix/cross-browser-and-grok`.
8. Never push directly to `main`.

## Current audit findings

### P0 - Grok export is broken

- `TODO.md` says Grok export does not capture the full chat and mislabels user/assistant messages.
- ~~In `src/content/content.js`, Grok implementation `class ZF` currently uses `.message-bubble`.~~ Still uses `.message-bubble` (confirmed valid for current Tailwind Grok UI).
- ~~Grok `detectChatType()` searches ancestor `.sr-only` text for the literal string `"chatgpt"`~~ **Fixed in Task 1** — now uses `.response-content-markdown`, `bg-surface-l1`, `max-w-none`, plus aria/sr-only fallbacks.
- ~~`getChatHtmlsAsync()` … does not attempt to expand/scroll~~ **Fixed in Task 1** — `collectAllTurnElements()` scroll-harvests the Grok overflow container.

### P0 - Packaging can ship stale artifacts

- `scripts/package-extension.sh` stages existing built files without rebuilding from `src/`.
- `scripts/build-firefox.sh` rebuilds only if runtime artifacts are missing, not when `src/` is newer.
- This violates the repo rule that `src/` is the source of truth.

### P1 - CI does not prove browser compatibility

- Current GitHub Actions only runs forbidden analytics/domain scans.
- CI does not run `node scripts/build-extension.mjs`.
- CI does not build Chromium package.
- CI does not build Firefox XPI or validate the Firefox-transformed manifest.

### P1 - Build map is incomplete

- `src/content/grok-title-debug.js` and `src/content/gemini-title-debug.js` are shipped from `content-scripts/`, but are absent from `scripts/extension-output-manifest.json`.
- Editing those `src/` files followed by the normal build does not update the shipped copies.

### P1 - Dead/contradictory Notion code remains

- `CHANGELOG.md` says Notion save support was removed in 3.7.0.8.
- `src/popup/index.js` still contains substantial Notion cookie/API code.
- `rules/request_modifier_rule.json` still contains Notion WebClipper DNR rules, including an origin set to a fixed `chrome-extension://...` ID.
- This should be verified as dead code and removed if unreachable. Do not expand scope into restoring Notion.

### Browser implementation note

- Runtime code already prefers `globalThis.browser` when available and falls back to `globalThis.chrome`, via bundled browser-polyfill logic.
- Firefox packaging rewrites MV3 `background.service_worker` to `background.scripts`, removes Chrome `update_url`, drops `declarativeNetRequestWithHostAccess`, and adds Gecko settings.

## Ordered task queue

- [x] **Task 1: Fix Grok full-chat extraction and role labeling.**
  - Determine current Grok DOM structure from existing diagnostics/debug harness and robust selectors.
  - Replace the stale `"chatgpt"` role heuristic.
  - Ensure full export collects all conversation turns, including virtualized/off-screen turns when necessary.
  - Keep image/text/markdown selection behavior intact.
  - Add targeted diagnostic logging only if useful and non-invasive.
  - Rebuild artifacts.
  - Verify Grok export manually in both Chromium and Firefox if available locally; otherwise record exact manual verification needed.

- [ ] **Task 2: Make packaging rebuild from source every time.**
  - Chromium and Firefox package commands must rebuild deterministically before staging.
  - Avoid version mutations except the intentional manifest version field.
  - Verify staged runtime files equal their mapped `src/` inputs.

- [ ] **Task 3: Complete the build output map.**
  - Add both debug scripts to `scripts/extension-output-manifest.json`.
  - Ensure a normal build updates every shipped source-backed runtime file.

- [ ] **Task 4: Add cross-browser CI.**
  - Run deterministic build.
  - Run existing forbidden-pattern guards.
  - Build Chromium package and validate archive root manifest.
  - Build Firefox XPI and validate Gecko manifest transformation.
  - Fail if build leaves tracked generated artifacts dirty after rebuilding.

- [ ] **Task 5: Remove dead Notion runtime surface if confirmed unreachable.**
  - Confirm current UI has no live Notion entrypoint.
  - Remove dead Notion code/rules/permissions only where safe.
  - Re-run Chromium + Firefox packaging and guards.

- [ ] **Task 6: Final browser compatibility audit.**
  - Re-check manifest permissions, runtime APIs, packaging, and manual smoke steps for Chrome/Edge/Brave and Firefox/LibreWolf.
  - Update README/project docs so browser support and verification commands are exact.

## Task 1 completion notes (2026-10-04)

### Changes

- Edited `src/content/content.js` Grok provider (`class ZF`):
  - `_resolveMessageBubble`, `_findScrollContainer`, `_dedupeKey`, `collectAllTurnElements`
  - `detectChatType` now prefers Tailwind cues: `.response-content-markdown` / `max-w-none` → assistant (`response`); `bg-surface-l1` → user (`prompt`); aria/sr-only text as fallback; removed `"chatgpt"` sniff
  - `getChatHtmlsAsync(includeAll=true)` scroll-harvests turns before labeling; selected-export path uses the same `detectChatType`
  - Thinking-container show/hide behavior preserved
- Bumped `manifest.json` → `3.7.0.13`
- Documented in `CHANGELOG.md`
- Rebuilt via `node scripts/build-extension.mjs` (`content-scripts/content.js` matches `src/`)

### Verification

- `node scripts/build-extension.mjs` — pass (9 artifacts)
- `./scripts/check-forbidden-analytics-patterns.sh` — pass
- `./scripts/check-forbidden-domains.sh` — pass
- Synthetic `detectChatType` cases (user `bg-surface-l1`, assistant `response-content-markdown` / `max-w-none`) — pass
- Artifact check: ZF no longer contains `includes("chatgpt")`; contains `[Grok-AutoScroll]`
- **Manual browser verification not run in this environment** (no live grok.com session). Required next:

  1. Load unpacked `3.7.0.13` at `chrome://extensions` (and Firefox `about:debugging` if available).
  2. Open a long Grok chat (`https://grok.com/c/...`) with ≥1 viewport of history.
  3. Export full Markdown: confirm turn count matches the UI and labels alternate You / Grok correctly.
  4. Spot-check image export still works.
  5. Optional console: look for `[Grok-AutoScroll] DONE collected N`.

### Remaining risks

- Grok may virtualize in a way that programmatic scroll does not remount older turns (same class of issue ChatGPT hit); if manual test still truncates, consider a Grok REST/API harvest path later.
- Class names (`bg-surface-l1`, `response-content-markdown`) can drift; keep title-debug / console probes handy.
- Nested / thinking-only bubbles could still confuse edge cases despite nested-bubble skip.

### Next task

**Task 2: Make packaging rebuild from source every time.**

## Completion standard

Do not mark the project task complete until:

- Grok full-chat export is verified.
- User/assistant roles export correctly on Grok.
- `node scripts/build-extension.mjs` passes.
- Both packaging scripts pass.
- Existing forbidden analytics/domain guards pass.
- CI exercises Chromium and Firefox packaging paths.
- This handoff contains the final commit SHA and verification summary.

## Last update

2026-10-04: Task 1 implemented (Grok role labeling + scroll harvest). Version `3.7.0.13`. Next: Task 2 packaging rebuild-from-source.
