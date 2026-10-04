# Cross-browser reliability + Grok export

Status: WIP
Branch: `fix/cross-browser-and-grok`

## Objective

Fix the known Grok export regression and harden ChatOut so releases cannot silently break Chromium or Firefox/LibreWolf.

## Acceptance criteria

- [x] Grok full Markdown export of one signed-in chat includes that conversation in order. *(https://grok.com/c/66972c93-f8ae-5248-824d-45f4b735e498 only. Not virtualized. Image export not done. Identical-text dedup not proven live.)*
- [x] Grok user and assistant turns are labeled correctly in that Markdown export and in the later text export of the same chat. *(Markdown: 9 `## You asked:` / 9 `## Grok Replied:`. Text: `grok_attachment_grief_ai_safety_via_loss_20261004T145416.txt`, 9 YOU ASKED / 9 GROK REPLIED, first turn is the user's Attachment Axiom / companion prompt. Image export not done.)*
- [ ] Chromium packaging always rebuilds from `src/`.
- [ ] Firefox packaging always rebuilds from `src/`.
- [ ] All shipped source-backed debug scripts are in the build output map.
- [ ] CI runs build + guards + Chromium packaging + Firefox packaging.
- [ ] CI detects generated-artifact drift.
- [ ] Dead Notion runtime code/rules are removed if confirmed unreachable.
- [ ] README/project documentation matches the final Chromium + Firefox workflow.
- [x] `HANDOFF.md` is updated after each completed task with verification and next action.

## Known evidence

- `TODO.md`: Grok export misses chat content and labels roles incorrectly.
- Live grok.com DOM (2026-10-04): user `data-testid=user-message` / `aria-label=You` / `bg-surface-user-bubble` / parent `items-end`; Grok `data-testid=assistant-message` / `aria-label=Grok` / parent `items-start`. Both contain `.response-content-markdown`. No per-turn id. Scroller `data-testid=chat-transcript-scroller`.
- Current CI only runs forbidden analytics/domain guards.
- Package scripts can stage stale emitted files.
- Debug source files are not included in the output manifest.
- Changelog says Notion was removed, but live popup bundle and DNR rules still contain Notion implementation.

## Coder notes

Use `HANDOFF.md` as the canonical running state for OpenCode/ChatGPT coordination.

### Task 1 (2026-10-04)

- `class ZF` only. Role order: testid, exact turn aria-label You/Grok, alignment, `bg-surface-user-bubble`. `.response-content-markdown` is last resort and cannot override those. Dedup is id or document Y (~24px only when text matches), not message text. Scroller prefers `chat-transcript-scroller`.
- Markdown full export verified for one chat while the manifest still said `3.7.0.13`: `grok_attachment_grief_ai_safety_via_loss_20261004T144936.md`, 9 You and 9 Grok, alternating, chronological, same turns as the page. No ChatOut console errors.
- Build (9 artifacts) and both forbidden guards passed; `content-scripts/content.js` matches `src`. Manifest then bumped to `3.7.0.14`.
- Text export of the same conversation succeeded: `grok_attachment_grief_ai_safety_via_loss_20261004T145416.txt` (9 YOU ASKED, 9 GROK REPLIED, first turn is the user's Attachment Axiom / companion prompt). Duplicate retry `grok_attachment_grief_ai_safety_via_loss_20261004T145110.txt` also exists.
- Not done: image export (popup showed Exporting and produced no file), identical-text dedup on grok.com (synthetic node check only), virtualized thread, Firefox.
- Task 1 stays open for those leftovers. Next after that: Task 2 — packaging must rebuild from `src/` every time.
