/* Archive every chat in the project currently open.
   ChatGPT projects and Claude projects are listed with the same logged-in
   endpoints the page already uses, then each chat is rendered with the
   existing exporter (ChatGPT mapping walker + turndown, Claude turns through
   the same turndown, Gemini hNvQHb parser). Gemini notebooks have no stable
   per-notebook list endpoint, so those chats are collected from the notebook
   page, scrolling to load lazy rows, and each chat is fetched with hNvQHb.
   One stored zip is saved locally. Chat text is never sent off the site. */
(function () {
  "use strict";
  const lib = globalThis.__CHATOUT_ARCHIVE_LIB__;
  if (!lib) {
    console.error("[chatout] project archive library missing");
    return;
  }

  const api = (globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id)
    ? globalThis.browser
    : globalThis.chrome;

  let running = false;
  let lastResult = null;
  let cancelRequested = false;
  let abortCtl = null;
  let cancelEl = null;
  const CANCELLED = "Archive cancelled";

  function checkCancel() {
    if (cancelRequested) throw new Error(CANCELLED);
  }

  function beginRun() {
    cancelRequested = false;
    abortCtl = typeof AbortController === "function" ? new AbortController() : null;
    if (cancelEl) cancelEl.hidden = false;
  }

  function endRun() {
    abortCtl = null;
    if (cancelEl) cancelEl.hidden = true;
  }

  function cancelRun() {
    if (!running) return false;
    cancelRequested = true;
    if (abortCtl) { try { abortCtl.abort(); } catch (e) { /* ignore */ } }
    setProgress("Cancelling…");
    return true;
  }

  function failure(e, failures) {
    if (cancelRequested) {
      setProgress(CANCELLED);
      return { ok: false, cancelled: true, error: CANCELLED, exported: 0, failed: 0, failures: [] };
    }
    const message = String((e && e.message) || e).slice(0, 300);
    setProgress(message);
    return { ok: false, error: message, exported: 0, failed: failures.length, failures: failures };
  }
  let statusEl = null;
  let buttonEl = null;

  function delayMs() {
    const raw = document.documentElement.getAttribute("data-chatout-archive-delay");
    if (raw == null || raw === "") return 400;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 400;
  }

  function setProgress(text) {
    document.documentElement.setAttribute("data-chatout-archive-progress", text);
    if (statusEl) statusEl.textContent = text;
  }

  function setResult(result) {
    lastResult = result;
    document.documentElement.setAttribute("data-chatout-archive-result", JSON.stringify(result));
  }

  function titleFromDom() {
    const heading = document.querySelector("main h1, h1");
    const headingText = heading && heading.textContent ? heading.textContent.trim() : "";
    if (headingText) return headingText;
    const title = (document.title || "").split(/\s[-|–]\s/)[0].trim();
    return title || "project";
  }

  function digName(json, depth) {
    if (!json || typeof json !== "object" || (depth || 0) > 5) return "";
    if (typeof json.name === "string" && json.name.trim()) return json.name.trim();
    if (json.display && typeof json.display.name === "string" && json.display.name.trim()) return json.display.name.trim();
    if (json.gizmo) {
      const nested = digName(json.gizmo, (depth || 0) + 1);
      if (nested) return nested;
    }
    return "";
  }

  async function fetchRetry(url, options, pause) {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      checkCancel();
      try {
        const res = await fetch(url, abortCtl ? Object.assign({ signal: abortCtl.signal }, options) : options);
        if (res.status === 429 || res.status === 503) {
          lastError = new Error("HTTP " + res.status);
          const retryAfter = Number(res.headers.get("retry-after"));
          const backoff = Math.min(8000, Math.max(pause || 400, 500) * (2 ** attempt));
          await lib.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(backoff, retryAfter * 1000) : backoff);
          continue;
        }
        return res;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        await lib.sleep(Math.min(8000, Math.max(pause || 400, 300) * (2 ** attempt)));
      }
    }
    throw lastError || new Error("request failed");
  }

  async function chatGptHeaders(pause) {
    const res = await fetchRetry(location.origin + "/api/auth/session", {
      credentials: "include",
      headers: { Accept: "application/json" }
    }, pause);
    if (!res.ok) throw new Error("session HTTP " + res.status);
    const session = await res.json();
    if (!session || !session.accessToken) throw new Error("no accessToken in session");
    const headers = {
      Authorization: "Bearer " + session.accessToken,
      Accept: "application/json"
    };
    const account = session.account && (session.account.id || session.account.account_id);
    if (account) headers["ChatGPT-Account-Id"] = account;
    try {
      const device = localStorage.getItem("oai-device-id") || localStorage.getItem("oai_device_id");
      if (device) headers["oai-device-id"] = device;
    } catch (e) { /* private mode */ }
    headers["oai-language"] = navigator.language || "en-US";
    return headers;
  }

  function chatGptItem(item) {
    if (!item) return null;
    const id = item.id || item.conversation_id;
    if (!id) return null;
    return {
      id: String(id),
      title: item.title || "Untitled chat",
      updated: item.update_time || item.create_time || null,
      url: location.origin + "/c/" + id
    };
  }

  async function listChatGpt(projectId, headers, pause) {
    return lib.collectPages(async function (cursor) {
      const c = cursor == null ? 0 : cursor;
      const url = location.origin + "/backend-api/gizmos/" + encodeURIComponent(projectId) + "/conversations?cursor=" + encodeURIComponent(c) + "&limit=50";
      const res = await fetchRetry(url, { credentials: "include", headers: headers, method: "GET" }, pause);
      if (!res.ok) throw new Error("project list HTTP " + res.status);
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items.map(chatGptItem).filter(Boolean) : [];
      let next = json.cursor;
      if (next == null || next === "") {
        const total = Number(json.total);
        const got = Number(c) + ((json.items && json.items.length) || 0);
        next = items.length && Number.isFinite(total) && got < total ? got : null;
      }
      if (pause) await lib.sleep(Math.min(pause, 250));
      return { items: items, nextCursor: next == null || next === "" ? null : next };
    });
  }

  function claudeOrgId() {
    const parts = String(document.cookie || "").split(";");
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i].trim();
      if (part.startsWith("lastActiveOrg=")) return decodeURIComponent(part.slice("lastActiveOrg=".length));
    }
    try {
      const stored = localStorage.getItem("lastActiveOrg");
      if (stored) return stored;
    } catch (e) { /* private mode */ }
    const html = document.documentElement ? document.documentElement.innerHTML : "";
    const match = html.match(/"organizationUuid"\s*:\s*"([^"]+)"/)
      || html.match(/"organization_uuid"\s*:\s*"([^"]+)"/)
      || html.match(/lastActiveOrg["']?\s*[:=]\s*["']([^"']+)/);
    return match ? match[1] : "";
  }

  function claudeItem(item) {
    if (!item) return null;
    const id = item.uuid || item.id;
    if (!id) return null;
    return {
      id: String(id),
      title: item.name || item.title || "Untitled chat",
      updated: item.updated_at || item.created_at || null,
      url: location.origin + "/chat/" + id
    };
  }

  async function listClaude(projectId, org, pause) {
    const bases = [
      location.origin + "/api/organizations/" + encodeURIComponent(org) + "/projects/" + encodeURIComponent(projectId) + "/conversations_v2",
      location.origin + "/api/organizations/" + encodeURIComponent(org) + "/projects/" + encodeURIComponent(projectId) + "/conversations"
    ];
    let base = bases[0];
    return lib.collectPages(async function (cursor) {
      const offset = cursor == null ? 0 : cursor;
      let url = base + "?limit=50&offset=" + encodeURIComponent(offset);
      let res = await fetchRetry(url, { credentials: "include", headers: { Accept: "application/json" } }, pause);
      if (res.status === 404 && base === bases[0]) {
        base = bases[1];
        url = base + "?limit=50&offset=" + encodeURIComponent(offset);
        res = await fetchRetry(url, { credentials: "include", headers: { Accept: "application/json" } }, pause);
      }
      if (!res.ok) throw new Error("project list HTTP " + res.status);
      const json = await res.json();
      const raw = Array.isArray(json) ? json : (json.conversations || json.chat_conversations || json.data || []);
      const items = raw.map(claudeItem).filter(Boolean);
      let next = null;
      if (json && json.next_cursor) next = json.next_cursor;
      else if (json && json.has_more) next = Number(offset) + raw.length;
      if (pause) await lib.sleep(Math.min(pause, 250));
      return { items: items, nextCursor: next };
    });
  }

  function chatIdFromHref(provider, href) {
    let url;
    try { url = new URL(href, location.origin); } catch (e) { return null; }
    if (provider === "chatgpt") {
      const m = url.pathname.match(/\/c\/([0-9a-fA-F-]{8,})/);
      return m ? m[1] : null;
    }
    if (provider === "claude") {
      const m = url.pathname.match(/\/chat\/([0-9a-zA-Z_-]+)/);
      return m ? m[1] : null;
    }
    if (provider === "gemini") {
      const m = url.pathname.match(/\/app\/([^/]+)/);
      if (!m || m[1] === "notebook" || m[1] === "notebooks") return null;
      return decodeURIComponent(m[1]);
    }
    return null;
  }

  async function collectDomChats(provider, pause) {
    const seen = new Map();
    let stable = 0;
    for (let pass = 0; pass < 40; pass += 1) {
      const before = seen.size;
      const roots = Array.from(document.querySelectorAll("main"));
      const scope = roots.length ? roots : [document.body];
      scope.forEach(function (root) {
        root.querySelectorAll("a[href]").forEach(function (anchor) {
          if (anchor.closest("nav, [role='navigation']")) return;
          const id = chatIdFromHref(provider, anchor.getAttribute("href"));
          if (!id || seen.has(id)) return;
          const title = (anchor.textContent || "").replace(/\s+/g, " ").trim() || id;
          seen.set(id, {
            id: id,
            title: title,
            updated: null,
            url: new URL(anchor.getAttribute("href"), location.origin).href
          });
        });
      });
      if (seen.size === before) stable += 1;
      else stable = 0;
      if (stable >= 2) break;
      scope.forEach(function (root) {
        root.querySelectorAll("*").forEach(function (el) {
          if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight;
        });
      });
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise(function (resolve) {
        requestAnimationFrame(function () { requestAnimationFrame(resolve); });
      });
      if (pause) await lib.sleep(Math.min(pause, 200));
    }
    return Array.from(seen.values());
  }

  /* ---- Gemini chat list: MaZiqc RPC first, sidebar scan as fallback ---- */
  function geminiId(raw) {
    return String(raw || "").trim().replace(/^c_/, "");
  }

  function parseBatchFrames(text, rpcid) {
    const out = [];
    String(text || "").split("\n").forEach(function (line) {
      const t = line.trim();
      if (!t.startsWith("[")) return;
      let frame;
      try { frame = JSON.parse(t); } catch (e) { return; }
      (Array.isArray(frame) ? frame : []).forEach(function (entry) {
        if (Array.isArray(entry) && entry[0] === "wrb.fr" && entry[1] === rpcid && typeof entry[2] === "string") {
          try { out.push(JSON.parse(entry[2])); } catch (e) { /* skip */ }
        }
      });
    });
    return out;
  }

  async function geminiRpc(tokens, rpcid, payload, pause) {
    const reqid = String(Math.floor(Math.random() * 9000000) + 1000000);
    const endpoint = location.origin + tokens.servicePath + "/data/batchexecute?rpcids=" + rpcid +
      "&source-path=" + encodeURIComponent(location.pathname || "/app") + "&bl=" + encodeURIComponent(tokens.bl) +
      "&f.sid=" + encodeURIComponent(tokens.sid) + "&hl=en&_reqid=" + reqid + "&rt=c";
    const body = new URLSearchParams();
    body.set("f.req", JSON.stringify([[[rpcid, payload, null, "generic"]]]));
    body.set("at", tokens.at);
    const res = await fetchRetry(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-Same-Domain": "1" },
      body: body.toString()
    }, pause);
    if (!res.ok) throw new Error(rpcid + " HTTP " + res.status);
    return parseBatchFrames(await res.text(), rpcid);
  }

  async function listGeminiRpc(tokens, pause) {
    if (!tokens.at || !tokens.bl || !tokens.sid) throw new Error("missing Gemini session tokens on the page");
    const seen = new Map();
    let cursor = null;
    for (let page = 0; page < 200; page += 1) {
      const payloads = cursor ? [JSON.stringify([50, cursor, [0, null, 1]])] : [JSON.stringify([50, null, [0, null, 1]]), JSON.stringify([200])];
      let inner = null;
      for (const payload of payloads) {
        const frames = await geminiRpc(tokens, "MaZiqc", payload, pause);
        const hit = frames.find(function (f) { return Array.isArray(f) && Array.isArray(f[2]) && f[2].length; });
        if (hit) { inner = hit; break; }
      }
      if (!inner) break;
      const before = seen.size;
      inner[2].forEach(function (row) {
        if (!Array.isArray(row) || !row[0]) return;
        const id = geminiId(row[0]);
        if (!id || seen.has(id)) return;
        const ts = Array.isArray(row[5]) && Number(row[5][0]) ? new Date(Number(row[5][0]) * 1000).toISOString() : null;
        seen.set(id, { id: id, title: row[1] ? String(row[1]) : "Untitled chat", updated: ts, url: location.origin + "/app/" + id });
      });
      cursor = typeof inner[1] === "string" && inner[1] ? inner[1] : null;
      if (!cursor || seen.size === before) break;
      if (pause) await lib.sleep(Math.min(pause, 250));
    }
    return Array.from(seen.values());
  }

  /* Sidebar items are often divs/buttons, not links; ids hide in href, data-* or jslog as c_<hex>. */
  async function collectGeminiSidebar(pause) {
    const seen = new Map();
    const idRe = /\bc_([0-9a-f]{8,})\b/i;
    let stable = 0;
    for (let pass = 0; pass < 60; pass += 1) {
      const before = seen.size;
      document.querySelectorAll("a[href*='/app/'], [jslog*='c_'], [data-conversation-id], [data-test-id*='conversation'], [data-id]").forEach(function (el) {
        let id = "";
        const href = el.getAttribute("href");
        if (href) id = chatIdFromHref("gemini", href) || "";
        if (!id) {
          const attrs = el.attributes;
          for (let i = 0; i < attrs.length && !id; i += 1) {
            const m = String(attrs[i].value).match(idRe);
            if (m) id = m[1];
            else if (attrs[i].name === "data-conversation-id" && attrs[i].value) id = attrs[i].value;
          }
        }
        id = geminiId(id);
        if (!id || seen.has(id)) return;
        const title = (el.textContent || "").replace(/\s+/g, " ").trim() || id;
        seen.set(id, { id: id, title: title, updated: null, url: location.origin + "/app/" + id });
      });
      if (seen.size === before) stable += 1; else stable = 0;
      if (stable >= 3) break;
      document.querySelectorAll("nav, aside, side-navigation, [role='navigation'], .conversations-container, infinite-scroller, *").forEach(function (el) {
        if (el.scrollHeight > el.clientHeight + 20 && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
      });
      await new Promise(function (resolve) { setTimeout(resolve, Math.max(150, Math.min(pause || 0, 600))); });
    }
    return Array.from(seen.values());
  }

  async function listGeminiAll(tokens, pause, notes) {
    let chats = [];
    try {
      chats = await listGeminiRpc(tokens, pause);
    } catch (e) {
      if (cancelRequested) throw e;
      notes.push("Gemini chat list request failed (" + ((e && e.message) || e) + "); used the sidebar instead.");
    }
    if (!chats.length) {
      setProgress("Listing chats from the sidebar…");
      chats = await collectGeminiSidebar(pause);
      if (chats.length) notes.push("Gemini chats were read from the sidebar.");
    }
    return chats;
  }

  function geminiTokens() {
    const html = document.documentElement ? document.documentElement.innerHTML : "";
    function pick(key) {
      const match = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
      return match ? match[1] : "";
    }
    return {
      at: pick("SNlM0e"),
      bl: pick("cfb2h"),
      sid: pick("FdrFJe"),
      servicePath: pick("Im6cmf") || "/_/BardChatUi"
    };
  }

  function claudeText(msg) {
    if (!msg) return "";
    if (typeof msg.text === "string" && msg.text.trim()) return msg.text;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content.map(function (part) {
        if (!part) return "";
        if (typeof part === "string") return part;
        return part.text || part.content || "";
      }).filter(Boolean).join("\n\n");
    }
    return "";
  }

  /* ---- Grok (grok.com) ---- */
  function grokHeaders(json) {
    const h = { Accept: "application/json" };
    try { h["x-xai-request-id"] = crypto.randomUUID(); } catch (e) { /* older browsers */ }
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  function grokItem(item) {
    if (!item) return null;
    const id = item.conversationId || item.id;
    if (!id) return null;
    const ws = Array.isArray(item.workspaces) ? item.workspaces : [];
    const first = ws[0];
    const workspaceId = typeof first === "string" ? first : (first && (first.workspaceId || first.id)) || item.workspaceId || "";
    return {
      id: String(id),
      title: item.title || "Untitled chat",
      updated: item.modifyTime || item.createTime || null,
      url: location.origin + "/c/" + id,
      projectId: workspaceId ? String(workspaceId) : ""
    };
  }

  async function listGrokConversations(workspaceId, pause) {
    return lib.collectPages(async function (cursor) {
      let url = location.origin + "/rest/app-chat/conversations?pageSize=60";
      if (workspaceId) url += "&workspaceId=" + encodeURIComponent(workspaceId);
      if (cursor) url += "&pageToken=" + encodeURIComponent(cursor);
      const res = await fetchRetry(url, { credentials: "include", headers: grokHeaders(false) }, pause);
      if (!res.ok) throw new Error("chat list HTTP " + res.status);
      const json = await res.json();
      const raw = Array.isArray(json.conversations) ? json.conversations : [];
      const items = raw.map(grokItem).filter(Boolean);
      const next = raw.length && json.nextPageToken && json.nextPageToken !== cursor ? json.nextPageToken : null;
      if (pause) await lib.sleep(Math.min(pause, 250));
      return { items: items, nextCursor: next };
    });
  }

  async function listGrokProjects(pause) {
    const out = [];
    let token = null;
    for (let page = 0; page < 20; page += 1) {
      let url = location.origin + "/rest/workspaces?pageSize=50&orderBy=ORDER_BY_LAST_USE_TIME";
      if (token) url += "&pageToken=" + encodeURIComponent(token);
      const res = await fetchRetry(url, { credentials: "include", headers: grokHeaders(false) }, pause);
      if (!res.ok) throw new Error("project list HTTP " + res.status);
      const json = await res.json();
      const raw = Array.isArray(json.workspaces) ? json.workspaces : [];
      raw.forEach(function (w) {
        const id = w && (w.workspaceId || w.id);
        if (id) out.push({ id: String(id), name: String(w.name || w.title || id) });
      });
      token = json.nextPageToken;
      if (!token || !raw.length) break;
    }
    return out;
  }

  /* Chats for one Grok project: ask the list endpoint filtered by workspace,
     then keep only chats that are tagged with that workspace (or all of them
     when the list carries no workspace tags at all). */
  async function listGrokProject(projectId, pause) {
    const listed = await listGrokConversations(projectId, pause);
    const items = listed.items || [];
    const tagged = items.some(function (c) { return c.projectId; });
    if (tagged) return { items: items.filter(function (c) { return c.projectId === projectId; }), note: listed.note || "" };
    /* No workspace tags: make sure the server really filtered, not just returned every chat. */
    const all = await listGrokConversations("", pause);
    const allIds = (all.items || []).map(function (c) { return c.id; }).sort().join(",");
    const gotIds = items.map(function (c) { return c.id; }).sort().join(",");
    if (items.length && gotIds === allIds) return { items: [], note: "Grok did not filter chats by project, so this project's chats could not be told apart." };
    return { items: items, note: listed.note || "" };
  }

  async function renderGrok(chat, pause, ctx) {
    const debug = window.__AI_EXPORTER_DEBUG__;
    const base = location.origin + "/rest/app-chat/conversations/" + encodeURIComponent(chat.id);
    const nodeRes = await fetchRetry(base + "/response-node?includeThreads=true", { credentials: "include", headers: grokHeaders(false) }, pause);
    if (!nodeRes.ok) throw new Error("response list HTTP " + nodeRes.status);
    const nodes = (await nodeRes.json()).responseNodes || [];
    const ids = nodes.map(function (n) { return n && n.responseId; }).filter(Boolean);
    if (!ids.length) throw new Error("no messages");
    const responses = [];
    for (let i = 0; i < ids.length; i += 50) {
      const res = await fetchRetry(base + "/load-responses", {
        method: "POST",
        credentials: "include",
        headers: grokHeaders(true),
        body: JSON.stringify({ responseIds: ids.slice(i, i + 50) })
      }, pause);
      if (!res.ok) throw new Error("conversation HTTP " + res.status);
      const json = await res.json();
      (json.responses || []).forEach(function (r) { responses.push(r); });
    }
    if (ctx) ctx.raw = { responses: responses };
    const order = new Map(ids.map(function (id, i) { return [id, i]; }));
    responses.sort(function (a, b) {
      const oa = order.has(a.responseId) ? order.get(a.responseId) : 1e9;
      const ob = order.has(b.responseId) ? order.get(b.responseId) : 1e9;
      return oa - ob || String(a.createTime || "").localeCompare(String(b.createTime || ""));
    });
    const turns = [];
    responses.forEach(function (r) {
      const text = String(r.message || r.query || "").trim();
      if (!text) return;
      const sender = String(r.sender || "").toLowerCase();
      turns.push({ role: sender === "human" || sender === "user" ? "prompt" : "response", text: text });
    });
    if (!turns.length) throw new Error("no messages");
    return debug.markdownFromHtmlNodes(debug.htmlNodesFromTurns(turns));
  }

  /* ---- Images and attachments (optional, popup toggle "Include images and attachments") ---- */
  const FILE_CAP = 50 * 1024 * 1024;
  const ARCHIVE_FILE_CAP = 1024 * 1024 * 1024;

  function readIncludeFiles() {
    return new Promise(function (resolve) {
      try {
        if (!api || !api.storage || !api.storage.local) { resolve(false); return; }
        const r = api.storage.local.get("chatoutIncludeFiles", function (v) { resolve(!!(v && v.chatoutIncludeFiles)); });
        if (r && typeof r.then === "function") r.then(function (v) { resolve(!!(v && v.chatoutIncludeFiles)); }, function () { resolve(false); });
      } catch (e) { resolve(false); }
    });
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function fileNameFromUrl(url) {
    try {
      const last = new URL(url, location.href).pathname.split("/").filter(Boolean).pop() || "";
      return decodeURIComponent(last);
    } catch (e) { return ""; }
  }

  function safeFileName(name, fallback, used) {
    let base = String(name || "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").replace(/^\.+/, "").trim();
    if (!base) base = fallback;
    if (base.length > 120) {
      const dot = base.lastIndexOf(".");
      const ext = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : "";
      base = base.slice(0, 120 - ext.length) + ext;
    }
    let out = base;
    let n = 2;
    while (used.has(out.toLowerCase())) {
      const dot = base.lastIndexOf(".");
      out = dot > 0 ? base.slice(0, dot) + "_" + n + base.slice(dot) : base + "_" + n;
      n += 1;
    }
    used.add(out.toLowerCase());
    return out;
  }

  async function fetchBytes(url, headers, pause) {
    checkCancel();
    let abs;
    try { abs = new URL(url, location.href); } catch (e) { throw new Error("bad url"); }
    if (abs.origin === location.origin) {
      const res = await fetchRetry(abs.href, { credentials: "include", headers: headers || {} }, pause);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const len = Number(res.headers.get("content-length"));
      if (Number.isFinite(len) && len > FILE_CAP) throw new Error("larger than 50 MB, skipped");
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > FILE_CAP) throw new Error("larger than 50 MB, skipped");
      return bytes;
    }
    if (!api || !api.runtime || !api.runtime.sendMessage) throw new Error("cannot fetch other sites");
    const resp = await new Promise(function (resolve, reject) {
      api.runtime.sendMessage({ type: "chatout-fetch-file", url: abs.href, cap: FILE_CAP }, function (r) {
        const err = api.runtime.lastError;
        if (err) reject(new Error(err.message)); else resolve(r);
      });
    });
    if (!resp || !resp.ok) throw new Error((resp && resp.error) || "download failed");
    return base64ToBytes(resp.base64 || "");
  }

  /* Each ref: { name, url?, text?, resolve?(): Promise<url>, match?: [strings to rewrite in markdown] } */
  function attachmentRefs(provider, raw, markdown, ctx) {
    const refs = [];
    const data = raw || {};
    if (provider === "chatgpt" && data.mapping) {
      Object.keys(data.mapping).forEach(function (key) {
        const msg = data.mapping[key] && data.mapping[key].message;
        if (!msg) return;
        const seen = new Set();
        const add = function (id, name, pointer) {
          if (!id || seen.has(id)) return;
          seen.add(id);
          refs.push({
            name: name || id,
            match: [pointer || "", id].filter(Boolean),
            resolve: async function () {
              const res = await fetchRetry(location.origin + "/backend-api/files/" + encodeURIComponent(id) + "/download", { credentials: "include", headers: ctx.headers || {} }, 0);
              if (!res.ok) throw new Error("file link HTTP " + res.status);
              const j = await res.json();
              if (!j.download_url) throw new Error("no download link");
              return { url: j.download_url, name: j.file_name || name };
            }
          });
        };
        const parts = (msg.content && msg.content.parts) || [];
        parts.forEach(function (part) {
          if (part && typeof part === "object" && part.asset_pointer) {
            const pointer = String(part.asset_pointer);
            add(pointer.replace(/^[a-z-]+:\/\//, ""), "", pointer);
          }
        });
        ((msg.metadata && msg.metadata.attachments) || []).forEach(function (a) { if (a) add(a.id, a.name, ""); });
      });
    }
    if (provider === "claude") {
      (data.chat_messages || data.messages || []).forEach(function (msg) {
        (msg.files_v2 || msg.files || []).forEach(function (f) {
          if (!f) return;
          const url = f.preview_url || (f.document_asset && f.document_asset.url) || (f.preview_asset && f.preview_asset.url) || f.thumbnail_url ||
            (f.file_uuid && ctx.org ? "/api/" + encodeURIComponent(ctx.org) + "/files/" + encodeURIComponent(f.file_uuid) + "/preview" : "");
          if (url) refs.push({ name: f.file_name || f.file_uuid, url: url, match: [url] });
        });
        (msg.attachments || []).forEach(function (a) {
          if (a && a.extracted_content != null) {
            const name = String(a.file_name || "pasted_text");
            refs.push({ name: /\.[a-z0-9]{1,6}$/i.test(name) ? name : name + ".txt", text: String(a.extracted_content) });
          }
        });
      });
    }
    if (provider === "grok") {
      const asset = function (u) { return /^https?:/i.test(u) ? u : "https://assets.grok.com/" + String(u).replace(/^\/+/, ""); };
      (data.responses || []).forEach(function (r) {
        (r.generatedImageUrls || []).concat(r.imageAttachments || []).forEach(function (u) {
          if (typeof u === "string" && u) refs.push({ name: fileNameFromUrl(asset(u)) || "image.png", url: asset(u), match: [u, asset(u)] });
        });
        (r.fileAttachmentsMetadata || r.fileAttachments || []).forEach(function (f) {
          if (f && typeof f === "object" && f.fileUri) refs.push({ name: f.fileName || fileNameFromUrl(f.fileUri), url: asset(f.fileUri), match: [f.fileUri, asset(f.fileUri)] });
        });
      });
    }
    // Every site: images linked in the markdown itself (covers Gemini).
    const known = new Set();
    refs.forEach(function (r) { (r.match || []).forEach(function (m) { known.add(m); }); if (r.url) known.add(r.url); });
    const re = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
    let m;
    while ((m = re.exec(String(markdown || "")))) {
      if (known.has(m[1])) continue;
      known.add(m[1]);
      refs.push({ name: fileNameFromUrl(m[1]) || "image", url: m[1], match: [m[1]] });
    }
    return refs;
  }

  /* Download a chat's files into <stem>_files/ and point the markdown at them.
     Never throws for a file; failures are returned for _index.md. */
  async function withAttachments(provider, chat, ctx, markdown, mdPath, pause, budget) {
    const refs = attachmentRefs(provider, ctx.raw, markdown, ctx);
    if (!refs.length) return { markdown: markdown, files: [], failures: [] };
    const dir = mdPath.replace(/\.md$/i, "") + "_files";
    const rel = dir.split("/").pop();
    const used = new Set();
    const files = [];
    const failures = [];
    const saved = [];
    let md = String(markdown);
    for (let i = 0; i < refs.length; i += 1) {
      const ref = refs[i];
      checkCancel();
      try {
        let bytes;
        let name = ref.name;
        if (ref.text != null) {
          bytes = new TextEncoder().encode(ref.text);
        } else {
          let url = ref.url;
          if (ref.resolve) {
            const got = await ref.resolve();
            url = got.url;
            if (got.name) name = got.name;
          }
          if (budget.used >= ARCHIVE_FILE_CAP) throw new Error("archive file limit (1 GB) reached, skipped");
          bytes = await fetchBytes(url, provider === "grok" ? grokHeaders(false) : null, pause);
          if (ref.url && !ref.match) ref.match = [ref.url];
        }
        if (budget.used + bytes.length > ARCHIVE_FILE_CAP) throw new Error("archive file limit (1 GB) reached, skipped");
        budget.used += bytes.length;
        const fname = safeFileName(name, "file_" + (i + 1), used);
        files.push({ name: dir + "/" + fname, data: bytes });
        const local = rel + "/" + encodeURI(fname).replace(/[()]/g, function (c) { return c === "(" ? "%28" : "%29"; });
        const token = "\u0000chatout-file-" + i + "\u0000";
        (ref.match || []).slice().sort(function (x, y) { return y.length - x.length; }).forEach(function (s) { if (s && s.length > 6) md = md.split(s).join(token); });
        saved.push({ name: fname, local: local, token: token });
      } catch (e) {
        if (cancelRequested) throw e;
        failures.push({ id: chat.id, title: chat.title, file: ref.name, error: String((e && e.message) || e).slice(0, 200) });
      }
      if (pause) await lib.sleep(Math.min(pause, 250));
    }
    saved.forEach(function (sv) { md = md.split(sv.token).join(sv.local); });
    if (saved.length || failures.length) {
      md += "\n\n## Attachments\n\n";
      saved.forEach(function (s) { md += "- [" + s.name + "](" + s.local + ")\n"; });
      failures.forEach(function (f) { md += "- " + f.file + " (not saved: " + f.error + ")\n"; });
    }
    return { markdown: md, files: files, failures: failures };
  }

  async function renderChat(provider, chat, ctx, pause) {
    ctx.raw = null;
    const debug = window.__AI_EXPORTER_DEBUG__;
    if (!debug) throw new Error("exporter unavailable");
    if (provider === "chatgpt") {
      const res = await fetchRetry(location.origin + "/backend-api/conversation/" + encodeURIComponent(chat.id), {
        credentials: "include",
        headers: ctx.headers,
        method: "GET"
      }, pause);
      if (!res.ok) throw new Error("conversation HTTP " + res.status);
      let data = await res.json();
      if (data && data.conversation && data.conversation.mapping) data = data.conversation;
      ctx.raw = data;
      if (typeof debug.chatGptMarkdownFromConversation !== "function") throw new Error("ChatGPT exporter unavailable");
      return debug.chatGptMarkdownFromConversation(data);
    }
    if (provider === "claude") {
      const res = await fetchRetry(location.origin + "/api/organizations/" + encodeURIComponent(ctx.org) + "/chat_conversations/" + encodeURIComponent(chat.id), {
        credentials: "include",
        headers: { Accept: "application/json" }
      }, pause);
      if (!res.ok) throw new Error("conversation HTTP " + res.status);
      const data = await res.json();
      ctx.raw = data;
      const messages = data.chat_messages || data.messages || [];
      const turns = [];
      messages.forEach(function (msg) {
        const text = claudeText(msg);
        if (!text) return;
        const sender = String(msg.sender || msg.role || "").toLowerCase();
        turns.push({ role: (sender === "human" || sender === "user") ? "prompt" : "response", text: text });
      });
      if (!turns.length) throw new Error("no messages");
      const nodes = debug.htmlNodesFromTurns(turns);
      return debug.markdownFromHtmlNodes(nodes);
    }
    if (provider === "gemini") {
      const tokens = ctx.tokens;
      if (!tokens.at || !tokens.sid || !tokens.bl) throw new Error("missing Gemini session tokens on the page");
      const reqid = String(Math.floor(Math.random() * 9000000) + 1000000);
      const sourcePath = "/app/" + geminiId(chat.id);
      const endpoint = location.origin + tokens.servicePath + "/data/batchexecute?rpcids=hNvQHb&source-path=" + encodeURIComponent(sourcePath) + "&bl=" + encodeURIComponent(tokens.bl) + "&f.sid=" + encodeURIComponent(tokens.sid) + "&hl=en&_reqid=" + reqid + "&rt=c";
      const payload = JSON.stringify(["c_" + geminiId(chat.id), 100, null, 1, [0], [4], null, 1]);
      const body = new URLSearchParams();
      body.set("f.req", JSON.stringify([[["hNvQHb", payload, null, "generic"]]]));
      body.set("at", tokens.at);
      const res = await fetchRetry(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: body.toString()
      }, pause);
      if (!res.ok) throw new Error("conversation HTTP " + res.status);
      if (typeof debug.geminiMarkdownFromRpc !== "function") throw new Error("Gemini exporter unavailable");
      return debug.geminiMarkdownFromRpc(await res.text());
    }
    if (provider === "grok") return renderGrok(chat, pause, ctx);
    throw new Error("unsupported provider");
  }

  function preface(projectName, chat, provider) {
    const lines = [
      "# " + (chat.title || "Chat"),
      "",
      "- Provider: " + provider,
      "- Project: " + projectName,
      "- Id: " + chat.id
    ];
    const day = lib.formatDay(chat.updated);
    if (day) lines.push("- Updated: " + day);
    if (chat.url) lines.push("- URL: " + chat.url);
    lines.push("", "");
    return lines.join("\n");
  }

  function indexMarkdown(projectName, rows, failures, listNote, fileFailures) {
    const lines = [
      "# " + projectName,
      "",
      "Exported: " + rows.length,
      "Failed: " + failures.length,
      ""
    ];
    if (listNote) lines.push(listNote, "");
    lines.push("## Files", "");
    if (!rows.length) lines.push("(none)", "");
    rows.forEach(function (row) { lines.push("- " + row.path + " — " + row.title); });
    lines.push("", "## Failed", "");
    if (!failures.length) lines.push("(none)");
    failures.forEach(function (failure) {
      lines.push("- " + (failure.title || failure.id) + " (" + failure.id + "): " + failure.error);
    });
    if (fileFailures && fileFailures.length) {
      lines.push("", "## Files not saved", "");
      fileFailures.forEach(function (f) { lines.push("- " + (f.title || f.id) + ": " + f.file + " — " + f.error); });
    }
    lines.push("");
    return lines.join("\n");
  }

  function bytesToBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
      const copy = new Array(slice.length);
      for (let j = 0; j < slice.length; j += 1) copy[j] = slice[j];
      bin += String.fromCharCode.apply(null, copy);
    }
    return btoa(bin);
  }

  function anchorDownload(filename, bytes) {
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    return { via: "anchor" };
  }

  /* Every zip has one top-level folder named like the zip, so unzipping makes its own folder. */
  function buildRootedZip(zipName, files) {
    const root = String(zipName).replace(/\.zip$/i, "");
    return lib.buildStoredZip(files.map(function (f) { return Object.assign({}, f, { name: root + "/" + f.name }); }));
  }

  async function saveZip(filename, bytes) {
    let downloadError = "";
    if (api && api.runtime && api.runtime.sendMessage && bytes.length < 32000000) {
      try {
        const response = await new Promise(function (resolve, reject) {
          api.runtime.sendMessage({
            type: "chatout-archive-download",
            filename: filename,
            base64: bytesToBase64(bytes)
          }, function (resp) {
            const err = api.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(resp);
          });
        });
        if (response && response.ok) return { via: "downloads", downloadId: response.id, filename: response.filename || filename, downloadError: "" };
        downloadError = (response && response.error) || "downloads API returned no id";
      } catch (e) {
        downloadError = (e && e.message) || String(e);
        console.warn("[chatout] downloads API unavailable, using a link download", downloadError);
      }
    }
    const saved = anchorDownload(filename, bytes);
    saved.downloadError = downloadError;
    return saved;
  }

  async function archiveProject() {
    if (running) return;
    const project = lib.detectProjectUrl(location.href);
    if (!project) {
      setResult({ ok: false, error: "Open a project or notebook page first." });
      return;
    }
    running = true;
    beginRun();
    if (buttonEl) buttonEl.disabled = true;
    document.documentElement.removeAttribute("data-chatout-archive-result");
    const pause = delayMs();
    const failures = [];
    try {
      setProgress("Listing chats…");
      let projectName = titleFromDom();
      let listed = { items: [], note: "" };
      const ctx = { headers: null, org: "", tokens: null };
      if (project.provider === "chatgpt") {
        ctx.headers = await chatGptHeaders(pause);
        try {
          const meta = await fetchRetry(location.origin + "/backend-api/gizmos/" + encodeURIComponent(project.id), {
            credentials: "include",
            headers: ctx.headers
          }, pause);
          if (meta.ok) {
            const name = digName(await meta.json(), 0);
            if (name) projectName = name;
          }
        } catch (e) { /* title stays on the page heading */ }
        listed = await listChatGpt(project.id, ctx.headers, pause);
      } else if (project.provider === "claude") {
        ctx.org = claudeOrgId();
        if (!ctx.org) throw new Error("Could not find the Claude organization id (lastActiveOrg).");
        try {
          const meta = await fetchRetry(location.origin + "/api/organizations/" + encodeURIComponent(ctx.org) + "/projects/" + encodeURIComponent(project.id), {
            credentials: "include",
            headers: { Accept: "application/json" }
          }, pause);
          if (meta.ok) {
            const name = digName(await meta.json(), 0);
            if (name) projectName = name;
          }
        } catch (e) { /* heading fallback */ }
        listed = await listClaude(project.id, ctx.org, pause);
      } else if (project.provider === "grok") {
        try {
          const projects = await listGrokProjects(pause);
          const hit = projects.find(function (p) { return p.id === project.id; });
          if (hit) projectName = hit.name;
        } catch (e) { /* heading fallback */ }
        listed = await listGrokProject(project.id, pause);
      } else if (project.provider === "gemini") {
        ctx.tokens = geminiTokens();
      }

      checkCancel();
      let chats = listed.items || [];
      let listNote = listed.note || "";
      if (!chats.length) {
        setProgress("Listing chats from the page…");
        const domChats = await collectDomChats(project.provider, pause);
        if (domChats.length) {
          chats = domChats;
          listNote = (listNote ? listNote + " " : "") + "Used the chats linked on this page.";
        }
      }
      if (!chats.length) {
        const message = listNote || "No chats found in this project.";
        setProgress(message);
        setResult({ ok: !listNote, exported: 0, failed: 0, empty: !listNote, error: listNote || undefined, project: projectName, failures: [] });
        return;
      }

      const paths = lib.buildChatPaths(projectName, chats, "md");
      const files = [];
      const fileFailures = [];
      const budget = { used: 0 };
      ctx.includeFiles = await readIncludeFiles();
      const rows = [];
      for (let i = 0; i < chats.length; i += 1) {
        const chat = chats[i];
        setProgress("Archiving \"" + projectName + "\" — " + (i + 1) + "/" + chats.length + " — " + chat.title);
        try {
          let markdown = await renderChat(project.provider, chat, ctx, pause);
          if (!markdown || !String(markdown).trim()) throw new Error("empty export");
          if (ctx.includeFiles) {
            const att = await withAttachments(project.provider, chat, ctx, markdown, paths[i], pause, budget);
            markdown = att.markdown;
            att.files.forEach(function (f) { files.push(f); });
            att.failures.forEach(function (f) { fileFailures.push(f); });
          }
          files.push({ name: paths[i], text: preface(projectName, chat, project.provider) + markdown });
          rows.push({ path: paths[i], title: chat.title, id: chat.id });
        } catch (e) {
          failures.push({
            id: chat.id,
            title: chat.title,
            error: String((e && e.message) || e).slice(0, 300)
          });
        }
        if (pause) await lib.sleep(pause);
        checkCancel();
      }

      const folder = paths[0] ? paths[0].split("/")[0] : lib.sanitizeSegment(projectName, "project");
      files.push({ name: folder + "/_index.md", text: indexMarkdown(projectName, rows, failures, listNote, fileFailures) });
      const zipName = lib.zipDownloadName(project.provider, projectName, new Date());
      setProgress("Saving " + rows.length + " chat" + (rows.length === 1 ? "" : "s") + "…");
      checkCancel();
      const bytes = buildRootedZip(zipName, files);
      const saved = await saveZip(zipName, bytes);
      const summary = "Exported " + rows.length + ", failed " + failures.length + ".";
      setProgress(summary + " Saved " + zipName + ".");
      setResult({
        ok: true,
        exported: rows.length,
        failed: failures.length,
        project: projectName,
        filename: zipName,
        savedAs: saved.filename || "",
        via: saved.via,
        downloadId: saved.downloadId == null ? null : saved.downloadId,
        downloadError: saved.downloadError || "",
        failures: failures,
        listNote: listNote
      });
    } catch (e) {
      setResult(failure(e, failures));
    } finally {
      running = false;
      endRun();
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  /* ---- Archive everything: every project plus chats outside projects, current site only. ---- */

  async function listChatGptProjects(headers, pause) {
    const out = [];
    const seen = new Set();
    let cursor = null;
    for (let page = 0; page < 50; page += 1) {
      let url = location.origin + "/backend-api/gizmos/snorlax/sidebar?owned_only=true&conversations_per_gizmo=0";
      if (cursor) url += "&cursor=" + encodeURIComponent(cursor);
      const res = await fetchRetry(url, { credentials: "include", headers: headers, method: "GET" }, pause);
      if (!res.ok) throw new Error("project list HTTP " + res.status);
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      items.forEach(function (entry) {
        const g = (entry && entry.gizmo && (entry.gizmo.gizmo || entry.gizmo)) || entry || {};
        const id = g.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        const name = (g.display && g.display.name) || g.name || digName(g, 0) || id;
        out.push({ id: String(id), name: String(name) });
      });
      cursor = json.cursor;
      if (!cursor || !items.length) break;
      if (pause) await lib.sleep(Math.min(pause, 250));
    }
    return out;
  }

  async function listChatGptAll(headers, pause) {
    return lib.collectPages(async function (cursor) {
      const offset = cursor == null ? 0 : Number(cursor);
      const url = location.origin + "/backend-api/conversations?offset=" + offset + "&limit=100&order=updated";
      const res = await fetchRetry(url, { credentials: "include", headers: headers, method: "GET" }, pause);
      if (!res.ok) throw new Error("chat list HTTP " + res.status);
      const json = await res.json();
      const raw = Array.isArray(json.items) ? json.items : [];
      const items = raw.map(chatGptItem).filter(Boolean);
      const total = Number(json.total);
      const got = offset + raw.length;
      const next = raw.length && (!Number.isFinite(total) || got < total) ? got : null;
      if (pause) await lib.sleep(Math.min(pause, 250));
      return { items: items, nextCursor: next };
    });
  }

  async function claudeJson(path, pause) {
    const res = await fetchRetry(location.origin + "/api/organizations/" + encodeURIComponent(path.org) + path.rest, {
      credentials: "include",
      headers: { Accept: "application/json" }
    }, pause);
    if (!res.ok) throw new Error("list HTTP " + res.status);
    return res.json();
  }

  async function listClaudeProjects(org, pause) {
    const json = await claudeJson({ org: org, rest: "/projects" }, pause);
    const raw = Array.isArray(json) ? json : (json.projects || json.data || []);
    return raw.filter(function (p) { return p && (p.uuid || p.id); }).map(function (p) {
      return { id: String(p.uuid || p.id), name: String(p.name || p.title || p.uuid || p.id) };
    });
  }

  async function listClaudeAll(org, pause) {
    const json = await claudeJson({ org: org, rest: "/chat_conversations" }, pause);
    const raw = Array.isArray(json) ? json : (json.conversations || json.chat_conversations || json.data || []);
    return raw.map(function (item) {
      const chat = claudeItem(item);
      if (chat) chat.projectId = item.project_uuid || (item.project && item.project.uuid) || "";
      return chat;
    }).filter(Boolean);
  }

  function uniqueFolder(name, id, used) {
    let folder = lib.sanitizeSegment(name, "project");
    if (used.has(folder)) folder = folder + "_" + lib.idSuffix(id);
    used.add(folder);
    return folder;
  }

  async function archiveEverything(scopeArg) {
    const scope = scopeArg === "projects" || scopeArg === "chats" ? scopeArg : "everything";
    if (running) return { started: false, error: "An archive is already running." };
    const provider = lib.providerFromUrl ? lib.providerFromUrl(location.href) : null;
    const host = location.hostname;
    const site = provider || (host.endsWith("chatgpt.com") ? "chatgpt" : host.endsWith("claude.ai") ? "claude" : host.endsWith("gemini.google.com") ? "gemini" : host === "grok.com" ? "grok" : "");
    if (!site) {
      lastResult = { ok: false, error: "Open ChatGPT, Claude, Gemini, or Grok first." };
      setResult(lastResult);
      return { started: false, error: lastResult.error };
    }
    running = true;
    beginRun();
    lastResult = null;
    document.documentElement.removeAttribute("data-chatout-archive-result");
    const pause = delayMs();
    const failures = [];
    const notes = [];
    try {
      setProgress("Listing projects…");
      const ctx = { headers: null, org: "", tokens: null };
      const groups = []; // { name, folder, chats }
      const usedFolders = new Set(["no-project"]);
      const claimed = new Set();
      let loose = [];
      if (site === "chatgpt") {
        ctx.headers = await chatGptHeaders(pause);
        let projects = [];
        try { projects = await listChatGptProjects(ctx.headers, pause); } catch (e) { notes.push("Project list failed: " + ((e && e.message) || e) + "."); }
        for (let i = 0; i < projects.length; i += 1) {
          setProgress("Listing project " + (i + 1) + "/" + projects.length + " — " + projects[i].name);
          const listed = await listChatGpt(projects[i].id, ctx.headers, pause);
          if (listed.note) notes.push(projects[i].name + ": " + listed.note);
          groups.push({ name: projects[i].name, id: projects[i].id, chats: listed.items || [] });
        }
        if (scope === "projects") { /* no loose list */ } else {
        setProgress("Listing chats outside projects…");
        const all = await listChatGptAll(ctx.headers, pause);
        if (all.note) notes.push("Chat list: " + all.note);
        loose = all.items || [];
        }
      } else if (site === "claude") {
        ctx.org = claudeOrgId();
        if (!ctx.org) throw new Error("Could not find the Claude organization id (lastActiveOrg).");
        let projects = [];
        try { projects = await listClaudeProjects(ctx.org, pause); } catch (e) { notes.push("Project list failed: " + ((e && e.message) || e) + "."); }
        for (let i = 0; i < projects.length; i += 1) {
          setProgress("Listing project " + (i + 1) + "/" + projects.length + " — " + projects[i].name);
          const listed = await listClaude(projects[i].id, ctx.org, pause);
          if (listed.note) notes.push(projects[i].name + ": " + listed.note);
          groups.push({ name: projects[i].name, id: projects[i].id, chats: listed.items || [] });
        }
        setProgress("Listing chats…");
        loose = await listClaudeAll(ctx.org, pause);
        loose.forEach(function (chat) {
          const g = chat.projectId && groups.find(function (x) { return x.id === chat.projectId; });
          if (g && !g.chats.some(function (c) { return c.id === chat.id; })) g.chats.push(chat);
        });
      } else if (site === "grok") {
        let projects = [];
        try { projects = await listGrokProjects(pause); } catch (e) { notes.push("Grok project list failed: " + ((e && e.message) || e) + "."); }
        if (!projects.length && scope === "projects") notes.push("No Grok projects found.");
        for (let i = 0; i < projects.length; i += 1) {
          setProgress("Listing project " + (i + 1) + "/" + projects.length + " — " + projects[i].name);
          try {
            const listed = await listGrokProject(projects[i].id, pause);
            if (listed.note) notes.push(projects[i].name + ": " + listed.note);
            groups.push({ name: projects[i].name, id: projects[i].id, chats: listed.items || [] });
          } catch (e) {
            notes.push(projects[i].name + ": chat list failed (" + ((e && e.message) || e) + ").");
            groups.push({ name: projects[i].name, id: projects[i].id, chats: [] });
          }
        }
        setProgress("Listing chats…");
        const all = await listGrokConversations("", pause);
        loose = all.items || [];
        loose.forEach(function (chat) {
          const g = chat.projectId && groups.find(function (x) { return x.id === chat.projectId; });
          if (g && !g.chats.some(function (c) { return c.id === chat.id; })) g.chats.push(chat);
        });
      } else {
        ctx.tokens = geminiTokens();
        if (scope === "projects") notes.push("Gemini has no projects ChatOut can read, so there is nothing to save in projects-only mode.");
        else notes.push("Gemini has no project list ChatOut can read; chats are saved under no-project/.");
        setProgress("Listing chats…");
        loose = scope === "projects" ? [] : await listGeminiAll(ctx.tokens, pause, notes);
      }

      checkCancel();
      // Dedupe: each conversation id once, project folder wins.
      const work = [];
      groups.forEach(function (g) {
        const chats = g.chats.filter(function (c) { if (claimed.has(c.id)) return false; claimed.add(c.id); return true; });
        g.folder = uniqueFolder(g.name, g.id, usedFolders);
        g.count = chats.length;
        if (chats.length && scope !== "chats") work.push({ group: g, chats: chats });
      });
      const rest = scope === "projects" ? [] : loose.filter(function (c) { if (claimed.has(c.id)) return false; claimed.add(c.id); return true; });
      const noProject = { name: "No project", folder: "no-project", count: rest.length };
      if (rest.length) work.push({ group: noProject, chats: rest });

      const total = work.reduce(function (n, w) { return n + w.chats.length; }, 0);
      if (!total) {
        lastResult = { ok: true, empty: true, exported: 0, failed: 0, projects: groups.length, failures: [], notes: notes };
        setProgress("No chats found." + (notes.length ? " " + notes.join(" ") : ""));
        setResult(lastResult);
        return { started: true };
      }

      const files = [];
      const budget = { used: 0 };
      let fileFailureCount = 0;
      ctx.includeFiles = await readIncludeFiles();
      let done = 0;
      let exported = 0;
      for (const w of work) {
        const g = w.group;
        const paths = lib.buildChatPaths(g.folder, w.chats, "md").map(function (p) { return g.folder + p.slice(p.indexOf("/")); });
        const rows = [];
        const groupFailures = [];
        const groupFileFailures = [];
        for (let i = 0; i < w.chats.length; i += 1) {
          const chat = w.chats[i];
          done += 1;
          setProgress("Archiving everything — " + done + "/" + total + " — " + g.name + " — " + chat.title);
          try {
            let markdown = await renderChat(site, chat, ctx, pause);
            if (!markdown || !String(markdown).trim()) throw new Error("empty export");
            if (ctx.includeFiles) {
              const att = await withAttachments(site, chat, ctx, markdown, paths[i], pause, budget);
              markdown = att.markdown;
              att.files.forEach(function (f) { files.push(f); });
              att.failures.forEach(function (f) { groupFileFailures.push(f); fileFailureCount += 1; });
            }
            files.push({ name: paths[i], text: preface(g.name, chat, site) + markdown });
            rows.push({ path: paths[i], title: chat.title, id: chat.id });
          } catch (e) {
            const f = { id: chat.id, title: chat.title, project: g.name, error: String((e && e.message) || e).slice(0, 300) };
            groupFailures.push(f);
            failures.push(f);
          }
          if (pause) await lib.sleep(pause);
          checkCancel();
        checkCancel();
        }
        exported += rows.length;
        g.exported = rows.length;
        g.failed = groupFailures.length;
        files.push({ name: g.folder + "/_index.md", text: indexMarkdown(g.name, rows, groupFailures, "", groupFileFailures) });
      }

      const top = [
        "# ChatOut archive: " + scope + " on " + site,
        "",
        "- Saved: " + new Date().toISOString(),
        "- Exported: " + exported,
        "- Failed: " + failures.length,
        "- Projects: " + groups.length,
        "- Images and attachments: " + (ctx.includeFiles ? "included (" + fileFailureCount + " not saved, see each folder's _index.md)" : "not included"),
        "",
        "## Folders",
        ""
      ];
      (scope === "chats" ? [] : groups).concat(rest.length ? [noProject] : []).forEach(function (g) {
        top.push("- " + g.folder + "/ — " + g.name + " — " + (g.exported || 0) + " exported, " + (g.failed || 0) + " failed");
      });
      if (notes.length) { top.push("", "## Notes", ""); notes.forEach(function (n) { top.push("- " + n); }); }
      files.push({ name: "_index.md", text: top.join("\n") + "\n" });

      const zipName = lib.zipDownloadName(site, scope === "chats" ? "chats" : scope, new Date());
      setProgress("Saving " + exported + " chats…");
      checkCancel();
      const saved = await saveZip(zipName, buildRootedZip(zipName, files));
      const summary = "Exported " + exported + ", failed " + failures.length + ".";
      setProgress(summary + " Saved " + zipName + ".");
      lastResult = {
        ok: true, scope: scope, exported: exported, failed: failures.length, projects: groups.length,
        filename: zipName, savedAs: saved.filename || "", via: saved.via,
        downloadId: saved.downloadId == null ? null : saved.downloadId, downloadError: saved.downloadError || "",
        failures: failures, notes: notes
      };
      setResult(lastResult);
    } catch (e) {
      lastResult = failure(e, failures);
      setResult(lastResult);
    } finally {
      running = false;
      endRun();
    }
    return { started: true };
  }

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (!msg || window.top !== window) return;
      if (msg.type === "chatout-archive-everything") {
        if (running) { sendResponse({ started: false, error: "An archive is already running." }); return; }
        lastResult = null;
        archiveEverything(msg.scope);
        sendResponse({ started: true });
        return;
      }
      if (msg.type === "chatout-archive-cancel") {
        sendResponse({ cancelled: cancelRun() });
        return;
      }
      if (msg.type === "chatout-archive-status") {
        sendResponse({
          running: running,
          progress: document.documentElement.getAttribute("data-chatout-archive-progress") || "",
          result: lastResult
        });
      }
    });
  }

  async function exportCurrent() {
    const debug = window.__AI_EXPORTER_DEBUG__;
    document.documentElement.removeAttribute("data-chatout-export-result");
    try {
      if (!debug || typeof debug.exportCurrentMarkdownFile !== "function") throw new Error("exporter unavailable");
      await debug.exportCurrentMarkdownFile();
      document.documentElement.setAttribute("data-chatout-export-result", "ok");
    } catch (e) {
      document.documentElement.setAttribute("data-chatout-export-result", "error: " + ((e && e.message) || e));
    }
  }

  function ensureUi() {
    const project = lib.detectProjectUrl(location.href);
    let host = document.getElementById("chatout-archive-root");
    if (!project) {
      if (host) host.remove();
      statusEl = null;
      buttonEl = null;
      return;
    }
    if (host) return;
    host = document.createElement("div");
    host.id = "chatout-archive-root";
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = [
      "<style>",
      ":host{all:initial}",
      ".panel{position:fixed;top:12px;right:12px;z-index:2147483646;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font-family:system-ui,sans-serif}",
      "button{appearance:none;border:0;border-radius:999px;background:#111827;color:#f9fafb;font:600 14px/1.2 system-ui,sans-serif;padding:10px 14px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)}",
      "button:disabled{opacity:.6;cursor:progress}",
      "button[hidden]{display:none}",
      ".status{max-width:320px;background:#fff;color:#111827;border-radius:10px;padding:8px 10px;font:13px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18)}",
      "</style>",
      "<div class='panel'>",
      "<button type='button' id='chatout-archive-project'>Archive project</button>",
      "<button type='button' id='chatout-archive-cancel' hidden>Cancel</button>",
      "<div class='status' id='chatout-archive-status' role='status' aria-live='polite'>Save every chat in this project.</div>",
      "</div>"
    ].join("");
    buttonEl = shadow.getElementById("chatout-archive-project");
    statusEl = shadow.getElementById("chatout-archive-status");
    cancelEl = shadow.getElementById("chatout-archive-cancel");
    cancelEl.hidden = !running;
    cancelEl.addEventListener("click", function () { cancelRun(); });
    buttonEl.addEventListener("click", function () { archiveProject(); });
    document.documentElement.appendChild(host);
  }

  document.addEventListener("chatout-command", function () {
    const command = document.documentElement.getAttribute("data-chatout-command") || "";
    if (command === "archive-project") archiveProject();
    else if (command.startsWith("archive-everything")) archiveEverything(command.split(":")[1]);
    else if (command === "archive-cancel") cancelRun();
    else if (command === "export-markdown") exportCurrent();
  }, true);

  ensureUi();
  setInterval(ensureUi, 1000);
  document.documentElement.setAttribute("data-chatout-ready", "1");
  globalThis.__CHATOUT_ARCHIVE__ = {
    archiveProject: archiveProject,
    archiveEverything: archiveEverything,
    detectProjectUrl: lib.detectProjectUrl
  };
})();
