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
   Tool inputs and outputs, reasoning text, and system message text count
   too, when they are the text the model was given. JSON keys, ids,
   citation and search metadata, attachment records, asset pointers, and
   base64 or encrypted blobs do not. The fallback window for an
   unrecognized model is 200,000 tokens, just above Chat A's visible
   total, so a text-heavy chat turns red (above 80%, at 160,000) with room
   left to ask for a summary. GPT-6, including the chatgpt.com slug
   gpt-6-thinking, has its own published 1,050,000 token window. When only
   on-screen text is available the ceiling is 40,000, so red starts at
   32,000 visible tokens, well before Chat B's 66k death. */
(function (root) {
  "use strict";

  var FALLBACK_LIMIT = 200000;
  var VISIBLE_ONLY_LIMIT = 40000;
  var RED_HINT = "Ask for a resume summary now.";
  var VISIBLE_CAVEAT = "visible text only, may under-read";

  /* GPT-6 publishes a 1,050,000 token context window (922,000 of that is
     input). chatgpt.com reports that family as gpt-6-thinking, which used
     to miss this table and show the 200,000 fallback. Unrecognized slugs
     still use FALLBACK_LIMIT, just above Chat A's observed wall. */
  var GPT6_LIMIT = 1050000;
  var MODEL_LIMITS = [
    { id: "gpt-6", re: /gpt-?6/i, limit: GPT6_LIMIT },
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

  function usage(visibleTokens, hiddenTokens, limit, mode, limitInfo, categories) {
    var visible = Math.max(0, Math.round(Number(visibleTokens) || 0));
    var hidden = Math.max(0, Math.round(Number(hiddenTokens) || 0));
    var lim = Math.max(1, Math.round(Number(limit) || FALLBACK_LIMIT));
    var dom = mode === "dom";
    var counted = dom ? visible : visible + hidden;
    var percent = (counted / lim) * 100;
    var info = limitInfo || {};
    var cats = null;
    if (categories && typeof categories === "object") {
      cats = {
        user: Math.max(0, Math.round(Number(categories.user) || 0)),
        assistant: Math.max(0, Math.round(Number(categories.assistant) || 0)),
        tool: Math.max(0, Math.round(Number(categories.tool) || 0)),
        reasoning: Math.max(0, Math.round(Number(categories.reasoning) || 0)),
        other: Math.max(0, Math.round(Number(categories.other) || 0))
      };
    }
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
      limitModel: info.model || "",
      categories: cats
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

  /* The resume line is for a real high reading. It stays quiet when most
     of the total is an "other" bucket, which is how a metadata walk used
     to paint a short chat red. */
  function adviceOk(u) {
    if (!u || u.band !== "red") return false;
    var c = u.categories;
    if (!c) return true;
    var explained = c.user + c.assistant + c.tool + c.reasoning;
    var total = u.tokens || 0;
    if (total > 0 && explained * 5 < total * 4) return false;
    return true;
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
    } else if (u.categories) {
      var c = u.categories;
      parts = [
        "Estimate " + u.label + ".",
        limitNote(u),
        "User " + fmt(c.user) + " tokens.",
        "Assistant " + fmt(c.assistant) + " tokens.",
        "Tool " + fmt(c.tool) + " tokens.",
        "Reasoning " + fmt(c.reasoning) + " tokens.",
        "Other " + fmt(c.other) + " tokens.",
        "Total " + fmt(u.tokens) + " tokens.",
        "About 4 characters per token, not a tokenizer."
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
    if (adviceOk(u)) parts.push(RED_HINT);
    return parts.join(" ");
  }

  /* A long base64 or data URL is a blob, not context text. A repeated
     letter (used by tests and by some tool bodies) is kept. */
  function isOpaque(s) {
    if (typeof s !== "string") return false;
    if (/^data:[^;]{0,80};base64,/i.test(s)) return true;
    if (s.length < 200) return false;
    var compact = s.replace(/\s+/g, "");
    if (compact.length < 200 || !/^[A-Za-z0-9+/=_-]+$/.test(compact)) return false;
    var seen = {};
    var kinds = 0;
    for (var i = 0; i < compact.length; i += 1) {
      var ch = compact.charAt(i);
      if (!seen[ch]) {
        seen[ch] = true;
        kinds += 1;
        if (kinds > 8) break;
      }
    }
    if (kinds < 8) return false;
    var spaces = 0;
    for (var j = 0; j < s.length; j += 1) if (s.charAt(j) === " ") spaces += 1;
    return spaces * 12 < s.length;
  }

  function pushText(out, s) {
    if (typeof s !== "string") return;
    var t = s.trim();
    if (!t || isOpaque(t)) return;
    out.push(t);
  }

  /* Allowlist of model-facing text. Metadata, ids, and asset pointers
     are never walked. */
  function textsFromContent(content) {
    var out = [];
    if (typeof content === "string") {
      pushText(out, content);
      return out;
    }
    if (!content || typeof content !== "object") return out;
    var type = String(content.content_type || "");
    if (typeof content.text === "string") pushText(out, content.text);
    if (typeof content.result === "string") pushText(out, content.result);
    if (type === "reasoning_recap" && typeof content.content === "string") pushText(out, content.content);
    if ((type === "thoughts" || type === "reasoning_recap" || type === "tether_browsing_display") && typeof content.summary === "string") {
      pushText(out, content.summary);
    }
    var raw = content.parts;
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i += 1) {
        var part = raw[i];
        if (typeof part === "string") pushText(out, part);
        else if (part && typeof part === "object" && typeof part.text === "string" && !part.asset_pointer) pushText(out, part.text);
      }
    }
    var thoughts = content.thoughts;
    if (Array.isArray(thoughts)) {
      for (var t = 0; t < thoughts.length; t += 1) {
        var thought = thoughts[t];
        if (!thought || typeof thought !== "object") continue;
        if (typeof thought.summary === "string") pushText(out, thought.summary);
        if (typeof thought.content === "string") pushText(out, thought.content);
      }
    }
    return out;
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

  function contentType(msg) {
    var content = msg && msg.content;
    if (!content || typeof content !== "object") return "";
    return String(content.content_type || "");
  }

  function categoryOf(msg) {
    var role = (msg.author && msg.author.role) || "";
    var type = contentType(msg);
    if (type === "thoughts" || type === "reasoning_recap" || type === "reasoning") return "reasoning";
    if (role === "tool") return "tool";
    if (role === "assistant" && !isShownRole(msg) && (type === "code" || type === "execution_output")) return "tool";
    if (role === "user") return "user";
    if (role === "assistant") return "assistant";
    return "other";
  }

  function absorbMessage(msg, buckets) {
    if (!msg) return;
    var texts = textsFromContent(msg.content);
    if (!texts.length) return;
    buckets[categoryOf(msg)].push(texts.join("\n"));
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
    var bits = textsFromContent(node.content);
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
  function emptyBuckets() {
    return { user: [], assistant: [], tool: [], reasoning: [], other: [] };
  }

  function tally(buckets) {
    function n(key) { return estimateTokens(buckets[key].join("\n")); }
    var categories = {
      user: n("user"),
      assistant: n("assistant"),
      tool: n("tool"),
      reasoning: n("reasoning"),
      other: n("other")
    };
    return {
      categories: categories,
      visibleTokens: categories.user + categories.assistant,
      hiddenTokens: categories.tool + categories.reasoning + categories.other
    };
  }

  function countConversation(data) {
    var buckets = emptyBuckets();
    var model = "";
    if (data && data.mapping && !(data.messages && data.messages.length)) {
      var keys = Object.keys(data.mapping);
      for (var i = 0; i < keys.length; i += 1) {
        var node = data.mapping[keys[i]];
        absorbMessage(node && node.message, buckets);
      }
      model = modelFromConversation(data);
    } else {
      var list = dedupeMessages([data && data.messages]);
      for (var j = 0; j < list.length; j += 1) absorbMessage(list[j], buckets);
      model = modelFromMessages({ messages: list, default_model_slug: data && data.default_model_slug, model: data && data.model });
    }
    var totals = tally(buckets);
    totals.model = model;
    return totals;
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
    GPT6_LIMIT: GPT6_LIMIT,
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
