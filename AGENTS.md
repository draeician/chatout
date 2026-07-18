# Agent System Status: [CUSTOMIZED]

Canonical instruction file for Grok Build, Codex, Claude Code, Cursor, and human contributors.

Read this file completely before changing code. When instructions conflict:

`project_spec.md` > `AGENTS.md` > `.crules/modes/*` > tool-specific entrypoints (`GROK.md`, `CLAUDE.md`, `CODEX.md`)

## Project identity

This repository is **ai-export-drae-chrome**: a Manifest V3 Chrome extension (`ai-exporter-drae`) that exports AI chat conversations to Markdown, text, and PDF.

- Extension / product name: `ai-exporter-drae`
- Version master: `manifest.json` (`version` field; Chrome multi-part, e.g. `3.6.13.5`)
- Runtime version source: same `manifest.json` field
- Smoke: `node scripts/build-extension.mjs`
- Guards (CI): `./scripts/check-forbidden-analytics-patterns.sh` and `./scripts/check-forbidden-domains.sh`
- Package: `./scripts/package-extension.sh`
- Tests: no formal unit suite; build + guards + manual extension reload
- Authoritative scope: `project_spec.md`
- Build / layout detail: `CLAUDE.md`

## Required reading before implementation

1. `AGENTS.md` (this file)
2. `project_spec.md`
3. Active task under `.crules/tasks/wip/` (if present)
4. Relevant swarm mode under `.crules/modes/` when acting as Manager or Coder
5. `CLAUDE.md` for `src/` vs root-artifact rules
6. `README.md` / `CHANGELOG.md` when changing user-facing behavior

## Swarm SOP (crules)

This repo uses the **Skeleton Swarm** workflow.

| Path | Role |
|------|------|
| `.crules/modes/MANAGER.md` | Orchestrate, version, task pipeline — do not implement product code |
| `.crules/modes/CODER.md` | Implement atomic, verified changes from tasks / user request |
| `.crules/modes/GIT_POLICY.md` | Conventional commits, branching, secret scan, release |
| `.crules/modes/BOOTSTRAPPER.md` | Only if status were still `[TEMPLATE]` |
| `.crules/tasks/{wip,review,done}/` | Markdown task files with acceptance criteria |
| `project_spec.md` | Single source of truth for scope and conventions |
| `.grok/rules/` | Always-on Grok project rules (SOP + style) |
| `.grok/agents/` | Optional Grok agent profiles (manager / coder / swarm) |

Default persona for implementation work: **Coder**.  
Default persona for planning, commits, releases, backlog: **Manager**.

Shortcut keywords (act as Manager, then follow `GIT_POLICY.md`):

- **commit** — secret scan, version bump in `manifest.json` if warranted, conventional commit
- **branch** — create `feat/` / `fix/` / `docs/` / `chore/` / `refactor/` branch
- **release** — verify version, changelog, package zip, tag (only if asked)

## Hard boundaries

1. **Edit `src/` first**, then run `node scripts/build-extension.mjs` so root / `content-scripts/` / `chunks/` artifacts match. Never ship a fix that only patched a root artifact.
2. Never commit secrets, credentials, API keys, or private conversation exports.
3. Never introduce analytics IDs (`G-…`, `UA-…`), tracking beacons, or banned domains (CI guards enforce this).
4. Do not use the legacy pipeline (`build_extension.sh`, `content-scripts/split/*`, `explode_content.pl`, `fix.bash`).
5. Do not expand scope beyond `project_spec.md` / the active task without user confirmation.
6. Minimum code that solves the problem. Nothing speculative (no new providers/export formats unless requested).
7. Touch only what you must. Clean up only your own mess.
8. Define success criteria. Loop until verified (build + guards at minimum).
9. Prefer list-form shell/script invocations; no reckless `shell=True`-style patterns in new Python helpers.
10. No `pip install --break-system-packages`.

## Coding style

- Match existing project style before introducing new patterns.
- Prefer precise edits to minified bundles in `src/` (string replace / small Node one-liners) rather than reformatting entire one-line files.
- Keep `webext-bridge` call shape: `sendMessage(messageId, data, destination)`.
- Document user-facing export behavior changes in `CHANGELOG.md` when releasing.

## Versioning and packaging

- Master (and only) version string: `manifest.json` → `version`.
- Bump when shipping a loadable fix users will verify in Chrome; use the existing multi-part Chrome version scheme (monotonic increase).
- **Per loadable update**: increment the last segment by **1** (`0.0.0.1` style, e.g. `3.7.0.1` → `3.7.0.2`) so the popup/settings version clearly changes on extension refresh.
- Conventional commit types map to bumps: `feat` → minor-ish segment when warranted, otherwise prefer last-segment `+1`; `fix`/`docs`/`chore`/`refactor` → last-segment `+1` unless a larger bump is intentional.
- Package with `./scripts/package-extension.sh`; zips land in `dist/`.

## Testing discipline

- Always run `node scripts/build-extension.mjs` after source changes that affect shipped artifacts.
- Run forbidden-pattern guards before claiming packaging readiness or after touching network/domain config.
- Prefer the smallest check that proves the change; manual Chrome reload for DOM/selector fixes.
- Do not invent a test framework without an explicit request.

## Git discipline

- Follow `.crules/modes/GIT_POLICY.md` when present.
- Conventional commits; no force-push to shared default branches unless explicitly requested.
- Do not commit as part of unrelated tasks without the user asking.
- Feature work on branches like `feat/…` / `fix/…`.

## Common principles

- Don’t assume. Don’t hide confusion. Surface tradeoffs.
- Prefer short, actionable edits over huge rewrites.
- Track non-trivial work in `.crules/tasks/wip/` with acceptance criteria.
- Provider UIs break selectors often: fix selectors in the content path, not architecture, unless the architecture is the bug.
