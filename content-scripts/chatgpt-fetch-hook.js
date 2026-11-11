/* Page-world hook for chatgpt.com. The gauge's content-script fetch is not
   the page's own request: ChatGPT loads a conversation with
   GET /backend-api/conversations/{id} (messages), and an extension-initiated
   call can be rejected even when the page's call succeeded. This script
   remembers those responses and, on request, refetches through the page's
   fetch with the session bearer. */
(function () {
  "use strict";
  if (window.__CHATOUT_FETCH_HOOK__) return;
  window.__CHATOUT_FETCH_HOOK__ = true;

  var cached = {};
  var origFetch = window.fetch;

  function idFrom(url) {
    var text = String(url || "");
    var plural = text.match(/\/backend-api\/conversations\/([^/?#]+)/);
    if (plural) return safeId(plural[1]);
    var singular = text.match(/\/backend-api\/conversation\/([^/?#]+)/);
    if (!singular) return "";
    return safeId(singular[1]);
  }

  function safeId(raw) {
    var id = "";
    try { id = decodeURIComponent(raw); } catch (e) { id = String(raw || ""); }
    if (!id || id === "init" || id === "search" || id.indexOf("textdoc") === 0) return "";
    return id;
  }

  function unwrap(data) {
    var body = data && data.conversation && (data.conversation.mapping || data.conversation.messages) ? data.conversation : data;
    if (!body) return null;
    if (body.mapping || (body.messages && body.messages.length)) return body;
    return null;
  }

  function publish(id, data, url) {
    var body = unwrap(data);
    if (!id || !body) return;
    cached[id] = body;
    try {
      window.postMessage({ source: "chatout-conv", id: id, url: String(url || ""), data: body }, location.origin);
    } catch (e) { /* page can reject a huge clone */ }
  }

  function msgKey(msg) {
    var node = msg && msg.message && msg.message.author && !msg.author ? msg.message : msg;
    if (!node || typeof node !== "object") return "";
    var id = node.id || node.message_id;
    if (id != null && typeof id !== "object" && String(id)) return "id:" + String(id);
    var parts = node.content && node.content.parts;
    var text = "";
    if (Array.isArray(parts)) {
      for (var i = 0; i < parts.length; i += 1) if (typeof parts[i] === "string") text += parts[i] + "\n";
    }
    if (!text && node.content && typeof node.content.text === "string") text = node.content.text;
    if (!text) return "";
    return "body:" + ((node.author && node.author.role) || "") + "\n" + text;
  }

  function noteResponse(url, responsePromise) {
    var id = idFrom(url);
    if (!id || !responsePromise || typeof responsePromise.then !== "function") return;
    responsePromise.then(function (res) {
      try {
        if (!res || !res.ok || typeof res.clone !== "function") return;
        res.clone().json().then(function (data) { publish(id, data, url); }).catch(function () {});
      } catch (e) {}
    }).catch(function () {});
  }

  if (typeof origFetch === "function") {
    window.fetch = function (input) {
      var url = "";
      try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch (e) {}
      var promise = origFetch.apply(this, arguments);
      try { noteResponse(url, promise); } catch (e) {}
      return promise;
    };
  }

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__chatoutUrl = url; } catch (e) {}
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    try {
      var id = idFrom(xhr.__chatoutUrl || "");
      if (id) {
        xhr.addEventListener("load", function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { publish(id, JSON.parse(xhr.responseText), xhr.__chatoutUrl || ""); } catch (e) {}
          }
        });
      }
    } catch (e) {}
    return origSend.apply(this, arguments);
  };

  function headersFor(session) {
    var headers = {
      Authorization: "Bearer " + session.accessToken,
      Accept: "application/json",
      "x-chatout-page": "1"
    };
    var account = session.account && (session.account.id || session.account.account_id);
    if (account) headers["ChatGPT-Account-Id"] = account;
    try {
      var device = localStorage.getItem("oai-device-id") || localStorage.getItem("oai_device_id");
      if (device) headers["oai-device-id"] = device;
    } catch (e) {}
    headers["oai-language"] = navigator.language || "en-US";
    return headers;
  }

  function mergeMessages(root, page) {
    var seen = {};
    var out = [];
    var lists = [(root && root.messages) || [], (page && page.messages) || []];
    for (var p = 0; p < lists.length; p += 1) {
      for (var i = 0; i < lists[p].length; i += 1) {
        var msg = lists[p][i];
        var key = msgKey(msg);
        if (!key || seen[key]) continue;
        seen[key] = true;
        out.push(msg);
      }
    }
    root.messages = out;
    return root;
  }

  async function getJson(url, headers) {
    var res = await origFetch.call(window, url, { credentials: "include", headers: headers, method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function load(id) {
    if (cached[id]) return cached[id];
    var sessionRes = await origFetch.call(window, location.origin + "/api/auth/session", {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (!sessionRes.ok) throw new Error("session");
    var session = await sessionRes.json();
    if (!session || !session.accessToken) throw new Error("no accessToken");
    var headers = headersFor(session);
    var root = null;
    var cursor = "";
    for (var guard = 0; guard < 40; guard += 1) {
      var url = location.origin + "/backend-api/conversations/" + encodeURIComponent(id) + "?include_has_versions=true&num_turns=100";
      if (cursor) url += "&before=" + encodeURIComponent(cursor);
      var page = null;
      try { page = unwrap(await getJson(url, headers)); } catch (e) { page = null; }
      if (!page || !page.messages) break;
      root = root ? mergeMessages(root, page) : page;
      var info = page.page_info || {};
      var next = info.has_previous_page && info.start_cursor ? String(info.start_cursor) : "";
      if (!next || next === cursor) break;
      cursor = next;
    }
    if (!root) {
      var legacy = unwrap(await getJson(location.origin + "/backend-api/conversation/" + encodeURIComponent(id), headers));
      if (!legacy) throw new Error("no conversation");
      root = legacy;
    }
    publish(id, root, "");
    return root;
  }

  window.__chatoutContextDebug = function () {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        window.removeEventListener("message", onMsg);
        resolve("chatout context debug\nNo reply. Reload the page and try again.");
      }, 3000);
      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data.source !== "chatout-context-debug-out") return;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        var text = String(ev.data.text || "");
        console.log(text);
        resolve(text);
      }
      window.addEventListener("message", onMsg);
      document.dispatchEvent(new Event("chatout-context-debug"));
    });
  };

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var msg = ev.data;
    if (!msg || msg.source !== "chatout-conv-ask" || !msg.id) return;
    if (cached[msg.id]) {
      publish(msg.id, cached[msg.id], "");
      return;
    }
    load(msg.id).catch(function () {});
  });
})();
