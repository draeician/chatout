# Git Policy

## Conventional Commits

All commits MUST follow the Conventional Commits specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

| Type       | Purpose                                          |
|------------|--------------------------------------------------|
| `feat`     | A new feature                                    |
| `fix`      | A bug fix                                        |
| `docs`     | Documentation-only changes                       |
| `chore`    | Maintenance tasks (deps, CI, tooling)            |
| `refactor` | Code change that neither fixes a bug nor adds a feature |

### Version Bump Rules

Version master is **`manifest.json`** (`version` field). Use the repo’s Chrome multi-part scheme and keep versions **monotonic**.

| Type       | Default intent                         |
|------------|----------------------------------------|
| `feat`     | Larger (minor-ish) segment bump        |
| `fix`      | Patch / build segment bump             |
| `docs`     | Patch / build segment bump (or skip if docs-only and user prefers) |
| `chore`    | Patch / build segment bump             |
| `refactor` | Patch / build segment bump             |

A `BREAKING CHANGE:` footer or `!` after the type implies a major-segment bump.

**Cross-file consistency**: There is no second runtime version file. After packaging, the zip name from `scripts/package-extension.sh` should match `manifest.json`. Keep `CHANGELOG.md` aligned on releases.

### Rules

- Subject line: imperative mood, lowercase preferred, no trailing period, max 72 chars.
- Body (optional): explain *why*, not *what*. Wrap at 80 chars.
- Breaking changes: add `BREAKING CHANGE:` footer or `!` after the type.
- Reference issues: `Closes #42`, `Fixes #13`.

## Branching Strategy

All work SHOULD happen on a branch — avoid direct commits to the shared default branch when collaborating.

| Branch Pattern          | Use Case                          |
|-------------------------|-----------------------------------|
| `feat/feature-name`     | New features                      |
| `fix/issue-name`        | Bug fixes                         |
| `docs/topic`            | Documentation updates             |
| `chore/description`     | Maintenance / tooling changes     |
| `refactor/description`  | Code restructuring                |

### Rules

- Branch names: lowercase, hyphen-separated words.
- Delete the branch after merge when appropriate.
- Keep branches short-lived; rebase/merge with default branch before opening a PR when needed.

## Secret Prevention

### Hard Prohibitions

The following MUST NEVER be committed to version control:

- `.env`, `.env.*` files
- `.pem`, `.key`, `.p12`, `.pfx` certificate / key files
- `credentials.json`, `serviceAccountKey.json`, or similar credential files
- Hardcoded API keys, tokens, passwords, or connection strings
- Private AI conversation dumps that contain personal data (use care with sample exports)

### Pre-Commit Secret Scan

Before every commit, the **Manager** MUST run a heuristic secret scan on all staged files. The scan checks for:

1. **File-name patterns**: `.env`, `.pem`, `.key`, `credentials.json`, `secret*`, `*.p12`.
2. **Content patterns** (regex examples):
   - `(?i)(api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*\S+`
   - `-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`
   - `ghp_[A-Za-z0-9]{36}` (GitHub PAT)
   - `sk-[A-Za-z0-9]{32,}` (OpenAI-style key)
   - `AKIA[0-9A-Z]{16}` (AWS access key ID)
3. **Outcome**:
   - If any match is found, the commit MUST be **blocked** and the user alerted with the file name, line number, and matched pattern.
   - False positives may be overridden only with an explicit user confirmation.

### Extension-specific packaging checks

Before release commits, prefer running:

- `./scripts/check-forbidden-analytics-patterns.sh`
- `./scripts/check-forbidden-domains.sh`

### .gitignore Enforcement

The Manager SHOULD verify that `.gitignore` still ignores generated multi-IDE crules dumps (e.g. `.cursor/rules/*.mdc`) when present, and does **not** ignore `AGENTS.md`, `project_spec.md`, `.crules/`, or `.grok/`.

## Release Protocol

A release is only official once the user accepts the version + packaged artifact (and git tag if they requested one). Use the **release** shortcut so tags match `manifest.json` when tags are used.
