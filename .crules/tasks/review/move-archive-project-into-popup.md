# Task: Move Archive project into the ChatOut popup

- **Owner:** Assigned coding agent
- **Branch:** `fix/archive-project-idle-status`
- **Base:** `origin/main` @ `e100962` (v3.7.0.23)
- **Verified commit:** `7ca3d91` (v3.7.0.25)
- **Status:** review — complete verification gate passed in a disposable Node 22 environment

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
- [x] `make test-browser` passes: unit 13/13 and browser 23/23.
- [x] `node scripts/build-extension.mjs` passes and regenerates artifacts.
- [x] `manifest.json` version is `3.7.0.25` with a matching `CHANGELOG.md`
      heading.
- [x] Forbidden analytics and domain guards pass with `ripgrep` installed.
- [x] `./scripts/package-extension.sh` writes
      `dist/chatout-chrome-v3.7.0.25.zip`.
- [x] `git diff --check` passes.
- [x] Changes are scanned for secrets.
- [x] Work is committed and pushed on the branch; task remains in `review/`.

## Verification environment

The gate was run on a fresh clone of the branch inside a disposable Podman
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

## Final verification evidence

All commands below ran in `/work` (the mounted disposable clone) on the
verified commit.

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

### Environment-only failure corrected

The first package attempt inside the container exited `127` because the
minimal Node image did not include the `zip` binary:

```
./scripts/package-extension.sh: line 32: zip: command not found
```

`zip` was installed in the disposable container, then the package command
re-ran with exit `0`. No repository code or test was changed.

## Regression tests added

- `tests/unit/project-archive-popup.test.mjs`: the content script creates no
  page UI, status reports/clears the detected project, the project message
  refuses a normal chat, starts on a project page, and cancel reports the run
  was active.
- `tests/unit/project-archive-lib.test.mjs`: project detection covers
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

## Corrections

No production or test corrections were required. The branch passed the full
gate as committed at `7ca3d91`. This verification pass updates only the task
file and `HANDOFF.md`; version `3.7.0.25` and `CHANGELOG.md` remain unchanged
because no loadable change was needed.

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
