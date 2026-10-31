/* Fixture responses for the headless extension tests.
   Nothing here is a real conversation. Shapes follow the logged-in
   endpoints ChatOut already uses (or, for project lists, the endpoints
   the sites themselves call). */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const CHATGPT_CHAT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GPT_A = "aaaaaaaa-1111-4111-8111-111111111111";
const GPT_B = "bbbbbbbb-2222-4222-8222-222222222222";
const GPT_C = "cccccccc-3333-4333-8333-333333333333";
const GPT_D = "dddddddd-4444-4444-8444-444444444444";
const GPT_DOM = "eeeeeeee-5555-4555-8555-555555555555";
const GPT_LOOSE = "ffffffff-6666-4666-8666-666666666666";
const CLAUDE_LOOSE = "44444444-4444-4444-8444-444444444444";

const CLAUDE_P1 = "11111111-1111-4111-8111-111111111111";
const CLAUDE_P2 = "22222222-2222-4222-8222-222222222222";
const CLAUDE_P3 = "33333333-3333-4333-8333-333333333333";
export const CLAUDE_PROJECT = "99999999-9999-4999-8999-999999999999";

function html(name) {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}

function chatgptConversation(title, user, assistant) {
  return {
    title: title,
    current_node: "n2",
    mapping: {
      n0: { id: "n0", parent: null, message: null },
      n1: {
        id: "n1",
        parent: "n0",
        message: {
          id: "m1",
          author: { role: "user" },
          content: { content_type: "text", parts: [user] },
          metadata: {}
        }
      },
      n2: {
        id: "n2",
        parent: "n1",
        message: {
          id: "m2",
          author: { role: "assistant" },
          content: { content_type: "text", parts: [assistant] },
          metadata: {}
        }
      }
    }
  };
}

const chatgptBodies = {
  [CHATGPT_CHAT]: chatgptConversation("Hello World", "What is 2+2?", "It is 4."),
  [GPT_A]: chatgptConversation("Packing list", "Bring a raincoat", "Pack a light shell."),
  [GPT_B]: chatgptConversation("Hello/World?", "Slash title question", "Use a safe filename."),
  [GPT_C]: chatgptConversation("Packing list", "Second packing note", "Duplicate titles stay distinct."),
  [GPT_LOOSE]: chatgptConversation("Loose chat", "Not in a project", "Saved under no-project."),
  [GPT_DOM]: chatgptConversation("From the page", "Loaded from the page link", "DOM fallback worked.")
};

function geminiRpc(ask, answer) {
  const item = [
    [null, "r1"],
    null,
    [ask, null, null, null, "ask1"],
    [[[null, [answer]]], null, null, "ans1"]
  ];
  const inner = JSON.stringify([[item], null]);
  const outer = JSON.stringify([["wrb.fr", "hNvQHb", inner]]);
  return ")]}'\n\n123\n" + outer + "\n";
}

const geminiBodies = {
  alpha: geminiRpc("Pack socks", "Wool socks are warmer."),
  beta: geminiRpc("Which flight?", "The morning one.")
};

function json(body, status) {
  return {
    status: status || 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  };
}

function page(name) {
  return { status: 200, contentType: "text/html; charset=utf-8", body: html(name) };
}

function handleChatGpt(url) {
  const pathName = url.pathname;
  if (pathName === "/api/auth/session") {
    return json({ accessToken: "fixture-token", account: { id: "acc-fixture" } });
  }
  if (pathName === "/g/g-p-fixture/project") return page("chatgpt-project.html");
  if (pathName === "/g/g-p-domonly/project") return page("chatgpt-dom-project.html");
  if (pathName === "/c/" + CHATGPT_CHAT) return page("chatgpt-chat.html");
  if (pathName === "/g/g-p-fixture/c/" + CHATGPT_CHAT) return page("chatgpt-chat.html");
  if (pathName === "/backend-api/gizmos/snorlax/sidebar") {
    return json({ items: [{ gizmo: { gizmo: { id: "g-p-fixture", display: { name: "My Research" } } }, conversations: { items: [] } }], cursor: null });
  }
  if (pathName === "/backend-api/conversations") {
    const offset = Number(url.searchParams.get("offset") || "0");
    if (offset === 0) {
      return json({ items: [
        { id: GPT_A, title: "Packing list", update_time: "2024-05-06T00:00:00.000Z" },
        { id: GPT_LOOSE, title: "Loose chat", update_time: "2024-05-10T00:00:00.000Z" }
      ], total: 2, offset: 0, limit: 100 });
    }
    return json({ items: [], total: 2, offset: offset, limit: 100 });
  }
  if (pathName === "/backend-api/gizmos/g-p-fixture") return json({ name: "My Research" });
  if (pathName === "/backend-api/gizmos/g-p-domonly") return json({ name: "DOM Only" });
  if (pathName === "/backend-api/gizmos/g-p-fixture/conversations") {
    const cursor = url.searchParams.get("cursor") || "0";
    if (cursor === "0") {
      return json({
        items: [
          { id: GPT_A, title: "Packing list", update_time: "2024-05-06T00:00:00.000Z" },
          { id: GPT_B, title: "Hello/World?", update_time: "2024-05-07T00:00:00.000Z" }
        ],
        cursor: 2,
        total: 4
      });
    }
    if (cursor === "2") {
      return json({
        items: [
          { id: GPT_C, title: "Packing list", update_time: "2024-05-08T00:00:00.000Z" },
          { id: GPT_D, title: "Broken chat", update_time: "2024-05-09T00:00:00.000Z" }
        ],
        cursor: null,
        total: 4
      });
    }
    return json({ items: [], cursor: null, total: 4 });
  }
  if (pathName === "/backend-api/gizmos/g-p-domonly/conversations") {
    return { status: 404, contentType: "application/json", body: "{\"error\":\"missing\"}" };
  }
  const conv = pathName.match(/^\/backend-api\/conversation\/([^/]+)$/);
  if (conv) {
    if (conv[1] === GPT_D) return { status: 500, contentType: "text/plain", body: "nope" };
    const body = chatgptBodies[conv[1]];
    if (!body) return { status: 404, contentType: "text/plain", body: "unknown conversation" };
    return json(body);
  }
  if (url.pathname === "/favicon.ico") return { status: 204, contentType: "text/plain", body: "" };
  return null;
}

function handleClaude(url) {
  const pathName = url.pathname;
  if (pathName === "/chat/" + CHATGPT_CHAT) return page("claude-chat.html");
  if (pathName === "/project/" + CLAUDE_PROJECT) return page("claude-project.html");
  if (pathName === "/api/organizations/org-fixture/projects") {
    return json([{ uuid: CLAUDE_PROJECT, name: "Ops notes" }]);
  }
  if (pathName === "/api/organizations/org-fixture/chat_conversations") {
    return json([
      { uuid: CLAUDE_P1, name: "Deploy", updated_at: "2024-06-01T00:00:00.000Z", project_uuid: CLAUDE_PROJECT },
      { uuid: CLAUDE_LOOSE, name: "Solo", updated_at: "2024-06-04T00:00:00.000Z", project_uuid: null }
    ]);
  }
  if (pathName === "/api/organizations/org-fixture/projects/" + CLAUDE_PROJECT) {
    return json({ name: "Ops notes", uuid: CLAUDE_PROJECT });
  }
  if (pathName.endsWith("/conversations_v2") || pathName.endsWith("/conversations")) {
    const offset = url.searchParams.get("offset") || "0";
    if (offset === "0") {
      return json({
        has_more: true,
        conversations: [
          { uuid: CLAUDE_P1, name: "Deploy", updated_at: "2024-06-01T00:00:00.000Z" },
          { uuid: CLAUDE_P2, name: "Notes", updated_at: "2024-06-02T00:00:00.000Z" }
        ]
      });
    }
    return json({
      has_more: false,
      conversations: [
        { uuid: CLAUDE_P3, name: "Broken", updated_at: "2024-06-03T00:00:00.000Z" }
      ]
    });
  }
  const conv = pathName.match(/\/chat_conversations\/([^/]+)$/);
  if (conv) {
    if (conv[1] === CLAUDE_P3) return { status: 500, contentType: "text/plain", body: "nope" };
    const texts = {
      [CLAUDE_P1]: ["Restart the worker?", "Yes, then check the logs."],
      [CLAUDE_P2]: ["Where is the runbook?", "Pinned in the project."],
      [CLAUDE_LOOSE]: ["Solo question", "Solo answer."]
    };
    const pair = texts[conv[1]];
    if (!pair) return { status: 404, contentType: "text/plain", body: "unknown" };
    return json({
      uuid: conv[1],
      name: "chat",
      chat_messages: [
        { sender: "human", text: pair[0] },
        { sender: "assistant", text: pair[1] }
      ]
    });
  }
  if (pathName === "/favicon.ico") return { status: 204, contentType: "text/plain", body: "" };
  return null;
}

const GROK_K1 = "grok-k1-1111";
const GROK_K2 = "grok-k2-2222";
const GROK_K3 = "grok-k3-3333";
const grokTexts = {
  [GROK_K1]: ["Lab question", "Lab answer from Grok."],
  [GROK_K2]: ["Loose Grok question", "Loose Grok answer."]
};

function handleGrok(url, request) {
  const p = url.pathname;
  if (p === "/" || p.startsWith("/c/")) return page("grok-project.html");
  if (p === "/project/ws-fixture") return page("grok-project.html");
  if (p === "/rest/workspaces") return json({ workspaces: [{ workspaceId: "ws-fixture", name: "Grok Lab" }] });
  if (p === "/rest/app-chat/conversations") {
    if (url.searchParams.get("workspaceId") === "ws-fixture") {
      return json({ conversations: [{ conversationId: GROK_K1, title: "Lab chat", modifyTime: "2024-07-01T00:00:00Z", workspaces: ["ws-fixture"] }] });
    }
    if (!url.searchParams.get("pageToken")) {
      return json({ conversations: [
        { conversationId: GROK_K1, title: "Lab chat", modifyTime: "2024-07-01T00:00:00Z", workspaces: ["ws-fixture"] },
        { conversationId: GROK_K2, title: "Loose grok", modifyTime: "2024-07-02T00:00:00Z", workspaces: [] }
      ], nextPageToken: GROK_K2 });
    }
    return json({ conversations: [{ conversationId: GROK_K3, title: "Broken grok", modifyTime: "2024-07-03T00:00:00Z" }] });
  }
  const node = p.match(/^\/rest\/app-chat\/conversations\/([^/]+)\/response-node$/);
  if (node) {
    if (node[1] === GROK_K3) return { status: 500, contentType: "text/plain", body: "nope" };
    return json({ responseNodes: [{ responseId: node[1] + "-q" }, { responseId: node[1] + "-a", parentResponseId: node[1] + "-q" }] });
  }
  const load = p.match(/^\/rest\/app-chat\/conversations\/([^/]+)\/load-responses$/);
  if (load && request.method() === "POST") {
    const pair = grokTexts[load[1]];
    if (!pair) return { status: 404, contentType: "text/plain", body: "unknown" };
    return json({ responses: [
      { responseId: load[1] + "-a", sender: "ASSISTANT", message: pair[1], createTime: "2024-07-01T00:00:02Z" },
      { responseId: load[1] + "-q", sender: "human", message: pair[0], createTime: "2024-07-01T00:00:01Z" }
    ] });
  }
  if (p === "/favicon.ico") return { status: 204, contentType: "text/plain", body: "" };
  return null;
}

function handleGemini(url, request) {
  if (url.pathname === "/notebook/nb-fixture") return page("gemini-notebook.html");
  if (url.pathname.includes("batchexecute")) {
    const raw = request.postData() || "";
    const params = new URLSearchParams(raw);
    const freq = params.get("f.req") || "";
    if (freq.includes("c_gamma")) return { status: 500, contentType: "text/plain", body: "nope" };
    if (freq.includes("c_alpha")) return { status: 200, contentType: "text/plain; charset=utf-8", body: geminiBodies.alpha };
    if (freq.includes("c_beta")) return { status: 200, contentType: "text/plain; charset=utf-8", body: geminiBodies.beta };
    return { status: 404, contentType: "text/plain", body: "unknown rpc" };
  }
  if (url.pathname === "/favicon.ico") return { status: 204, contentType: "text/plain", body: "" };
  return null;
}

export async function installFixtures(context) {
  await context.route(/https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com|grok\.com)\//, async function (route) {
    const request = route.request();
    const url = new URL(request.url());
    let hit = null;
    if (url.hostname === "chatgpt.com") hit = handleChatGpt(url);
    else if (url.hostname === "claude.ai") hit = handleClaude(url);
    else if (url.hostname === "gemini.google.com") hit = handleGemini(url, request);
    else if (url.hostname === "grok.com") hit = handleGrok(url, request);
    if (!hit) {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "unmocked " + url.pathname });
      return;
    }
    await route.fulfill(hit);
  });
}
