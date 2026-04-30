const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sidepanelBundlePath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source, snippet, label) {
  assert.equal(source.includes(snippet), true, `${label} should include the expected snippet`);
}

function main() {
  const sidepanelSource = readSource(sidepanelBundlePath);

  assertIncludes(
    sidepanelSource,
    "const __cpIsMcpPermissionOnlyWindow = __cpSidepanelMcpPermissionPopupParseSearch(window.location.search).permissionOnly;",
    "hydrate guard permission-only parse"
  );

  assertIncludes(
    sidepanelSource,
    "if (!__cpIsMcpPermissionOnlyWindow) {",
    "hydrate guard condition"
  );

  assertIncludes(
    sidepanelSource,
    "语义锚点：mcpPermissionOnly 权限窗的 requestId 回包不能被通用 session hydrate 起手 sn() 提前拒绝。",
    "hydrate guard anchor"
  );

  console.log("mcp permission popup hydrate guard regression test passed");
}

main();
