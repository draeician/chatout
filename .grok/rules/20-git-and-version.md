# Git, versioning, and release

Follow `.crules/modes/GIT_POLICY.md` in full when present.

## Conventional commits

`feat` | `fix` | `docs` | `chore` | `refactor` — imperative subject, ≤72 chars.

## Version sources (must match)

1. `manifest.json` → `version` — **master** (and only release version string)
2. Git tags on release when used (`vX.Y.Z` or multi-part matching the zip)

There is no separate package `__version__`. After a bump, the packaged zip name
from `./scripts/package-extension.sh` should reflect the same version.

Bump from the highest observed value (monotonic). Prefer matching historical
Chrome multi-part versioning used in this repo rather than inventing a pure
SemVer scheme.

**Loadable extension updates:** always bump `manifest.json` `version` by
**+1 on the last segment** (`X.Y.Z.N` → `X.Y.Z.(N+1)`) so the user can see
the version change after reloading the extension.

## Pre-commit

- Heuristic secret scan on staged files.
- No credentials or private conversation dumps committed.
- After version edit, confirm `manifest.json` and any release notes/changelog entry agree.

## Shortcuts

User says **commit** / **branch** / **release** → Manager persona + `GIT_POLICY.md`.
