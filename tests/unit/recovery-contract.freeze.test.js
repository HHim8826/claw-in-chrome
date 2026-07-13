const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createChromeMock,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const rootDir = path.join(__dirname, "..", "..");
const contractPath = path.join(rootDir, "src", "shared", "claw-contract.js");
const mcpPermissionPopupProtocolPath = path.join(rootDir, "src", "shared", "mcp-permission-popup-protocol.js");
const modelsPath = path.join(rootDir, "src", "shared", "custom-provider-models.js");
const githubUpdateSharedPath = path.join(rootDir, "src", "shared", "github-update-shared.js");
const detachedWindowRuntimePath = path.join(rootDir, "src", "background", "service-worker-detached-window-runtime.js");
const runtimePath = path.join(rootDir, "src", "background", "service-worker-runtime.js");
const loaderPath = path.join(rootDir, "src", "background", "service-worker-loader.js");
const manifestPath = path.join(rootDir, "src", "manifest.json");
const sidepanelHtmlPath = path.join(rootDir, "src", "sidepanel", "sidepanel.html");
const optionsHtmlPath = path.join(rootDir, "src", "options", "options.html");
const pairingHtmlPath = path.join(rootDir, "src", "pages", "pairing.html");
const offscreenHtmlPath = path.join(rootDir, "src", "offscreen", "offscreen.html");
const releaseWorkflowPath = path.join(rootDir, ".github", "workflows", "release-extension.yml");
const releasePackageListPath = path.join(
  rootDir,
  ".github",
  "release-package-items.txt",
);

function createSandbox(overrides = {}) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URLSearchParams,
    ...overrides
  };
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadContractSandbox(overrides = {}) {
  const sandbox = createSandbox(overrides);
  runScriptInSandbox(contractPath, sandbox);
  return sandbox;
}

function loadContractAndPermissionPopupProtocolSandbox(overrides = {}) {
  const sandbox = loadContractSandbox(overrides);
  runScriptInSandbox(mcpPermissionPopupProtocolPath, sandbox);
  return sandbox;
}

function indexOfOrFail(source, token, label) {
  const index = source.indexOf(token);
  assert.notEqual(index, -1, `${label} should include ${token}`);
  return index;
}

async function testContractExposesFrozenStableKeys() {
  const sandbox = loadContractSandbox();
  const contract = sandbox.__CP_CONTRACT__;

  assert.ok(contract, "contract should be attached to globalThis");
  assert.equal(contract.version, 1);
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.auth), true);
  assert.equal(Object.isFrozen(contract.prompts), true);
  assert.equal(Object.isFrozen(contract.workflows), true);
  assert.equal(Object.isFrozen(contract.models), true);
  assert.equal(Object.isFrozen(contract.ui), true);
  assert.equal(Object.isFrozen(contract.customProvider), true);
  assert.equal(Object.isFrozen(contract.permissionManager), true);
  assert.equal(Object.isFrozen(contract.nativeMessaging), true);
  assert.equal(Object.isFrozen(contract.githubUpdate), true);
  assert.equal(Object.isFrozen(contract.githubUpdate.STORAGE_KEYS), true);
  assert.equal(Object.isFrozen(contract.githubUpdate.MESSAGE_TYPES), true);
  assert.ok(contract.messages, "contract.messages should exist");
  assert.equal(Object.isFrozen(contract.messages), true);
  assert.equal(Object.isFrozen(contract.session), true);
  assert.equal(Object.isFrozen(contract.detachedWindow), true);
  assert.equal(Object.isFrozen(contract.offscreen), true);
  assert.equal(Object.isFrozen(contract.providerObservability), true);
  assert.equal(Object.isFrozen(contract.pairing), true);
  assert.equal(Object.isFrozen(contract.pairing.QUERY_KEYS), true);
  assert.equal(Object.isFrozen(contract.pairing.MESSAGE_FIELDS), true);
  assert.equal(Object.isFrozen(contract.agentIndicator), true);
  assert.equal(Object.isFrozen(contract.agentIndicator.RUNTIME_MESSAGE_TYPES), true);
  assert.equal(Object.isFrozen(contract.agentIndicator.DOM_IDS), true);
  assert.equal(Object.isFrozen(contract.mcpBridge), true);
  assert.equal(Object.isFrozen(contract.mcpBridge.RUNTIME_MESSAGE_FIELDS), true);
  assert.equal(Object.isFrozen(contract.mcpBridge.PERMISSION_PROMPT_STORAGE_FIELDS), true);
  assert.equal(Object.isFrozen(contract.mcpBridge.PERMISSION_POPUP_QUERY_KEYS), true);
  assert.equal(Object.isFrozen(contract.debug), true);
  assert.equal(Object.isFrozen(contract.debug.RELEVANT_STORAGE_KEYS), true);
  assert.equal(contract.customProvider.STORAGE_KEY, "customProviderConfig");
  assert.equal(contract.customProvider.HTTP_PROVIDER_STORAGE_KEY, "customProviderAllowHttp");
  assert.equal(contract.customProvider.ANTHROPIC_API_KEY_STORAGE_KEY, "anthropicApiKey");
  assert.equal(contract.auth.ACCESS_TOKEN_STORAGE_KEY, "accessToken");
  assert.equal(contract.prompts.SYSTEM_PROMPT_STORAGE_KEY, "chrome_ext_system_prompt");
  assert.equal(
    contract.providerObservability.MEASUREMENT_COMPLETE_EVENT,
    "cp:provider-measurement-complete",
  );
  assert.equal(contract.providerObservability.EVENT_VERSION, 1);
  assert.equal(contract.prompts.SKIP_PERMISSIONS_SYSTEM_PROMPT_STORAGE_KEY, "chrome_ext_skip_perms_system_prompt");
  assert.equal(contract.prompts.PROFILES_STORAGE_KEY, "customSystemPromptProfiles");
  assert.equal(contract.prompts.ACTIVE_PROFILE_STORAGE_KEY, "customSystemPromptActiveProfileId");
  assert.equal(contract.workflows.STORAGE_KEY, "claw_site_workflows_v1");
  assert.equal(contract.models.CONFIG_STORAGE_KEY, "chrome_ext_models");
  assert.equal(contract.ui.PREFERRED_LOCALE_STORAGE_KEY, "preferred_locale");
  assert.equal(contract.ui.DEBUG_MODE_STORAGE_KEY, "debugMode");
  assert.equal(contract.ui.SHOW_TRACE_IDS_STORAGE_KEY, "showTraceIds");
  assert.equal(
    contract.ui.SHOW_SYSTEM_REMINDERS_STORAGE_KEY,
    "showSystemReminders",
  );
  assert.equal(contract.ui.SHOW_TOOL_RESULT_DETAILS_STORAGE_KEY, "showToolResultDetails");
  assert.equal(contract.permissionManager.UPDATE_AVAILABLE_STORAGE_KEY, "updateAvailable");
  assert.equal(contract.permissionManager.SAVED_PROMPTS_STORAGE_KEY, "savedPrompts");
  assert.equal(contract.offscreen.KEEPALIVE_INTERVAL_MS, 20000);
  assert.equal(contract.offscreen.AUDIO_FIELD_URL, "audioUrl");
  assert.equal(contract.offscreen.GIF_MAX_FRAME_COUNT, 50);
  assert.equal(contract.offscreen.GIF_MAX_TOTAL_PIXELS, 50000000);
  assert.equal(contract.offscreen.GIF_FIELD_BLOB_URL, "blobUrl");
  assert.equal(contract.pairing.QUERY_KEYS.REQUEST_ID, "request_id");
  assert.equal(contract.pairing.QUERY_KEYS.CLIENT_TYPE, "client_type");
  assert.equal(contract.pairing.MESSAGE_FIELDS.NAME, "name");
  assert.equal(contract.pairing.DEFAULT_CLIENT_TYPE, "desktop");
  assert.equal(contract.pairing.CLOSE_DELAY_MS, 100);
  assert.equal(contract.agentIndicator.RUNTIME_MESSAGE_TYPES.SHOW_AGENT_INDICATORS, "SHOW_AGENT_INDICATORS");
  assert.equal(contract.agentIndicator.RUNTIME_MESSAGE_TYPES.HIDE_STATIC_INDICATOR, "HIDE_STATIC_INDICATOR");
  assert.equal(contract.agentIndicator.CURRENT_TAB_SENTINEL, "CURRENT_TAB");
  assert.equal(contract.agentIndicator.DOM_IDS.STOP_BUTTON, "claude-agent-stop-button");
  assert.equal(contract.agentIndicator.HEARTBEAT_INTERVAL_MS, 5000);
  assert.equal(contract.mcpBridge.RUNTIME_MESSAGE_FIELDS.REQUEST_ID, "requestId");
  assert.equal(contract.mcpBridge.RUNTIME_MESSAGE_FIELDS.ALLOWED, "allowed");
  assert.equal(contract.mcpBridge.PERMISSION_PROMPT_STORAGE_KEY_PREFIX, "mcp_prompt_");
  assert.equal(contract.mcpBridge.PERMISSION_PROMPT_STORAGE_FIELDS.PROMPT, "prompt");
  assert.equal(contract.mcpBridge.PERMISSION_PROMPT_STORAGE_FIELDS.TAB_ID, "tabId");
  assert.equal(contract.mcpBridge.PERMISSION_PROMPT_STORAGE_FIELDS.TIMESTAMP, "timestamp");
  assert.equal(contract.mcpBridge.PERMISSION_POPUP_QUERY_KEYS.PERMISSION_ONLY, "mcpPermissionOnly");
  assert.equal(contract.mcpBridge.PERMISSION_POPUP_RESPONSE_TIMEOUT_MS, 30000);
  assert.equal(contract.nativeMessaging.PERMISSION, "nativeMessaging");
  assert.equal(contract.nativeMessaging.HOST_DESKTOP, "com.anthropic.claude_browser_extension");
  assert.equal(contract.nativeMessaging.HOST_CLAUDE_CODE, "com.anthropic.claude_code_browser_extension");
  assert.equal(contract.githubUpdate.STORAGE_KEYS.INFO, "githubUpdateInfo");
  assert.equal(contract.githubUpdate.STORAGE_KEYS.UPDATE_AVAILABLE, "updateAvailable");
  assert.equal(contract.githubUpdate.MESSAGE_TYPES.CHECK_NOW, "CP_GITHUB_UPDATE_CHECK_NOW");
  assert.equal(contract.githubUpdate.ALARM_NAME, "cp_github_update_check");
  assert.equal(contract.debug.SIDEPANEL_LOGS_STORAGE_KEY, "sidepanelDebugLogs");
  assert.equal(contract.debug.SIDEPANEL_META_STORAGE_KEY, "sidepanelDebugMeta");
  assert.equal(contract.messages.SW_KEEPALIVE, "SW_KEEPALIVE");
  assert.equal(contract.messages.open_side_panel, "open_side_panel");
  assert.equal(contract.messages.PING_SIDEPANEL, "PING_SIDEPANEL");
  assert.equal(contract.messages.PANEL_OPENED, "PANEL_OPENED");
  assert.equal(contract.messages.PANEL_CLOSED, "PANEL_CLOSED");
  assert.equal(contract.messages.SHOW_PERMISSION_NOTIFICATION, "SHOW_PERMISSION_NOTIFICATION");
  assert.equal(contract.messages.resize_window, "resize_window");
  assert.equal(contract.messages.MCP_PERMISSION_RESPONSE, "MCP_PERMISSION_RESPONSE");
  assert.equal(contract.messages.WORKFLOW_REPLACE_USER, "CP_WORKFLOW_REPLACE_USER");
  assert.equal(contract.messages.EXECUTE_TASK, "EXECUTE_TASK");
  assert.equal(contract.messages.OFFSCREEN_PLAY_SOUND, "OFFSCREEN_PLAY_SOUND");
  assert.equal(contract.messages.GENERATE_GIF, "GENERATE_GIF");
  assert.equal(contract.messages.REVOKE_BLOB_URL, "REVOKE_BLOB_URL");
  assert.equal(contract.messages.MAIN_TAB_ACK_REQUEST, "MAIN_TAB_ACK_REQUEST");
  assert.equal(contract.messages.MAIN_TAB_ACK_RESPONSE, "MAIN_TAB_ACK_RESPONSE");
  assert.equal(contract.messages.SECONDARY_TAB_CHECK_MAIN, "SECONDARY_TAB_CHECK_MAIN");
  assert.equal(contract.messages.pairing_confirmed, "pairing_confirmed");
  assert.equal(contract.messages.pairing_dismissed, "pairing_dismissed");
  assert.equal(contract.messages.show_pairing_prompt, "show_pairing_prompt");
  assert.equal(contract.messages.STOP_AGENT, "STOP_AGENT");
  assert.equal(contract.messages.SWITCH_TO_MAIN_TAB, "SWITCH_TO_MAIN_TAB");
  assert.equal(contract.messages.STATIC_INDICATOR_HEARTBEAT, "STATIC_INDICATOR_HEARTBEAT");
  assert.equal(contract.messages.DISMISS_STATIC_INDICATOR_FOR_GROUP, "DISMISS_STATIC_INDICATOR_FOR_GROUP");
  assert.equal(contract.messages.POPULATE_INPUT_TEXT, "POPULATE_INPUT_TEXT");
  assert.equal(contract.messages.tool_call, "tool_call");
  assert.equal(contract.messages.tool_result, "tool_result");
  assert.equal(contract.messages.pairing_request, "pairing_request");
  assert.equal(contract.messages.permission_response, "permission_response");
  assert.equal(contract.session.CHAT_SCOPE_PREFIX, "claw.chat.scopes.");
  assert.equal(contract.detachedWindow.OPEN_GROUP_MESSAGE_TYPE, "OPEN_GROUP_DETACHED_WINDOW");
}

async function testGithubUpdateSharedReadsFrozenContract() {
  const sandbox = loadContractSandbox();
  runScriptInSandbox(githubUpdateSharedPath, sandbox);
  const contract = sandbox.__CP_CONTRACT__;
  const shared = sandbox.__CP_GITHUB_UPDATE_SHARED__;

  assert.ok(shared, "github update shared should be attached to globalThis");
  assert.equal(shared.STORAGE_KEYS.INFO, contract.githubUpdate.STORAGE_KEYS.INFO);
  assert.equal(shared.STORAGE_KEYS.UPDATE_AVAILABLE, contract.githubUpdate.STORAGE_KEYS.UPDATE_AVAILABLE);
  assert.equal(shared.MESSAGE_TYPES.CHECK_NOW, contract.githubUpdate.MESSAGE_TYPES.CHECK_NOW);
  assert.equal(shared.ALARM_NAME, contract.githubUpdate.ALARM_NAME);
}

async function testPermissionPopupProtocolReadsFrozenContract() {
  const sandbox = loadContractAndPermissionPopupProtocolSandbox();
  const contract = sandbox.__CP_CONTRACT__;
  const protocol = sandbox.__CP_MCP_PERMISSION_POPUP_PROTOCOL__;

  assert.ok(protocol, "permission popup protocol should be attached to globalThis");
  assert.equal(Object.isFrozen(protocol), true);
  assert.equal(Object.isFrozen(protocol.QUERY_KEYS), true);
  assert.equal(Object.isFrozen(protocol.STORAGE_FIELDS), true);
  assert.equal(Object.isFrozen(protocol.RESPONSE_FIELDS), true);
  assert.equal(Object.isFrozen(protocol.POPUP_WINDOW), true);
  assert.equal(protocol.QUERY_KEYS.REQUEST_ID, contract.mcpBridge.PERMISSION_POPUP_QUERY_KEYS.REQUEST_ID);
  assert.equal(protocol.STORAGE_FIELDS.PROMPT, contract.mcpBridge.PERMISSION_PROMPT_STORAGE_FIELDS.PROMPT);
  assert.equal(protocol.STORAGE_FIELDS.TAB_ID, contract.mcpBridge.PERMISSION_PROMPT_STORAGE_FIELDS.TAB_ID);
  assert.equal(protocol.STORAGE_FIELDS.TIMESTAMP, contract.mcpBridge.PERMISSION_PROMPT_STORAGE_FIELDS.TIMESTAMP);
  assert.equal(protocol.STORAGE_KEY_PREFIX, contract.mcpBridge.PERMISSION_PROMPT_STORAGE_KEY_PREFIX);
  assert.equal(protocol.RESPONSE_TIMEOUT_MS, contract.mcpBridge.PERMISSION_POPUP_RESPONSE_TIMEOUT_MS);
  assert.equal(protocol.RESPONSE_MESSAGE_TYPE, contract.messages.MCP_PERMISSION_RESPONSE);
  assert.equal(protocol.buildPromptStorageKey("abc"), "mcp_prompt_abc");

  const response = protocol.buildResponseMessage("r1", false);
  assert.equal(response.type, contract.messages.MCP_PERMISSION_RESPONSE);
  assert.equal(response.requestId, "r1");
  assert.equal(response.allowed, false);
}

async function testRecoveredModulesReadFrozenContract() {
  const chromeMock = createChromeMock();
  const sandbox = loadContractSandbox({
    chrome: chromeMock.chrome,
    fetch: async () => {
      throw new Error("fetch should not be called in contract freeze test");
    }
  });
  runScriptInSandbox(modelsPath, sandbox);
  runScriptInSandbox(detachedWindowRuntimePath, sandbox);
  runScriptInSandbox(runtimePath, sandbox);

  const contract = sandbox.__CP_CONTRACT__;
  const helpers = sandbox.CustomProviderModels;
  const detachedWindowApi = sandbox.__CP_DETACHED_WINDOW_RUNTIME__;
  const serviceWorkerApi = sandbox.__CP_SERVICE_WORKER_RUNTIME__;

  assert.equal(helpers.LEGACY_STORAGE_KEY, contract.customProvider.STORAGE_KEY);
  assert.equal(helpers.PROFILES_STORAGE_KEY, contract.customProvider.PROFILES_STORAGE_KEY);
  assert.equal(helpers.ACTIVE_PROFILE_STORAGE_KEY, contract.customProvider.ACTIVE_PROFILE_STORAGE_KEY);
  assert.equal(helpers.HTTP_PROVIDER_STORAGE_KEY, contract.customProvider.HTTP_PROVIDER_STORAGE_KEY);
  assert.ok(detachedWindowApi, "detached window runtime should be attached to globalThis");
  assert.equal(serviceWorkerApi.constants.CHAT_SCOPE_PREFIX, contract.session.CHAT_SCOPE_PREFIX);
  assert.equal(serviceWorkerApi.constants.CHAT_CLEANUP_AUDIT_KEY, contract.session.CHAT_CLEANUP_AUDIT_KEY);
}

async function testServiceWorkerRuntimeAcceptsContractMessageType() {
  const chromeMock = createChromeMock();
  const sandbox = loadContractSandbox({
    chrome: chromeMock.chrome
  });
  runScriptInSandbox(runtimePath, sandbox);

  let openCalls = 0;
  sandbox.__CP_SERVICE_WORKER_RUNTIME__.registerServiceWorkerRuntimeHandlers({
    chrome: chromeMock.chrome,
    console,
    openDetachedWindowForGroup: async () => {
      openCalls += 1;
      return {
        success: true
      };
    }
  });

  const listener = chromeMock.events.runtimeOnMessage.listeners[0];
  const response = await new Promise((resolve, reject) => {
    try {
      listener({
        type: sandbox.__CP_CONTRACT__.detachedWindow.OPEN_GROUP_MESSAGE_TYPE
      }, {
        tab: {
          id: 42
        }
      }, resolve);
    } catch (error) {
      reject(error);
    }
  });

  assert.equal(openCalls, 1);
  assert.equal(response.success, true);
}

async function testShellEntryPointsLoadContractBeforeRecoveredModules() {
  const sidepanelHtml = fs.readFileSync(sidepanelHtmlPath, "utf8");
  const optionsHtml = fs.readFileSync(optionsHtmlPath, "utf8");
  const pairingHtml = fs.readFileSync(pairingHtmlPath, "utf8");
  const offscreenHtml = fs.readFileSync(offscreenHtmlPath, "utf8");
  const loaderSource = fs.readFileSync(loaderPath, "utf8");

  const sidepanelContractIndex = indexOfOrFail(sidepanelHtml, "/claw-contract.js", "sidepanel.html");
  const sidepanelProtocolIndex = indexOfOrFail(sidepanelHtml, "/mcp-permission-popup-protocol.js", "sidepanel.html");
  assert.ok(sidepanelContractIndex < indexOfOrFail(sidepanelHtml, "/custom-provider-models.js", "sidepanel.html"));
  assert.ok(sidepanelContractIndex < indexOfOrFail(sidepanelHtml, "/provider-format-adapter.js", "sidepanel.html"));
  assert.ok(sidepanelContractIndex < sidepanelProtocolIndex);
  assert.ok(sidepanelProtocolIndex < indexOfOrFail(sidepanelHtml, "/assets/sidepanel-BoLm9pmH.js", "sidepanel.html"));
  assert.ok(sidepanelContractIndex < indexOfOrFail(sidepanelHtml, "/assets/sidepanel-BoLm9pmH.js", "sidepanel.html"));
  const sidepanelMetricsIndex = indexOfOrFail(sidepanelHtml, "/sidepanel/answer-provider-metrics.js", "sidepanel.html");
  assert.ok(indexOfOrFail(sidepanelHtml, "/provider-observability.js", "sidepanel.html") < sidepanelMetricsIndex);
  assert.ok(indexOfOrFail(sidepanelHtml, "/assets/sidepanel-BoLm9pmH.js", "sidepanel.html") < sidepanelMetricsIndex);
  indexOfOrFail(sidepanelHtml, "/sidepanel/answer-provider-metrics.css", "sidepanel.html");

  const optionsContractIndex = indexOfOrFail(optionsHtml, "/claw-contract.js", "options.html");
  assert.ok(optionsContractIndex < indexOfOrFail(optionsHtml, "/assets/options-Hyb_OzME.js", "options.html"));
  assert.ok(optionsContractIndex < indexOfOrFail(optionsHtml, "/custom-provider-models.js", "options.html"));

  const pairingContractIndex = indexOfOrFail(pairingHtml, "/claw-contract.js", "pairing.html");
  assert.ok(pairingContractIndex < indexOfOrFail(pairingHtml, "/assets/pairing-H3Cs7KHl.js", "pairing.html"));

  const offscreenContractIndex = indexOfOrFail(offscreenHtml, "claw-contract.js", "offscreen.html");
  assert.ok(offscreenContractIndex < indexOfOrFail(offscreenHtml, "offscreen.js", "offscreen.html"));

  const loaderContractIndex = indexOfOrFail(loaderSource, 'import "../shared/claw-contract.js";', "service-worker-loader.js");
  const loaderBindingIndex = indexOfOrFail(loaderSource, 'import "../shared/native-host-binding.js";', "service-worker-loader.js");
  const loaderProtocolIndex = indexOfOrFail(loaderSource, 'import "../shared/mcp-permission-popup-protocol.js";', "service-worker-loader.js");
  const loaderBundleIndex = indexOfOrFail(loaderSource, 'import "../assets/service-worker.ts-H0DVM1LS.js";', "service-worker-loader.js");
  const loaderDetachedRuntimeIndex = indexOfOrFail(loaderSource, 'import "./service-worker-detached-window-runtime.js";', "service-worker-loader.js");

  assert.ok(loaderContractIndex < loaderBindingIndex);
  assert.ok(loaderBindingIndex < loaderProtocolIndex);
  assert.ok(loaderProtocolIndex < loaderBundleIndex);
  assert.ok(loaderBundleIndex < loaderDetachedRuntimeIndex);
}

async function testReleaseAndManifestKeepFrozenShellInterfaces() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const workflow = fs.readFileSync(releaseWorkflowPath, "utf8");
  const releasePackageList = fs.readFileSync(releasePackageListPath, "utf8");

  assert.equal(manifest.background?.service_worker, "background/service-worker-loader.js");
  assert.equal(manifest.options_page, "options/options.html");
  assert.match(workflow, /\brelease-package-items\.txt\b/);
  assert.match(releasePackageList, /\bclaw-contract\.js\b/);
  assert.match(releasePackageList, /\bnative-host-binding\.js\b/);
  assert.match(releasePackageList, /\bmcp-permission-popup-protocol\.js\b/);
  assert.match(releasePackageList, /\bservice-worker-detached-window-runtime\.js\b/);
  assert.match(releasePackageList, /\banswer-provider-metrics\.js\b/);
  assert.match(releasePackageList, /\banswer-provider-metrics\.css\b/);
}

async function main() {
  await testContractExposesFrozenStableKeys();
  await testGithubUpdateSharedReadsFrozenContract();
  await testPermissionPopupProtocolReadsFrozenContract();
  await testRecoveredModulesReadFrozenContract();
  await testServiceWorkerRuntimeAcceptsContractMessageType();
  await testShellEntryPointsLoadContractBeforeRecoveredModules();
  await testReleaseAndManifestKeepFrozenShellInterfaces();
  console.log("recovery contract freeze tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
