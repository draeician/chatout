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
  if (!/^(chatgpt|claude|gemini|grok)-[\p{L}\p{N}_-]+-\d{8}-\d{6}\.zip$/u.test(result.filename)) throw new Error("zip name " + result.filename);
  if (result.savedAs !== "chatout-archives/" + result.filename) throw new Error("savedAs " + result.savedAs);
  const worker = await serviceWorker(context);
  const saved = await waitForDownload(worker, result.downloadId);
  return { result: result, file: saved.filename, names: unzipNames(saved.filename) };
}

async function runScope(page, context, scope) {
  await page.evaluate(function (scope) {
    document.documentElement.setAttribute("data-chatout-archive-delay", "0");
    document.documentElement.removeAttribute("data-chatout-archive-result");
    document.documentElement.setAttribute("data-chatout-command", "archive-everything:" + scope);
    document.dispatchEvent(new Event("chatout-command"));
  }, scope);
  const handle = await page.waitForFunction(function () {
    return document.documentElement.getAttribute("data-chatout-archive-result");
  }, null, { timeout: 30000 });
  const result = JSON.parse(await handle.jsonValue());
  if (!result.ok) throw new Error((result.error || "archive failed") + "\n" + page.__logs.join("\n"));
  const re = new RegExp("^(chatgpt|claude|gemini|grok)-" + scope + "-\\d{8}-\\d{6}\\.zip$");
  if (!re.test(result.filename)) throw new Error("zip name " + JSON.stringify(result));
  if (result.savedAs !== "chatout-archives/" + result.filename) throw new Error("savedAs " + result.savedAs);
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

check("chatgpt archive everything dedupes", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const saved = await runScope(page, context, "everything");
  const names = saved.names;
  if (!names.includes("_index.md") || !names.includes("my_research/_index.md") || !names.includes("no-project/_index.md")) throw new Error(names.join(", "));
  const packing = names.filter(function (n) { return n.includes("11111111"); });
  if (packing.length !== 1 || !packing[0].startsWith("my_research/")) throw new Error("dedupe " + names.join(", "));
  if (!names.some(function (n) { return n.startsWith("no-project/") && n.includes("loose_chat"); })) throw new Error("loose " + names.join(", "));
  const top = unzipRead(saved.file, "_index.md");
  if (!top.includes("my_research/") || !top.includes("no-project/")) throw new Error(top);
  await page.close();
});

check("chatgpt projects only and chats only", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const p = await runScope(page, context, "projects");
  if (p.names.some(function (n) { return n.startsWith("no-project/"); }) || !p.names.includes("my_research/_index.md")) throw new Error(p.names.join(", "));
  const c = await runScope(page, context, "chats");
  if (c.names.some(function (n) { return n.startsWith("my_research/"); })) throw new Error(c.names.join(", "));
  if (c.names.filter(function (n) { return n.startsWith("no-project/") && !n.endsWith("_index.md"); }).length !== 1) throw new Error("chats " + c.names.join(", "));
  await page.close();
});

check("claude archive everything dedupes", async function (context) {
  const page = await openFixture(context, "https://claude.ai/chat/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const saved = await runScope(page, context, "everything");
  const deploy = saved.names.filter(function (n) { return n.includes("11111111"); });
  if (deploy.length !== 1 || !deploy[0].startsWith("ops_notes/")) throw new Error(saved.names.join(", "));
  if (!saved.names.some(function (n) { return n.startsWith("no-project/") && n.includes("solo"); })) throw new Error(saved.names.join(", "));
  await page.close();
});

check("popup checkbox runs once and unchecks itself", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  await page.evaluate(function () { document.documentElement.setAttribute("data-chatout-archive-delay", "0"); });
  const worker = await serviceWorker(context);
  const tabId = await worker.evaluate(function () {
    return new Promise(function (resolve) { chrome.tabs.query({ url: "https://chatgpt.com/c/*" }, function (t) { resolve(t[t.length - 1].id); }); });
  });
  const extId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto("chrome-extension://" + extId + "/popup.html?tabId=" + tabId);
  const box = popup.getByRole("checkbox", { name: "Archive everything" });
  const others = [popup.getByRole("checkbox", { name: "Archive projects only" }), popup.getByRole("checkbox", { name: "Archive chats only" })];
  for (const b of [box].concat(others)) if (await b.isChecked()) throw new Error("default should be off");
  await box.check();
  const dialog = popup.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  if (!/Archive everything on ChatGPT\? This downloads every chat and project and can be large\./.test(await dialog.innerText())) throw new Error("confirm text");
  await dialog.getByRole("button", { name: "Archive" }).click();
  await popup.waitForFunction(function () { return document.querySelector("#chatout-archive-all").getAttribute("data-running") === "everything"; }, null, { timeout: 5000 }).catch(function () {});
  await popup.waitForFunction(function () { return /Exported/.test(document.querySelector("#chatout-archive-all").getAttribute("data-last") || ""); }, null, { timeout: 30000 });
  if (await box.isChecked()) throw new Error("box stayed checked");
  for (const b of [box].concat(others)) if (await b.isDisabled()) throw new Error("box stayed disabled");
  const last = await popup.locator("#chatout-archive-all").getAttribute("data-last");
  if (!/chatout-archives\/chatgpt-everything-/.test(last)) throw new Error(last);
  await popup.reload();
  if (await popup.getByRole("checkbox", { name: "Archive everything" }).isChecked()) throw new Error("re-run on reopen");
  await popup.close();
  await page.close();
});

check("grok project archive", async function (context) {
  const page = await openFixture(context, "https://grok.com/project/ws-fixture");
  const saved = await archiveProject(page, context);
  if (saved.result.exported !== 1 || saved.result.failed !== 0) throw new Error("summary " + JSON.stringify(saved.result));
  if (!/^grok-grok-lab-\d{8}-\d{6}\.zip$/.test(saved.result.filename)) throw new Error(saved.result.filename);
  const f = saved.names.find(function (n) { return n.startsWith("grok_lab/") && n.includes("lab_chat"); });
  if (!f) throw new Error(saved.names.join(", "));
  const body = unzipRead(saved.file, f);
  if (body.indexOf("Lab question") < 0 || body.indexOf("Lab question") > body.indexOf("Lab answer")) throw new Error(body);
  await page.close();
});

check("grok archive everything dedupes and reports failures", async function (context) {
  const page = await openFixture(context, "https://grok.com/");
  const saved = await runScope(page, context, "everything");
  const k1 = saved.names.filter(function (n) { return n.includes("lab_chat"); });
  if (k1.length !== 1 || !k1[0].startsWith("grok_lab/")) throw new Error(saved.names.join(", "));
  if (!saved.names.some(function (n) { return n.startsWith("no-project/") && n.includes("loose_grok"); })) throw new Error(saved.names.join(", "));
  if (saved.result.failed !== 1) throw new Error("failed " + saved.result.failed);
  const c = await runScope(page, context, "chats");
  if (c.names.some(function (n) { return n.startsWith("grok_lab/"); })) throw new Error(c.names.join(", "));
  await page.close();
});

async function openPopup(context, page) {
  const worker = await serviceWorker(context);
  const url = page.url();
  const tabId = await worker.evaluate(function (url) {
    return new Promise(function (resolve) { chrome.tabs.query({}, function (t) { resolve(t.filter(function (x) { return x.url === url; }).pop().id); }); });
  }, url);
  const popup = await context.newPage();
  await popup.goto("chrome-extension://" + new URL(worker.url()).host + "/popup.html?tabId=" + tabId);
  return popup;
}

check("popup archive everything: declining the confirm starts nothing", async function (context) {
  const page = await openFixture(context, "https://claude.ai/chat/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  await page.evaluate(function () { document.documentElement.removeAttribute("data-chatout-archive-result"); document.documentElement.removeAttribute("data-chatout-archive-progress"); });
  const popup = await openPopup(context, page);
  const box = popup.getByRole("checkbox", { name: "Archive everything" });
  await box.check();
  const dialog = popup.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  if (!/on Claude\?/.test(await dialog.innerText())) throw new Error(await dialog.innerText());
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await popup.waitForFunction(function () { return !document.querySelector("#chatout-archive-all input").checked; }, null, { timeout: 5000 });
  await popup.waitForTimeout(800);
  const started = await page.evaluate(function () { return document.documentElement.getAttribute("data-chatout-archive-progress") || document.documentElement.getAttribute("data-chatout-archive-result"); });
  if (started) throw new Error("archive started after decline: " + started);
  for (const name of ["Archive everything", "Archive projects only", "Archive chats only"]) {
    if (await popup.getByRole("checkbox", { name: name }).isDisabled()) throw new Error(name + " disabled");
  }
  await popup.close();
  await page.close();
});

check("popup cancel stops a running archive and saves nothing", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  await page.evaluate(function () { document.documentElement.setAttribute("data-chatout-archive-delay", "700"); });
  const worker = await serviceWorker(context);
  const before = await worker.evaluate(function () { return new Promise(function (r) { chrome.downloads.search({}, function (i) { r(i.length); }); }); });
  const popup = await openPopup(context, page);
  const cancel = popup.locator("#chatout-archive-all-cancel");
  if (await cancel.isVisible()) throw new Error("cancel visible while idle");
  await popup.getByRole("checkbox", { name: "Archive chats only" }).check();
  await cancel.waitFor({ state: "visible", timeout: 5000 });
  if (!(await popup.getByRole("checkbox", { name: "Archive everything" }).isDisabled())) throw new Error("others not disabled");
  await cancel.click();
  await popup.waitForFunction(function () { return document.querySelector("#chatout-archive-all").getAttribute("data-last"); }, null, { timeout: 15000 });
  const lastText = await popup.locator("#chatout-archive-all").getAttribute("data-last");
  if (lastText !== "Archive cancelled") throw new Error("status: " + lastText);
  if (await popup.getByRole("checkbox", { name: "Archive chats only" }).isChecked()) throw new Error("box stayed checked");
  if (await popup.getByRole("checkbox", { name: "Archive everything" }).isDisabled()) throw new Error("others stayed disabled");
  if (await cancel.isVisible()) throw new Error("cancel still visible");
  await page.waitForTimeout(1500);
  const after = await worker.evaluate(function () { return new Promise(function (r) { chrome.downloads.search({}, function (i) { r(i.length); }); }); });
  if (after !== before) throw new Error("a file was saved after cancel");
  await popup.close();
  await page.close();
});

check("on-page cancel stops a project archive", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/g/g-p-fixture/project");
  await page.evaluate(function () { document.documentElement.setAttribute("data-chatout-archive-delay", "700"); document.documentElement.removeAttribute("data-chatout-archive-result"); });
  await page.getByRole("button", { name: "Archive project" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  const handle = await page.waitForFunction(function () { return document.documentElement.getAttribute("data-chatout-archive-result"); }, null, { timeout: 15000 });
  const result = JSON.parse(await handle.jsonValue());
  if (!result.cancelled) throw new Error(JSON.stringify(result));
  await page.close();
});

async function setIncludeFiles(context, page, on) {
  const popup = await openPopup(context, page);
  await popup.waitForSelector("#chatout-archive-all[data-files-ready='1']", { timeout: 5000 });
  const toggle = popup.getByRole("checkbox", { name: "Include images and attachments" });
  if ((await toggle.isChecked()) !== on) {
    await toggle.click();
    await popup.waitForSelector("#chatout-archive-all[data-files-saved='" + on + "']", { timeout: 5000 });
  }
  await popup.reload();
  await popup.waitForSelector("#chatout-archive-all[data-files-ready='1']", { timeout: 5000 });
  if ((await popup.getByRole("checkbox", { name: "Include images and attachments" }).isChecked()) !== on) throw new Error("toggle not saved");
  await popup.close();
}

check("include images and attachments: on saves files and rewrites links, off unchanged", async function (context) {
  const page = await openFixture(context, "https://chatgpt.com/g/g-p-fixture/project");
  const popupDefault = await openPopup(context, page);
  await popupDefault.waitForSelector("#chatout-archive-all[data-files-ready='1']", { timeout: 5000 });
  if (await popupDefault.getByRole("checkbox", { name: "Include images and attachments" }).isChecked()) throw new Error("default should be off");
  await popupDefault.close();
  await setIncludeFiles(context, page, true);
  const on = await archiveProject(page, context);
  const img = "my_research/2024-05-06_packing_list_11111111_files/photo.png";
  if (!on.names.includes(img)) throw new Error("missing " + img + " in " + on.names.join(", "));
  const md = unzipRead(on.file, "my_research/2024-05-06_packing_list_11111111.md");
  if (!md.includes("(2024-05-06_packing_list_11111111_files/photo.png)")) throw new Error("link not rewritten\n" + md);
  if (md.includes("file-service://")) throw new Error("remote pointer left\n" + md);
  if (!md.includes("notes.pdf (not saved")) throw new Error("failed file not noted\n" + md);
  const index = unzipRead(on.file, "my_research/_index.md");
  if (!index.includes("## Files not saved") || !index.includes("notes.pdf")) throw new Error(index);
  if (on.result.exported !== 3) throw new Error("archive should not fail on a file: " + JSON.stringify(on.result));

  const cpage = await openFixture(context, "https://claude.ai/chat/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const c = await runScope(cpage, context, "everything");
  if (!c.names.some(function (n) { return /^ops_notes\/.*_files\/diagram\.png$/.test(n); })) throw new Error(c.names.join(", "));
  const pasted = c.names.find(function (n) { return /_files\/pasted\.txt$/.test(n); });
  if (!pasted || unzipRead(c.file, pasted).trim() !== "pasted log line") throw new Error("pasted text " + c.names.join(", "));
  await cpage.close();

  await setIncludeFiles(context, page, false);
  const off = await archiveProject(page, context);
  if (off.names.some(function (n) { return n.includes("_files/"); })) throw new Error("files saved while off: " + off.names.join(", "));
  const md2 = unzipRead(off.file, "my_research/2024-05-06_packing_list_11111111.md");
  if (md2.includes("## Attachments")) throw new Error("attachments section while off");
  await page.close();
});

check("gemini archive everything lists chats with MaZiqc", async function (context) {
  const page = await openFixture(context, "https://gemini.google.com/app");
  const saved = await runScope(page, context, "everything");
  if (saved.result.exported !== 2 || saved.result.failed !== 1) throw new Error(JSON.stringify(saved.result));
  if (!saved.names.some(function (n) { return n.startsWith("no-project/") && n.includes("packing_list"); })) throw new Error(saved.names.join(", "));
  if (!saved.names.some(function (n) { return n.startsWith("no-project/") && n.includes("flights"); })) throw new Error(saved.names.join(", "));
  await page.close();
});

check("gemini falls back to a sidebar without links", async function (context) {
  const page = await openFixture(context, "https://gemini.google.com/u/1/app");
  const saved = await runScope(page, context, "chats");
  const mds = saved.names.filter(function (n) { return n.startsWith("no-project/") && !n.endsWith("_index.md"); });
  if (mds.length !== 2) throw new Error(saved.names.join(", ") + " " + JSON.stringify(saved.result));
  const top = unzipRead(saved.file, "_index.md");
  if (!top.includes("read from the sidebar")) throw new Error(top);
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
