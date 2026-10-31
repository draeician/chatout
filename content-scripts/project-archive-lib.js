/* ChatOut project-archive helpers.
   Loaded as a classic content script. No network, no third-party code.
   A stored (uncompressed) zip keeps the extension free of a zip library
   and is easy to open with any unzip tool. */
(function (root) {
  "use strict";

  function sanitizeSegment(raw, fallback) {
    const fb = fallback || "untitled";
    let s = String(raw == null ? "" : raw).normalize("NFKC");
    s = s.replace(/[\u0000-\u001f\u007f]/g, " ");
    s = s.replace(/[\\/:*?"<>|]/g, " ");
    s = s.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^[._]+|[._]+$/g, "");
    s = s.replace(/[^\p{L}\p{N}_-]/gu, "");
    s = s.toLowerCase();
    if (!s) s = fb;
    if (s.length > 60) s = s.slice(0, 60).replace(/_+$/g, "") || fb;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) s = "_" + s;
    if (s === "." || s === "..") s = fb;
    return s;
  }

  function idSuffix(id) {
    const raw = String(id == null ? "" : id).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (!raw) return "chat";
    return raw.slice(-8);
  }

  function toDate(value) {
    if (value == null || value === "") return null;
    let d;
    if (value instanceof Date) d = value;
    else if (typeof value === "number") d = new Date(value < 1e12 ? value * 1000 : value);
    else {
      const s = String(value).trim();
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        d = new Date(n < 1e12 ? n * 1000 : n);
      } else d = new Date(s);
    }
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDay(value) {
    const d = toDate(value);
    if (!d) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function buildChatPaths(projectName, chats, ext) {
    const folder = sanitizeSegment(projectName, "project");
    const extension = ext || "md";
    const used = new Set();
    return (chats || []).map(function (chat) {
      const day = formatDay(chat && chat.updated);
      const title = sanitizeSegment(chat && chat.title, "chat");
      const suffix = idSuffix(chat && chat.id);
      const stem = [day, title, suffix].filter(Boolean).join("_") || "chat";
      let rel = folder + "/" + stem + "." + extension;
      let n = 2;
      while (used.has(rel.toLowerCase())) {
        rel = folder + "/" + stem + "_" + n + "." + extension;
        n += 1;
      }
      used.add(rel.toLowerCase());
      return rel;
    });
  }

  function detectProjectUrl(href) {
    let url;
    try {
      url = new URL(String(href || ""));
    } catch (e) {
      return null;
    }
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname || "/";
    if (host === "chatgpt.com" || host === "chat.openai.com") {
      const m = path.match(/\/g\/(g-p-[A-Za-z0-9_-]+)/);
      if (!m) return null;
      return { provider: "chatgpt", id: m[1] };
    }
    if (host === "claude.ai") {
      const m = path.match(/\/project\/([0-9a-zA-Z_-]+)/);
      if (!m) return null;
      return { provider: "claude", id: m[1] };
    }
    if (host === "gemini.google.com") {
      const m = path.match(/\/(?:u\/\d+\/)?(?:app\/)?notebooks?\/([^/]+)/);
      if (!m) return null;
      return { provider: "gemini", id: decodeURIComponent(m[1]) };
    }
    return null;
  }

  async function collectPages(fetchPage, maxPages) {
    const limit = maxPages || 200;
    const items = [];
    const seen = new Set();
    const seenCursors = new Set();
    let cursor = null;
    let note = "";
    let truncated = false;
    for (let page = 0; page < limit; page += 1) {
      const key = cursor == null ? "__start__" : String(cursor);
      if (seenCursors.has(key)) break;
      seenCursors.add(key);
      let result;
      try {
        result = await fetchPage(cursor);
      } catch (e) {
        note = (e && e.message) || String(e);
        break;
      }
      const batch = (result && result.items) || [];
      for (let i = 0; i < batch.length; i += 1) {
        const item = batch[i];
        if (!item || item.id == null || item.id === "") continue;
        const id = String(item.id);
        if (seen.has(id)) continue;
        seen.add(id);
        items.push(item);
      }
      const next = result ? result.nextCursor : null;
      if (next == null || next === "" || String(next) === String(cursor)) break;
      cursor = next;
      if (page === limit - 1) {
        truncated = true;
        note = note || "Listing stopped at the page cap.";
      }
    }
    return { items: items, note: note, truncated: truncated };
  }

  function sleep(ms) {
    const n = Number(ms) || 0;
    if (n <= 0) return Promise.resolve();
    return new Promise(function (resolve) {
      setTimeout(resolve, n);
    });
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const d = date || new Date();
    const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
    const year = Math.max(d.getFullYear(), 1980);
    const datePart = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
    return { time: time, date: datePart };
  }

  function buildStoredZip(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const list = files || [];
    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      const name = String(file.name || "").replace(/\\/g, "/");
      if (!name || name.startsWith("/") || name.split("/").some(function (part) { return part === "" || part === "." || part === ".."; })) {
        throw new Error("Unsafe zip path: " + name);
      }
      const nameBytes = encoder.encode(name);
      const data = typeof file.data === "string" || file.data == null
        ? encoder.encode(file.text != null ? String(file.text) : (file.data == null ? "" : String(file.data)))
        : file.data;
      const crc = crc32(data);
      const stamp = dosDateTime(new Date());
      const local = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, stamp.time, true);
      view.setUint16(12, stamp.date, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, stamp.time, true);
      cv.setUint16(14, stamp.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      locals.push(local, data);
      centrals.push(central);
      offset += local.length + data.length;
    }
    let centralSize = 0;
    for (let i = 0; i < centrals.length; i += 1) centralSize += centrals[i].length;
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, list.length, true);
    ev.setUint16(10, list.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    const parts = locals.concat(centrals, [eocd]);
    let total = 0;
    for (let i = 0; i < parts.length; i += 1) total += parts[i].length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (let i = 0; i < parts.length; i += 1) {
      out.set(parts[i], pos);
      pos += parts[i].length;
    }
    return out;
  }

  function formatStamp(value) {
    const d = value == null || value === "" ? new Date() : toDate(value);
    if (!d) return "";
    return d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) + "-" +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds());
  }

  function zipDownloadName(projectName, when) {
    const stamp = formatStamp(when) || "export";
    return "chatout_" + sanitizeSegment(projectName, "project") + "_" + stamp + ".zip";
  }

  const api = {
    sanitizeSegment: sanitizeSegment,
    idSuffix: idSuffix,
    formatDay: formatDay,
    buildChatPaths: buildChatPaths,
    detectProjectUrl: detectProjectUrl,
    collectPages: collectPages,
    sleep: sleep,
    crc32: crc32,
    buildStoredZip: buildStoredZip,
    zipDownloadName: zipDownloadName
  };
  root.__CHATOUT_ARCHIVE_LIB__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
