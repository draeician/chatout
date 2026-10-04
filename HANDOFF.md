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
- `.message-bubble` is on both user and Grok turns (confirmed 2026-10-04 on grok.com). It is the harvest selector, not a role cue.
- Role is no longer `.response-content-markdown` / `bg-surface-l1` / `max-w-none`. Both roles contain `.response-content-markdown`. Live cues: `data-testid="user-message"` + `aria-label="You"` + `bg-surface-user-bubble` + parent `items-end`, versus `data-testid="assistant-message"` + `aria-label="Grok"` + parent `items-start`.
- `collectAllTurnElements()` still scroll-harvests. It prefers `[data-testid="chat-transcript-scroller"]`. Dedup is a real per-turn id or document Y, not message text. The observed thread was not virtualized.

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

- [ ] **Task 1: Fix Grok full-chat extraction and role labeling.** Markdown full-conversation export of one signed-in chat is verified (turn count, order, You vs Grok). Text export, image export, identical-text dedup, and a virtualized thread are not done.
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

## Task 1 notes (2026-10-04) — Markdown role check verified for one chat; task not finished

Live DOM was observed on `https://grok.com/c/66972c93-f8ae-5248-824d-45f4b735e498` (Attachment Grief: AI Safety via Loss). Selectors the code now trusts:

- User turn: `div[data-testid="user-message"]`, `role="article"`, `aria-label="You"`, classes include `message-bubble`, `bg-surface-user-bubble`, `prose-chat`. Parent uses `items-end`. No unique id.
- Grok turn: `div[data-testid="assistant-message"]`, `role="article"`, `aria-label="Grok"`, classes include `message-bubble`, `prose-chat`. Parent uses `items-start`. No unique id.
- Both contain `.response-content-markdown`. That class must not decide role. `bg-surface-l1` was not the user cue.
- Scroller: `div[data-testid="chat-transcript-scroller"]`. This thread was not virtualized (the first user node stayed mounted after scrolling to the bottom). Scroll harvest is still kept for threads that do virtualize.

### Changes (`class ZF` only)

- `detectChatType` order: `data-testid` `user-message` / `assistant-message`, then exact `aria-label` `You` / `Grok` on the turn (not a multi-bubble ancestor), then alignment (`items-end` / `justify-end` / `self-end` / `ml-auto` vs `items-start` / `justify-start`), then `bg-surface-user-bubble`. `.response-content-markdown` is last resort only and cannot override those cues. `message-bubble` is not a role cue.
- Dedup is no longer message text. Identity is a real per-turn id if present; otherwise document Y (`getBoundingClientRect().top + scrollTop`) with about 24px tolerance only when the text also matches. `user-message` / `assistant-message` are not dedup ids.
- `_findScrollContainer` prefers `[data-testid="chat-transcript-scroller"]` before the generic overflow heuristic.
- Full Markdown still uses `getChatHtmlsAsync` → `collectAllTurnElements`. Other providers were not edited.
- Manifest bumped `3.7.0.13` → `3.7.0.14` after the live export. The export below was the content script while the manifest still said `3.7.0.13`.

### Verification actually performed

- `node scripts/build-extension.mjs` — 9 artifacts.
- `./scripts/check-forbidden-analytics-patterns.sh` — pass.
- `./scripts/check-forbidden-domains.sh` — pass.
- `content-scripts/content.js` matches `src/content/content.js`.
- Chrome developer mode, unpacked load of that build (manifest still `3.7.0.13`), conversation reloaded, **full Markdown only**.
- File `grok_attachment_grief_ai_safety_via_loss_20261004T144936.md`: 9 `## You asked:` and 9 `## Grok Replied:`, alternating, chronological. A browser pass found the same turns on the page. No ChatOut console errors (only unrelated Grok CSP/403s).
- Synthetic node check only for position dedup (two identical texts at different Y kept; ~24px same text kept once). Not a repo unit suite.

### Not verified

- Text export and image export were not completed (popup stayed busy).
- This chat had no two identical user messages, so the new dedup was not proven on grok.com.
- This thread was not virtualized, so scroll harvest was not shown remounting discarded turns.
- Firefox was not used.

### Remaining risks

- Virtualized Grok threads may still truncate if programmatic scroll does not remount older turns.
- Identical short turns closer than ~24px with the same text can still collapse. Wider than that they are kept. Not proven live.
- Last-resort `.response-content-markdown` can still mark a turn assistant if testid, aria-label, alignment, and `bg-surface-user-bubble` are all missing.
- Text and image export paths were not exercised on this build.

### Next task

Finish Task 1 leftovers (text, image, a virtualized thread, two identical user texts), then **Task 2: packaging must rebuild from source every time.**

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

2026-10-04: Grok Markdown role check verified on one signed-in chat (`66972c93-f8ae-5248-824d-45f4b735e498`) against the content script at manifest `3.7.0.13` (9 You / 9 Grok, alternating). Manifest then bumped to `3.7.0.14`. Text, image, identical-text dedup, and virtualized harvest are not done. Task 1 stays open. Next after those leftovers: Task 2.
