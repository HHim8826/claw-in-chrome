const assert = require("node:assert/strict");
const path = require("node:path");

const { runScriptInSandbox } = require("../helpers/chrome-test-utils");

const rootDir = path.join(__dirname, "..", "..");
const contractPath = path.join(rootDir, "src", "shared", "claw-contract.js");
const protocolPath = path.join(rootDir, "src", "shared", "mcp-permission-popup-protocol.js");

function createSandbox(overrides = {}) {
  const sandbox = {
    console,
    URLSearchParams,
    ...overrides
  };
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadProtocolSandbox(overrides = {}) {
  const sandbox = createSandbox(overrides);
  runScriptInSandbox(contractPath, sandbox);
  runScriptInSandbox(protocolPath, sandbox);
  return sandbox;
}

function createRuntimeUrl(targetPath) {
  return `chrome-extension://test-extension-id/${String(targetPath || "").replace(/^\/+/, "")}`;
}

async function testProtocolAttachesFrozenApi() {
  const sandbox = loadProtocolSandbox();
  const protocol = sandbox.__CP_MCP_PERMISSION_POPUP_PROTOCOL__;

  assert.ok(protocol, "protocol should be attached to globalThis");
  assert.equal(Object.isFrozen(protocol), true);
  assert.equal(Object.isFrozen(protocol.QUERY_KEYS), true);
  assert.equal(Object.isFrozen(protocol.STORAGE_FIELDS), true);
  assert.equal(Object.isFrozen(protocol.RESPONSE_FIELDS), true);
  assert.equal(Object.isFrozen(protocol.POPUP_WINDOW), true);
  assert.equal(protocol.QUERY_KEYS.REQUEST_ID, "requestId");
  assert.equal(protocol.STORAGE_FIELDS.PROMPT, "prompt");
  assert.equal(protocol.RESPONSE_FIELDS.ALLOWED, "allowed");
}

async function testProtocolParsesPopupSearchAndStorageHelpers() {
  const sandbox = loadProtocolSandbox();
  const protocol = sandbox.__CP_MCP_PERMISSION_POPUP_PROTOCOL__;

  const parsed = protocol.parsePopupSearch("?tabId=12&mcpPermissionOnly=true&requestId=req-1");
  assert.equal(parsed.tabId, 12);
  assert.equal(parsed.permissionOnly, true);
  assert.equal(parsed.requestId, "req-1");

  const requestOnlyParsed = protocol.parsePopupSearch(
    "?mcpPermissionOnly=true&requestId=req-only",
  );
  assert.equal(requestOnlyParsed.tabId, null);
  assert.equal(requestOnlyParsed.permissionOnly, true);
  assert.equal(requestOnlyParsed.requestId, "req-only");

  assert.equal(protocol.isPermissionPopupSearch("?tabId=12&mcpPermissionOnly=true&requestId=req-1"), true);
  assert.equal(
    protocol.isPermissionPopupSearch("?mcpPermissionOnly=true&requestId=req-only"),
    true,
  );
  assert.equal(protocol.isPermissionPopupSearch("?tabId=12&mcpPermissionOnly=true"), false);
  assert.equal(protocol.buildPromptStorageKey("req-1"), "mcp_prompt_req-1");

  const storageEntry = protocol.createPromptStorageEntry("allow this tool", 12, 123);
  assert.equal(storageEntry.prompt, "allow this tool");
  assert.equal(storageEntry.tabId, 12);
  assert.equal(storageEntry.timestamp, 123);

  const loadedEntry = protocol.getPromptStorageEntry({
    [protocol.buildPromptStorageKey("req-1")]: storageEntry
  }, "req-1");
  assert.equal(loadedEntry.prompt, "allow this tool");
  assert.equal(loadedEntry.tabId, 12);
  assert.equal(loadedEntry.timestamp, 123);
}

async function testProtocolBuildsResponseAndPopupWindowPayloads() {
  const sandbox = loadProtocolSandbox();
  const protocol = sandbox.__CP_MCP_PERMISSION_POPUP_PROTOCOL__;

  const response = protocol.buildResponseMessage("req-1", true);
  assert.equal(response.type, "MCP_PERMISSION_RESPONSE");
  assert.equal(response.requestId, "req-1");
  assert.equal(response.allowed, true);

  const popupUrl = protocol.buildPopupUrl(createRuntimeUrl, {
    tabId: 12,
    requestId: "req-1"
  });
  assert.equal(
    popupUrl,
    "chrome-extension://test-extension-id/sidepanel/sidepanel.html?tabId=12&mcpPermissionOnly=true&requestId=req-1"
  );

  const requestOnlyPopupUrl = protocol.buildPopupUrl(createRuntimeUrl, {
    requestId: "req-only"
  });
  assert.equal(
    requestOnlyPopupUrl,
    "chrome-extension://test-extension-id/sidepanel/sidepanel.html?mcpPermissionOnly=true&requestId=req-only"
  );

  const popupWindowOptions = protocol.createPopupWindowOptions(createRuntimeUrl, {
    tabId: 12,
    requestId: "req-1"
  });
  assert.equal(popupWindowOptions.url, popupUrl);
  assert.equal(popupWindowOptions.type, "popup");
  assert.equal(popupWindowOptions.width, 600);
  assert.equal(popupWindowOptions.height, 600);
  assert.equal(popupWindowOptions.focused, true);

  const requestOnlyPopupWindowOptions = protocol.createPopupWindowOptions(
    createRuntimeUrl,
    {
      requestId: "req-only"
    },
  );
  assert.equal(requestOnlyPopupWindowOptions.url, requestOnlyPopupUrl);
  assert.equal(requestOnlyPopupWindowOptions.type, "popup");
  assert.equal(requestOnlyPopupWindowOptions.width, 600);
  assert.equal(requestOnlyPopupWindowOptions.height, 600);
  assert.equal(requestOnlyPopupWindowOptions.focused, true);
}

async function main() {
  await testProtocolAttachesFrozenApi();
  await testProtocolParsesPopupSearchAndStorageHelpers();
  await testProtocolBuildsResponseAndPopupWindowPayloads();
  console.log("mcp permission popup protocol tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
