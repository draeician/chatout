/* The project archive lives in the popup now. This test loads the content
   script with a tiny DOM stub and checks the contract the popup relies on:
   no page UI is created, status reports the detected project, and the project
   start/cancel messages work. Archive execution itself is covered by the
   headless browser suite. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const libCode = readFileSync(path.join(root, "src/content/project-archive-lib.js"), "utf8");
const contentCode = readFileSync(path.join(root, "src/content/project-archive.js"), "utf8");

function createHarness(href) {
  const attributes = new Map();
  const created = [];
  const listeners = [];
  let messageListener = null;

  const documentElement = {
    setAttribute: function (name, value) { attributes.set(name, String(value)); },
    getAttribute: function (name) { return attributes.has(name) ? attributes.get(name) : null; },
    removeAttribute: function (name) { attributes.delete(name); }
  };
  const document = {
    documentElement: documentElement,
    body: { appendChild: function () { throw new Error("content script appended page UI"); } },
    title: "",
    cookie: "",
    readyState: "complete",
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function (type, fn) { listeners.push({ type: type, fn: fn }); },
    createElement: function (tag) { created.push(tag); throw new Error("content script created page UI: " + tag); }
  };

  const sandbox = {
    console: console,
    document: document,
    location: {
      href: href,
      origin: new URL(href).origin,
      hostname: new URL(href).hostname,
      pathname: new URL(href).pathname
    },
    navigator: { language: "en-US" },
    localStorage: { getItem: function () { return null; } },
    fetch: function () { return new Promise(function () {}); },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    AbortController: AbortController,
    URL: URL,
    URLSearchParams: URLSearchParams,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    Uint8Array: Uint8Array,
    Uint32Array: Uint32Array,
    DataView: DataView,
    Date: Date,
    Set: Set,
    Map: Map,
    Promise: Promise,
    Math: Math,
    Number: Number,
    String: String,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Error: Error,
    RegExp: RegExp,
    btoa: btoa,
    atob: atob,
    chrome: {
      runtime: {
        onMessage: {
          addListener: function (fn) { messageListener = fn; }
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.top = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(libCode, sandbox);
  vm.runInContext(contentCode, sandbox);

  function message(msg) {
    return new Promise(function (resolve) {
      messageListener(msg, {}, resolve);
    });
  }

  return {
    attributes: attributes,
    created: created,
    listeners: listeners,
    sandbox: sandbox,
    message: message,
    setHref: function (next) {
      const url = new URL(next);
      sandbox.location.href = next;
      sandbox.location.origin = url.origin;
      sandbox.location.hostname = url.hostname;
      sandbox.location.pathname = url.pathname;
    }
  };
}

test("content script does not inject page UI", function () {
  const harness = createHarness("https://chatgpt.com/g/g-p-fixture/project");
  assert.deepEqual(harness.created, []);
  assert.equal(harness.attributes.get("data-chatout-ready"), "1");
  assert.equal(harness.listeners.filter(function (l) { return l.type === "chatout-command"; }).length, 1);
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("status reports a detected project and clears it on a normal chat", async function () {
  const harness = createHarness("https://chatgpt.com/g/g-p-fixture/project");
  const project = await harness.message({ type: "chatout-archive-status" });
  assert.equal(project.running, false);
  assert.equal(project.mode, "");
  assert.deepEqual(plain(project.project), { provider: "chatgpt", id: "g-p-fixture" });

  harness.setHref("https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const chat = await harness.message({ type: "chatout-archive-status" });
  assert.equal(chat.project, null);
});

test("project message refuses a non-project page", async function () {
  const harness = createHarness("https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  const response = await harness.message({ type: "chatout-archive-project" });
  assert.deepEqual(plain(response), { started: false, error: "Open a project or notebook page first." });
  const status = await harness.message({ type: "chatout-archive-status" });
  assert.equal(status.running, false);
});

test("project message starts the run and cancel reports it was running", async function () {
  const harness = createHarness("https://chatgpt.com/g/g-p-fixture/project");
  const started = await harness.message({ type: "chatout-archive-project" });
  assert.deepEqual(plain(started), { started: true });

  const status = await harness.message({ type: "chatout-archive-status" });
  assert.equal(status.running, true);
  assert.equal(status.mode, "project");
  assert.match(status.progress, /Listing chats/);

  const cancelled = await harness.message({ type: "chatout-archive-cancel" });
  assert.deepEqual(plain(cancelled), { cancelled: true });
});
