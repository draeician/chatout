/* Context gauge for the open ChatGPT conversation.
   Prefers /backend-api/conversation JSON (every mapping node). Falls back
   to on-screen message text and says so. Sits in the archive panel's slot
   when that button is on the page, otherwise fixed at the upper right. */
(function () {
  "use strict";
  var lib = globalThis.__CHATOUT_CONTEXT_LIB__;
  if (!lib || !lib.isChatGptHost(location.hostname)) return;

  var api = (globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id)
    ? globalThis.browser
    : globalThis.chrome;

  var REFRESH_MS = 600;
  var REFETCH_MS = 3000;
  var timer = null;
  var seq = 0;
  var sessionHeadersCache = null;
  var pending = null;
  var cache = { id: "", at: 0, data: null, sig: "" };

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

  function shouldShow() {
    if (!lib.isChatGptHost(location.hostname)) return false;
    if (lib.conversationIdFromPath(location.pathname)) return true;
    return !!document.querySelector("main [data-message-author-role]");
  }

  function domText() {
    var nodes = document.querySelectorAll("main [data-message-author-role]");
    var parts = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var role = nodes[i].getAttribute("data-message-author-role") || "";
      if (role !== "user" && role !== "assistant") continue;
      parts.push(nodes[i].textContent || "");
    }
    return parts.join("\n");
  }

  function domSignature() {
    var nodes = document.querySelectorAll("main [data-message-author-role]");
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

  async function fetchConversation(id) {
    var headers = await sessionHeaders();
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var kill = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    try {
      var res = await fetch(location.origin + "/backend-api/conversation/" + encodeURIComponent(id), {
        credentials: "include",
        headers: headers,
        method: "GET",
        signal: ctl ? ctl.signal : undefined
      });
      if (!res.ok) throw new Error("conversation HTTP " + res.status);
      var data = await res.json();
      if (data && data.conversation && data.conversation.mapping) data = data.conversation;
      if (!data || !data.mapping) throw new Error("no mapping");
      return data;
    } finally {
      if (kill) clearTimeout(kill);
    }
  }

  function loadConversation(id) {
    var sig = domSignature();
    var now = Date.now();
    if (cache.id === id && cache.data && cache.sig === sig && now - cache.at < 8000) return Promise.resolve(cache.data);
    if (cache.id === id && cache.data && now - cache.at < REFETCH_MS) {
      setTimeout(schedule, REFETCH_MS - (now - cache.at) + 40);
      return Promise.resolve(cache.data);
    }
    if (pending && pending.id === id) return pending.promise;
    var promise = fetchConversation(id).then(function (data) {
      cache.id = id;
      cache.at = Date.now();
      cache.data = data;
      cache.sig = sig;
      return data;
    }).catch(function () {
      return cache.id === id ? cache.data : null;
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
      host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;";
      var shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = "<div id='chatout-context-mount' style='position:fixed;top:12px;right:12px;z-index:2147483646;'></div>";
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
  }

  function render(u) {
    var host = slot();
    if (!host) return;
    var color = u.band === "red" ? "#b91c1c" : u.band === "amber" ? "#b45309" : "#15803d";
    var fill = u.band === "red" ? "#dc2626" : u.band === "amber" ? "#d97706" : "#16a34a";
    var width = Math.max(0, Math.min(100, u.percent));
    var tip = lib.tooltip(u);
    var caveat = u.caveat
      ? "<span style='display:block;margin-top:2px;font:11px/1.2 system-ui,sans-serif;color:#6b7280;white-space:nowrap'>" + esc(u.caveat) + "</span>"
      : "";
    var now = Math.round(Math.min(100, Math.max(0, u.percent)));
    host.innerHTML = "<div id='chatout-context-gauge' role='meter' aria-valuemin='0' aria-valuemax='100' aria-valuenow='" + now + "' aria-label='" + esc(tip) + "' title='" + esc(tip) + "' style='text-align:right;font-family:system-ui,sans-serif'>" +
      "<span style='display:inline-flex;align-items:center;gap:6px;background:#fff;color:" + color + ";border-radius:999px;padding:6px 10px;box-shadow:0 8px 24px rgba(0,0,0,.18)'>" +
      "<span style='font:600 13px/1 system-ui,sans-serif'>" + esc(u.label) + "</span>" +
      "<span style='display:inline-block;width:42px;height:6px;border-radius:99px;background:#e5e7eb;overflow:hidden'>" +
      "<span style='display:block;height:100%;width:" + width.toFixed(1) + "%;background:" + fill + "'></span>" +
      "</span></span>" + caveat + "</div>";
    var root = document.documentElement;
    root.setAttribute("data-chatout-context", String(Math.round(Math.min(u.percent, 999))));
    root.setAttribute("data-chatout-context-mode", u.mode);
    root.setAttribute("data-chatout-context-visible", String(u.visibleTokens));
    root.setAttribute("data-chatout-context-hidden", String(u.hiddenTokens));
    root.setAttribute("data-chatout-context-limit", String(u.limit));
    root.setAttribute("data-chatout-context-band", u.band);
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
    }
    var override = await readOverride();
    if (my !== seq) return;
    var counted = null;
    var mode = "dom";
    if (id) {
      var data = await loadConversation(id);
      if (my !== seq) return;
      if (data && data.mapping) {
        counted = lib.countConversation(data);
        mode = "json";
      }
    }
    if (!counted) {
      counted = {
        visibleTokens: lib.estimateTokens(domText()),
        hiddenTokens: 0,
        model: modelFromDom()
      };
      mode = "dom";
    }
    var resolved = lib.resolveLimit(counted.model, override);
    var limit = mode === "dom" ? lib.visibleOnlyLimit(resolved.limit) : resolved.limit;
    render(lib.usage(counted.visibleTokens, counted.hiddenTokens, limit, mode));
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
    if (url !== lastUrl) {
      lastUrl = url;
      lastSig = sig;
      if (cache.id && cache.id !== lib.conversationIdFromPath(location.pathname)) {
        cache.data = null;
        cache.at = 0;
      }
      schedule();
      return;
    }
    if (sig !== lastSig) {
      lastSig = sig;
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
