const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createChromeMock, flushMicrotasks, runScriptInSandbox } = require("../helpers/chrome-test-utils");
const { FakeDocument, FakeElement, FakeMutationObserver } = require("../helpers/fake-dom");

const repoRoot = path.join(__dirname, "..", "..");
const optionsPath = path.join(repoRoot, "src", "options", "browser-tools-options.js");
const cardHelpersPath = path.join(repoRoot, "src", "options", "options-card-helpers.js");

const SWITCHES = [
  { id: "cp-browser-batch-enabled", key: "browserBatchEnabled", title: "Batch browser actions" },
  { id: "cp-browser-strip-interference", key: "cicStripExtensionInterference", title: "Recover from other extensions' page frames" },
  { id: "cp-browser-minimized-window-guard", key: "cicMinimizedWindowGuard", title: "Keep minimized windows in the background" },
];

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
  runScriptInSandbox(path.join(repoRoot, "src", "shared", "claw-contract.js"), sandbox);
  runScriptInSandbox(cardHelpersPath, sandbox);
  runScriptInSandbox(optionsPath, sandbox);
  return { chromeMock, document, sandbox };
}

function toggle(document, id) {
  return document.getElementById(id);
}

async function testRendersAsASettingsPanelWithSwitches() {
  const harness = createHarness();
  await flushMicrotasks();
  const root = harness.document.getElementById("cp-browser-tools-root");
  assert.ok(root, "the browser tools card renders on the options route");
  for (const token of ["cp-page-card", "cp-page-panel", "bg-bg-100", "border-border-300", "rounded-xl"]) {
    assert.equal(root.className.split(" ").includes(token), true, `the card uses the shared panel class ${token}`);
  }
  assert.equal(root.querySelector("h3").className, "cp-page-heading text-text-100 font-xl-bold");
  for (const entry of SWITCHES) {
    const button = toggle(harness.document, entry.id);
    assert.ok(button, `${entry.key} has a switch`);
    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.getAttribute("role"), "switch");
    assert.equal(button.className, "cp-page-toggle cp-update-enhancer-toggle");
    assert.equal(button.dataset.enabled, "true", `${entry.key} defaults to enabled`);
    assert.equal(button.getAttribute("aria-checked"), "true");
    assert.equal(root.textContent.includes(entry.title), true, `${entry.key} is labelled`);
  }
}

async function testSwitchesPersistEachSetting() {
  const harness = createHarness();
  await flushMicrotasks();
  for (const entry of SWITCHES) {
    toggle(harness.document, entry.id).click();
    await flushMicrotasks();
    const stored = await harness.chromeMock.chrome.storage.local.get(entry.key);
    assert.equal(stored[entry.key], false, `${entry.key} turns off`);
    assert.equal(toggle(harness.document, entry.id).dataset.enabled, "false");
  }
  toggle(harness.document, SWITCHES[0].id).click();
  await flushMicrotasks();
  const stored = await harness.chromeMock.chrome.storage.local.get(SWITCHES[0].key);
  assert.equal(stored[SWITCHES[0].key], true, "switching again turns the setting back on");
}

async function testReflectsStoredValuesAndLocale() {
  const harness = createHarness({
    storageState: { browserBatchEnabled: false, cicMinimizedWindowGuard: false },
    locale: "zh-TW",
  });
  await flushMicrotasks();
  assert.equal(toggle(harness.document, "cp-browser-batch-enabled").dataset.enabled, "false");
  assert.equal(toggle(harness.document, "cp-browser-strip-interference").dataset.enabled, "true");
  assert.equal(toggle(harness.document, "cp-browser-minimized-window-guard").dataset.enabled, "false");
  const text = harness.document.getElementById("cp-browser-tools-root").textContent;
  for (const label of ["批次執行瀏覽器操作", "排除其他擴充功能的干擾", "最小化視窗保持在背景"]) {
    assert.equal(text.includes(label), true, `zh-TW label ${label}`);
  }
}

async function testHiddenOutsideOptionsRoute() {
  const harness = createHarness({ hash: "" });
  await flushMicrotasks();
  assert.equal(harness.document.getElementById("cp-browser-tools-root"), null);
}

function testPageLoadsTheModule() {
  const html = fs.readFileSync(path.join(repoRoot, "src", "options", "options.html"), "utf8");
  assert.equal(html.includes('<script src="/options/browser-tools-options.js"></script>'), true);
  assert.ok(
    html.indexOf('<script src="/options/options-card-helpers.js"></script>') > -1 &&
      html.indexOf('<script src="/options/options-card-helpers.js"></script>') < html.indexOf('<script src="/options/browser-tools-options.js"></script>'),
    "the shared card helpers load before the option cards",
  );
  for (const modulePath of ["browser-tools-options.js", "data-insights-options.js", "site-blocklist-options.js"]) {
    const source = fs.readFileSync(path.join(repoRoot, "src", "options", modulePath), "utf8");
    assert.equal(source.includes("function localeKey()"), false, `${modulePath} uses the shared locale helper`);
    assert.equal(source.includes("new MutationObserver"), false, `${modulePath} uses the shared mount observer`);
  }
  const release = fs.readFileSync(path.join(repoRoot, ".github", "release-package-items.txt"), "utf8");
  assert.equal(release.includes("options/browser-tools-options.js"), true);
}

function testKillSwitchKeysMatchTheBundle() {
  const contract = fs.readFileSync(path.join(repoRoot, "src", "shared", "claw-contract.js"), "utf8");
  const bundle = fs.readFileSync(path.join(repoRoot, "src", "assets", "mcpPermissions-qqAoJjJ8.js"), "utf8");
  for (const key of ["cicStripExtensionInterference", "cicMinimizedWindowGuard"]) {
    assert.equal(contract.includes(`"${key}"`), true, `${key} is part of the shared contract`);
    assert.equal(bundle.includes(`const { ${key}: `), true, `the bundle reads ${key}`);
  }
  const backup = fs.readFileSync(path.join(repoRoot, "src", "shared", "settings-backup.js"), "utf8");
  for (const key of ["browserBatchEnabled", "cicStripExtensionInterference", "cicMinimizedWindowGuard", "userBlockedUrlPatterns"]) {
    assert.equal(backup.includes(`"${key}",`), true, `${key} is included in settings backups`);
  }
}

async function main() {
  await testRendersAsASettingsPanelWithSwitches();
  await testSwitchesPersistEachSetting();
  await testReflectsStoredValuesAndLocale();
  await testHiddenOutsideOptionsRoute();
  testPageLoadsTheModule();
  testKillSwitchKeysMatchTheBundle();
  console.log("browser tools options tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
