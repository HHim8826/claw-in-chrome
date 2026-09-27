const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createChromeMock, flushMicrotasks, runScriptInSandbox } = require("../helpers/chrome-test-utils");
const { FakeDocument, FakeElement, FakeMutationObserver } = require("../helpers/fake-dom");

const repoRoot = path.join(__dirname, "..", "..");
const optionsPath = path.join(repoRoot, "src", "options", "browser-tools-options.js");

function createHarness(options = {}) {
  const chromeMock = createChromeMock({ storageState: options.storageState || {} });
  const document = new FakeDocument({ readyState: "complete" });
  document.documentElement.lang = options.locale || "en-US";
  const mountAnchor = document.createElement("div");
  mountAnchor.id = "cp-options-debug-anchor";
  document.body.appendChild(mountAnchor);
  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    navigator: { language: options.locale || "en-US" },
    window: {
      location: { hash: options.hash ?? "#options" },
      addEventListener() {},
    },
  };
  sandbox.globalThis = sandbox;
  runScriptInSandbox(optionsPath, sandbox);
  return { chromeMock, document, sandbox };
}

function checkbox(document) {
  return document.getElementById("cp-browser-batch-enabled");
}

async function testDefaultsToEnabledAndPersistsChanges() {
  const harness = createHarness();
  await flushMicrotasks();
  const root = harness.document.getElementById("cp-browser-tools-root");
  assert.ok(root, "the browser tools card renders on the options route");
  assert.equal(root.textContent.includes("Batch browser actions"), true);
  assert.equal(checkbox(harness.document).checked, true, "batching defaults to enabled");

  checkbox(harness.document).dispatchEvent({ type: "change", target: { checked: false } });
  await flushMicrotasks();
  const stored = await harness.chromeMock.chrome.storage.local.get("browserBatchEnabled");
  assert.equal(stored.browserBatchEnabled, false);
  assert.equal(checkbox(harness.document).checked, false);
}

async function testReflectsStoredValueAndLocale() {
  const harness = createHarness({ storageState: { browserBatchEnabled: false }, locale: "zh-TW" });
  await flushMicrotasks();
  assert.equal(checkbox(harness.document).checked, false);
  assert.equal(harness.document.getElementById("cp-browser-tools-root").textContent.includes("批次執行瀏覽器操作"), true);
}

async function testHiddenOutsideOptionsRoute() {
  const harness = createHarness({ hash: "" });
  await flushMicrotasks();
  assert.equal(harness.document.getElementById("cp-browser-tools-root"), null);
}

function testPageLoadsTheModule() {
  const html = fs.readFileSync(path.join(repoRoot, "src", "options", "options.html"), "utf8");
  assert.equal(html.includes('<script src="/options/browser-tools-options.js"></script>'), true);
  const release = fs.readFileSync(path.join(repoRoot, ".github", "release-package-items.txt"), "utf8");
  assert.equal(release.includes("options/browser-tools-options.js"), true);
}

async function main() {
  await testDefaultsToEnabledAndPersistsChanges();
  await testReflectsStoredValueAndLocale();
  await testHiddenOutsideOptionsRoute();
  testPageLoadsTheModule();
  console.log("browser tools options tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
