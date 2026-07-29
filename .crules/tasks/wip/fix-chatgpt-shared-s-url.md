# Fix: ChatGPT shared conversation URL (`/s/t_…`)

**Branch:** `fix/chatgpt-shared-s-url`  
**Status:** wip  
**Reporter URL:** `https://chatgpt.com/s/t_6a6a1c6b76848191ade3a3e2829b2ed8`  
**Type:** shared conversation link (friend-shared), not a normal `/c/{uuid}` chat.

## Problem

Export fails (or popup blocks export) on ChatGPT **shared** URLs of the form:

```
https://chatgpt.com/s/t_<hex-id>
```

Content scripts already match `https://chatgpt.com/*` in `manifest.json`, so injection is fine. The likely gate is the popup “is this a chat page” check.

## Likely root cause

From `NOTE.md` / `src/popup/index.js` provider config `mt`:

```js
{ name: "ChatGPT", hosts: ["chat.openai.com","chatgpt.com"], chatPaths: ["/c","/g/"] }
```

Pathname `/s/t_…` does **not** include `/c` or `/g/`, so `connectionStatus` becomes `"home"` and the popup shows `hint.goToChatPage` instead of enabling export.

Secondary risk (content path):

- Full-conversation API path parses conversation id from `/c/{uuid}` only (`RESUME.md`). Shared pages may use a different id shape (`t_…`) and/or different backend endpoints / DOM structure. After unblocking the popup, verify DOM scrape and (if used) API id extraction still work on a live `/s/` page.

## Scope (edit `src/` first, then rebuild)

1. **Popup** (`src/popup/index.js`): add ChatGPT `chatPaths` entry for shared links, e.g. `"/s/"` (substring match via `pathname.includes`).
2. **Content** (`src/content/content.js`): only if needed after popup fix — conversation-id parsing, title selectors, or message selectors for shared view.
3. Rebuild: `node scripts/build-extension.mjs`.
4. Version: bump `manifest.json` last segment by +1 when shipping a loadable fix.
5. Changelog entry when releasing.

Out of scope unless discovered during fix: other share URL shapes, guest-mode root `/`, new providers.

## Acceptance criteria

- [x] On `https://chatgpt.com/s/t_*`, popup does **not** treat the tab as home / “go to chat page”.
- [ ] Export (at least Markdown or text) produces non-empty conversation content on a real shared page when messages are visible in the DOM. *(manual — needs live shared URL on laptop)*
- [x] Existing `/c/{uuid}` and `/g/.../c/...` ChatGPT URLs still pass the chatPaths check (no regression — paths retained, `/s/` and `/share` added).
- [x] Changes landed in `src/` and rebuilt artifacts match (`node scripts/build-extension.mjs`).
- [x] No forbidden analytics/domains introduced.

## Notes for Coder

- Prefer minimal change: extend `chatPaths` first; only touch content scrapers if export still fails after popup unlock.
- Minified sources: precise string replace or small Node one-liner.
- Do not commit conversation contents from the shared URL.
- Manual verify: load unpacked extension, open the shared URL, open popup, export.

## Done when

User can export the reported shared URL style after reload; criteria above checked.
