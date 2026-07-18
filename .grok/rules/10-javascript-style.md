# JavaScript coding style (ai-export-drae-chrome)

Apply on any `*.js` / `*.mjs` / `*.ts` edit under this repository.

## Language and packaging

- Chrome Manifest V3 extension — no in-repo bundler or `package.json` app stack.
- Source of truth: `src/`. After edits, run `node scripts/build-extension.mjs`.
- Prefer existing vendored libraries under `src/content/vendor/` and existing patterns; do not add npm dependencies without an explicit request.
- Treat minified one-line files carefully: precise string replacements or small Node scripts beat full-file reformats.

## Style

1. Match surrounding file style (many shipped files are already minified).
2. Prefer `const` / `let`; avoid new `var`.
3. Prefer clear, existing naming conventions in non-minified scripts (`scripts/`, debug harnesses).
4. Keep modules and message contracts stable (`webext-bridge` destinations, message IDs).
5. Prefer small pure helpers when adding logic that can be reasoned about outside the DOM.
6. Do not introduce TypeScript toolchain requirements; `src/shared/endpoints.ts` is reference-only unless the user wires a compiler.

## Extension-specific

1. Content-script DOM selectors are fragile — when a provider breaks, fix selectors first.
2. Debug overlays (`*-title-debug.js`) must stay gated (e.g. `localStorage` flags); do not enable them by default in production paths.
3. Config allowlists (`ALLOWED_EXTERNAL_DOMAINS`, shared config) must stay consistent between `src/` and built copies after rebuild.
4. `sendMessage(messageId, data, destination)` — never pass destination as a bare second positional that silently defaults to `"background"`.

## Safety

- No analytics IDs, tracking beacons, or banned domains in shipped artifacts.
- No secrets or conversation dumps committed.
- Prefer safe shell/script practices in `scripts/` (explicit args, no reckless eval).

## Structure preference

Keep changes local to the provider path or module that owns the bug. Split only when size or clarity demands it; preserve public export behavior.

## Verification

- Default smoke: `node scripts/build-extension.mjs`
- Guards when touching network/config/content: forbidden analytics/domain scripts
- Manual: reload unpacked extension and exercise the affected provider UI
