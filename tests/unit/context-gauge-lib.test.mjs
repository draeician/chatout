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

test("gpt-6-thinking uses the published 1,050,000 window instead of the fallback", function () {
  const resolved = lib.resolveLimit("gpt-6-thinking", null);
  assert.equal(resolved.limit, lib.GPT6_LIMIT);
  assert.equal(resolved.limit, 1050000);
  assert.equal(resolved.source, "gpt-6");
  assert.equal(resolved.model, "gpt-6-thinking");
  assert.equal(lib.resolveLimit("gpt-6", null).limit, 1050000);
  assert.equal(lib.resolveLimit("gpt-6-astra", null).source, "gpt-6");
  const named = lib.usage(8949, 0, resolved.limit, "json", resolved, {
    user: 2000, assistant: 6949, tool: 0, reasoning: 0, other: 0
  });
  assert.match(lib.tooltip(named), /Limit 1,050,000 \(gpt-6-thinking\)/);
  assert.doesNotMatch(lib.tooltip(named), /fallback/);
});

test("visible-only red starts well before Chat B's 66k death", function () {
  const ceiling = lib.visibleOnlyLimit(lib.FALLBACK_LIMIT);
  assert.equal(ceiling, 40000);
  assert.ok(ceiling * 0.8 < 65757 * 0.6);
  assert.equal(lib.usage(32000, 0, ceiling, "dom").band, "amber");
  assert.equal(lib.usage(32001, 0, ceiling, "dom").band, "red");
  const died = lib.usage(65757, 0, ceiling, "dom");
  assert.equal(died.band, "red");
  assert.equal(died.label, "100%+");
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
  const withTools = lib.usage(65757, 120000, lib.FALLBACK_LIMIT, "json", null, {
    user: 1000, assistant: 64757, tool: 120000, reasoning: 0, other: 0
  });
  assert.equal(withTools.band, "red");
  assert.match(lib.tooltip(withTools), /Tool 120,000/);
  assert.match(lib.tooltip(withTools), /User 1,000/);
  assert.match(lib.tooltip(withTools), /Ask for a resume summary now/);
  const lumped = lib.usage(65757, 120000, lib.FALLBACK_LIMIT, "json");
  assert.match(lib.tooltip(lumped), /Hidden\/tool 120,000/);
  assert.match(lib.tooltip(lumped), /Visible 65,757/);
});

test("a bogus hidden total does not ask for a resume summary", function () {
  const bogus = lib.usage(8949, 1110182, 200000, "json", { source: "fallback", model: "gpt-6-thinking" }, {
    user: 2000, assistant: 6949, tool: 0, reasoning: 0, other: 1110182
  });
  assert.equal(bogus.label, "100%+");
  assert.equal(bogus.band, "red");
  const tip = lib.tooltip(bogus);
  assert.match(tip, /Other 1,110,182/);
  assert.doesNotMatch(tip, /Ask for a resume summary now/);
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
          metadata: { attachments: [{ name: "notes.pdf", extracted_text: "S".repeat(2000) }] },
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
  assert.equal(counted.categories.user, lib.estimateTokens("Hello"));
  assert.ok(counted.visibleTokens >= lib.estimateTokens("Hello") + lib.estimateTokens("Hi there"));
  assert.equal(counted.categories.tool, lib.estimateTokens("x".repeat(400)));
  assert.ok(counted.hiddenTokens < lib.estimateTokens("S".repeat(2000)));
  assert.equal(counted.categories.other, lib.estimateTokens("system prompt text"));
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
  assert.equal(
    lib.conversationIdFromPath("/g/g-p-6a00000012348191a1b2c3d4e5f60718-my-project/c/01HXYZABCdef-more_id"),
    "01HXYZABCdef-more_id"
  );
  assert.equal(lib.conversationIdFromPath("/g/g-p-fixture/project"), "");
  assert.equal(lib.isChatGptHost("chatgpt.com"), true);
  assert.equal(lib.isChatGptHost("claude.ai"), false);
});

test("the label stops at 100%+ and the tooltip names the limit and raw counts", function () {
  const over = lib.usage(900000, 50000, lib.FALLBACK_LIMIT, "json", { source: "fallback", model: "gpt-5.2" });
  assert.equal(over.label, "100%+");
  assert.equal(over.band, "red");
  const tip = lib.tooltip(over);
  assert.match(tip, /Limit 200,000 \(fallback, gpt-5\.2\)/);
  assert.match(tip, /Visible 900,000/);
  assert.match(tip, /Hidden\/tool 50,000/);
  assert.match(tip, /Total 950,000/);
  const named = lib.usage(1000, 0, 32000, "json", { source: "instant", model: "gpt-4o" });
  assert.match(lib.tooltip(named), /Limit 32,000 \(gpt-4o\)/);
});

test("counts the paginated messages list ChatGPT returns instead of a mapping", function () {
  const tool = "z".repeat(400);
  const counted = lib.countConversation({
    default_model_slug: "gpt-5.2",
    messages: [
      { id: "u", author: { role: "user" }, content: { content_type: "text", parts: ["Hello"] }, recipient: "all", metadata: {} },
      { id: "t", author: { role: "tool", name: "browser" }, content: { content_type: "text", parts: [tool] }, metadata: {} },
      { id: "a", author: { role: "assistant" }, content: { content_type: "text", parts: ["Hi"] }, recipient: "all", metadata: { model_slug: "gpt-5.2" } }
    ]
  });
  assert.equal(counted.model, "gpt-5.2");
  assert.equal(counted.categories.user, lib.estimateTokens("Hello"));
  assert.equal(counted.categories.assistant, lib.estimateTokens("Hi"));
  assert.equal(counted.visibleTokens, counted.categories.user + counted.categories.assistant);
  assert.equal(counted.categories.tool, lib.estimateTokens(tool));
});

test("refreshing the same messages, including an overlapping page, does not change the count", function () {
  const tool = "z".repeat(400);
  const unnamed = "q".repeat(400);
  const shared = { id: "t", author: { role: "tool", name: "browser" }, content: { content_type: "text", parts: [tool] }, metadata: {} };
  const noId = { author: { role: "tool", name: "browser" }, content: { content_type: "text", parts: [unnamed] }, metadata: {} };
  const newer = [
    { id: "a", author: { role: "assistant" }, content: { content_type: "text", parts: ["Hi"] }, recipient: "all", metadata: { model_slug: "gpt-5.2" } },
    shared,
    noId
  ];
  const older = [
    { id: "u", author: { role: "user" }, content: { content_type: "text", parts: ["Hello"] }, recipient: "all", metadata: {} },
    shared,
    noId
  ];
  const once = lib.countConversation({ messages: newer.concat(older), default_model_slug: "gpt-5.2" });
  const repeated = newer.concat(newer, older, older, newer);
  const counts = [0, 1, 2].map(function () {
    return lib.countConversation({ messages: repeated, default_model_slug: "gpt-5.2" });
  });
  counts.forEach(function (counted) {
    assert.equal(counted.visibleTokens, once.visibleTokens);
    assert.equal(counted.hiddenTokens, once.hiddenTokens);
    assert.equal(counted.model, "gpt-5.2");
  });
  assert.equal(once.categories.user, lib.estimateTokens("Hello"));
  assert.equal(once.categories.assistant, lib.estimateTokens("Hi"));
  assert.equal(once.visibleTokens, once.categories.user + once.categories.assistant);
  assert.ok(once.hiddenTokens < lib.estimateTokens(tool + unnamed) + 40);
  assert.ok(once.hiddenTokens > lib.estimateTokens(tool));
  const doubledList = lib.dedupeMessages([repeated, repeated]);
  assert.equal(doubledList.length, lib.dedupeMessages([newer, older]).length);
});

test("a short chat with connector metadata stays under 10%", function () {
  const blob = "m".repeat(900000);
  const cipher = "Ab3+/xyzQ9".repeat(400);
  const data = {
    default_model_slug: "gpt-6-thinking",
    messages: [
      { id: "u", author: { role: "user" }, content: { content_type: "text", parts: ["Summarize the repo"] }, recipient: "all", metadata: { request_id: "req-1" } },
      { id: "call", author: { role: "assistant" }, content: { content_type: "code", language: "unknown", text: "search(\"repo\")" }, recipient: "web.run", metadata: { model_slug: "gpt-6-thinking" } },
      {
        id: "tool",
        author: { role: "tool", name: "web.run" },
        content: { content_type: "text", parts: ["file excerpt " + "x".repeat(80)] },
        recipient: "all",
        metadata: {
          search_result_groups: [{ entries: [{ snippet: blob, content: blob, url: "https://example.test/readme" }] }],
          content_references: [{ matched_text: blob.slice(0, 400), type: "grouped_webpages" }],
          encrypted_reasoning: cipher,
          attachments: [{ id: "file-1", name: "shot.png", extracted_text: blob.slice(0, 500) }]
        }
      },
      {
        id: "think",
        author: { role: "assistant" },
        content: { content_type: "thoughts", thoughts: [{ summary: "Look at the excerpt", content: "The excerpt is short." }] },
        metadata: { encrypted_reasoning: cipher },
        recipient: "all"
      },
      {
        id: "a",
        author: { role: "assistant" },
        content: {
          content_type: "multimodal_text",
          parts: [
            { content_type: "image_asset_pointer", asset_pointer: "file-service://file-1" },
            "The repo is small.",
            cipher
          ]
        },
        metadata: { model_slug: "gpt-6-thinking", content_references: [{ matched_text: "The repo is small.", items: [{ snippet: blob }] }] },
        recipient: "all"
      }
    ]
  };
  assert.ok(lib.estimateTokens(blob) > 200000);
  const counted = lib.countConversation(data);
  const again = lib.countConversation({ messages: data.messages.concat(data.messages), default_model_slug: data.default_model_slug });
  assert.equal(again.visibleTokens, counted.visibleTokens);
  assert.equal(again.hiddenTokens, counted.hiddenTokens);
  assert.equal(counted.model, "gpt-6-thinking");
  assert.equal(counted.categories.user, lib.estimateTokens("Summarize the repo"));
  assert.equal(counted.categories.assistant, lib.estimateTokens("The repo is small."));
  assert.equal(counted.categories.reasoning, lib.estimateTokens("Look at the excerpt\nThe excerpt is short."));
  assert.equal(counted.categories.other, 0);
  assert.ok(counted.categories.tool > lib.estimateTokens("search(\"repo\")"));
  assert.ok(counted.categories.tool < 80);
  const limit = lib.resolveLimit(counted.model, null);
  const reading = lib.usage(counted.visibleTokens, counted.hiddenTokens, limit.limit, "json", limit, counted.categories);
  assert.ok(reading.percent < 10, "percent " + reading.percent + " tokens " + reading.tokens);
  assert.ok(reading.tokens < 500);
  assert.equal(reading.label.startsWith("~"), true);
  const tip = lib.tooltip(reading);
  assert.match(tip, /User /);
  assert.match(tip, /Assistant /);
  assert.match(tip, /Tool /);
  assert.match(tip, /Reasoning /);
  assert.match(tip, /Other 0/);
  assert.match(tip, /Limit 1,050,000 \(gpt-6-thinking\)/);
  assert.doesNotMatch(tip, /Ask for a resume summary now/);
  assert.doesNotMatch(tip, /100%\+/);
});

test("tool text more than 5x the conversation is uncertain and does not ask for a resume", function () {
  const cats = { user: 651, assistant: 8297, tool: 1015216, reasoning: 1432, other: 0 };
  const reading = lib.usage(651 + 8297, 1015216 + 1432, lib.GPT6_LIMIT, "json", { source: "gpt-6", model: "gpt-6-thinking" }, cats);
  assert.equal(reading.label, "uncertain");
  assert.equal(reading.uncertain, true);
  const tip = lib.tooltip(reading);
  assert.match(tip, /Estimate uncertain/);
  assert.match(tip, /more than 5 times the conversation/);
  assert.doesNotMatch(tip, /Ask for a resume summary now/);
});

test("a github connector chat with stored tool payloads stays near the visible text", function () {
  const sentence = "The repository is a small Python service with a readme and tests. ";
  const userText = sentence.repeat(80);
  const assistantText = sentence.repeat(80);
  const fileA = "F".repeat(20000);
  const fileB = "G".repeat(20000);
  const payload = JSON.stringify({
    files: [
      { path: "README.md", sha: "abc", content: fileA },
      { path: "src/app.py", sha: "def", content: fileB }
    ],
    versions: [{ ref: "main", files: [{ path: "README.md", content: fileA }] }]
  });
  const search = JSON.stringify({
    search_results: [{ title: "README", url: "https://example.test/readme", snippet: "S".repeat(4000), content: "C".repeat(20000) }]
  });
  const stdout = "line\n".repeat(8000);
  const data = {
    default_model_slug: "gpt-6-thinking",
    messages: [
      { id: "u", author: { role: "user" }, content: { content_type: "text", parts: [userText] }, recipient: "all", metadata: {} },
      { id: "call", author: { role: "assistant" }, content: { content_type: "code", language: "unknown", text: "get_file(\"README.md\")" }, recipient: "github", metadata: { model_slug: "gpt-6-thinking" } },
      { id: "files", author: { role: "tool", name: "github" }, content: { content_type: "text", parts: [payload], text: payload, result: payload }, recipient: "all", metadata: {} },
      { id: "search", author: { role: "tool", name: "web.run" }, content: { content_type: "text", parts: [search], text: search }, recipient: "all", metadata: {} },
      { id: "browse", author: { role: "tool", name: "browser" }, content: { content_type: "tether_browsing_display", result: "P".repeat(20000), summary: "A short page summary." }, recipient: "all", metadata: {} },
      { id: "quote", author: { role: "tool", name: "browser" }, content: { content_type: "tether_quote", url: "https://example.test/readme", title: "README", text: "Q".repeat(20000) }, recipient: "all", metadata: {} },
      { id: "out", author: { role: "tool", name: "python" }, content: { content_type: "execution_output", text: stdout }, recipient: "all", metadata: {} },
      { id: "think", author: { role: "assistant" }, content: { content_type: "thoughts", thoughts: [{ summary: "Read the readme", content: "The service is small." }] }, recipient: "all", metadata: {} },
      { id: "a", author: { role: "assistant" }, content: { content_type: "text", parts: [assistantText] }, recipient: "all", metadata: { model_slug: "gpt-6-thinking" } }
    ]
  };
  assert.ok(lib.estimateTokens(payload) > 10000);
  const counted = lib.countConversation(data);
  const total = counted.visibleTokens + counted.hiddenTokens;
  assert.equal(counted.categories.user, lib.estimateTokens(userText));
  assert.equal(counted.categories.assistant, lib.estimateTokens(assistantText));
  assert.equal(counted.categories.other, 0);
  assert.equal(counted.toolCapped, true);
  assert.ok(counted.categories.tool <= lib.TOOL_MESSAGE_CAP_TOKENS + 30);
  assert.ok(counted.categories.tool > lib.TOOL_MESSAGE_CAP_TOKENS / 2);
  assert.ok(total <= counted.visibleTokens * 3, "total " + total + " visible " + counted.visibleTokens + " tool " + counted.categories.tool);
  const limit = lib.resolveLimit(counted.model, null);
  const reading = lib.usage(counted.visibleTokens, counted.hiddenTokens, limit.limit, "json", limit, counted.categories, { toolCapped: counted.toolCapped });
  assert.ok(reading.percent < 10);
  assert.equal(reading.uncertain, false);
  assert.match(reading.label, /^~/);
  const tip = lib.tooltip(reading);
  assert.match(tip, /Tool output capped/);
  assert.doesNotMatch(tip, /Ask for a resume summary now/);
  const report = lib.debugConversation(data);
  assert.ok(report.length < 25000, "report leaked text: " + report.length);
  assert.match(report, /stored-payload/);
  assert.match(report, /duplicate/);
  assert.match(report, /tether-cache/);
  assert.match(report, /capped=yes/);
  assert.match(report, /role=tool/);
  assert.match(report, /top 20 fields/);
  assert.doesNotMatch(report, /FFFFFFF/);
  assert.doesNotMatch(report, /line\nline/);
});
