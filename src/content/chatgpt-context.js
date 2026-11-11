/* Context gauge for the open ChatGPT conversation.
   Prefers the paginated /backend-api/conversations/{id} messages list,
   then the older mapping body, then the response the page itself loaded.
   Visible DOM text is only a fallback, and it stays hidden when no turn
   text was found. On a project page the pill sits under Archive project. */
(function () {
  "use strict";
  var lib = globalThis.__CHATOUT_CONTEXT_LIB__;
  if (!lib || !lib.isChatGptHost(location.hostname)) return;

  var api = (globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id)
    ? globalThis.browser
    : globalThis.chrome;

  var REFRESH_MS = 600;
  var REFETCH_MS = 3000;
  var RETRY_MS = 4000;
  var timer = null;
  var seq = 0;
  var sessionHeadersCache = null;
  var pending = null;
  var lastFetchAt = 0;
  var captured = {};
  var cache = { id: "", at: 0, data: null, sig: "", source: "" };

  var TURN_SELECTOR = "[data-message-author-role='user'], [data-message-author-role='assistant'], [data-turn='user'], [data-turn='assistant'], [data-testid^='conversation-turn-']";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readOverride() {
    return new Promise(function (resolve) {
      try {
        if (!api || !api.storage || !api.storage.local) { resolve(null); return; }
        api.storage.local.get("chatoutContextLimit", function (bag) {
          if (api.runtime && api.runtime.lastError) { resolve(null); return; }
          var n = bag && Number(bag.chatoutContextLimit);
          resolve(Number.isFinite(n) ? n : null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function roleOf(node) {
    var role = node.getAttribute("data-message-author-role") || node.getAttribute("data-turn") || "";
    if (role === "user" || role === "assistant") return role;
    var testid = node.getAttribute("data-testid") || "";
    if (/assistant/i.test(testid)) return "assistant";
    if (/user/i.test(testid)) return "user";
    var inner = node.querySelector("[data-message-author-role], [data-turn]");
    if (inner && inner !== node) return roleOf(inner);
    return "";
  }

  function messageNodes() {
    var nodes = document.querySelectorAll(TURN_SELECTOR);
    var list = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.closest && node.closest("#chatout-archive-root, #chatout-context-root")) continue;
      var role = roleOf(node);
      if (role !== "user" && role !== "assistant") continue;
      var outer = false;
      for (var j = 0; j < nodes.length; j += 1) {
        if (i !== j && node.contains(nodes[j]) && roleOf(nodes[j])) { outer = true; break; }
      }
      if (!outer) list.push(node);
    }
    return list;
  }

  function shouldShow() {
    if (!lib.isChatGptHost(location.hostname)) return false;
    if (lib.conversationIdFromPath(location.pathname)) return true;
    return messageNodes().length > 0;
  }

  function domText() {
    var nodes = messageNodes();
    var parts = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var text = nodes[i].textContent || "";
      if (String(text).trim()) parts.push(text);
    }
    return parts.join("\n");
  }

  function domSignature() {
    var nodes = messageNodes();
    var last = nodes.length ? (nodes[nodes.length - 1].textContent || "").length : 0;
    return nodes.length + ":" + last;
  }

  function modelFromDom() {
    var nodes = document.querySelectorAll("[data-testid*='model-switcher'], [data-testid*='model-selector']");
    for (var i = 0; i < nodes.length; i += 1) {
      var text = (nodes[i].textContent || "").replace(/\s+/g, " ").trim();
      if (text && text.length < 48) return text;
    }
    return "";
  }

  function usable(data) {
    if (!data) return null;
    if (data.conversation && (data.conversation.mapping || data.conversation.messages)) data = data.conversation;
    if (data.mapping || (data.messages && data.messages.length)) return data;
    return null;
  }

  function remember(id, data) {
    var body = usable(data);
    if (!id || !body) return;
    var prev = captured[id];
    if (body.mapping || !prev || !prev.messages || !body.messages) {
      captured[id] = body;
      return;
    }
    var seen = {};
    var out = [];
    var lists = [prev.messages, body.messages];
    for (var p = 0; p < lists.length; p += 1) {
      for (var i = 0; i < lists[p].length; i += 1) {
        var msg = lists[p][i];
        var key = (msg && (msg.id || msg.message_id)) || ("n" + out.length);
        if (seen[key]) continue;
        seen[key] = true;
        out.push(msg);
      }
    }
    prev.messages = out;
    if (body.default_model_slug) prev.default_model_slug = body.default_model_slug;
    if (body.current_node) prev.current_node = body.current_node;
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var msg = ev.data;
    if (!msg || msg.source !== "chatout-conv" || !msg.id) return;
    remember(msg.id, msg.data);
    if (msg.id === lib.conversationIdFromPath(location.pathname)) schedule();
  });

  function askPage(id) {
    try {
      window.postMessage({ source: "chatout-conv-ask", id: id }, location.origin);
    } catch (e) {}
  }

  function waitCaptured(id, ms) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function tick() {
        if (captured[id]) { resolve(captured[id]); return; }
        if (Date.now() - start >= ms) { resolve(null); return; }
        setTimeout(tick, 50);
      })();
    });
  }

  async function sessionHeaders() {
    if (sessionHeadersCache) return sessionHeadersCache;
    var res = await fetch(location.origin + "/api/auth/session", {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) throw new Error("session HTTP " + res.status);
    var session = await res.json();
    if (!session || !session.accessToken) throw new Error("no accessToken");
    var headers = {
      Authorization: "Bearer " + session.accessToken,
      Accept: "application/json"
    };
    var account = session.account && (session.account.id || session.account.account_id);
    if (account) headers["ChatGPT-Account-Id"] = account;
    try {
      var device = localStorage.getItem("oai-device-id") || localStorage.getItem("oai_device_id");
      if (device) headers["oai-device-id"] = device;
    } catch (e) { /* private mode */ }
    headers["oai-language"] = (navigator.language || "en-US");
    sessionHeadersCache = headers;
    return headers;
  }

  async function fetchJson(url, headers) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var kill = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    try {
      var res = await fetch(url, {
        credentials: "include",
        headers: headers,
        method: "GET",
        signal: ctl ? ctl.signal : undefined
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) sessionHeadersCache = null;
        throw new Error("HTTP " + res.status);
      }
      return res.json();
    } finally {
      if (kill) clearTimeout(kill);
    }
  }

  async function fetchMessagePages(id, headers) {
    var merged = [];
    var seen = {};
    var root = null;
    var cursor = "";
    for (var guard = 0; guard < 40; guard += 1) {
      var url = location.origin + "/backend-api/conversations/" + encodeURIComponent(id) + "?include_has_versions=true&num_turns=100";
      if (cursor) url += "&before=" + encodeURIComponent(cursor);
      var data;
      try {
        data = usable(await fetchJson(url, headers));
      } catch (e) {
        if (root && merged.length) break;
        throw e;
      }
      if (!data || !data.messages) {
        if (root && merged.length) break;
        throw new Error("no messages");
      }
      if (!root) root = data;
      for (var i = 0; i < data.messages.length; i += 1) {
        var msg = data.messages[i];
        var key = (msg && (msg.id || msg.message_id)) || ("n" + merged.length + ":" + i);
        if (seen[key]) continue;
        seen[key] = true;
        merged.push(msg);
      }
      var info = data.page_info || {};
      var next = info.has_previous_page && info.start_cursor ? String(info.start_cursor) : "";
      if (!next || next === cursor) break;
      cursor = next;
    }
    if (!root) throw new Error("no messages");
    root.messages = merged;
    return root;
  }

  async function fetchConversation(id) {
    var headers = await sessionHeaders();
    try {
      var paged = await fetchMessagePages(id, headers);
      if (paged && paged.messages && paged.messages.length) return paged;
    } catch (e) {}
    var legacy = usable(await fetchJson(location.origin + "/backend-api/conversation/" + encodeURIComponent(id), headers));
    if (legacy && (legacy.mapping || (legacy.messages && legacy.messages.length))) return legacy;
    throw new Error("no conversation");
  }

  function store(id, data, source) {
    cache.id = id;
    cache.at = Date.now();
    cache.data = data;
    cache.sig = domSignature();
    cache.source = source;
    return data;
  }

  function loadConversation(id) {
    if (captured[id]) return Promise.resolve(store(id, captured[id], "page"));
    var sig = domSignature();
    var now = Date.now();
    if (cache.id === id && cache.data && cache.sig === sig && now - cache.at < 8000) return Promise.resolve(cache.data);
    if (cache.id === id && cache.data && now - cache.at < REFETCH_MS) {
      setTimeout(schedule, REFETCH_MS - (now - cache.at) + 40);
      return Promise.resolve(cache.data);
    }
    if (pending && pending.id === id) return pending.promise;
    lastFetchAt = now;
    var promise = fetchConversation(id).then(function (data) {
      return store(id, data, "extension");
    }).catch(function () {
      askPage(id);
      return waitCaptured(id, 2500).then(function (data) {
        if (data) return store(id, data, "page");
        return cache.id === id ? cache.data : null;
      });
    }).finally(function () {
      if (pending && pending.promise === promise) pending = null;
    });
    pending = { id: id, promise: promise };
    return promise;
  }

  function slot() {
    var archive = document.getElementById("chatout-archive-root");
    if (archive && archive.shadowRoot) {
      var inside = archive.shadowRoot.getElementById("chatout-context-slot");
      if (inside) {
        var own = document.getElementById("chatout-context-root");
        if (own) own.remove();
        return inside;
      }
    }
    var host = document.getElementById("chatout-context-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "chatout-context-root";
      host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;";
      var shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = "<div id='chatout-context-mount' style='position:fixed;top:56px;right:16px;z-index:2147483646;pointer-events:auto;'></div>";
      document.documentElement.appendChild(host);
    }
    return host.shadowRoot.getElementById("chatout-context-mount");
  }

  function clearGauge() {
    var archive = document.getElementById("chatout-archive-root");
    if (archive && archive.shadowRoot) {
      var inside = archive.shadowRoot.getElementById("chatout-context-slot");
      if (inside) inside.textContent = "";
    }
    var own = document.getElementById("chatout-context-root");
    if (own) own.remove();
    var root = document.documentElement;
    root.removeAttribute("data-chatout-context");
    root.removeAttribute("data-chatout-context-mode");
    root.removeAttribute("data-chatout-context-visible");
    root.removeAttribute("data-chatout-context-hidden");
    root.removeAttribute("data-chatout-context-limit");
    root.removeAttribute("data-chatout-context-band");
    root.removeAttribute("data-chatout-context-source");
  }

  function render(u, source) {
    var host = slot();
    if (!host) return;
    var color = u.band === "red" ? "#b91c1c" : u.band === "amber" ? "#b45309" : "#15803d";
    var fill = u.band === "red" ? "#dc2626" : u.band === "amber" ? "#d97706" : "#16a34a";
    var width = Math.max(0, Math.min(100, u.percent));
    var tip = lib.tooltip(u);
    var now = Math.round(Math.min(100, Math.max(0, u.percent)));
    host.innerHTML = "<div id='chatout-context-gauge' role='meter' aria-valuemin='0' aria-valuemax='100' aria-valuenow='" + now + "' aria-label='" + esc(tip) + "' title='" + esc(tip) + "' style='text-align:right;font-family:system-ui,sans-serif;width:max-content;margin-left:auto'>" +
      "<span style='display:inline-flex;align-items:center;gap:6px;background:#fff;color:" + color + ";border-radius:999px;padding:4px 8px;box-shadow:0 4px 14px rgba(0,0,0,.18)'>" +
      "<span style='font:600 12px/1 system-ui,sans-serif'>" + esc(u.label) + "</span>" +
      "<span style='display:inline-block;width:36px;height:6px;border-radius:99px;background:#e5e7eb;overflow:hidden'>" +
      "<span style='display:block;height:100%;width:" + width.toFixed(1) + "%;background:" + fill + "'></span>" +
      "</span></span></div>";
    var root = document.documentElement;
    root.setAttribute("data-chatout-context", String(Math.round(Math.min(u.percent, 999))));
    root.setAttribute("data-chatout-context-mode", u.mode);
    root.setAttribute("data-chatout-context-visible", String(u.visibleTokens));
    root.setAttribute("data-chatout-context-hidden", String(u.hiddenTokens));
    root.setAttribute("data-chatout-context-limit", String(u.limit));
    root.setAttribute("data-chatout-context-band", u.band);
    root.setAttribute("data-chatout-context-source", source || "");
  }

  async function refresh() {
    var my = ++seq;
    if (!shouldShow()) {
      clearGauge();
      return;
    }
    var id = lib.conversationIdFromPath(location.pathname);
    if (cache.id && id && cache.id !== id) {
      cache.data = null;
      cache.at = 0;
      cache.id = "";
      cache.source = "";
    }
    var override = await readOverride();
    if (my !== seq) return;
    var counted = null;
    var mode = "dom";
    var source = "dom";
    if (id) {
      var data = await loadConversation(id);
      if (my !== seq) return;
      if (data && (data.mapping || (data.messages && data.messages.length))) {
        counted = lib.countConversation(data);
        mode = "json";
        source = cache.source || "extension";
      }
    }
    if (!counted) {
      var text = domText();
      if (!String(text).trim()) {
        clearGauge();
        return;
      }
      counted = {
        visibleTokens: lib.estimateTokens(text),
        hiddenTokens: 0,
        model: modelFromDom()
      };
      mode = "dom";
      source = "dom";
    }
    var resolved = lib.resolveLimit(counted.model, override);
    var limit = mode === "dom" ? lib.visibleOnlyLimit(resolved.limit) : resolved.limit;
    render(lib.usage(counted.visibleTokens, counted.hiddenTokens, limit, mode), source);
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      refresh();
    }, REFRESH_MS);
  }

  function ignored(node) {
    while (node) {
      if (node.id === "chatout-archive-root" || node.id === "chatout-context-root") return true;
      node = node.parentNode;
    }
    return false;
  }

  var observed = null;
  function observe() {
    var target = document.body || document.documentElement;
    if (!target || target === observed) return;
    if (observer) observer.disconnect();
    observed = target;
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i += 1) {
      if (!ignored(records[i].target)) {
        schedule();
        return;
      }
    }
  });

  var lastUrl = location.href;
  var lastSig = "";
  setInterval(function () {
    observe();
    var url = location.href;
    var sig = domSignature();
    var id = lib.conversationIdFromPath(location.pathname);
    if (url !== lastUrl) {
      lastUrl = url;
      lastSig = sig;
      if (cache.id && cache.id !== id) {
        cache.data = null;
        cache.at = 0;
      }
      schedule();
      return;
    }
    if (sig !== lastSig) {
      lastSig = sig;
      schedule();
    } else if (id && !cache.data && Date.now() - lastFetchAt > RETRY_MS) {
      schedule();
    } else if (cache.data && Date.now() - cache.at > 8000) {
      schedule();
    }
  }, 1000);

  if (api && api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes && changes.chatoutContextLimit) schedule();
    });
  }

  observe();
  lastSig = domSignature();
  refresh();
})();
