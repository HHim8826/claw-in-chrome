const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createChromeMock, flushMicrotasks, runScriptInSandbox } = require("../helpers/chrome-test-utils");
const { FakeDocument, FakeElement, FakeMutationObserver } = require("../helpers/fake-dom");

const repoRoot = path.join(__dirname, "..", "..");
const modulePath = path.join(repoRoot, "src", "options", "site-blocklist-options.js");

function createHarness(options = {}) {
  const chromeMock = createChromeMock({ storageState: options.storageState || {} });
  const managedState = { blockedUrlPatterns: options.managedPatterns || [] };
  chromeMock.chrome.storage.managed = { get: options.managedGet || (async () => managedState) };
  const document = new FakeDocument({ readyState: "complete" });
  document.documentElement.lang = options.locale || "en-US";
  const mountAnchor = document.createElement("div");
  mountAnchor.id = "cp-options-permissions-anchor";
  document.body.appendChild(mountAnchor);
  const sandbox = {
    console,
    URL,
    chrome: chromeMock.chrome,
    document,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    navigator: { language: options.locale || "en-US" },
    window: {
      location: { hash: options.hash ?? "" },
      addEventListener() {},
    },
  };
  sandbox.globalThis = sandbox;
  runScriptInSandbox(path.join(repoRoot, "src", "shared", "claw-contract.js"), sandbox);
  runScriptInSandbox(path.join(repoRoot, "src", "shared", "managed-policy.js"), sandbox);
  runScriptInSandbox(path.join(repoRoot, "src", "options", "options-card-helpers.js"), sandbox);
  runScriptInSandbox(modulePath, sandbox);
  return { chromeMock, document, sandbox };
}

function el(harness, id) {
  return harness.document.getElementById(id);
}

async function addPattern(harness, value, via = "button") {
  const input = el(harness, "cp-site-blocklist-input");
  input.value = value;
  input.dispatchEvent({ type: "input", target: input });
  if (via === "enter") {
    input.dispatchEvent({ type: "keydown", key: "Enter", target: input });
  } else {
    el(harness, "cp-site-blocklist-add").click();
  }
  await flushMicrotasks();
  await flushMicrotasks();
}

async function stored(harness) {
  const values = await harness.chromeMock.chrome.storage.local.get("userBlockedUrlPatterns");
  return values.userBlockedUrlPatterns === undefined ? undefined : [...values.userBlockedUrlPatterns];
}

function patternRows(harness) {
  return el(harness, "cp-site-blocklist-root").querySelectorAll("[data-cp-blocked-pattern]");
}

async function testRendersOnThePermissionsTabOnly() {
  for (const hash of ["", "#permissions", "#unknown"]) {
    const harness = createHarness({ hash });
    await flushMicrotasks();
    const root = el(harness, "cp-site-blocklist-root");
    assert.ok(root, `the card renders for hash ${JSON.stringify(hash)}`);
    assert.equal(root.parentNode.id, "cp-options-permissions-anchor");
    for (const token of ["bg-bg-100", "border-border-300", "rounded-xl"]) {
      assert.equal(root.className.split(" ").includes(token), true, `the card matches the permissions panels (${token})`);
    }
    assert.equal(root.textContent.includes("Blocked sites"), true);
    assert.equal(root.textContent.includes("You haven't blocked any sites."), true);
  }
  for (const hash of ["#options", "#prompts", "#options?provider=true"]) {
    const harness = createHarness({ hash });
    await flushMicrotasks();
    assert.equal(el(harness, "cp-site-blocklist-root"), null, `the card stays hidden for ${hash}`);
  }
}

async function testAddsNormalizedPatternsAndRemovesThem() {
  const harness = createHarness();
  await flushMicrotasks();
  await addPattern(harness, " https://www.News.example/Today?x=1 ");
  assert.deepEqual(await stored(harness), ["news.example/today"]);
  await addPattern(harness, "*.shop.example", "enter");
  assert.deepEqual(await stored(harness), ["news.example/today", "*.shop.example"]);
  assert.deepEqual(patternRows(harness).map((row) => row.getAttribute("data-cp-blocked-pattern")), ["news.example/today", "*.shop.example"]);
  assert.equal(el(harness, "cp-site-blocklist-input").value, "", "the input clears after adding");

  const remove = el(harness, "cp-site-blocklist-root").querySelector('[data-cp-remove-pattern="news.example/today"]');
  assert.ok(remove, "each user rule has a remove button");
  remove.click();
  await flushMicrotasks();
  await flushMicrotasks();
  assert.deepEqual(await stored(harness), ["*.shop.example"]);
  assert.deepEqual(patternRows(harness).map((row) => row.getAttribute("data-cp-blocked-pattern")), ["*.shop.example"]);
}

async function testRejectsEmptyInvalidDuplicateAndOverflow() {
  const harness = createHarness({ storageState: { userBlockedUrlPatterns: ["news.example"] } });
  await flushMicrotasks();
  await addPattern(harness, "   ");
  assert.equal(el(harness, "cp-site-blocklist-status").textContent, "Enter a domain or URL pattern.");
  await addPattern(harness, "not a pattern");
  assert.equal(el(harness, "cp-site-blocklist-status").textContent, "Use a domain or URL pattern such as example.com or example.com/admin/*.");
  await addPattern(harness, "https://news.example/*");
  assert.equal(el(harness, "cp-site-blocklist-status").textContent, "news.example is already on the list.");
  assert.deepEqual(await stored(harness), ["news.example"], "rejected input isn't saved");

  const full = createHarness({ storageState: { userBlockedUrlPatterns: Array.from({ length: 200 }, (_, index) => `site${index}.example`) } });
  await flushMicrotasks();
  await addPattern(full, "one-more.example");
  assert.equal(el(full, "cp-site-blocklist-status").textContent, "You can block up to 200 patterns.");
  assert.equal((await stored(full)).length, 200);
}

async function testShowsAdministratorRulesReadOnly() {
  const harness = createHarness({ managedPatterns: ["intranet.example/*"], locale: "zh-TW" });
  await flushMicrotasks();
  const root = el(harness, "cp-site-blocklist-root");
  const managedRows = root.querySelectorAll("[data-cp-managed-pattern]");
  assert.deepEqual(managedRows.map((row) => row.getAttribute("data-cp-managed-pattern")), ["intranet.example/*"]);
  assert.equal(root.querySelectorAll('[data-cp-remove-pattern="intranet.example/*"]').length, 0, "administrator rules can't be removed here");
  assert.equal(root.textContent.includes("封鎖網站"), true);
  assert.equal(root.textContent.includes("由瀏覽器管理員設定"), true);

  const none = createHarness({ locale: "zh-CN" });
  await flushMicrotasks();
  assert.equal(el(none, "cp-site-blocklist-root").textContent.includes("blockedUrlPatterns"), true, "the card explains where administrator rules come from");
  assert.equal(el(none, "cp-site-blocklist-root").textContent.includes("屏蔽网站"), true);
}

async function testUserListDoesNotWaitForManagedPolicy() {
  let releaseManaged;
  const harness = createHarness({
    storageState: { userBlockedUrlPatterns: ["news.example"] },
    managedGet: () => new Promise((resolve) => {
      releaseManaged = () => resolve({ blockedUrlPatterns: ["intranet.example"] });
    }),
  });
  await flushMicrotasks();
  assert.deepEqual(patternRows(harness).map((row) => row.getAttribute("data-cp-blocked-pattern")), ["news.example"], "the user's list renders while Chrome is still loading policy");
  releaseManaged();
  await flushMicrotasks();
  const managedRows = el(harness, "cp-site-blocklist-root").querySelectorAll("[data-cp-managed-pattern]");
  assert.deepEqual(managedRows.map((row) => row.getAttribute("data-cp-managed-pattern")), ["intranet.example"]);
}

async function testExternalChangesRerender() {
  const harness = createHarness();
  await flushMicrotasks();
  await harness.chromeMock.chrome.storage.local.set({ userBlockedUrlPatterns: ["synced.example"] });
  await flushMicrotasks();
  assert.deepEqual(patternRows(harness).map((row) => row.getAttribute("data-cp-blocked-pattern")), ["synced.example"]);
}

function testWiring() {
  const html = fs.readFileSync(path.join(repoRoot, "src", "options", "options.html"), "utf8");
  const helpers = html.indexOf('<script src="/options/options-card-helpers.js"></script>');
  const card = html.indexOf('<script src="/options/site-blocklist-options.js"></script>');
  assert.ok(helpers > -1 && card > helpers, "the blocklist card loads after the shared helpers");
  assert.ok(html.indexOf("/shared/managed-policy.js") < card, "the site policy runtime loads before the card");
  assert.equal(html.includes('<link rel="stylesheet" href="/options/site-blocklist-options.css" />'), true);

  const bundle = fs.readFileSync(path.join(repoRoot, "src", "assets", "options-Hyb_OzME.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    bundle.includes('n.jsx("div", {\n          id: __cpOptionsPermissionsMountAnchorId,\n        }),'),
    true,
    "the permissions tab exposes a mount anchor for readable cards",
  );
  assert.equal(bundle.includes('const __cpOptionsPermissionsMountAnchorId = "cp-options-permissions-anchor";'), true);

  const release = fs.readFileSync(path.join(repoRoot, ".github", "release-package-items.txt"), "utf8");
  assert.equal(release.includes("options/site-blocklist-options.js"), true);
  assert.equal(release.includes("options/site-blocklist-options.css"), true);
}

async function main() {
  await testRendersOnThePermissionsTabOnly();
  await testAddsNormalizedPatternsAndRemovesThem();
  await testRejectsEmptyInvalidDuplicateAndOverflow();
  await testShowsAdministratorRulesReadOnly();
  await testUserListDoesNotWaitForManagedPolicy();
  await testExternalChangesRerender();
  testWiring();
  console.log("site blocklist options tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
