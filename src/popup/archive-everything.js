/* ChatOut popup: three one-shot archive checkboxes for the current site.
   Checking a box starts that archive in the active tab right away; the box
   unchecks itself when the run finishes or fails. Nothing is saved, so
   reopening the popup never starts a run. */
(function () {
  const api = globalThis.chrome || globalThis.browser;
  if (!api || !api.tabs) return;
  const MODES = [
    { scope: "everything", label: "Archive everything", hint: "All projects plus chats outside projects" },
    { scope: "projects", label: "Archive projects only", hint: "Every project, one folder each" },
    { scope: "chats", label: "Archive chats only", hint: "Chats not in any project, into no-project/" }
  ];
  let timer = null;
  let active = "";

  const box = document.createElement("div");
  box.id = "chatout-archive-all";
  box.style.cssText = "padding:10px 12px;border-top:1px solid #e5e7eb;font:13px/1.4 system-ui,sans-serif;color:#111827;background:#fff";
  box.innerHTML = "<div style='font-weight:600;margin-bottom:4px'>Archive this site</div>" +
    MODES.map(function (m) {
      return "<label style='display:flex;gap:6px;align-items:flex-start;margin:3px 0;cursor:pointer' title='" + m.hint + "'>" +
        "<input type='checkbox' data-scope='" + m.scope + "' aria-label='" + m.label + "'> <span>" + m.label +
        "<br><small style='color:#6b7280'>" + m.hint + "</small></span></label>";
    }).join("") +
    "<div id='chatout-archive-all-status' role='status' aria-live='polite' style='margin-top:4px;color:#374151'></div>";
  const statusEl = box.querySelector("#chatout-archive-all-status");
  const inputs = Array.prototype.slice.call(box.querySelectorAll("input[type=checkbox]"));

  function setStatus(text) { statusEl.textContent = text || ""; }
  function lock(scope) {
    active = scope || "";
    inputs.forEach(function (input) {
      input.checked = !!scope && input.dataset.scope === scope;
      input.disabled = !!scope;
    });
    box.setAttribute("data-running", scope ? scope : "");
  }

  async function targetTab() {
    const forced = new URLSearchParams(location.search).get("tabId");
    if (forced) return Number(forced);
    const tabs = await new Promise(function (resolve) { api.tabs.query({ active: true, currentWindow: true }, resolve); });
    return tabs && tabs[0] ? tabs[0].id : null;
  }

  function send(tabId, msg) {
    return new Promise(function (resolve) {
      try {
        api.tabs.sendMessage(tabId, msg, function (resp) {
          const err = api.runtime.lastError;
          resolve(err ? { error: "Open ChatGPT, Claude, Gemini, or Grok in this tab first." } : (resp || {}));
        });
      } catch (e) { resolve({ error: String((e && e.message) || e) }); }
    });
  }

  function finish(text) {
    if (timer) clearInterval(timer);
    timer = null;
    lock("");
    setStatus(text);
    box.setAttribute("data-last", text || "");
  }

  function watch(tabId) {
    if (timer) clearInterval(timer);
    timer = setInterval(async function () {
      const s = await send(tabId, { type: "chatout-archive-status" });
      if (s.error) { finish(s.error); return; }
      if (s.running) { setStatus(s.progress); return; }
      const r = s.result;
      if (!r) return;
      if (!r.ok) finish("Failed: " + r.error);
      else if (r.empty) finish("No chats found." + (r.notes && r.notes.length ? " " + r.notes.join(" ") : ""));
      else finish("Exported " + r.exported + ", failed " + r.failed + ". Saved " + (r.savedAs || r.filename) + "." +
        (r.notes && r.notes.length ? " " + r.notes.join(" ") : ""));
    }, 700);
  }

  inputs.forEach(function (input) {
    input.addEventListener("change", async function () {
      if (!input.checked || active) return;
      const scope = input.dataset.scope;
      lock(scope);
      setStatus("Starting…");
      const tabId = await targetTab();
      if (tabId == null) { finish("No active tab."); return; }
      const resp = await send(tabId, { type: "chatout-archive-everything", scope: scope });
      if (resp.error || !resp.started) { finish(resp.error || "Could not start."); return; }
      watch(tabId);
    });
  });

  async function init() {
    document.body.appendChild(box);
    const tabId = await targetTab();
    if (tabId == null) return;
    const s = await send(tabId, { type: "chatout-archive-status" });
    if (s.running) { lock("everything"); setStatus(s.progress); inputs.forEach(function (i) { i.checked = false; }); watch(tabId); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
