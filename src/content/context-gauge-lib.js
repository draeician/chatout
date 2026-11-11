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
   left to ask for a summary. GPT-6 uses 1,050,000 tokens. OpenAI's API
   docs for GPT-6 Astra, Sol, and Luna each list that context window and
   922,000 maximum input tokens (https://developers.openai.com/api/docs/models/gpt-6-astra
   and the matching Sol and Luna pages, checked 2026-11-11). chatgpt.com
   calls the family gpt-6-thinking, which is not that API id, so applying
   the published window to the slug is an assumption. When only on-screen
   text is available the ceiling is 40,000, so red starts at 32,000
   visible tokens, well before Chat B's 66k death. Tool messages also
   store browse pages, tether quotes, and connector file or search JSON
   that the model does not keep. Those are skipped. Any other tool body
   is counted once per message and capped. */
(function (root) {
  "use strict";

  var FALLBACK_LIMIT = 200000;
  var VISIBLE_ONLY_LIMIT = 40000;
  var RED_HINT = "Ask for a resume summary now.";
  var VISIBLE_CAVEAT = "visible text only, may under-read";

  /* See the header for the GPT-6 source. Unrecognized slugs still use
     FALLBACK_LIMIT, just above Chat A's observed wall. */
  var GPT6_LIMIT = 1050000;
  /* A tool body we cannot classify is not counted in full. 2,000 tokens
     is a cap, not a measurement of what the model kept. */
  var TOOL_MESSAGE_CAP_TOKENS = 2000;
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

  function toolUncertain(cats) {
    if (!cats) return false;
    return cats.tool > 5 * (cats.user + cats.assistant + cats.reasoning);
  }

  function usage(visibleTokens, hiddenTokens, limit, mode, limitInfo, categories, flags) {
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
    var uncertain = toolUncertain(cats);
    return {
      visibleTokens: visible,
      hiddenTokens: hidden,
      tokens: counted,
      limit: lim,
      percent: percent,
      label: uncertain ? "uncertain" : (percent > 100 ? "100%+" : "~" + Math.round(percent) + "%"),
      caveat: dom ? VISIBLE_CAVEAT : "",
      band: bandFor(percent),
      mode: dom ? "dom" : "json",
      limitSource: dom ? "visible" : (info.source || ""),
      limitModel: info.model || "",
      categories: cats,
      uncertain: uncertain,
      toolCapped: !!(flags && flags.toolCapped)
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

  /* The resume line is for a real high reading. It stays quiet when the
     total is mostly an "other" bucket, or when tool text is more than
     five times the conversation. */
  function adviceOk(u) {
    if (!u || u.band !== "red") return false;
    if (u.uncertain || toolUncertain(u.categories)) return false;
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
      if (u.toolCapped) parts.push("Tool output capped.");
      if (u.uncertain) parts.push("Tool text is more than 5 times the conversation, so this estimate is uncertain.");
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

  var CACHE_KEYS = {
    files: 1, file_contents: 1, file_content: 1, search_results: 1, search_result_groups: 1,
    organic_results: 1, organic: 1, citations: 1, content_references: 1, sources: 1, quotes: 1,
    versions: 1, assets: 1, hits: 1, blobs: 1, patches: 1, repositories: 1, tether: 1, tether_quotes: 1
  };

  function hasKey(keys, name) {
    for (var i = 0; i < keys.length; i += 1) if (keys[i] === name) return true;
    return false;
  }

  function stringMass(value, depth) {
    if (value == null || depth > 6) return 0;
    if (typeof value === "string") return value.length;
    var total = 0;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) total += stringMass(value[i], depth + 1);
      return total;
    }
    if (typeof value === "object") {
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k += 1) total += stringMass(value[keys[k]], depth + 1);
    }
    return total;
  }

  /* File bodies and search hits stored inside a tool JSON blob. */
  function cacheChars(value, depth) {
    if (value == null || depth > 6 || typeof value === "string") return 0;
    var total = 0;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) total += cacheChars(value[i], depth + 1);
      return total;
    }
    if (typeof value !== "object") return 0;
    var keys = Object.keys(value);
    if (hasKey(keys, "path") && (typeof value.content === "string" || typeof value.text === "string")) {
      total += stringMass(value.content, 0) + stringMass(value.text, 0);
    }
    if ((hasKey(keys, "url") || hasKey(keys, "link")) && (value.snippet || value.content || value.extract)) {
      total += stringMass(value.snippet, 0) + stringMass(value.content, 0) + stringMass(value.extract, 0);
    }
    for (var k = 0; k < keys.length; k += 1) {
      if (CACHE_KEYS[keys[k]]) total += stringMass(value[keys[k]], 0);
      else total += cacheChars(value[keys[k]], depth + 1);
    }
    return total;
  }

  function isStoredPayload(s) {
    if (!s || s.length < 1500) return false;
    var trimmed = s.trim();
    if (trimmed.charAt(0) !== "{" && trimmed.charAt(0) !== "[") return false;
    try { return cacheChars(JSON.parse(trimmed), 0) >= 1000; } catch (e) { return false; }
  }

  function isTether(type) {
    return type === "tether_browsing_display" || type === "tether_quote" || type === "tether_browsing_code";
  }

  function capText(text, cap) {
    if (estimateTokens(text) <= cap) return { text: text, capped: false };
    var end = Math.min(text.length, cap * 4);
    var slice = text.slice(0, end);
    while (estimateTokens(slice) > cap && end > 0) {
      end = Math.floor(end * 0.9);
      slice = text.slice(0, end);
    }
    return { text: slice, capped: true };
  }

  function classifyField(category, type, value, seen) {
    var trimmed = String(value || "").trim();
    if (!trimmed) return { counted: false, reason: "empty" };
    if (isOpaque(trimmed)) return { counted: false, reason: "opaque" };
    if (category === "tool" && isTether(type)) return { counted: false, reason: "tether-cache" };
    if (seen[trimmed]) return { counted: false, reason: "duplicate" };
    if (category === "tool" && isStoredPayload(trimmed)) {
      seen[trimmed] = true;
      return { counted: false, reason: "stored-payload" };
    }
    seen[trimmed] = true;
    return { counted: true, reason: "counted" };
  }

  function noteMeta(value, path, out, depth) {
    if (value == null || depth > 5 || out.length >= 30) return;
    if (typeof value === "string") {
      if (value.length >= 500) out.push({ path: path, chars: value.length, counted: false, reason: "metadata" });
      return;
    }
    if (Array.isArray(value)) {
      var n = Math.min(value.length, 20);
      for (var i = 0; i < n; i += 1) noteMeta(value[i], path + "[" + i + "]", out, depth + 1);
      return;
    }
    if (typeof value === "object") {
      var keys = Object.keys(value);
      var m = Math.min(keys.length, 30);
      for (var k = 0; k < m; k += 1) noteMeta(value[keys[k]], path + "." + keys[k], out, depth + 1);
    }
  }

  /* Content text the model may have been given. Tool caches are recorded
     and skipped. The same string in parts, text, and result counts once. */
  function inspectMessage(msg) {
    var category = categoryOf(msg || {});
    var type = contentType(msg);
    var content = msg && msg.content;
    var fields = [];
    var texts = [];
    var seen = {};
    function add(path, value) {
      if (typeof value !== "string") return;
      var decision = classifyField(category, type, value, seen);
      fields.push({ path: path, chars: value.length, counted: decision.counted, reason: decision.reason });
      if (decision.counted) texts.push(String(value).trim());
    }
    if (typeof content === "string") add("content", content);
    else if (content && typeof content === "object") {
      var parts = content.parts;
      if (Array.isArray(parts)) {
        for (var i = 0; i < parts.length; i += 1) {
          var part = parts[i];
          if (typeof part === "string") add("content.parts[" + i + "]", part);
          else if (part && typeof part === "object" && typeof part.text === "string" && !part.asset_pointer) add("content.parts[" + i + "].text", part.text);
        }
      }
      if (typeof content.text === "string") add("content.text", content.text);
      if (typeof content.result === "string") add("content.result", content.result);
      if (typeof content.summary === "string") add("content.summary", content.summary);
      if (type === "reasoning_recap" && typeof content.content === "string") add("content.content", content.content);
      var thoughts = content.thoughts;
      if (Array.isArray(thoughts)) {
        for (var t = 0; t < thoughts.length; t += 1) {
          var thought = thoughts[t];
          if (!thought || typeof thought !== "object") continue;
          if (typeof thought.summary === "string") add("content.thoughts[" + t + "].summary", thought.summary);
          if (typeof thought.content === "string") add("content.thoughts[" + t + "].content", thought.content);
        }
      }
    }
    if (msg && msg.metadata) noteMeta(msg.metadata, "metadata", fields, 0);
    var capped = false;
    if (category === "tool" && texts.length) {
      var limited = capText(texts.join("\n"), TOOL_MESSAGE_CAP_TOKENS);
      texts = limited.text ? [limited.text] : [];
      capped = limited.capped;
    }
    var author = (msg && msg.author) || {};
    return {
      category: category,
      fields: fields,
      texts: texts,
      capped: capped,
      role: String(author.role || ""),
      recipient: String((msg && msg.recipient) || ""),
      type: type,
      name: String(author.name || "").replace(/\s+/g, " ").slice(0, 40)
    };
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

  function absorbMessage(msg, buckets, state) {
    if (!msg) return;
    var info = inspectMessage(msg);
    if (info.capped && state) state.toolCapped = true;
    if (!info.texts.length) return;
    buckets[info.category].push(info.texts.join("\n"));
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
    var info = inspectMessage(node);
    if (!info.texts.length) return "";
    return "body:" + info.role + "\n" + info.texts.join("\n");
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

  function messageList(data) {
    if (data && data.mapping && !(data.messages && data.messages.length)) {
      var keys = Object.keys(data.mapping);
      var out = [];
      for (var i = 0; i < keys.length; i += 1) {
        var node = data.mapping[keys[i]];
        if (node && node.message) out.push(node.message);
      }
      return out;
    }
    return dedupeMessages([data && data.messages]);
  }

  function countConversation(data) {
    var buckets = emptyBuckets();
    var state = { toolCapped: false };
    var list = messageList(data);
    for (var i = 0; i < list.length; i += 1) absorbMessage(list[i], buckets, state);
    var model = (data && data.mapping && !(data.messages && data.messages.length))
      ? modelFromConversation(data)
      : modelFromMessages({ messages: list, default_model_slug: data && data.default_model_slug, model: data && data.model });
    var totals = tally(buckets);
    totals.model = model;
    totals.toolCapped = state.toolCapped;
    return totals;
  }

  function fieldLine(index, info, field) {
    var reason = field.reason && field.reason !== "counted" ? " reason=" + field.reason : "";
    return "#" + index + " role=" + (info.role || "-") + " type=" + (info.type || "-") + " " + field.path + " chars=" + field.chars + " counted=" + (field.counted ? "yes" : "no") + reason;
  }

  /* Pasteable field report. Lengths and paths only, never message text.
     On chatgpt.com the page console command is: await __chatoutContextDebug() */
  function debugConversation(data) {
    var list = messageList(data);
    var ranked = [];
    var body = ["per message:"];
    for (var i = 0; i < list.length; i += 1) {
      var info = inspectMessage(list[i]);
      var head = "#" + i + " role=" + (info.role || "-") + " recipient=" + (info.recipient || "-") + " type=" + (info.type || "-");
      if (info.name) head += " name=" + info.name;
      if (info.capped) head += " capped=yes";
      body.push(head);
      if (!info.fields.length) body.push("  (no string fields)");
      for (var f = 0; f < info.fields.length; f += 1) {
        var field = info.fields[f];
        var reason = field.reason && field.reason !== "counted" ? " reason=" + field.reason : "";
        body.push("  " + field.path + " chars=" + field.chars + " counted=" + (field.counted ? "yes" : "no") + reason);
        ranked.push({ chars: field.chars, line: fieldLine(i, info, field) });
      }
    }
    ranked.sort(function (a, b) { return b.chars - a.chars; });
    var top = ["top 20 fields by characters:"];
    var n = Math.min(20, ranked.length);
    for (var t = 0; t < n; t += 1) top.push((t + 1) + ". " + ranked[t].line);
    if (!n) top.push("(none)");
    return ["chatout context debug", "messages: " + list.length].concat(top).concat(body).join("\n");
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
    TOOL_MESSAGE_CAP_TOKENS: TOOL_MESSAGE_CAP_TOKENS,
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
    debugConversation: debugConversation,
    dedupeMessages: dedupeMessages,
    messageKey: messageKey,
    conversationIdFromPath: conversationIdFromPath,
    isChatGptHost: isChatGptHost
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
