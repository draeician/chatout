/* Options control for the ChatGPT context-gauge limit.
   Blank keeps the model table (fallback 200,000). A number replaces it. */
(function () {
  "use strict";
  var api = globalThis.chrome || globalThis.browser;
  var KEY = "chatoutContextLimit";
  var box = document.createElement("div");
  box.id = "chatout-context-limit";
  box.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:40;background:#fff;border-top:1px solid #e5e7eb;padding:10px 16px;font:13px/1.4 system-ui,sans-serif;color:#1f2937;box-shadow:0 -4px 16px rgba(0,0,0,.06)";
  box.innerHTML = "<label style='display:flex;flex-wrap:wrap;gap:8px;align-items:center'>" +
    "<span style='font-weight:600'>ChatGPT context limit</span>" +
    "<input id='chatout-context-limit-input' type='number' min='1000' max='2000000' step='1000' inputmode='numeric' placeholder='Automatic (200,000)' aria-label='ChatGPT context limit in tokens' style='width:11em;padding:4px 8px'>" +
    "<span>tokens</span></label>" +
    "<div style='color:#4b5563;margin-top:2px'>Blank uses the model table. The on-page gauge estimates the open ChatGPT conversation (~4 characters per token) and counts hidden tool results when the conversation JSON is available.</div>" +
    "<div id='chatout-context-limit-error' style='color:#b91c1c' hidden></div>";
  document.body.appendChild(box);
  var input = box.querySelector("#chatout-context-limit-input");
  var error = box.querySelector("#chatout-context-limit-error");

  function showError(text) {
    error.hidden = !text;
    error.textContent = text || "";
  }

  if (api && api.storage && api.storage.local) {
    api.storage.local.get(KEY, function (bag) {
      var n = bag && Number(bag[KEY]);
      if (Number.isFinite(n) && n >= 1000) {
        input.value = String(Math.round(n));
        box.setAttribute("data-saved", String(Math.round(n)));
      } else {
        box.setAttribute("data-saved", "");
      }
    });
  }

  function save() {
    var raw = input.value.trim();
    if (!raw) {
      showError("");
      box.setAttribute("data-saved", "");
      if (api && api.storage && api.storage.local) api.storage.local.remove(KEY);
      return;
    }
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 1000 || n > 2000000) {
      showError("Enter a number from 1,000 to 2,000,000, or leave blank.");
      return;
    }
    var rounded = Math.round(n);
    showError("");
    box.setAttribute("data-saved", String(rounded));
    if (api && api.storage && api.storage.local) {
      var payload = {};
      payload[KEY] = rounded;
      api.storage.local.set(payload);
    }
  }

  input.addEventListener("change", save);
  input.addEventListener("blur", save);
})();
