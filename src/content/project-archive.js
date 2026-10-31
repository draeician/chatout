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
      try {
        const res = await fetch(url, options);
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

  async function renderChat(provider, chat, ctx, pause) {
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
      const sourcePath = "/app/" + chat.id;
      const endpoint = location.origin + tokens.servicePath + "/data/batchexecute?rpcids=hNvQHb&source-path=" + encodeURIComponent(sourcePath) + "&bl=" + encodeURIComponent(tokens.bl) + "&f.sid=" + encodeURIComponent(tokens.sid) + "&hl=en&_reqid=" + reqid + "&rt=c";
      const payload = JSON.stringify(["c_" + chat.id, 100, null, 1, [0], [4], null, 1]);
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

  function indexMarkdown(projectName, rows, failures, listNote) {
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
      } else if (project.provider === "gemini") {
        ctx.tokens = geminiTokens();
      }

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
      const rows = [];
      for (let i = 0; i < chats.length; i += 1) {
        const chat = chats[i];
        setProgress("Archiving \"" + projectName + "\" — " + (i + 1) + "/" + chats.length + " — " + chat.title);
        try {
          const markdown = await renderChat(project.provider, chat, ctx, pause);
          if (!markdown || !String(markdown).trim()) throw new Error("empty export");
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
      }

      const folder = paths[0] ? paths[0].split("/")[0] : lib.sanitizeSegment(projectName, "project");
      files.push({ name: folder + "/_index.md", text: indexMarkdown(projectName, rows, failures, listNote) });
      const zipName = lib.zipDownloadName(project.provider, projectName, new Date());
      setProgress("Saving " + rows.length + " chat" + (rows.length === 1 ? "" : "s") + "…");
      const bytes = lib.buildStoredZip(files);
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
      const message = String((e && e.message) || e).slice(0, 300);
      setProgress(message);
      setResult({ ok: false, error: message, exported: 0, failed: 0, failures: failures });
    } finally {
      running = false;
      if (buttonEl) buttonEl.disabled = false;
    }
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
      ".status{max-width:320px;background:#fff;color:#111827;border-radius:10px;padding:8px 10px;font:13px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18)}",
      "</style>",
      "<div class='panel'>",
      "<button type='button' id='chatout-archive-project'>Archive project</button>",
      "<div class='status' id='chatout-archive-status' role='status' aria-live='polite'>Save every chat in this project.</div>",
      "</div>"
    ].join("");
    buttonEl = shadow.getElementById("chatout-archive-project");
    statusEl = shadow.getElementById("chatout-archive-status");
    buttonEl.addEventListener("click", function () { archiveProject(); });
    document.documentElement.appendChild(host);
  }

  document.addEventListener("chatout-command", function () {
    const command = document.documentElement.getAttribute("data-chatout-command") || "";
    if (command === "archive-project") archiveProject();
    else if (command === "export-markdown") exportCurrent();
  }, true);

  ensureUi();
  setInterval(ensureUi, 1000);
  document.documentElement.setAttribute("data-chatout-ready", "1");
  globalThis.__CHATOUT_ARCHIVE__ = {
    archiveProject: archiveProject,
    detectProjectUrl: lib.detectProjectUrl
  };
})();
