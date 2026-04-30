const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sidepanelBundlePath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");
const serviceWorkerBundlePath = path.join(rootDir, "src", "assets", "service-worker.ts-H0DVM1LS.js");

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source, snippet, label) {
  assert.equal(source.includes(snippet), true, `${label} should include the expected snippet`);
}

function main() {
  const sidepanelSource = readSource(sidepanelBundlePath);
  const serviceWorkerSource = readSource(serviceWorkerBundlePath);

  assertIncludes(
    sidepanelSource,
    "const t = typeof a.targetTabId == \"number\" ? a.targetTabId : null;",
    "sidepanel STOP_AGENT targetTabId parse"
  );

  assertIncludes(
    sidepanelSource,
    "if (t && e && e !== t) {",
    "sidepanel STOP_AGENT mismatch guard"
  );

  assertIncludes(
    sidepanelSource,
    "return false;",
    "sidepanel STOP_AGENT ignore branch"
  );

  assertIncludes(
    sidepanelSource,
    "语义锚点：STOP_AGENT 先按 targetTabId 过滤；只有命中当前 tab 的 sidepanel 才会走 cancel + permission deny 收口。",
    "sidepanel STOP_AGENT anchor"
  );

  assertIncludes(
    serviceWorkerSource,
    "语义锚点：background 会给 STOP_AGENT 补 targetTabId，供 sidepanel consumer 过滤多面板广播。",
    "service worker STOP_AGENT anchor"
  );

  console.log("sidepanel STOP_AGENT target filter regression test passed");
}

main();
