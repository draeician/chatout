# Refreshing browser fixtures

The headless tests do not log into ChatGPT, Claude, or Gemini. They load saved HTML and mocked responses that match the calls the extension makes. When a site changes its page or its logged-in endpoints, recapture from a profile that is already signed in, then update the committed fixtures by hand.

Captured output is gitignored. It can contain private chat text even after token fields are redacted. Read it locally and do not commit it.

## One-time profile

Use a Chrome profile that is not the one you have open day to day. Close every Chrome window using that profile before a script launches it (Chrome locks the directory).

```bash
# Sign in once, in a normal window. Then quit Chrome completely.
google-chrome --user-data-dir="$HOME/chatout-profile"
```

Log into the sites you care about. Quit Chrome.

## Recapture

From the repo root, with the extension already built (`node scripts/build-extension.mjs`):

```bash
node tests/browser/capture-fixtures.mjs \
  --profile "$HOME/chatout-profile" \
  --url "https://chatgpt.com/g/g-p-YOURPROJECT/project" \
  --out tests/browser/fixtures/captured/chatgpt
```

The same command works for a Claude project URL (`https://claude.ai/project/...`) and a Gemini notebook URL.

It writes:

- `page.html` — the project page after a scroll, so lazy chat rows are in the DOM
- `network.json` — responses whose URLs look like the site's own chat APIs, with token-like fields replaced

## What to copy back

1. From `page.html`, keep the smallest structure the archive button needs: the project `h1`, chat links inside `main` (`/c/…`, `/chat/…`, or `/app/…`), and for Gemini the inline `SNlM0e` / `cfb2h` / `FdrFJe` keys. Put that into `tests/browser/fixtures/<site>.html` using fake titles.
2. From `network.json`, keep the JSON shape (field names, cursor / `has_more`, message roles) and replace titles and message text with short fake sentences in `tests/browser/mock-site.mjs`.
3. If the list URL or the notebook path changed, update `detectProjectUrl` in `src/content/project-archive-lib.js` and the matching branch in `src/content/project-archive.js`.
4. Run `make test-browser`.

## Live archive (real site, no clicking)

```bash
node tests/browser/live-archive.mjs \
  --profile "$HOME/chatout-profile" \
  --url "https://chatgpt.com/g/g-p-YOURPROJECT/project" \
  --out "$HOME/chatout-archives" \
  --delay 400
```

The script opens the URL, clicks **Archive project**, waits until the zip is on disk, copies it to `--out`, and prints `Exported N, failed M`. `--delay` is the pause between chats in milliseconds (default 400). A failed chat does not stop the run; the zip's `_index.md` names it.
