/* Archive one real project with a Chrome profile that is already logged in.
   Close any Chrome that has that profile open first. Chat text stays in the
   local zip; this script only drives the extension. */
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeExtension, launchExtension, serviceWorker, waitForDownload } from "./launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

async function main() {
  const profile = arg("--profile", "");
  const url = arg("--url", "");
  const outDir = arg("--out", "");
  const delay = arg("--delay", "400");
  if (!profile || !url || !outDir) {
    console.error("Usage: node tests/browser/live-archive.mjs --profile DIR --url PROJECT_URL --out DIR [--delay 400]");
    process.exit(2);
  }
  await mkdir(outDir, { recursive: true });
  const session = await launchExtension({
    extensionPath: root,
    userDataDir: path.resolve(profile)
  });
  try {
    const page = await session.context.newPage();
    page.on("console", function (msg) { console.log("page " + msg.type() + " " + msg.text()); });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("html[data-chatout-ready='1']", { timeout: 30000 });
    await page.evaluate(function (ms) {
      document.documentElement.setAttribute("data-chatout-archive-delay", String(ms));
    }, delay);
    const button = page.getByRole("button", { name: "Archive project" });
    if (await button.count() === 0) {
      throw new Error("No Archive project button. Open a ChatGPT project, Claude project, or Gemini notebook URL.");
    }
    await button.click();
    await page.waitForFunction(function () {
      return document.documentElement.getAttribute("data-chatout-archive-result");
    }, null, { timeout: 30 * 60 * 1000 });
    const result = JSON.parse(await page.evaluate(function () {
      return document.documentElement.getAttribute("data-chatout-archive-result");
    }));
    console.log(JSON.stringify({
      ok: result.ok,
      exported: result.exported,
      failed: result.failed,
      project: result.project,
      error: result.error || null,
      failures: result.failures || []
    }, null, 2));
    if (!result.ok) process.exit(1);
    if (result.downloadId == null) throw new Error("download id missing");
    const worker = await serviceWorker(session.context);
    const saved = await waitForDownload(worker, result.downloadId);
    const dest = path.join(path.resolve(outDir), path.basename(saved.filename));
    await copyFile(saved.filename, dest);
    console.log("Saved " + dest);
    console.log("Exported " + result.exported + ", failed " + result.failed + ".");
  } finally {
    await closeExtension(session);
  }
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
