/* ChatOut popup: project archive plus three one-shot archive checkboxes for
   the current site. A project action is shown only while the active tab is on
   a supported project page. Checking a box starts that archive in the active
   tab right away; the box unchecks itself when the run finishes or fails.
   Nothing is saved, so reopening the popup never starts a run. */
(function () {
  const api = globalThis.chrome || globalThis.browser;
  if (!api || !api.tabs) return;
  const MODES = [
    { scope: "everything", label: "Archive everything", hint: "All projects plus chats outside projects" },
    { scope: "projects", label: "Archive projects only", hint: "Every project, one folder each" },
    { scope: "chats", label: "Archive chats only", hint: "Chats not in any project, into no-project/" }
  ];
  const PROVIDERS = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", grok: "Grok" };
  let timer = null;
  let tabId = null;
  let active = "";
  let project = null;
  let lastResultKey = "";

  const box = document.createElement("div");
  box.id = "chatout-archive-all";
  box.style.cssText = "padding:10px 12px;border-top:1px solid #e5e7eb;font:13px/1.4 system-ui,sans-serif;color:#111827;background:#fff";
  box.innerHTML =
    "<div id='chatout-archive-project' hidden style='padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid #e5e7eb'>" +
    "<div style='font-weight:600;margin-bottom:4px'>Archive project</div>" +
    "<div id='chatout-archive-project-name' style='color:#6b7280;margin-bottom:6px'></div>" +
    "<div style='display:flex;gap:6px;align-items:center'>" +
    "<button type='button' id='chatout-archive-project-start'>Archive project</button>" +
    "<button type='button' id='chatout-archive-project-cancel' hidden>Cancel</button></div>" +
    "<div id='chatout-archive-project-status' role='status' aria-live='polite' style='margin-top:4px;color:#374151'></div>" +
    "</div>" +
    "<div style='font-weight:600;margin-bottom:4px'>Archive this site</div>" +
    MODES.map(function (m) {
      return "<label style='display:flex;gap:6px;align-items:flex-start;margin:3px 0;cursor:pointer' title='" + m.hint + "'>" +
        "<input type='checkbox' data-scope='" + m.scope + "' aria-label='" + m.label + "'> <span>" + m.label +
        "<br><small style='color:#6b7280'>" + m.hint + "</small></span></label>";
    }).join("") +
    "<label style='display:flex;gap:6px;align-items:center;margin:6px 0 2px;cursor:pointer' title='Saved; applies to every archive'>" +
    "<input type='checkbox' id='chatout-include-files' aria-label='Include images and attachments'> <span>Include images and attachments</span></label>" +
    "<button type='button' id='chatout-archive-all-cancel' hidden style='margin-top:6px'>Cancel</button>" +
    "<div id='chatout-archive-all-confirm' role='dialog' aria-modal='true' aria-labelledby='chatout-archive-all-confirm-text' hidden style='margin-top:6px;padding:8px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb'>" +
    "<div id='chatout-archive-all-confirm-text'></div>" +
    "<div style='display:flex;gap:6px;justify-content:flex-end;margin-top:6px'>" +
    "<button type='button' id='chatout-archive-all-no'>Cancel</button><button type='button' id='chatout-archive-all-yes'>Archive</button></div></div>" +
    "<div id='chatout-archive-all-status' role='status' aria-live='polite' style='margin-top:4px;color:#374151'></div>";
  const statusEl = box.querySelector("#chatout-archive-all-status");
  const projectSection = box.querySelector("#chatout-archive-project");
  const projectNameEl = box.querySelector("#chatout-archive-project-name");
  const projectStart = box.querySelector("#chatout-archive-project-start");
  const projectCancel = box.querySelector("#chatout-archive-project-cancel");
  const projectStatusEl = box.querySelector("#chatout-archive-project-status");
  const inputs = Array.prototype.slice.call(box.querySelectorAll("input[type=checkbox][data-scope]"));
  const filesToggle = box.querySelector("#chatout-include-files");
  if (api.storage && api.storage.local) {
    api.storage.local.get("chatoutIncludeFiles", function (v) { filesToggle.checked = !!(v && v.chatoutIncludeFiles); box.setAttribute("data-files-ready", "1"); });
    filesToggle.addEventListener("change", function () {
      api.storage.local.set({ chatoutIncludeFiles: filesToggle.checked }, function () { box.setAttribute("data-files-saved", String(filesToggle.checked)); });
    });
  }
  const cancelBtn = box.querySelector("#chatout-archive-all-cancel");
  const confirmEl = box.querySelector("#chatout-archive-all-confirm");
  const confirmText = box.querySelector("#chatout-archive-all-confirm-text");
  const SITES = { "chatgpt.com": "ChatGPT", "chat.openai.com": "ChatGPT", "claude.ai": "Claude", "gemini.google.com": "Gemini", "grok.com": "Grok" };

  async function siteName(id) {
    try {
      const tab = await new Promise(function (resolve) { api.tabs.get(id, resolve); });
      const host = new URL(tab.url).hostname.replace(/^www\./, "");
      return SITES[host] || host;
    } catch (e) { return "this site"; }
  }

  function askConfirm(site) {
    return new Promise(function (resolve) {
      confirmText.textContent = "Archive everything on " + site + "? This downloads every chat and project and can be large.";
      confirmEl.hidden = false;
      const yes = box.querySelector("#chatout-archive-all-yes");
      const no = box.querySelector("#chatout-archive-all-no");
      function done(answer) {
        confirmEl.hidden = true;
        yes.removeEventListener("click", onYes);
        no.removeEventListener("click", onNo);
        resolve(answer);
      }
      function onYes() { done(true); }
      function onNo() { done(false); }
      yes.addEventListener("click", onYes);
      no.addEventListener("click", onNo);
      no.focus();
    });
  }

  function setStatus(text) { statusEl.textContent = text || ""; }
  function setProjectStatus(text) { projectStatusEl.textContent = text || ""; }
  function setProject(next) {
    project = next && next.provider ? next : null;
    projectSection.hidden = !project;
    projectNameEl.textContent = project ? (PROVIDERS[project.provider] || project.provider) + " project detected" : "";
  }

  function lockScopes(scope) {
    active = scope || "";
    inputs.forEach(function (input) {
      input.checked = !!scope && input.dataset.scope === scope;
      input.disabled = !!scope;
    });
    box.setAttribute("data-running", scope || "");
    const siteRun = !!scope && scope !== "project";
    cancelBtn.hidden = !siteRun;
    cancelBtn.disabled = !siteRun;
  }

  function lockProject(disabled, running) {
    projectStart.disabled = !!disabled;
    projectStart.textContent = running ? "Archiving…" : "Archive project";
    projectCancel.hidden = !running;
    projectCancel.disabled = !running;
  }

  function unlock() {
    lockScopes("");
    lockProject(false, false);
  }

  async function targetTab() {
    const forced = new URLSearchParams(location.search).get("tabId");
    if (forced) return Number(forced);
    const tabs = await new Promise(function (resolve) { api.tabs.query({ active: true, currentWindow: true }, resolve); });
    return tabs && tabs[0] ? tabs[0].id : null;
  }

  function send(id, msg) {
    return new Promise(function (resolve) {
      try {
        api.tabs.sendMessage(id, msg, function (resp) {
          const err = api.runtime.lastError;
          resolve(err ? { error: "Open ChatGPT, Claude, Gemini, or Grok in this tab first." } : (resp || {}));
        });
      } catch (e) { resolve({ error: String((e && e.message) || e) }); }
    });
  }

  function resultText(r) {
    if (r.cancelled) return "Archive cancelled";
    if (!r.ok) return "Failed: " + (r.error || "unknown error");
    if (r.empty) return "No chats found." + (r.notes && r.notes.length ? " " + r.notes.join(" ") : "");
    return "Exported " + r.exported + ", failed " + r.failed + ". Saved " + (r.savedAs || r.filename) + "." +
      (r.notes && r.notes.length ? " " + r.notes.join(" ") : "");
  }

  function showResult(r) {
    const text = resultText(r);
    if (r.mode === "project") setProjectStatus(text);
    else { setStatus(text); box.setAttribute("data-last", text); }
  }

  async function poll() {
    if (tabId == null) return;
    const s = await send(tabId, { type: "chatout-archive-status" });
    if (s.error) return;
    setProject(s.project);
    if (s.running) {
      if (s.mode === "project") {
        lockScopes("project");
        lockProject(true, true);
        setProjectStatus(s.progress);
      } else {
        lockScopes(s.mode || "running");
        lockProject(true, false);
        setStatus(s.progress);
      }
      return;
    }
    if (active) unlock();
    else lockProject(false, false);
    if (!s.result) return;
    const key = JSON.stringify(s.result);
    if (key === lastResultKey) return;
    lastResultKey = key;
    showResult(s.result);
  }

  function startPoll() {
    if (timer) clearInterval(timer);
    timer = setInterval(poll, 700);
    poll();
  }

  inputs.forEach(function (input) {
    input.addEventListener("change", async function () {
      if (!input.checked || active) return;
      const scope = input.dataset.scope;
      lockScopes(scope);
      lockProject(true, false);
      if (tabId == null) { unlock(); setStatus("No active tab."); return; }
      if (scope === "everything") {
        setStatus("");
        const ok = await askConfirm(await siteName(tabId));
        if (!ok) {
          unlock();
          setStatus("Nothing archived.");
          box.setAttribute("data-last", "Nothing archived.");
          return;
        }
      }
      lockScopes(scope);
      lockProject(true, false);
      setStatus("Starting…");
      lastResultKey = "";
      const resp = await send(tabId, { type: "chatout-archive-everything", scope: scope });
      if (resp.error || !resp.started) {
        unlock();
        setStatus(resp.error || "Could not start.");
        box.setAttribute("data-last", resp.error || "Could not start.");
        return;
      }
      startPoll();
    });
  });

  projectStart.addEventListener("click", async function () {
    if (active || !project || tabId == null) return;
    lockScopes("project");
    lockProject(true, true);
    setProjectStatus("Starting…");
    lastResultKey = "";
    const resp = await send(tabId, { type: "chatout-archive-project" });
    if (resp.error || !resp.started) {
      unlock();
      setProjectStatus(resp.error || "Could not start.");
      return;
    }
    startPoll();
  });

  projectCancel.addEventListener("click", async function () {
    if (tabId == null) return;
    projectCancel.disabled = true;
    setProjectStatus("Cancelling…");
    await send(tabId, { type: "chatout-archive-cancel" });
  });

  cancelBtn.addEventListener("click", async function () {
    if (tabId == null) return;
    cancelBtn.disabled = true;
    setStatus("Cancelling…");
    await send(tabId, { type: "chatout-archive-cancel" });
  });

  async function init() {
    document.body.appendChild(box);
    tabId = await targetTab();
    if (tabId == null) return;
    const s = await send(tabId, { type: "chatout-archive-status" });
    if (!s.error) {
      setProject(s.project);
      if (s.result) {
        lastResultKey = JSON.stringify(s.result);
        showResult(s.result);
      }
    }
    startPoll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
