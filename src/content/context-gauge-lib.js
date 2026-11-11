/* ChatGPT context-gauge math. No network, no DOM, no dependencies.
   Token counts are a heuristic: about 4 characters per token for non-CJK
   text, and about 1 token per CJK character. That matches the owner's
   o200k_base exports within roughly 5–15% (those chats were ~4.2–4.5
   characters per token), and it over-counts a little, so the gauge warns
   slightly early. It is not a tokenizer.

   Calibration, from two real chats that both ended on ChatGPT's red
   "start a new chat" mark. Counts are visible user and assistant text
   only, tiktoken o200k_base:
     Chat A: 816 KB, 185,632 tokens, 314 turns.
     Chat B: 269 KB, 65,757 tokens, 140 turns, heavy connector/tool use.
   Visible text alone does not predict the wall (A and B differ by ~3x).
   Hidden tool results, file reads, reasoning, and system messages count
   too. The fallback window is 200,000 tokens, just above Chat A's visible
   total, so a text-heavy chat turns red (above 80%, at 160,000) with room
   left to ask for a summary. When only on-screen text is available the
   ceiling is 40,000, so red starts at 32,000 visible tokens, well before
   Chat B's 66k death. */
(function (root) {
  "use strict";

  var FALLBACK_LIMIT = 200000;
  var VISIBLE_ONLY_LIMIT = 40000;
  var RED_HINT = "Ask for a resume summary now.";
  var VISIBLE_CAVEAT = "visible text only, may under-read";

  /* Recognized small models only. Anything else, including current
     flagship and Thinking slugs, uses FALLBACK_LIMIT: the published 128k
     Thinking input cap is below Chat A's observed wall. */
  var MODEL_LIMITS = [
    { id: "gpt-3.5", re: /gpt-?3\.5|gpt-?3-5|gpt-35/i, limit: 16000 },
    { id: "instant", re: /gpt-?4o|chatgpt-4o|\binstant\b|\bfast\b/i, limit: 32000 },
    { id: "gpt-4", re: /gpt-?4(?!o)(?![\.\d])/i, limit: 32000 }
  ];

  function estimateTokens(text) {
    var s = String(text || "");
    if (!s) return 0;
    var cjk = 0;
    for (var i = 0; i < s.length; i += 1) {
      var c = s.charCodeAt(i);
      if ((c >= 0x3400 && c <= 0x9fff) || (c >= 0x3040 && c <= 0x30ff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)) cjk += 1;
    }
    return cjk + Math.ceil((s.length - cjk) / 4);
  }

  function resolveLimit(modelLabel, override) {
    var n = Number(override);
    if (Number.isFinite(n) && n >= 1000 && n <= 2000000) {
      return { limit: Math.round(n), source: "override", model: String(modelLabel || "") };
    }
    var label = String(modelLabel || "");
    for (var i = 0; i < MODEL_LIMITS.length; i += 1) {
      if (MODEL_LIMITS[i].re.test(label)) {
        return { limit: MODEL_LIMITS[i].limit, source: MODEL_LIMITS[i].id, model: label };
      }
    }
    return { limit: FALLBACK_LIMIT, source: "fallback", model: label };
  }

  function visibleOnlyLimit(fullLimit) {
    var n = Number(fullLimit);
    if (!Number.isFinite(n) || n <= 0) n = FALLBACK_LIMIT;
    return Math.min(Math.round(n), VISIBLE_ONLY_LIMIT);
  }

  function bandFor(percent) {
    if (percent > 80) return "red";
    if (percent >= 60) return "amber";
    return "green";
  }

  function fmt(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function usage(visibleTokens, hiddenTokens, limit, mode, limitInfo) {
    var visible = Math.max(0, Math.round(Number(visibleTokens) || 0));
    var hidden = Math.max(0, Math.round(Number(hiddenTokens) || 0));
    var lim = Math.max(1, Math.round(Number(limit) || FALLBACK_LIMIT));
    var dom = mode === "dom";
    var counted = dom ? visible : visible + hidden;
    var percent = (counted / lim) * 100;
    var info = limitInfo || {};
    return {
      visibleTokens: visible,
      hiddenTokens: hidden,
      tokens: counted,
      limit: lim,
      percent: percent,
      label: percent > 100 ? "100%+" : "~" + Math.round(percent) + "%",
      caveat: dom ? VISIBLE_CAVEAT : "",
      band: bandFor(percent),
      mode: dom ? "dom" : "json",
      limitSource: dom ? "visible" : (info.source || ""),
      limitModel: info.model || ""
    };
  }

  function limitNote(u) {
    var name = "fallback";
    if (u && u.mode === "dom") name = "visible text only";
    else if (u && u.limitSource === "override") name = "your setting";
    else if (u && u.limitSource && u.limitSource !== "fallback") name = u.limitModel || u.limitSource;
    else if (u && u.limitModel) name = "fallback, " + u.limitModel;
    return "Limit " + fmt(u && u.limit) + " (" + name + ").";
  }

  function tooltip(u) {
    var parts;
    if (!u || u.mode === "dom") {
      parts = [
        "Visible text only, may under-read.",
        limitNote(u),
        "Visible " + fmt(u && u.visibleTokens) + " tokens.",
        "Hidden tool calls are not counted.",
        "Total " + fmt(u && u.tokens) + " tokens."
      ];
    } else {
      parts = [
        "Estimate " + u.label + ".",
        limitNote(u),
        "Visible " + fmt(u.visibleTokens) + " tokens.",
        "Hidden/tool " + fmt(u.hiddenTokens) + " tokens.",
        "Total " + fmt(u.tokens) + " tokens.",
        "About 4 characters per token, not a tokenizer."
      ];
    }
    if (u && u.band === "red") parts.push(RED_HINT);
    return parts.join(" ");
  }

  function pushStrings(value, out, depth) {
    if (value == null || depth > 12) return;
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) pushStrings(value[i], out, depth + 1);
      return;
    }
    if (typeof value === "object") {
      var keys = Object.keys(value);
      for (var j = 0; j < keys.length; j += 1) pushStrings(value[keys[j]], out, depth + 1);
    }
  }

  function visibleParts(content) {
    if (!content || typeof content !== "object") return [];
    var type = String(content.content_type || "text");
    if (type !== "text" && type !== "multimodal_text" && type !== "code") return [];
    var parts = [];
    if (typeof content.text === "string") parts.push(content.text);
    var raw = content.parts;
    if (!Array.isArray(raw)) return parts;
    for (var i = 0; i < raw.length; i += 1) {
      var part = raw[i];
      if (typeof part === "string") parts.push(part);
      else if (part && typeof part === "object" && typeof part.text === "string" && !part.asset_pointer) parts.push(part.text);
    }
    return parts;
  }

  function isShownRole(msg) {
    var role = (msg.author && msg.author.role) || "";
    if (role !== "user" && role !== "assistant") return false;
    var recipient = msg.recipient || "all";
    return recipient === "all" || recipient === "user" || recipient === "";
  }

  function slugOf(msg) {
    return msg && msg.metadata && (msg.metadata.model_slug || msg.metadata.resolved_model_slug);
  }

  function modelFromConversation(data) {
    var mapping = (data && data.mapping) || {};
    var fromPath = "";
    var nodeId = data && data.current_node;
    var seen = {};
    while (nodeId && mapping[nodeId] && !seen[nodeId]) {
      seen[nodeId] = true;
      var msg = mapping[nodeId].message;
      var role = msg && msg.author && msg.author.role;
      var slug = slugOf(msg);
      if (!fromPath && role === "assistant" && slug) fromPath = String(slug);
      nodeId = mapping[nodeId].parent;
    }
    if (fromPath) return fromPath;
    return modelFromMessages(data);
  }

  function modelFromMessages(data) {
    var list = (data && data.messages) || [];
    for (var i = list.length - 1; i >= 0; i -= 1) {
      var msg = list[i];
      var role = msg && msg.author && msg.author.role;
      var slug = slugOf(msg);
      if (role === "assistant" && slug) return String(slug);
    }
    if (data && data.default_model_slug) return String(data.default_model_slug);
    if (data && data.model) return String(data.model);
    return "";
  }

  function absorbMessage(msg, visible, hidden) {
    if (!msg) return;
    var shown = isShownRole(msg);
    var vis = shown ? visibleParts(msg.content) : [];
    if (shown && typeof msg.content === "string") vis.push(msg.content);
    var all = [];
    pushStrings(msg.content, all, 0);
    pushStrings(msg.metadata, all, 0);
    if (msg.author && msg.author.name && !shown) all.push(String(msg.author.name));
    if (msg.recipient && msg.recipient !== "all" && msg.recipient !== "user") all.push(String(msg.recipient));
    var rest = all.slice();
    for (var v = 0; v < vis.length; v += 1) {
      var at = rest.indexOf(vis[v]);
      if (at >= 0) rest.splice(at, 1);
    }
    if (vis.length) visible.push(vis.join("\n"));
    if (rest.length) hidden.push(rest.join("\n"));
  }

  function messageNode(msg) {
    if (msg && msg.message && typeof msg.message === "object" && (msg.message.author || msg.message.content) && !msg.author) return msg.message;
    return msg;
  }

  function messageKey(msg) {
    var node = messageNode(msg);
    if (!node || typeof node !== "object") return "";
    var id = node.id || node.message_id;
    if (id != null && typeof id !== "object" && String(id)) return "id:" + String(id);
    var role = (node.author && node.author.role) || "";
    var bits = [];
    pushStrings(node.content, bits, 0);
    if (!bits.length) return "";
    return "body:" + role + "\n" + bits.join("\n");
  }

  /* One snapshot. The same message id, or the same body when there is no id,
     is kept once. Callers must pass the pages from this refresh only. */
  function dedupeMessages(lists) {
    var seen = {};
    var out = [];
    var groups = lists || [];
    for (var p = 0; p < groups.length; p += 1) {
      var list = groups[p] || [];
      for (var i = 0; i < list.length; i += 1) {
        var key = messageKey(list[i]);
        if (!key || seen[key]) continue;
        seen[key] = true;
        out.push(messageNode(list[i]));
      }
    }
    return out;
  }

  /* Mapping nodes, or the paginated messages list ChatGPT now returns.
     Orphans in a mapping are not in the live context, so that path can read high.
     A messages list is deduped before counting so a repeated snapshot cannot grow. */
  function countConversation(data) {
    var visible = [];
    var hidden = [];
    var model = "";
    if (data && data.mapping && !(data.messages && data.messages.length)) {
      var keys = Object.keys(data.mapping);
      for (var i = 0; i < keys.length; i += 1) {
        var node = data.mapping[keys[i]];
        absorbMessage(node && node.message, visible, hidden);
      }
      model = modelFromConversation(data);
    } else {
      var list = dedupeMessages([data && data.messages]);
      for (var j = 0; j < list.length; j += 1) absorbMessage(list[j], visible, hidden);
      model = modelFromMessages({ messages: list, default_model_slug: data && data.default_model_slug, model: data && data.model });
    }
    return {
      visibleTokens: estimateTokens(visible.join("\n")),
      hiddenTokens: estimateTokens(hidden.join("\n")),
      model: model
    };
  }

  function conversationIdFromPath(pathname) {
    var m = String(pathname || "").match(/\/c\/([A-Za-z0-9_-]{8,})(?=\/|$)/);
    return m ? m[1] : "";
  }

  function isChatGptHost(hostname) {
    var host = String(hostname || "").replace(/^www\./, "");
    return host === "chatgpt.com" || host === "chat.openai.com";
  }

  root.__CHATOUT_CONTEXT_LIB__ = {
    FALLBACK_LIMIT: FALLBACK_LIMIT,
    VISIBLE_ONLY_LIMIT: VISIBLE_ONLY_LIMIT,
    RED_HINT: RED_HINT,
    VISIBLE_CAVEAT: VISIBLE_CAVEAT,
    MODEL_LIMITS: MODEL_LIMITS,
    estimateTokens: estimateTokens,
    resolveLimit: resolveLimit,
    visibleOnlyLimit: visibleOnlyLimit,
    bandFor: bandFor,
    usage: usage,
    tooltip: tooltip,
    countConversation: countConversation,
    dedupeMessages: dedupeMessages,
    messageKey: messageKey,
    conversationIdFromPath: conversationIdFromPath,
    isChatGptHost: isChatGptHost
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
