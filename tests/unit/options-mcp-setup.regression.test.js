const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const settingsPath = path.join(rootDir, "src", "shared", "custom-provider-settings.js");
const optionsBundlePath = path.join(rootDir, "src", "assets", "options-Hyb_OzME.js");
const zhCustomI18nPath = path.join(rootDir, "src", "i18n", "custom", "zh-CN.js");

function main() {
  const settingsSource = fs.readFileSync(settingsPath, "utf8");
  const optionsBundleSource = fs.readFileSync(optionsBundlePath, "utf8");
  const zhCustomI18nSource = fs.readFileSync(zhCustomI18nPath, "utf8");

  assert.match(
    settingsSource,
    /const MCP_SERVER_COMMAND = "claw-in-chrome-mcp";/,
    "settings page should keep the MCP setup snippet aligned with the published command name",
  );

  assert.match(
    settingsSource,
    /const MCP_WINDOWS_SERVER_COMMAND = "claw-in-chrome-mcp\.cmd";/,
    "settings page should expose a Windows-safe MCP command shim",
  );

  assert.match(
    settingsSource,
    /const MCP_DEFAULT_EXTENSION_ID = "fcoeoabgfenejglbffodgkkbkcdhcgfn";/,
    "settings page should know the default packaged extension id so it can hide unnecessary override UI",
  );

  assert.doesNotMatch(
    settingsSource,
    /MCP_PROFILE_TOKEN_ENV_KEY|MCP_PROFILE_TOKEN_STORAGE_KEY|getOrCreateMcpProfileToken|rotateMcpProfileToken|buildMcpProfileTokenEnvLine/,
    "settings page should no longer expose profile-token specific state or helpers",
  );

  assert.match(
    settingsSource,
    /const MCP_BIND_BROWSER_ENV_KEY = "CIC_MCP_BIND_BROWSER";/,
    "settings page should expose the browser-binding environment variable name",
  );

  assert.match(
    settingsSource,
    /const MCP_EXTENSION_IDS_ENV_KEY = "CLAW_IN_CHROME_EXTENSION_IDS";/,
    "settings page should expose the extension-id override environment variable name",
  );

  assert.match(
    settingsSource,
    /mcpSetupTitle:\s*"MCP setup"/,
    "settings page should define an MCP setup section title",
  );

  assert.match(
    settingsSource,
    /const MCP_ROOT_ID = "cp-options-mcp-root";/,
    "settings page should define a dedicated MCP root id",
  );

  assert.match(
    settingsSource,
    /const MCP_ANCHOR_ID = "cp-options-mcp-anchor";/,
    "settings page should define a dedicated MCP mount anchor id",
  );

  assert.match(
    settingsSource,
    /const MCP_NAV_ITEM_ID = "cp-options-mcp-nav-item";/,
    "settings page should define a dedicated MCP nav item id",
  );

  assert.match(
    settingsSource,
    /`cp-page-input cp-page-input-mono cp-mcp-setup-code \$\{SHARED_FRAME_CLASS\}`/,
    "settings page should reuse the shared framed input styling for MCP code blocks",
  );

  assert.match(
    settingsSource,
    /const mcpSetupSection = createNode\("div", "cp-page-stack"\);/,
    "settings page should render the MCP page by reusing the shared stack layout",
  );

  assert.match(
    settingsSource,
    /const mcpSetupEnvHeader = createNode\("div", "cp-page-row"\);[\s\S]*const mcpSetupEnvCopy = createNode\("div", "cp-page-row-copy"\);/s,
    "settings page should reuse the shared row controls for the MCP env block",
  );

  assert.match(
    settingsSource,
    /const mcpSetupConfigHeader = createNode\("div", "cp-page-row"\);[\s\S]*const mcpSetupConfigCopy = createNode\("div", "cp-page-row-copy"\);/s,
    "settings page should reuse the shared row controls for the MCP config block",
  );

  assert.doesNotMatch(
    settingsSource,
    /mcpSetupTokenLabel|mcpSetupTokenHelp|mcpSetupCopyTokenSuccess|mcpSetupRefreshTokenSuccess|refreshAction|copyTokenButton|refreshTokenButton|mcpSetupTokenBlock/,
    "settings page should no longer render or manage a profile-token block",
  );

  assert.match(
    settingsSource,
    /async function detectMcpBrowserId\(\) \{[\s\S]*async function buildMcpServerConfigSnippet\(extensionId\) \{[\s\S]*const detectedBrowser = await detectMcpBrowserId\(\);[\s\S]*command: getMcpServerCommand\(\),[\s\S]*args: \["serve"\],[\s\S]*env\[MCP_BIND_BROWSER_ENV_KEY\] = detectedBrowser;[\s\S]*env\[MCP_EXTENSION_IDS_ENV_KEY\] = runtimeId;[\s\S]*JSON\.stringify/s,
    "settings page should generate a copyable MCP server configuration snippet with browser binding plus the optional extension id override",
  );

  assert.doesNotMatch(
    settingsSource,
    /env\[MCP_PROFILE_TOKEN_ENV_KEY\]/,
    "settings page should not emit CIC_MCP_PROFILE_TOKEN in the MCP config snippet",
  );

  assert.match(
    settingsSource,
    /mcpSetupEnvBlock\.hidden = !shouldShowExtensionOverride;/,
    "settings page should hide the extension-id override block when the current extension id is already the default packaged id",
  );

  assert.match(
    settingsSource,
    /const mcpSetupNotes = createNode\("div", "cp-mcp-setup-notes"\);[\s\S]*mcpSetupNotes\.appendChild\(mcpSetupRepoMeta\);/s,
    "settings page should keep the MCP notes area focused on the repository link",
  );

  assert.match(
    settingsSource,
    /await copyTextToClipboard\(mcpSetupEnvCode\.textContent \|\| ""\);/,
    "settings page should let users copy the environment variable snippet",
  );

  assert.match(
    settingsSource,
    /await copyTextToClipboard\(mcpSetupConfigCode\.textContent \|\| ""\);/,
    "settings page should let users copy the MCP config snippet",
  );

  assert.match(
    optionsBundleSource,
    /const __cpOptionsMcpMountAnchorId = "cp-options-mcp-anchor";/,
    "options bundle should expose a dedicated MCP mount anchor",
  );

  assert.match(
    optionsBundleSource,
    /const __cpOptionsNavHrefOptionsMcp = "\/settings\/options\?provider=mcp";/,
    "options bundle should expose a dedicated MCP hash route",
  );

  assert.match(
    optionsBundleSource,
    /providerSubview === __cpOptionsMcpSubviewToken[\s\S]*children: navStrings\.mcp/s,
    "options bundle should render an MCP nav item under Options",
  );

  assert.match(
    zhCustomI18nSource,
    /"mcpNavTitle": "MCP"/,
    "zh-CN custom strings should translate the MCP nav title",
  );

  assert.match(
    zhCustomI18nSource,
    /"mcpSetupTitle": "MCP 接入"/,
    "zh-CN custom strings should translate the MCP setup section title",
  );

  assert.match(
    zhCustomI18nSource,
    /"mcpSetupRepoLabel": "项目地址："/,
    "zh-CN custom strings should translate the MCP repository label",
  );

  assert.match(
    zhCustomI18nSource,
    /"mcpSetupConfigLabel": "配置示例"/,
    "zh-CN custom strings should keep the MCP config block title concise",
  );

  assert.doesNotMatch(
    zhCustomI18nSource,
    /"mcpSetupTokenLabel":|"mcpSetupTokenHelp":|"mcpSetupCopyTokenSuccess":|"mcpSetupRefreshTokenSuccess":|"refreshAction":/,
    "zh-CN custom strings should no longer ship profile-token UI copy",
  );

  console.log("options MCP setup regression test passed");
}

main();
