/* Headless ChatOut checks: load the extension, open fixture pages, and
   confirm single-chat export plus project archives. No login, no network. */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installFixtures, CLAUDE_PROJECT } from "./mock-site.mjs";
import { closeExtension, launchExtension, serviceWorker, waitForDownload } from "./launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extensionPath = root;

function unzipRead(file, name) {
  return execFileSync("python3", [
    "-c",
    "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())",
    file,
    name
  ], { encoding: "utf8" });
}

function unzipNames(file) {
  const out = execFileSync("python3", [
    "-c",
    "import zipfile,sys; print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))",
    file
  ], { encoding: "utf8" });
  return out.trim().split("\n").filter(Boolean);
}

async function openFixture(context, url) {
  const page = await context.newPage();
  const logs = [];
  page.on("console", function (msg) { logs.push(msg.type() + " " + msg.text()); });
  page.on("pageerror", function (err) { logs.push("pageerror " + err.message); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("html[data-chatout-ready='1']", { timeout: 20000 });
  page.__logs = logs;
  return page;
}

async function exportMarkdown(page) {
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.evaluate(function () {
    document.documentElement.setAttribute("data-chatout-export-result", "");
    document.documentElement.setAttribute("data-chatout-command", "export-markdown");
    document.dispatchEvent(new Event("chatout-command"));
  });
  const status = await page.waitForFunction(function () {
    const value = document.documentElement.getAttribute("data-chatout-export-result");
    return value ? value : null;
  }, null, { timeout: 30000 }).then(function (handle) { return handle.jsonValue(); });
  if (!String(status).startsWith("ok")) throw new Error("single-chat export failed: " + status + "\n" + page.__logs.join("\n"));
  const download = await downloadPromise;
  const file = await download.path();
  return {
    filename: download.suggestedFilename(),
    body: readFileSync(file, "utf8")
  };
}

async function archiveProject(page, context) {
  await page.evaluate(function () {
    document.documentElement.setAttribute("data-chatout-archive-delay", "0");
    document.documentElement.removeAttribute("data-chatout-archive-result");
  });
  await page.getByRole("button", { name: "Archive project" }).click();
  await page.waitForFunction(function () {
    return document.documentElement.getAttribute("data-chatout-archive-result");
  }, null, { timeout: 30000 });
  const result = JSON.parse(await page.evaluate(function () {
    return document.documentElement.getAttribute("data-chatout-archive-result");
  }));
  if (!result.ok) throw new Error((result.error || "archive failed") + "\n" + page.__logs.join("\n"));
  if (result.downloadId == null) throw new Error("archive did not use chrome.downloads\n" + JSON.stringify(result));
  const worker = await serviceWorker(context);
  const saved = await waitForDownload(worker, result.downloadId);
  return { result: result, file: saved.filename, names: unzipNames(saved.filename) };
}

const tests = [];
function check(name, fn) { tests.push({ name: name, fn: fn }); }

check("chatgpt single-chat export", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const saved = await exportMarkdown(page);
  if (!/^chatgpt_hello_world_.*\.md$/.test(saved.filename)) throw new Error("unexpected filename " + saved.filename);
  if (!saved.body.includes("What is 2+2?")) throw new Error("missing user text");
  if (!saved.body.includes("It is 4.")) throw new Error("missing reply");
  if (!saved.body.includes("You asked:")) throw new Error("missing exporter heading");
  await page.close();
});

check("chatgpt project chat export", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/g/g-p-fixture/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const saved = await exportMarkdown(page);
  if (!/^chatgpt_hello_world_.*\.md$/.test(saved.filename)) throw new Error("unexpected filename " + saved.filename);
  if (!saved.body.includes("What is 2+2?")) throw new Error("missing user text");
  if (!saved.body.includes("It is 4.")) throw new Error("missing reply");
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(saved.body)) throw new Error("export file contains CJK: " + saved.body.slice(0, 200));
  await page.close();
});

check("claude single-chat export", async function (context) {
  const page = await openFixture(context, "https://claude.ai/chat/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const saved = await exportMarkdown(page);
  if (!/^claude_moon_notes_.*\.md$/.test(saved.filename)) throw new Error("unexpected filename " + saved.filename);
  if (!saved.body.includes("How many moons?")) throw new Error("missing prompt");
  if (!saved.body.includes("One moon.")) throw new Error("missing reply");
  if (!saved.body.includes("You asked:")) throw new Error("missing exporter heading");
  await page.close();
});

check("chatgpt project archive", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/g/g-p-fixture/project");
  const saved = await archiveProject(page, context);
  if (saved.result.exported !== 3 || saved.result.failed !== 1) {
    throw new Error("unexpected summary " + JSON.stringify(saved.result));
  }
  const names = saved.names;
  const packing = "my_research/2024-05-06_packing_list_11111111.md";
  const slash = "my_research/2024-05-07_hello_world_22222222.md";
  const dup = "my_research/2024-05-08_packing_list_33333333.md";
  for (const expected of [packing, slash, dup, "my_research/_index.md"]) {
    if (!names.includes(expected)) throw new Error("missing " + expected + " in " + names.join(", "));
  }
  if (names.some(function (name) { return name.includes("..") || name.includes("broken"); })) {
    throw new Error("unsafe or failed chat was written: " + names.join(", "));
  }
  const body = unzipRead(saved.file, packing);
  if (!body.includes("Bring a raincoat")) throw new Error("chatgpt body missing message");
  if (!body.includes("You asked:")) throw new Error("chatgpt body missing exporter heading");
  const index = unzipRead(saved.file, "my_research/_index.md");
  if (!index.includes("Exported: 3") || !index.includes("Failed: 1") || !index.includes("Broken chat")) {
    throw new Error("index missing summary\n" + index);
  }
  const progress = await page.locator("#chatout-archive-status").innerText();
  if (!/Exported 3, failed 1/.test(progress)) throw new Error("progress text: " + progress);
  await page.close();
});

check("chatgpt project archive falls back to the page", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/g/g-p-domonly/project");
  const saved = await archiveProject(page, context);
  if (saved.result.exported !== 1 || saved.result.failed !== 0) {
    throw new Error("unexpected summary " + JSON.stringify(saved.result));
  }
  const fileName = saved.names.find(function (name) { return name.endsWith(".md") && !name.endsWith("_index.md"); });
  if (fileName !== "dom_only/from_the_page_55555555.md") throw new Error("path " + fileName);
  const body = unzipRead(saved.file, fileName);
  if (!body.includes("Loaded from the page link")) throw new Error("dom fallback body missing");
  await page.close();
});

check("claude project archive", async function (context) {
  const page = await openFixture(context, "https://claude.ai/project/" + CLAUDE_PROJECT);
  const saved = await archiveProject(page, context);
  if (saved.result.exported !== 2 || saved.result.failed !== 1) {
    throw new Error("unexpected summary " + JSON.stringify(saved.result));
  }
  const deploy = "ops_notes/2024-06-01_deploy_11111111.md";
  if (!saved.names.includes(deploy)) throw new Error("missing deploy file " + saved.names.join(", "));
  const body = unzipRead(saved.file, deploy);
  if (!body.includes("Restart the worker?")) throw new Error("claude body missing");
  if (!body.includes("You asked:")) throw new Error("claude body missing exporter heading");
  const index = unzipRead(saved.file, "ops_notes/_index.md");
  if (!index.includes("Failed: 1") || !index.includes("Broken")) throw new Error(index);
  await page.close();
});

check("gemini notebook archive", async function (context) {
  const page = await openFixture(context, "https://gemini.google.com/notebook/nb-fixture");
  const saved = await archiveProject(page, context);
  if (saved.result.exported !== 2 || saved.result.failed !== 1) {
    throw new Error("unexpected summary " + JSON.stringify(saved.result) + "\n" + page.__logs.join("\n"));
  }
  const packing = saved.names.find(function (name) { return name.includes("packing_list_alpha"); });
  if (!packing || !packing.startsWith("trip_notebook/")) throw new Error("paths " + saved.names.join(", "));
  const body = unzipRead(saved.file, packing);
  if (!body.includes("# You Asked:") || !body.includes("Pack socks")) throw new Error(body);
  const index = unzipRead(saved.file, "trip_notebook/_index.md");
  if (!index.includes("Hotels")) throw new Error(index);
  await page.close();
});

async function main() {
  const built = spawnSync(process.execPath, ["scripts/build-extension.mjs"], { cwd: root, stdio: "inherit" });
  if (built.status !== 0) process.exit(built.status || 1);

  const session = await launchExtension({ extensionPath: extensionPath });
  await session.context.addCookies([{
    name: "lastActiveOrg",
    value: "org-fixture",
    domain: "claude.ai",
    path: "/",
    secure: true,
    sameSite: "Lax"
  }]);
  await installFixtures(session.context);
  let failed = 0;
  try {
    for (const item of tests) {
      try {
        await item.fn(session.context);
        console.log("PASS " + item.name);
      } catch (error) {
        failed += 1;
        console.log("FAIL " + item.name);
        console.log(error && error.stack ? error.stack : error);
      }
    }
  } finally {
    await closeExtension(session);
  }
  console.log((tests.length - failed) + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
