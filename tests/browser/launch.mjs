import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const extensionArgs = (extensionPath) => [
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
  "--headless=new",
  "--no-first-run",
  "--disable-default-apps",
  "--disable-popup-blocking"
];

/* headless:false plus --headless=new avoids Playwright's chrome-headless-shell,
   which cannot load extensions, while still running without a display. */
export async function launchExtension({ extensionPath, userDataDir, downloadsPath }) {
  const dir = userDataDir || await mkdtemp(path.join(os.tmpdir(), "chatout-profile-"));
  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    acceptDownloads: true,
    downloadsPath: downloadsPath || path.join(dir, "downloads"),
    viewport: { width: 1280, height: 800 },
    args: extensionArgs(extensionPath)
  });
  return { context, userDataDir: dir, ephemeral: !userDataDir };
}

export async function closeExtension(session) {
  if (!session) return;
  await session.context.close().catch(function () {});
  if (session.ephemeral) await rm(session.userDataDir, { recursive: true, force: true }).catch(function () {});
}

export async function serviceWorker(context) {
  const existing = context.serviceWorkers();
  if (existing.length) return existing[0];
  return context.waitForEvent("serviceworker", { timeout: 20000 });
}

export async function waitForDownload(worker, downloadId) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const item = await worker.evaluate(function (id) {
      return new Promise(function (resolve) {
        chrome.downloads.search({ id: id }, function (items) {
          const hit = items && items[0];
          resolve(hit ? { filename: hit.filename, state: hit.state, error: hit.error || null } : null);
        });
      });
    }, downloadId);
    if (item && item.state === "complete" && item.filename) return item;
    if (item && item.state === "interrupted") throw new Error("download interrupted: " + item.error);
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
  }
  throw new Error("download did not finish");
}
