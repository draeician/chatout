import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const code = readFileSync(path.join(root, "src/content/project-archive-lib.js"), "utf8");
const sandbox = {
  console: console,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  Uint8Array: Uint8Array,
  Uint32Array: Uint32Array,
  DataView: DataView,
  URL: URL,
  Date: Date,
  Set: Set,
  Map: Map,
  Promise: Promise,
  Math: Math,
  Number: Number,
  String: String
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const lib = sandbox.__CHATOUT_ARCHIVE_LIB__;

test("sanitizes path characters and windows-reserved names", function () {
  assert.equal(lib.sanitizeSegment("Hello/World?", "chat"), "hello_world");
  assert.equal(lib.sanitizeSegment("../../etc/passwd", "chat"), "etc_passwd");
  assert.equal(lib.sanitizeSegment("CON", "chat"), "_con");
  assert.equal(lib.sanitizeSegment("   ", "chat"), "chat");
  assert.equal(lib.sanitizeSegment("Café notes", "chat"), "café_notes");
});

test("dedupes identical title stems and keeps the id", function () {
  const paths = lib.buildChatPaths("My Research", [
    { title: "Packing list", id: "aaaaaaaa-1111-4111-8111-111111111111", updated: "2024-05-06T00:00:00.000Z" },
    { title: "Packing list", id: "aaaaaaaa-1111-4111-8111-111111111111", updated: "2024-05-06T00:00:00.000Z" },
    { title: "Hello/World?", id: "bbbbbbbb-2222-4222-8222-222222222222", updated: "2024-05-07T00:00:00.000Z" }
  ]);
  assert.deepEqual(plain(paths), [
    "my_research/2024-05-06_packing_list_11111111.md",
    "my_research/2024-05-06_packing_list_11111111_2.md",
    "my_research/2024-05-07_hello_world_22222222.md"
  ]);
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("detects project urls and ignores a normal chat", function () {
  assert.deepEqual(
    plain(lib.detectProjectUrl("https://chatgpt.com/g/g-p-fixture/project")),
    { provider: "chatgpt", id: "g-p-fixture" }
  );
  assert.equal(lib.detectProjectUrl("https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), null);
  assert.equal(
    plain(lib.detectProjectUrl("https://claude.ai/project/99999999-9999-4999-8999-999999999999")).provider,
    "claude"
  );
  assert.deepEqual(
    plain(lib.detectProjectUrl("https://gemini.google.com/notebook/nb-fixture")),
    { provider: "gemini", id: "nb-fixture" }
  );
  assert.equal(lib.detectProjectUrl("https://gemini.google.com/app/alpha"), null);
});

test("stops paging when the cursor repeats and keeps partial results on error", async function () {
  let calls = 0;
  const ok = await lib.collectPages(async function (cursor) {
    calls += 1;
    if (cursor == null) return { items: [{ id: "a", title: "A" }], nextCursor: 1 };
    return { items: [{ id: "b", title: "B" }, { id: "a", title: "dup" }], nextCursor: null };
  });
  assert.equal(calls, 2);
  assert.deepEqual(plain(ok.items.map(function (item) { return item.id; })), ["a", "b"]);

  const partial = await lib.collectPages(async function (cursor) {
    if (cursor == null) return { items: [{ id: "a", title: "A" }], nextCursor: 1 };
    throw new Error("project list HTTP 500");
  });
  assert.equal(partial.items.length, 1);
  assert.match(partial.note, /HTTP 500/);
});

test("writes a zip another tool can read", function () {
  const bytes = lib.buildStoredZip([
    { name: "my_research/hello_world.md", text: "Bring a raincoat\n" },
    { name: "my_research/_index.md", text: "Exported: 1\nFailed: 0\n" }
  ]);
  const dir = mkdtempSync(path.join(os.tmpdir(), "chatout-zip-"));
  const file = path.join(dir, "out.zip");
  writeFileSync(file, bytes);
  const listing = execFileSync("python3", ["-c", "import zipfile,sys; print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", file], { encoding: "utf8" });
  assert.match(listing, /my_research\/hello_world\.md/);
  const body = execFileSync("python3", ["-c", "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())", file, "my_research/hello_world.md"], { encoding: "utf8" });
  assert.match(body, /Bring a raincoat/);
  assert.throws(function () { lib.buildStoredZip([{ name: "../secret.md", text: "nope" }]); });
  rmSync(dir, { recursive: true, force: true });
});

test("zip name is provider-project-timestamp in local time", function () {
  const name = lib.zipDownloadName("chatgpt", "Repo AetherGate", new Date(2026, 0, 5, 3, 4, 5));
  assert.equal(name, "chatgpt-repo-aethergate-20260105-030405.zip");
  assert.equal(lib.zipDownloadName("claude", "", new Date(2026, 9, 31, 13, 32, 5)), "claude-project-20261031-133205.zip");
});
