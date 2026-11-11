import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const code = readFileSync(path.join(root, "src/content/context-gauge-lib.js"), "utf8");
const sandbox = { console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const lib = sandbox.__CHATOUT_CONTEXT_LIB__;

test("estimates about 4 characters per token and 1 per CJK character", function () {
  const nihao = String.fromCharCode(0x4f60, 0x597d);
  assert.equal(lib.estimateTokens("abcd"), 1);
  assert.equal(lib.estimateTokens("abcde"), 2);
  assert.equal(lib.estimateTokens(nihao), 2);
  assert.equal(lib.estimateTokens("ab" + nihao), 3);
});

test("unknown and flagship models use the 200k calibration fallback", function () {
  assert.equal(lib.resolveLimit("", null).limit, 200000);
  assert.equal(lib.resolveLimit("gpt-5.2", null).source, "fallback");
  assert.equal(lib.resolveLimit("gpt-5.2-thinking", null).limit, 200000);
  assert.equal(lib.resolveLimit("gpt-4o", null).limit, 32000);
  assert.equal(lib.resolveLimit("gpt-4o-mini", null).source, "instant");
  assert.equal(lib.resolveLimit("GPT-4", null).limit, 32000);
  assert.equal(lib.resolveLimit("gpt-4.1", null).limit, 200000);
  assert.equal(lib.resolveLimit("gpt-3.5-turbo", null).limit, 16000);
  assert.equal(lib.resolveLimit("gpt-5.2", 50000).source, "override");
  assert.equal(lib.resolveLimit("gpt-4o", 12).limit, 32000);
});

test("visible-only red starts well before Chat B's 66k death", function () {
  const ceiling = lib.visibleOnlyLimit(lib.FALLBACK_LIMIT);
  assert.equal(ceiling, 40000);
  assert.ok(ceiling * 0.8 < 65757 * 0.6);
  assert.equal(lib.usage(32000, 0, ceiling, "dom").band, "amber");
  assert.equal(lib.usage(32001, 0, ceiling, "dom").band, "red");
  const died = lib.usage(65757, 0, ceiling, "dom");
  assert.equal(died.band, "red");
  assert.match(died.caveat, /visible text only, may under-read/);
  assert.match(lib.tooltip(died), /Visible text only, may under-read/);
  assert.match(lib.tooltip(died), /Ask for a resume summary now/);
  assert.equal(lib.visibleOnlyLimit(16000), 16000);
});

test("a text-heavy chat turns red on the default window with room left", function () {
  const early = lib.usage(150000, 0, lib.FALLBACK_LIMIT, "json");
  assert.equal(early.band, "amber");
  assert.equal(early.caveat, "");
  const wall = lib.usage(185632, 0, lib.FALLBACK_LIMIT, "json");
  assert.equal(wall.band, "red");
  assert.ok(wall.percent < 100);
  assert.match(lib.tooltip(wall), /Ask for a resume summary now/);
});

test("hidden tool tokens fill the window when visible text does not", function () {
  const visibleOnly = lib.usage(65757, 0, lib.FALLBACK_LIMIT, "json");
  assert.equal(visibleOnly.band, "green");
  const withTools = lib.usage(65757, 120000, lib.FALLBACK_LIMIT, "json");
  assert.equal(withTools.band, "red");
  assert.match(lib.tooltip(withTools), /Hidden\/tool 120,000/);
  assert.match(lib.tooltip(withTools), /Visible 65,757/);
});

test("counts every mapping node, split into visible and hidden", function () {
  const counted = lib.countConversation({
    current_node: "n2",
    default_model_slug: "gpt-5.2",
    mapping: {
      n0: { id: "n0", parent: null, message: null },
      n1: {
        id: "n1",
        parent: "n0",
        message: {
          author: { role: "user" },
          content: { content_type: "multimodal_text", parts: [{ asset_pointer: "file-service://file-1" }, "Hello"] },
          metadata: { attachments: [{ name: "notes.pdf", extracted_text: "SECRET FILE BODY" }] },
          recipient: "all"
        }
      },
      n2: {
        id: "n2",
        parent: "n1",
        message: {
          author: { role: "assistant" },
          content: { content_type: "text", parts: ["Hi there"] },
          metadata: { model_slug: "gpt-4o" },
          recipient: "all"
        }
      },
      tool: {
        id: "tool",
        parent: "n1",
        message: {
          author: { role: "tool", name: "browser" },
          content: { content_type: "text", parts: ["x".repeat(400)] },
          metadata: {},
          recipient: "all"
        }
      },
      sys: {
        id: "sys",
        parent: null,
        message: {
          author: { role: "system" },
          content: { content_type: "text", parts: ["system prompt text"] },
          metadata: {}
        }
      },
      orphan: {
        id: "orphan",
        parent: "n0",
        message: {
          author: { role: "assistant" },
          content: { content_type: "text", parts: ["abandoned branch answer"] },
          metadata: {},
          recipient: "all"
        }
      }
    }
  });
  assert.equal(counted.model, "gpt-4o");
  assert.ok(counted.visibleTokens >= lib.estimateTokens("Hello\nHi there\nabandoned branch answer"));
  assert.ok(counted.hiddenTokens >= lib.estimateTokens("x".repeat(400)));
  assert.ok(counted.hiddenTokens >= lib.estimateTokens("SECRET FILE BODY"));
  assert.ok(counted.hiddenTokens >= lib.estimateTokens("system prompt text"));
  const live = lib.countConversation({
    current_node: "n2",
    mapping: {
      n1: { message: { author: { role: "user" }, content: { content_type: "text", parts: ["Only live"] }, recipient: "all" } },
      side: { message: { author: { role: "tool", name: "browser" }, content: { content_type: "text", parts: ["side tool body that is long enough"] } } }
    }
  });
  assert.ok(live.hiddenTokens >= lib.estimateTokens("side tool body that is long enough"));
  assert.equal(live.visibleTokens, lib.estimateTokens("Only live"));
});

test("reads a conversation id from project and plain chat urls", function () {
  assert.equal(lib.conversationIdFromPath("/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(lib.conversationIdFromPath("/g/g-p-fixture/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(lib.conversationIdFromPath("/g/g-p-fixture/project"), "");
  assert.equal(lib.isChatGptHost("chatgpt.com"), true);
  assert.equal(lib.isChatGptHost("claude.ai"), false);
});
