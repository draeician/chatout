/* Fails if Chinese, Japanese, or Korean text shows up in user-facing source.
   Kept on purpose:
   - _locales packs for zh_CN, zh_TW, ja, and ko (default_locale is en)
   - tests/browser/fixtures, where a saved chat may be in those languages
   - tests/unit/cjk-numbering-allowlist.json, the list/number glyphs the
     document converter writes for Chinese, Japanese, and Korean lists
   - the packed HTML-entity table stored as new Uint16Array('...') */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const skipDirs = new Set([".git", "node_modules", "dist", "test-results", "playwright-report"]);
const allowPrefixes = [
  "_locales/zh_CN/",
  "_locales/zh_TW/",
  "_locales/ja/",
  "_locales/ko/",
  "tests/browser/fixtures/"
];
const allowlistRel = "tests/unit/cjk-numbering-allowlist.json";
const numberingFiles = new Set(["src/content/content.js", "content-scripts/content.js"]);
const glyphs = JSON.parse(readFileSync(path.join(root, allowlistRel), "utf8"));
const textExt = /\.(js|mjs|cjs|html|md|json|txt|ts|css|svg)$/;

function stripUint16(text) {
  const key = "new Uint16Array('";
  let out = "";
  let i = 0;
  while (true) {
    const j = text.indexOf(key, i);
    if (j < 0) return out + text.slice(i);
    out += text.slice(i, j);
    const k = text.indexOf("')", j + key.length);
    if (k < 0) return out + text.slice(j);
    i = k + 2;
  }
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const abs = path.join(dir, name);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (rel === allowlistRel) continue;
    if (allowPrefixes.some(function (prefix) { return rel === prefix.slice(0, -1) || rel.startsWith(prefix); })) continue;
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (textExt.test(rel)) out.push(rel);
  }
}

test("user-facing source has no CJK outside the allow list", function () {
  const files = [];
  walk(root, files);
  const hits = [];
  for (const rel of files) {
    let text = readFileSync(path.join(root, rel), "utf8");
    if (numberingFiles.has(rel)) {
      text = stripUint16(text);
      for (const glyph of glyphs) text = text.split(glyph).join("");
    }
    const at = text.search(cjk);
    if (at >= 0) hits.push(rel + ": " + JSON.stringify(text.slice(Math.max(0, at - 48), at + 48)));
  }
  assert.deepEqual(hits, []);
});

test("default locale is English", function () {
  const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.default_locale, "en");
});

test("chatgpt project chat urls expose the conversation id", function () {
  const source = readFileSync(path.join(root, "src/content/content.js"), "utf8");
  const literal = String.raw`/\/c\/([0-9a-fA-F-]{8,})(?=\/|$)/`;
  assert.ok(source.includes("_getConversationIdFromUrl(){try{const m=location.pathname.match(" + literal));
  const re = /\/c\/([0-9a-fA-F-]{8,})(?=\/|$)/;
  function id(pathname) {
    const match = pathname.match(re);
    return match ? match[1] : null;
  }
  assert.equal(id("/g/g-p-fixture/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(id("/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(id("/g/g-p-fixture/project"), null);
});
