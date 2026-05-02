const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const contractPath = path.join(rootDir, "src", "shared", "claw-contract.js");
const settingsPath = path.join(rootDir, "src", "shared", "custom-provider-settings.js");
const permissionManagerPath = path.join(
  rootDir, "src", "assets",
  "PermissionManager-9s959502.js",
);
const sidepanelPath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");
const zhCustomI18nPath = path.join(rootDir, "src", "i18n", "custom", "zh-CN.js");

function main() {
  const contractSource = fs.readFileSync(contractPath, "utf8");
  const settingsSource = fs.readFileSync(settingsPath, "utf8");
  const permissionManagerSource = fs.readFileSync(permissionManagerPath, "utf8");
  const sidepanelSource = fs.readFileSync(sidepanelPath, "utf8");
  const zhCustomI18nSource = fs.readFileSync(zhCustomI18nPath, "utf8");

  assert.match(
    contractSource,
    /SHOW_TOOL_RESULT_DETAILS_STORAGE_KEY:\s*"showToolResultDetails"/,
    "shared contract should expose the tool result details storage key",
  );

  assert.match(
    settingsSource,
    /const SHOW_TOOL_RESULT_DETAILS_STORAGE_KEY =\s*uiContract\.SHOW_TOOL_RESULT_DETAILS_STORAGE_KEY \|\|\s*"showToolResultDetails";/s,
    "settings page should read the shared tool result details storage key",
  );

  assert.match(
    settingsSource,
    /toolResultDetailsTitle:\s*"Show tool result details"/,
    "settings page should define a tool result details toggle label",
  );

  assert.match(
    settingsSource,
    /const toolResultDetailsToggle = createNode\(\s*"button",\s*"cp-page-toggle cp-update-enhancer-toggle",\s*\);/s,
    "settings page should render the tool result details switch with the visible toggle styling",
  );

  assert.match(
    settingsSource,
    /\.cp-update-enhancer-toggle \{/,
    "settings page should include fallback toggle styles so the switch stays visible in the custom settings panel",
  );

  assert.match(
    settingsSource,
    /async function setToolResultDetailsEnabled\(enabled\) \{/,
    "settings page should persist tool result detail toggles",
  );

  assert.match(
    settingsSource,
    /storageKey:\s*SHOW_TOOL_RESULT_DETAILS_STORAGE_KEY/,
    "settings page should save the tool result details preference to storage",
  );

  assert.match(
    settingsSource,
    /SHOW_TOOL_RESULT_DETAILS_STORAGE_KEY in changes[\s\S]*refreshDebug\(\)\.catch/s,
    "settings page should refresh the debug section when the tool result details preference changes",
  );

  assert.match(
    permissionManagerSource,
    /t\.SHOW_TOOL_RESULT_DETAILS = "showToolResultDetails";/,
    "permission manager bundle should expose the tool result details storage key to the sidepanel bundle",
  );

  assert.match(
    sidepanelSource,
    /y\(v\.SHOW_TOOL_RESULT_DETAILS\)\.then\(e => \{/,
    "sidepanel bundle should read the tool result details preference from storage",
  );

  assert.match(
    sidepanelSource,
    /const D = P \|\| b;/,
    "sidepanel tool rows should force expansion when tool result details are enabled",
  );

  assert.match(
    sidepanelSource,
    /forceExpanded: P/,
    "sidepanel tool result cards should receive the force-expanded flag",
  );

  assert.match(
    sidepanelSource,
    /forceExpanded: z = false/,
    "tool result card renderer should accept a force-expanded prop",
  );

  assert.match(
    sidepanelSource,
    /\(z \|\| i\) && c && l\.jsx\("div", \{/,
    "tool result details should render when force-expanded is enabled",
  );

  assert.match(
    zhCustomI18nSource,
    /"toolResultDetailsTitle": "显示工具结果详情"/,
    "zh-CN custom strings should translate the tool result details toggle",
  );

  console.log("tool result details setting regression test passed");
}

main();
