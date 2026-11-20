# Task: Move Archive project into the ChatOut popup

- **Owner:** Assigned coding agent
- **Branch:** `fix/archive-project-idle-status`
- **Base:** `origin/main` @ `e100962` (v3.7.0.23)
- **Status:** review — implementation and unit checks complete; browser gate blocked by Node 18

## Goal

Remove the Archive project button and status panel that ChatOut injects into
provider pages, and expose the same project archive from the ChatOut popup.
The popup control is shown only when the active tab is on a supported project
or notebook page. Progress, cancellation, errors, and completion results are
shown in the popup, the archive keeps running when the popup closes, and the
status is restored when it reopens.

## Acceptance Criteria

- [x] The injected Archive project button and white status panel are gone from
      the website.
- [x] Archive project appears in the existing ChatOut popup alongside the
      "Archive this site" controls.
- [x] The project control is shown only when `detectProjectUrl` finds a
      supported ChatGPT, Claude, Grok, or Gemini project/notebook page.
- [x] The popup reuses the existing archive implementation and
      `chatout-archive-project`, `chatout-archive-status`, and
      `chatout-archive-cancel` messages.
- [x] Progress, cancellation, errors, and completion results are displayed in
      the popup.
- [x] The archive runs in the content script, so closing the popup does not
      stop it; reopening restores running progress and the last result.
- [x] Existing single-chat export and site archive controls are preserved.
- [x] Regression tests cover project detection, popup visibility/controls, and
      archive execution.
- [ ] `make test-browser` passes — **blocked by the environment**: the
      installed Playwright requires Node.js 20 or newer, and this host only has
      Node.js 18.19.1. Unit tests pass; the e2e half cannot start.
- [x] `node scripts/build-extension.mjs` passes and regenerates artifacts.
- [x] `manifest.json` version is `3.7.0.25` with a matching `CHANGELOG.md`
      heading.
- [x] Changes are scanned for secrets.
- [x] Work is committed and pushed on the branch; task is in `review/`.

## Verification evidence

| Command | Result |
|---|---|
| `node scripts/build-extension.mjs` | PASS — "Built 12 extension artifacts from src." |
| `diff -q src/content/project-archive.js content-scripts/project-archive.js` | PASS |
| `diff -q src/popup/archive-everything.js popup-archive.js` | PASS |
| `node --check src/content/project-archive.js` | PASS |
| `node --check src/popup/archive-everything.js` | PASS |
| `node --check tests/browser/run.mjs` | PASS |
| `node --check tests/browser/live-archive.mjs` | PASS |
| `node --test tests/unit/project-archive-lib.test.mjs tests/unit/project-archive-popup.test.mjs` | PASS — 10/10 |
| `node --test tests/unit/*.test.mjs` | 11/13 — pre-existing `no-cjk-ui.test.mjs` scans ignored `archive/` and `content-scripts/split/`; clean tracked snapshot passes |
| `node tests/browser/run.mjs` | BLOCKED — Playwright requires Node.js 20+, host has 18.19.1 |
| `./scripts/check-forbidden-analytics-patterns.sh` | exit 0, but `rg` is missing so it does not scan |
| `./scripts/check-forbidden-domains.sh` | exit 0, but `rg` is missing so it does not scan |
| Supplemental `grep -rEn` analytics/domain scans | PASS |
| Secret scan of staged diff | PASS |
| `git diff --check` | PASS |

## Regression tests added

- `tests/unit/project-archive-popup.test.mjs`: the content script creates no
  page UI, status reports/clears the detected project, the project message
  refuses a normal chat, starts on a project page, and cancel reports the run
  was active.
- `tests/unit/project-archive-lib.test.mjs`: project detection now covers
  ChatGPT project chats, Gemini `/u/<n>/app/notebooks/<id>`, Grok projects,
  unsupported hosts, and invalid URLs.
- `tests/browser/run.mjs`:
  - no on-page archive host, status, or button, and page controls still click;
  - the popup shows Archive project only on a supported project page;
  - progress and cancellation are shown in the popup;
  - a running archive is restored after closing and reopening the popup;
  - a completed result is restored after reopening;
  - project cancel saves nothing;
  - existing project archive tests now start from the popup and assert the
    popup completion text.

## Blockers

1. **Browser suite:** `node tests/browser/run.mjs` exits before launching
   Chromium with:
   `Playwright requires Node.js 20 or higher.` The host provides Node.js
   18.19.1 at `/usr/bin/node`. The exact unblock is to run the suite with
   Node.js 20+ (for example, install or select a Node 20 toolchain).
2. **Guard scripts:** `rg` (ripgrep) is not installed, so both scripts treat a
   missing matcher as "no match". Supplemental `grep` scans passed.
3. **CJK unit test:** `tests/unit/no-cjk-ui.test.mjs` walks ignored local
   `archive/` and `content-scripts/split/` directories. The clean tracked
   snapshot passes; this is pre-existing and unrelated to this change.

## Coder Notes

- The content script keeps the archive engine, `data-chatout-archive-*`
  attributes, the `chatout-command` hook, and the `data-chatout-ready` marker,
  but no longer creates a shadow host, button, cancel button, or status panel.
- `setProgress` now only writes the progress attribute; `setResult` adds the
  run mode (`project`, `everything`, `projects`, or `chats`) so the popup can
  route status to the right section.
- The popup polls `chatout-archive-status` while open. It shows the project
  section only when the status response includes a project, disables both
  archive sections during a run, and re-renders a distinct result once.
- `archiveProject` clears the previous result at start so a reopened popup
  cannot show stale completion text while a new run is active.
- No provider, export format, or site archive behavior changed.
