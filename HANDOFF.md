# HANDOFF — Move Archive project into the popup

- **Owner:** Assigned coding agent
- **Branch:** `fix/archive-project-idle-status`
- **Base:** `origin/main` @ `e100962` (v3.7.0.23)
- **Version:** `3.7.0.25`
- **Status:** pushed for review; **not merged**
- **Task:** `.crules/tasks/review/move-archive-project-into-popup.md`

## What changed

The website no longer gets an injected "Archive project" button or white
status panel. The same archive is now started and monitored from the ChatOut
popup.

- `src/content/project-archive.js` (and rebuilt
  `content-scripts/project-archive.js`):
  - removed `ensureUi`, the shadow host, the injected button, cancel button,
    and status panel, plus the one-second UI interval;
  - kept the archive engine, `data-chatout-archive-*` attributes, the
    `chatout-command` hook, and `data-chatout-ready`;
  - added the `chatout-archive-project` message;
  - `chatout-archive-status` now returns the detected `project` and the
    current/last `mode`;
  - results carry `mode` (`project`, `everything`, `projects`, or `chats`) so
    the popup can route status;
  - `archiveProject` clears the previous result at start and returns
    `{ started: true }`.
- `src/popup/archive-everything.js` (and rebuilt `popup-archive.js`):
  - added an "Archive project" section with start, cancel, and status;
  - the section is visible only when the status response detects a supported
    project;
  - the popup polls status while open, shows progress/cancel/error/completion,
    restores a running archive after reopening, and restores the last result;
  - existing "Archive this site" checkboxes, confirmation, include-files
    toggle, and cancel behavior are unchanged.
- `tests/unit/project-archive-popup.test.mjs`: new content-script contract
  tests (no page UI, project detection, start/cancel messages).
- `tests/unit/project-archive-lib.test.mjs`: broader project-detection cases.
- `tests/browser/run.mjs`: project archive tests now drive the popup, assert
  the page has no injected UI, assert popup-only visibility, progress,
  cancellation, no-download-on-cancel, and status restore after reopening.
- `tests/browser/live-archive.mjs` and `tests/browser/CAPTURE.md`: live
  archive drives the popup instead of the old on-page button.
- `manifest.json`: `3.7.0.24` → `3.7.0.25`.
- `CHANGELOG.md`: matching `[3.7.0.25] - 2026-11-20` entry.

## Verification commands and results

| Command | Result |
|---|---|
| `node scripts/build-extension.mjs` | PASS — "Built 12 extension artifacts from src." |
| `diff -q src/content/project-archive.js content-scripts/project-archive.js` | PASS — identical |
| `diff -q src/popup/archive-everything.js popup-archive.js` | PASS — identical |
| `node --check src/content/project-archive.js` | PASS |
| `node --check src/popup/archive-everything.js` | PASS |
| `node --check tests/browser/run.mjs` | PASS |
| `node --check tests/browser/live-archive.mjs` | PASS |
| `node --test tests/unit/project-archive-lib.test.mjs tests/unit/project-archive-popup.test.mjs` | PASS — 10/10 |
| `node --test tests/unit/*.test.mjs` on clean tracked snapshot | PASS — 13/13 |
| `node tests/browser/run.mjs` | **BLOCKED** — Playwright requires Node.js 20+, host has 18.19.1 |
| `./scripts/check-forbidden-analytics-patterns.sh` | exit 0, but `rg: command not found`; not authoritative |
| `./scripts/check-forbidden-domains.sh` | exit 0, but `rg: command not found`; not authoritative |
| Supplemental `grep -rEn` analytics/domain scans | PASS — no forbidden IDs or domains |
| Secret scan of staged diff | PASS — no sensitive filenames or credential patterns |
| `git diff --check` | PASS |

### Clean-snapshot unit verification

Snapshot: `/tmp/opencode/verify-popup-archive`, built from the tracked file set
with working-tree contents plus the new unit test.

- `node --test tests/unit/*.test.mjs` → 13 passed, 0 failed.
- No ignored `archive/` or `content-scripts/split/` directories are present.

### Browser-suite blocker

`node tests/browser/run.mjs` exits before launching Chromium:

```
Playwright requires Node.js 20 or higher.
Please update your version of Node.js.
```

The host provides Node.js 18.19.1 at `/usr/bin/node`; no Node 20+ runtime was
found. The exact unblock is to run the suite with Node.js 20 or newer.

### Guard-script blocker

`rg` (ripgrep) is not installed. Both guard scripts use `if rg ...`, so a
missing `rg` is treated as "no match" and the script prints success without
scanning. Supplemental `grep` scans passed, but the scripts need `rg` for an
authoritative result.

## Manual verification still recommended

After a Node 20+ runtime is available, run:

```bash
node tests/browser/run.mjs
```

Then reload the unpacked extension at `chrome://extensions` and confirm on a
project page:

1. No "Archive project" button or status panel is injected into the page.
2. The ChatOut popup shows "Archive project" and the detected provider.
3. Starting it shows progress in the popup; Cancel stops it.
4. Closing the popup during a run and reopening it restores progress.
5. Reopening after completion restores the completion text.
6. A normal chat page shows no project control, and single-chat export still
   works.

## Next action

Review the branch and run the browser suite with Node.js 20+ and `rg`. Do not
merge into `main` until review approval.
