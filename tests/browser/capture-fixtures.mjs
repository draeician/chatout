/* Save a redacted snapshot of a logged-in project page and the JSON
   responses the page loads, so an agent can refresh fixtures after a DOM
   or endpoint change. Output stays under the chosen directory. Review it
   before copying anything into tests/browser/fixtures/. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeExtension, launchExtension } from "./launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = /token|authorization|cookie|password|email|secret/i;

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET.test(key) ? "[redacted]" : redact(item);
    }
    return out;
  }
  return value;
}

async function main() {
  const profile = arg("--profile", "");
  const url = arg("--url", "");
  const outDir = path.resolve(arg("--out", "tests/browser/fixtures/captured"));
  if (!profile || !url) {
    console.error("Usage: node tests/browser/capture-fixtures.mjs --profile DIR --url PROJECT_URL [--out DIR]");
    process.exit(2);
  }
  await mkdir(outDir, { recursive: true });
  const captured = [];
  const session = await launchExtension({
    extensionPath: root,
    userDataDir: path.resolve(profile)
  });
  try {
    const page = await session.context.newPage();
    page.on("response", async function (response) {
      const responseUrl = response.url();
      if (!/backend-api|\/api\/organizations|batchexecute|\/api\/auth\/session/.test(responseUrl)) return;
      let body = "";
      try { body = await response.text(); } catch (e) { body = ""; }
      if (body.length > 2000000) body = body.slice(0, 2000000);
      let parsed = null;
      try { parsed = redact(JSON.parse(body)); } catch (e) { parsed = null; }
      captured.push({
        url: responseUrl.split("?")[0],
        status: response.status(),
        json: parsed,
        text: parsed ? null : body.slice(0, 4000)
      });
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.evaluate(function () {
      document.querySelectorAll("main, body").forEach(function (root) {
        root.querySelectorAll("*").forEach(function (el) {
          if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight;
        });
      });
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(2000);
    const html = await page.content();
    await writeFile(path.join(outDir, "page.html"), html);
    await writeFile(path.join(outDir, "network.json"), JSON.stringify(captured, null, 2));
    await writeFile(path.join(outDir, "README.txt"), [
      "Local capture. Do not commit this folder.",
      "page.html is the project page after a scroll.",
      "network.json is redacted response bodies for the logged-in endpoints.",
      "Copy only the selectors and JSON shapes you need into tests/browser/fixtures/ and tests/browser/mock-site.mjs.",
      "Replace real titles and message text with short fake strings.",
      ""
    ].join("\n"));
    console.log("Wrote " + captured.length + " responses to " + outDir);
  } finally {
    await closeExtension(session);
  }
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
