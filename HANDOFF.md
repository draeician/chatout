# HANDOFF — Move Archive project into the popup

- **Owner:** Assigned coding agent
- **Branch:** `fix/archive-project-idle-status`
- **Base:** `origin/main` @ `e100962` (v3.7.0.23)
- **Verified commit:** `7ca3d91` (v3.7.0.25)
- **Docs commit:** `6783054`
- **Status:** review approved; merged to `main` with `--no-ff`
- **Task:** `.crules/tasks/done/move-archive-project-into-popup.md`

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

No production or test corrections were required during the verification pass.
This pass updates only this handoff and the task file; version `3.7.0.25` and
`CHANGELOG.md` remain unchanged because no loadable change was needed.

## Review approval and merge

- **Review approved:** 2026-11-20; merge and feature-branch cleanup authorized.
- **Merge method:** `git merge --no-ff fix/archive-project-idle-status`.
- **Merge target:** `main`.
- **History:** no rebase, no force-push, no shared-history rewrite.
- **Verified implementation:** `7ca3d91`; the only changes after verification
  were the task move and this handoff (`6783054` plus the merge commit), so
  the gate evidence below applies to the merged implementation.
- **Final main SHA:** recorded in the merge completion report, since a commit
  cannot contain its own merge SHA.
- **Cleanup:** local and remote `fix/archive-project-idle-status` branches are
  removed after the merge.

## Verification environment

The full gate ran on a fresh clone of the branch inside a disposable Podman
container. Nothing was installed or changed on the host or system-wide.

- **Container:** `docker.io/library/node:22-bookworm`
- **Node.js:** `v22.23.5`
- **npm:** `10.9.9`
- **ripgrep:** `13.0.0`
- **Playwright:** `1.64.1`
- **Chromium:** Playwright Chromium/Headless Shell `156.0.8078.4`
- **OS:** Debian GNU/Linux 12 (bookworm), Linux `7.0.0-43-generic` x86_64
- **Clone:** `/tmp/opencode/chatout-verify-v25`
- **Verified commit:** `7ca3d91` (branch tip)

Environment preparation inside the disposable container:

```bash
apt-get update
apt-get install -y --no-install-recommends ripgrep zip
npm install
npx playwright install --with-deps chromium
```

## Final verification commands and results

All commands ran in `/work` (the mounted disposable clone) on commit
`7ca3d91`.

| Command | Exit | Result |
|---|---:|---|
| `node scripts/build-extension.mjs` | 0 | `Built 12 extension artifacts from src/.` |
| `make test-browser` | 0 | Unit **13 passed, 0 failed**; browser **23 passed, 0 failed** |
| `./scripts/check-forbidden-analytics-patterns.sh` | 0 | `✅ No forbidden analytics patterns found in emitted extension artifacts.` |
| `./scripts/check-forbidden-domains.sh` | 0 | `✅ No forbidden domains detected in shipped extension artifacts.` |
| `./scripts/package-extension.sh` | 0 | Wrote `dist/chatout-chrome-v3.7.0.25.zip` (50 entries; manifest version `3.7.0.25`) |
| `git diff --check` | 0 | No whitespace errors |

### Browser suite results

```
PASS chatgpt single-chat export
PASS archive project controls are not injected into the page
PASS popup shows Archive project only on a supported project page
PASS popup shows project archive progress and cancellation
PASS popup restores a running project archive after reopening
PASS chatgpt project chat export
PASS claude single-chat export
PASS chatgpt project archive
PASS chatgpt project archive falls back to the page
PASS claude project archive
PASS gemini notebook archive
PASS chatgpt archive everything dedupes
PASS chatgpt projects only and chats only
PASS claude archive everything dedupes
PASS popup checkbox runs once and unchecks itself
PASS grok project archive
PASS grok archive everything dedupes and reports failures
PASS popup archive everything: declining the confirm starts nothing
PASS popup cancel stops a running archive and saves nothing
PASS popup project cancel stops the run and saves nothing
PASS include images and attachments: on saves files and rewrites links, off unchanged
PASS gemini archive everything lists chats with MaZiqc
PASS gemini falls back to a sidebar without links
23 passed, 0 failed
```

### Environment-only issue corrected

The first package attempt inside the container exited `127` because the
minimal Node image did not include the `zip` binary:

```
./scripts/package-extension.sh: line 32: zip: command not found
```

`zip` was installed in the disposable container, then the package command
re-ran with exit `0`. No repository code or test was changed.

## Manual spot checks still useful

The automated suite covers the requested behavior. A quick unpacked-extension
reload is still useful before release:

1. No "Archive project" button or status panel is injected into the page.
2. The ChatOut popup shows "Archive project" and the detected provider on a
   project page.
3. Starting it shows progress in the popup; Cancel stops it.
4. Closing the popup during a run and reopening it restores progress.
5. Reopening after completion restores the completion text.
6. A normal chat page shows no project control, and single-chat export still
   works.

## Next action

Complete. The approved branch was merged into `main` with `--no-ff` and the
feature branch was removed. The full required gate passed at `7ca3d91`; the
only post-verification changes were the task move, this handoff, and the merge
commit. No verification blockers remain. Use the packaged
`dist/chatout-chrome-v3.7.0.25.zip` for release if desired.
