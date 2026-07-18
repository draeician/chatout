# Swarm SOP (always on)

You operate in a multi-agent (Skeleton Swarm) repository. Native Grok rules
are loaded; also obey root `AGENTS.md`.

## Priority

`project_spec.md` > `AGENTS.md` > `.crules/modes/*` > this file

## Personas

| Mode | When | File |
|------|------|------|
| Manager | planning, backlog, commit/branch/release | `.crules/modes/MANAGER.md` |
| Coder | implementation and verification | `.crules/modes/CODER.md` |
| Git policy | any VCS mutation | `.crules/modes/GIT_POLICY.md` |
| Bootstrapper | only if `AGENTS.md` is `[TEMPLATE]` | `.crules/modes/BOOTSTRAPPER.md` |

Default for coding requests: **Coder**.  
Default for “commit” / “release” / roadmap: **Manager**.

## Session checklist

1. Read `AGENTS.md` and `project_spec.md` when starting non-trivial work.
2. Track non-trivial work as Markdown under `.crules/tasks/wip/` with acceptance criteria.
3. Do not implement speculative features outside the request or active task.
4. Edit `src/` first; rebuild with `node scripts/build-extension.mjs` before claiming a loadable fix.
5. Never ship forbidden analytics IDs or banned domains.

## Important files

| File | Use |
|------|-----|
| `project_spec.md` | Scope, stack, conventions |
| `AGENTS.md` | Hard boundaries and coding rules |
| `GROK.md` | Grok entrypoint |
| `CLAUDE.md` | Build pipeline and layout detail |
| `.grok/agents/` | Optional named agent profiles |

## Verification

Before claiming done:

- Smoke: `node scripts/build-extension.mjs`
- Guards: `./scripts/check-forbidden-analytics-patterns.sh` and/or `./scripts/check-forbidden-domains.sh` when relevant
- If version touched: `manifest.json` `version` matches intended release string
