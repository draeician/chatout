# Cross-browser reliability + Grok export

Status: WIP
Branch: `fix/cross-browser-and-grok`

## Objective

Fix the known Grok export regression and harden ChatOut so releases cannot silently break Chromium or Firefox/LibreWolf.

## Acceptance criteria

- [ ] Grok full export includes the entire conversation.
- [ ] Grok user and assistant turns are labeled correctly.
- [ ] Chromium packaging always rebuilds from `src/`.
- [ ] Firefox packaging always rebuilds from `src/`.
- [ ] All shipped source-backed debug scripts are in the build output map.
- [ ] CI runs build + guards + Chromium packaging + Firefox packaging.
- [ ] CI detects generated-artifact drift.
- [ ] Dead Notion runtime code/rules are removed if confirmed unreachable.
- [ ] README/project documentation matches the final Chromium + Firefox workflow.
- [ ] `HANDOFF.md` is updated after each completed task with verification and next action.

## Known evidence

- `TODO.md`: Grok export misses chat content and labels roles incorrectly.
- Grok `detectChatType()` currently checks for the literal string `"chatgpt"`.
- Current CI only runs forbidden analytics/domain guards.
- Package scripts can stage stale emitted files.
- Debug source files are not included in the output manifest.
- Changelog says Notion was removed, but live popup bundle and DNR rules still contain Notion implementation.

## Coder notes

Use `HANDOFF.md` as the canonical running state for OpenCode/ChatGPT coordination.
