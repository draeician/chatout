#!/usr/bin/env node
/**
 * Transform Chrome manifest.json → Firefox/LibreWolf MV3 manifest.
 * Reads JSON from stdin or path argv[2]; writes to stdout or argv[3].
 *
 * Changes:
 * - Remove Chrome Web Store update_url
 * - background.service_worker → background.scripts (Firefox event page)
 * - Drop Chrome-only permission declarativeNetRequestWithHostAccess
 * - Add browser_specific_settings.gecko id + min version
 */
import fs from "node:fs";

const GECKO_ID = "draeician+chatout@gmail.com";
const STRICT_MIN = "128.0";
const DROP_PERMS = new Set(["declarativeNetRequestWithHostAccess"]);

const inPath = process.argv[2];
const outPath = process.argv[3];
const raw = inPath ? fs.readFileSync(inPath, "utf8") : fs.readFileSync(0, "utf8");
const m = JSON.parse(raw);

delete m.update_url;

if (m.background && m.background.service_worker) {
  const sw = m.background.service_worker;
  m.background = { scripts: [sw] };
}

if (Array.isArray(m.permissions)) {
  m.permissions = m.permissions.filter((p) => !DROP_PERMS.has(p));
}

m.browser_specific_settings = {
  gecko: {
    id: GECKO_ID,
    strict_min_version: STRICT_MIN,
  },
};

const text = JSON.stringify(m, null, 2) + "\n";
if (outPath) fs.writeFileSync(outPath, text);
else process.stdout.write(text);
