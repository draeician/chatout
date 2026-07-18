# Standard Operating Procedure — Develop & Build

Commands and steps for developing and building this Chrome extension. See [.cursorrules](../.cursorrules) for strict workflow rules and [build_extension.sh](../build_extension.sh) for the build script.

---

## Quick reference (commands)

| Action | Command / step |
|--------|-----------------|
| **Build** (after editing split files) | `./build_extension.sh` |
| **Reload extension** | Chrome → `chrome://extensions` → Reload on this extension’s card |
| **First-time load** | Load unpacked extension once; no separate dev server or install step |

---

## Development workflow

1. **Source of truth:** Edit only files under `content-scripts/split/`.
2. **Artifact:** Do not edit `content-scripts/content.js`; it is overwritten by the build.
3. After any change under `content-scripts/split/`, run the build, then reload the extension in Chrome.

---

## Build process

- **Script:** [build_extension.sh](../build_extension.sh) (run from repo root).
- **What it does:**
  1. Concatenates `content-scripts/split/*.js` (in glob order) into `content-scripts/content.js`.
  2. If `manifest.json` content_scripts point at the split files, rewrites them to use `content-scripts/content.js` only.

Run from repo root:

```bash
./build_extension.sh
```

---

## File layout (split sources)

| File(s) | Role |
|---------|------|
| `00_loader_preamble.js` | Initialization; runs first. |
| `01_vendor_react.js`, `02_vendor_lib_2.js` … `15_vendor_lib_15.js` | Third-party / vendor code; edit only when debugging vendor issues. |
| App logic | Lives in the appropriate split file; see [.cursorrules](../.cursorrules) for where to make changes. |

Order is determined by filename (glob sort), so numbering controls load order.

---

## Reference

- **Workflow rules:** [.cursorrules](../.cursorrules)
- **Build script:** [build_extension.sh](../build_extension.sh)
