/**
 * Grok title / filename debugger (dismissible overlay).
 *
 * Enable:  localStorage.setItem("aiExporterGrokTitleDebug", "1"); location.reload();
 * Disable: localStorage.removeItem("aiExporterGrokTitleDebug"); location.reload();
 * Optional default search text (saved): localStorage.setItem("aiExporterGrokTitleDebugSearch", "Your chat title");
 */
(function () {
  const FLAG = "aiExporterGrokTitleDebug";
  const SEARCH_KEY = "aiExporterGrokTitleDebugSearch";

  function flagOn() {
    try {
      return localStorage.getItem(FLAG) === "1";
    } catch (e) {
      return false;
    }
  }

  if (!flagOn()) return;

  const SELECTORS_TO_TRY = [
    { name: "sidebar_chat_links", sel: '[data-sidebar] a[href*="/c/"]' },
    { name: "sidebar_nav_menu_buttons", sel: '[data-sidebar="menu"] a[data-sidebar="menu-button"]' },
    { name: "any_data_sidebar_links", sel: "[data-sidebar] a[href]" },
    { name: "aside_anchors", sel: "aside a[href]" },
    { name: "nav_anchors", sel: "nav a[href]" },
    { name: "role_nav_links", sel: '[role="navigation"] a[href]' },
    { name: "chat_path_links", sel: 'a[href*="/c/"]' },
    { name: "aria_current", sel: 'a[aria-current="page"], [aria-current="page"]' },
  ];

  function safePathname(href) {
    if (!href) return "";
    try {
      return new URL(href, window.location.origin).pathname;
    } catch (e) {
      return "";
    }
  }

  function collectSelectorDiagnostics() {
    const pathname = new URL(window.location.href).pathname;
    const rows = [];
    for (const { name, sel } of SELECTORS_TO_TRY) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(sel));
      } catch (e) {
        rows.push({ name, sel, error: String(e.message || e) });
        continue;
      }
      const sample = nodes.slice(0, 25).map((el) => ({
        tag: el.tagName,
        href: el.getAttribute("href"),
        hrefPath: safePathname(el.getAttribute("href")),
        matchesPath: safePathname(el.getAttribute("href")) === pathname,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
        dataAttrs: [...el.attributes]
          .filter((a) => a.name.startsWith("data-"))
          .slice(0, 12)
          .map((a) => `${a.name}="${String(a.value).slice(0, 80)}"`),
      }));
      rows.push({ name, sel, count: nodes.length, sample });
    }
    return {
      pathname,
      pathnameSegments: pathname.split("/").filter(Boolean),
      documentTitle: document.title,
      rows,
    };
  }

  function findElementsContainingText(query, maxResults) {
    const q = (query || "").trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    const out = [];
    const seen = new Set();
    const candidates = document.querySelectorAll(
      "a, button, span, li, h1, h2, h3, h4, p, div[role], [data-testid], [data-sidebar]"
    );
    for (const el of candidates) {
      if (out.length >= (maxResults || 40)) break;
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
      const t = (el.textContent || "").trim().replace(/\s+/g, " ");
      if (t.length > 400 || t.length < q.length) continue;
      if (!t.toLowerCase().includes(ql)) continue;
      const key = el.tagName + (el.getAttribute("href") || "") + t.slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        tag: el.tagName,
        id: el.id || "",
        className: typeof el.className === "string" ? el.className.slice(0, 200) : "",
        href: el.getAttribute("href"),
        hrefPath: safePathname(el.getAttribute("href")),
        text: t.slice(0, 220),
      });
    }
    return out;
  }

  function buildPanel() {
    const root = document.createElement("div");
    root.id = "ai-exporter-grok-title-debug";
    root.setAttribute("data-ai-exporter-debug", "1");
    root.style.cssText = [
      "position:fixed",
      "bottom:12px",
      "right:12px",
      "z-index:2147483646",
      "max-width:min(520px,94vw)",
      "max-height:78vh",
      "overflow:auto",
      "background:#141414",
      "color:#eaeaea",
      "font:12px/1.45 system-ui,Segoe UI,sans-serif",
      "border:1px solid #3a3a3a",
      "border-radius:10px",
      "box-shadow:0 10px 40px rgba(0,0,0,.55)",
      "padding:12px 12px 10px",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "ChatOut — Grok title debug";
    title.style.cssText = "font-weight:600;font-size:13px;margin-bottom:8px;color:#fff;";
    root.appendChild(title);

    const help = document.createElement("div");
    help.style.cssText = "opacity:.85;margin-bottom:10px;font-size:11px;";
    help.innerHTML =
      "Disable: <code style=\"background:#222;padding:2px 4px;border-radius:4px;\">localStorage.removeItem('" +
      FLAG +
      "')</code> then reload. This panel only loads when the flag is on.";
    root.appendChild(help);

    const out = document.createElement("pre");
    out.style.cssText =
      "white-space:pre-wrap;word-break:break-word;background:#0b0b0b;border:1px solid #2a2a2a;border-radius:6px;padding:8px;margin:8px 0;max-height:36vh;overflow:auto;font-size:11px;";
    root.appendChild(out);

    const label = document.createElement("label");
    label.textContent = "Search page for title substring (case-insensitive)";
    label.style.cssText = "display:block;margin-top:8px;font-size:11px;";
    root.appendChild(label);

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = 'e.g. "Homepage Starter Dashboard Configuration"';
    search.style.cssText =
      "width:100%;box-sizing:border-box;margin:4px 0 8px;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#0b0b0b;color:#eee;font-size:12px;";
    try {
      const saved = localStorage.getItem(SEARCH_KEY);
      if (saved) search.value = saved;
    } catch (e) {}
    root.appendChild(search);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;";

    function btn(label, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "cursor:pointer;padding:6px 10px;border-radius:6px;border:1px solid #555;background:#222;color:#eee;font-size:11px;";
      b.addEventListener("click", onClick);
      return b;
    }

    function render() {
      const api = window.__AI_EXPORTER_DEBUG__;
      const diag = collectSelectorDiagnostics();
      let resolved = "(extension API not ready yet — click Refresh)";
      let provider = "";
      if (api && typeof api.getChatGroupTitle === "function") {
        try {
          resolved = api.getChatGroupTitle();
        } catch (e) {
          resolved = "getChatGroupTitle error: " + (e && e.message);
        }
      }
      if (api && typeof api.getProvider === "function") {
        try {
          provider = api.getProvider();
        } catch (e) {
          provider = String(e && e.message);
        }
      }

      const searchHits = findElementsContainingText(search.value.trim(), 35);

      const payload = {
        provider,
        getChatGroupTitle_result: resolved,
        location: window.location.href,
        ...diag,
        titleSearch_query: search.value.trim() || null,
        titleSearch_hits: searchHits,
      };

      out.textContent = JSON.stringify(payload, null, 2);
      return payload;
    }

    btnRow.appendChild(
      btn("Refresh", function () {
        render();
      })
    );
    btnRow.appendChild(
      btn("Copy JSON", function () {
        const p = render();
        const t = JSON.stringify(p, null, 2);
        navigator.clipboard.writeText(t).catch(() => {
          prompt("Copy diagnostics:", t);
        });
      })
    );
    btnRow.appendChild(
      btn("Save search text", function () {
        try {
          localStorage.setItem(SEARCH_KEY, search.value);
        } catch (e) {}
        render();
      })
    );
    btnRow.appendChild(
      btn("Run search now", function () {
        render();
      })
    );
    root.appendChild(btnRow);

    const close = btn("Close panel", function () {
      root.remove();
    });
    close.style.borderColor = "#7a3030";
    root.appendChild(close);

    const disable = btn("Disable debug & reload", function () {
      try {
        localStorage.removeItem(FLAG);
        localStorage.removeItem(SEARCH_KEY);
      } catch (e) {}
      location.reload();
    });
    disable.style.borderColor = "#555";
    disable.style.marginTop = "6px";
    root.appendChild(disable);

    search.addEventListener("input", function () {
      render();
    });

    document.documentElement.appendChild(root);

    let tries = 0;
    const poll = setInterval(function () {
      tries++;
      render();
      if (window.__AI_EXPORTER_DEBUG__ && tries > 3) clearInterval(poll);
      if (tries > 80) clearInterval(poll);
    }, 400);

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel, { once: true });
  } else {
    buildPanel();
  }
})();
