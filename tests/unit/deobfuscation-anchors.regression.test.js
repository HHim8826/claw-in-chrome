const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const sidepanelPath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");
const sidepanelInlineProviderCssPath = path.join(rootDir, "src", "sidepanel", "sidepanel-inline-provider.css");
const enUsMessagesPath = path.join(rootDir, "src", "i18n", "en-US.json");
const zhCnMessagesPath = path.join(rootDir, "src", "i18n", "zh-CN.json");
const zhTwMessagesPath = path.join(rootDir, "src", "i18n", "zh-TW.json");
const permissionManagerPath = path.join(rootDir, "src", "assets", "PermissionManager-9s959502.js");
const mcpPermissionsPath = path.join(rootDir, "src", "assets", "mcpPermissions-qqAoJjJ8.js");
const accessibilityTreeBundlePath = path.join(rootDir, "src", "assets", "accessibility-tree.js-D8KNCIWO.js");
const agentVisualIndicatorBundlePath = path.join(rootDir, "src", "assets", "agent-visual-indicator.js-Ct7LqXhp.js");
const startRecordingBundlePath = path.join(rootDir, "src", "assets", "startRecording-BeCDKY84.js");
const pairingBootstrapBundlePath = path.join(rootDir, "src", "assets", "pairing-H3Cs7KHl.js");
const pairingPromptBundlePath = path.join(rootDir, "src", "assets", "PairingPrompt-Do4C6yFu.js");
const contentScriptBundlePath = path.join(rootDir, "src", "assets", "content-script.ts-Bwa5rY9t.js");
const serviceWorkerBundlePath = path.join(rootDir, "src", "assets", "service-worker.ts-H0DVM1LS.js");
const serviceWorkerRuntimePath = path.join(rootDir, "src", "background", "service-worker-runtime.js");
const detachedWindowRuntimePath = path.join(rootDir, "src", "background", "service-worker-detached-window-runtime.js");
const serviceWorkerLoaderPath = path.join(rootDir, "src", "background", "service-worker-loader.js");
const optionsBundlePath = path.join(rootDir, "src", "assets", "options-Hyb_OzME.js");
const offscreenPath = path.join(rootDir, "src", "offscreen", "offscreen.js");
const storageChunkPath = path.join(rootDir, "src", "assets", "useStorageState-hbwNMVUA.js");
const mapPath = path.join(rootDir, "DEOBFUSCATION_MAP.md");
const sessionRecoveryDetachedWindowDocPath = path.join(rootDir, "docs", "session-recovery-detached-window.md");
const toolExecutorIndicatorDocPath = path.join(rootDir, "docs", "tool-executor-indicator-chain.md");
const taskPlanPath = path.join(rootDir, "任务规格计划书.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeAnchorWhitespace(value) {
  return String(value)
    .replace(/\basync\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "async $1 =>")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "$1 =>")
    .replace(/\s+/g, " ")
    .replace(/\(\s+(?=[`"'A-Za-z_$[{])/g, "(")
    .replace(/,\s+(?=[)\]}])/g, "")
    .trim();
}

function assertIncludes(source, needle, label) {
  const exactMatch = source.includes(needle);
  const normalizedMatch = normalizeAnchorWhitespace(source).includes(
    normalizeAnchorWhitespace(needle),
  );
  assert.equal(
    exactMatch || normalizedMatch,
    true,
    `${label} should include ${needle}`,
  );
}

async function testCompactConversationCompactsWithoutTdz() {
  const source = read(sidepanelPath);
  const start = source.indexOf("class WX {");
  const end = source.indexOf("function qX", start);
  assert.notEqual(start, -1, "sidepanel bundle should include compact conversation service");
  assert.notEqual(end, -1, "compact conversation service should end before qX helper");

  const compactServiceSource = source.slice(start, end);
  const sandbox = {
    ZX: {
      calculateMetricsFromMessages(messages, maxOutputTokens, contextWindow) {
        assert.equal(Array.isArray(messages), true);
        assert.equal(maxOutputTokens, 4096);
        assert.equal(contextWindow, 200000);
        return {
          totalTokens: 1234,
        };
      },
    },
    _: async (key) => {
      assert.equal(key, "zepher_prompt");
      return {};
    },
  };
  const CompactConversationService = vm.runInNewContext(
    `${compactServiceSource}\nWX;`,
    sandbox,
  );

  let createMessagePayload = null;
  const service = new CompactConversationService(async (payload) => {
    createMessagePayload = payload;
    return {
      content: [
        {
          type: "text",
          text: "<analysis>checked</analysis>\n<summary>summary body</summary>",
        },
      ],
    };
  });

  const result = await service.compactConversation(
    [
      {
        role: "user",
        content: "hello",
      },
      {
        role: "assistant",
        content: "hi",
      },
    ],
    4096,
    true,
    200000,
  );

  assert.ok(createMessagePayload, "compact should reach createMessage");
  assert.equal(createMessagePayload.messages.length, 3);
  assert.equal(createMessagePayload.messages[0].role, "user");
  assert.equal(createMessagePayload.messages[1].role, "assistant");
  assert.equal(createMessagePayload.messages[2].role, "user");
  assert.equal(result.summaryMessage.isCompactSummary, true);
  assert.equal(result.messagesAfterCompacting.length, 2);
  assert.equal(result.messagesAfterCompacting[0].isCompactionMessage, true);
  assert.equal(result.preCompactTokenCount, 1234);
  assert.equal(Number.isFinite(result.postCompactTokenCount), true);
  assert.equal(Number.isFinite(result.tokensSaved), true);
  assert.equal(result.tokensSaved > 0, true);
}

async function testSidepanelContextUsageIndicatorAnchorsExist() {
  const source = read(sidepanelPath);
  const css = read(sidepanelInlineProviderCssPath);
  const enUs = JSON.parse(read(enUsMessagesPath));
  const zhCn = JSON.parse(read(zhCnMessagesPath));
  const zhTw = JSON.parse(read(zhTwMessagesPath));

  assertIncludes(source, "function __cpBuildContextUsageMetrics", "context usage indicator");
  assertIncludes(source, "function __cpContextUsageIndicator", "context usage indicator");
  assertIncludes(source, "\"data-testid\": \"context-usage-indicator\"", "context usage indicator");
  assertIncludes(source, "role: \"meter\"", "context usage indicator");
  assertIncludes(source, "id: \"cpContextUsageLabel\"", "context usage indicator");
  assertIncludes(source, "className: \"cp-context-usage-tooltip\"", "context usage indicator");
  assertIncludes(source, "const __cpDisplayContextWindow = __cpNormalizeContextWindow(n.contextWindow);", "context usage indicator display window");
  assertIncludes(source, "ZX.calculateProjectedMetricsFromMessages(Array.isArray(e) ? e : [], 0, __cpDisplayContextWindow)", "context usage indicator display window");
  assertIncludes(source, "contextWindow: t.contextWindow", "custom provider context usage config");
  assertIncludes(css, ".cp-context-usage-indicator", "context usage indicator styles");
  assertIncludes(css, ".cp-context-usage-tooltip", "context usage indicator styles");
  assertIncludes(css, ".cp-context-usage-indicator[data-tone=\"warning\"]", "context usage indicator styles");
  assertIncludes(css, ".cp-context-usage-indicator[data-tone=\"danger\"]", "context usage indicator styles");
  assert.equal(
    enUs.cpContextUsageLabel,
    "Context usage: {percent}% ({total} / {window})",
  );
  assert.equal(
    zhCn.cpContextUsageLabel,
    "上下文占用：{percent}%（{total} / {window}）",
  );
  assert.equal(
    zhTw.cpContextUsageLabel,
    "上下文佔用：{percent}%（{total} / {window}）",
  );
}

async function testSidepanelContextUsageIndicatorUsesConfiguredWindowForDisplay() {
  const source = read(sidepanelPath);
  const zxStart = source.indexOf("const ZX = new class {");
  const zxEnd = source.indexOf("function __cpFormatContextUsageTokenCount", zxStart);
  const normalizeStart = source.indexOf("function __cpNormalizeContextWindow");
  const normalizeEnd = source.indexOf("function __cpIsCustomProviderPrivacyMode", normalizeStart);
  const builderStart = source.indexOf("function __cpBuildContextUsageMetrics");
  const builderEnd = source.indexOf("function __cpContextUsageIndicator", builderStart);

  assert.notEqual(zxStart, -1, "sidepanel bundle should include token metrics helper");
  assert.notEqual(zxEnd, -1, "token metrics helper should end before context usage helpers");
  assert.notEqual(normalizeStart, -1, "sidepanel bundle should include context window normalizer");
  assert.notEqual(normalizeEnd, -1, "context window normalizer should end before provider mode helper");
  assert.notEqual(builderStart, -1, "sidepanel bundle should include context usage metrics builder");
  assert.notEqual(builderEnd, -1, "context usage metrics builder should end before indicator component");

  const { ZX, __cpBuildContextUsageMetrics } = vm.runInNewContext(
    `${source.slice(zxStart, zxEnd)}
${source.slice(normalizeStart, normalizeEnd)}
${source.slice(builderStart, builderEnd)}
({ ZX, __cpBuildContextUsageMetrics });`,
    {},
  );
  const messages = [
    {
      role: "user",
      content: "hello",
    },
  ];

  const rawProjectedMetrics = ZX.calculateProjectedMetricsFromMessages(messages, 10000, 40000);
  assert.equal(rawProjectedMetrics.contextWindow, 30000);

  const displayMetrics = __cpBuildContextUsageMetrics(messages, {
    contextWindow: 40000,
    maxOutputTokens: 10000,
  });
  assert.equal(displayMetrics.contextWindow, 40000);
}

async function testSidepanelStripsCustomToolTypeForCustomAnthropicProviders() {
  const source = read(sidepanelPath);
  const start = source.indexOf("function __cpNormalizeProviderFormat");
  const end = source.indexOf("function __cpNormalizeAnthropicClientBaseUrl", start);

  assert.notEqual(start, -1, "sidepanel bundle should include provider format normalizer");
  assert.notEqual(end, -1, "provider tool normalizer should end before anthropic base URL helper");
  assertIncludes(source, "const __cpToolsForProvider = __cpNormalizeCustomAnthropicToolsForProvider(D || [], __cpResolvedProviderConfig, __cpHasUsableProviderConfig);", "custom anthropic provider tool normalization");
  assertIncludes(source, "tools: __cpToolsForProvider", "custom anthropic provider tool normalization");

  const { __cpNormalizeCustomAnthropicToolsForProvider } = vm.runInNewContext(
    `${source.slice(start, end)}
({ __cpNormalizeCustomAnthropicToolsForProvider });`,
    {},
  );
  const customTool = {
    type: "custom",
    name: "turn_answer_start",
    description: "marker",
    input_schema: {
      type: "object",
      properties: {},
    },
  };
  const webSearchTool = {
    type: "web_search_20260209",
    name: "web_search",
  };
  const regularTool = {
    name: "computer",
    input_schema: {
      type: "object",
    },
  };
  const tools = [customTool, webSearchTool, regularTool];

  const normalized = __cpNormalizeCustomAnthropicToolsForProvider(
    tools,
    {
      format: "anthropic",
      baseUrl: "https://api.deepseek.example/v1/messages",
    },
    true,
  );

  assert.notEqual(normalized, tools);
  assert.equal("type" in normalized[0], false);
  assert.equal(normalized[0].name, "turn_answer_start");
  assert.equal(customTool.type, "custom");
  assert.equal(normalized[1], webSearchTool);
  assert.equal(normalized[2], regularTool);
  assert.equal(
    __cpNormalizeCustomAnthropicToolsForProvider(tools, { format: "openai_chat" }, true),
    tools,
  );
  assert.equal(
    __cpNormalizeCustomAnthropicToolsForProvider(tools, { format: "anthropic" }, false),
    tools,
  );
}

async function testSidepanelCompactionBlocksConcurrentSendAnchorsExist() {
  const source = read(sidepanelPath);

  assertIncludes(source, "isCompacting: __cpIsCompacting = false", "compaction send guard");
  assertIncludes(source, "const __cpInputDisabled = __cpSurfaceBlocked || __cpIsCompacting;", "compaction send guard");
  assertIncludes(source, "if ((n.trim() || t) && !y && !__cpIsCompacting && !s && !c && !__cpSurfaceBlocked) {", "compaction send guard");
  assertIncludes(source, "disabled: !n.trim() && r.length === 0 || r.some(e => e.error) || c || __cpSurfaceBlocked || __cpIsCompacting", "compaction send guard");
  assertIncludes(source, "isCompacting: kt", "compaction send guard");
  assertIncludes(source, "if (r.pendingContinue && !xt && !kt) {", "compaction send guard");
  assertIncludes(source, "if ((o.inputText.trim() || e) && !xt && !kt && (W || Z || n)) {", "compaction send guard");
  assertIncludes(source, "__cpPanelDebugLog(__cpIsDuplicateSend ? \"chat.send_duplicate_blocked\" : \"chat.send_busy_blocked\"", "compaction send guard");
  assertIncludes(source, "__cpPanelDebugLog(D ? \"chat.send_compacting_blocked\" : \"chat.send_loading_blocked\"", "compaction send guard");
  assertIncludes(source, "__cpPanelDebugLog(\"chat.retry_busy_blocked\"", "compaction send guard");
  assertIncludes(source, "if (!n && !__cpIsCompacting && (h || p) && c.trim()) {", "runtime input bridge compaction guard");
  assertIncludes(source, "if (!n && !__cpIsCompacting && (h || p) && e.trim() && m) {", "runtime input bridge compaction guard");
}

async function testSidepanelRetriesTransientStreamErrorsAnchorsExist() {
  const source = read(sidepanelPath);

  assertIncludes(source, "function __cpIsRetryableTransientChatError", "transient stream retry guard");
  assertIncludes(source, "t.startsWith(\"stream error\")", "transient stream retry guard");
  assertIncludes(source, "t.includes(\"internal_error\")", "transient stream retry guard");
  assertIncludes(source, "t.includes(\"received from peer\")", "transient stream retry guard");
  assertIncludes(source, "__cpPanelDebugLog(\"chat.retry_transient_error\"", "transient stream retry guard");
  assertIncludes(source, "} else if (__cpIsRetryableTransientChatError(n) && g + 1 < m) {", "transient stream retry guard");
}

async function testSidepanelAnchorsExist() {
  const source = read(sidepanelPath);
  assert.equal(
    source.includes("https://claude.ai/settings/usage"),
    false,
    "custom-provider errors must not redirect to Claude account usage settings"
  );
  assertIncludes(source, "const __cpPermissionPromptStore = t1;", "sidepanel bundle");
  assertIncludes(source, "const __cpHandlePermissionRequiredPrompt = async e => {", "sidepanel bundle");
  assertIncludes(source, "const __cpPermissionRetryHelper = OQ;", "sidepanel bundle");
  assertIncludes(source, "const __cpPermissionRetryingToolExecutor = Se;", "sidepanel bundle");
  assertIncludes(source, "const __cpDetachedWindowLockStorageKey = __CP_DETACHED_WINDOW_LOCKS_KEY;", "sidepanel bundle");
  assertIncludes(source, "const __cpPermissionApproveHandler = nn;", "sidepanel bundle");
  assertIncludes(source, "const __cpPermissionDenyHandler = sn;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPermissionPromptPromiseResolverRef = Ee;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelInlinePairingPromptState = Le;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelContractMessages = globalThis.__CP_CONTRACT__?.messages;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRuntimeMessageTypeExecuteTask = __cpSidepanelContractMessages?.EXECUTE_TASK ?? \"EXECUTE_TASK\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRuntimeMessageTypePopulateInputText = __cpSidepanelContractMessages?.POPULATE_INPUT_TEXT ?? \"POPULATE_INPUT_TEXT\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRuntimeMessageTypeStopAgent = __cpSidepanelContractMessages?.STOP_AGENT ?? \"STOP_AGENT\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRuntimeMessageTypeMainTabAckRequest = __cpSidepanelContractMessages?.MAIN_TAB_ACK_REQUEST ?? \"MAIN_TAB_ACK_REQUEST\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRuntimeMessageTypeMainTabAckResponse = __cpSidepanelContractMessages?.MAIN_TAB_ACK_RESPONSE ?? \"MAIN_TAB_ACK_RESPONSE\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRuntimeMessageTypePingSidepanel = __cpSidepanelContractMessages?.PING_SIDEPANEL ?? \"PING_SIDEPANEL\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelQueryKeySessionId = \"sessionId\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelQueryKeySkipPermissions = \"skipPermissions\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelQueryModeWindow = \"window\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypeSecondaryTabCheckMain = __cpSidepanelContractMessages?.SECONDARY_TAB_CHECK_MAIN ?? \"SECONDARY_TAB_CHECK_MAIN\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypeShowPermissionNotification = __cpSidepanelContractMessages?.SHOW_PERMISSION_NOTIFICATION ?? \"SHOW_PERMISSION_NOTIFICATION\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypeOpenOptionsWithTask = __cpSidepanelContractMessages?.OPEN_OPTIONS_WITH_TASK ?? \"OPEN_OPTIONS_WITH_TASK\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypePanelOpened = __cpSidepanelContractMessages?.PANEL_OPENED ?? \"PANEL_OPENED\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypePanelClosed = __cpSidepanelContractMessages?.PANEL_CLOSED ?? \"PANEL_CLOSED\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypePlayNotificationSound = __cpSidepanelContractMessages?.PLAY_NOTIFICATION_SOUND ?? \"PLAY_NOTIFICATION_SOUND\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypeResizeWindow = __cpSidepanelContractMessages?.resize_window ?? \"resize_window\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelChatOrchestratorComponent = CQ;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPromptsContract = globalThis.__CP_CONTRACT__?.prompts || {};", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelStorageKeySystemPrompt = __cpSidepanelPromptsContract.SYSTEM_PROMPT_STORAGE_KEY || \"chrome_ext_system_prompt\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelStorageKeySkipPermissionsSystemPrompt = __cpSidepanelPromptsContract.SKIP_PERMISSIONS_SYSTEM_PROMPT_STORAGE_KEY || \"chrome_ext_skip_perms_system_prompt\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelStorageKeyToolUsagePrompt = __cpSidepanelPromptsContract.TOOL_USAGE_PROMPT_STORAGE_KEY || \"chrome_ext_tool_usage_prompt\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelStorageKeyCustomToolPrompts = \"chrome_ext_custom_tool_prompts\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBootstrapQueryKeySkipPermissions = \"skipPermissions\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSessionHydrationLockRef = __cpHydratingSessionRef;", "sidepanel bundle");
  assertIncludes(source, "const __cpApplyDraftToCurrentScope = __cpApplySessionDraft;", "sidepanel bundle");
  assertIncludes(source, "const __cpApplySnapshotToCurrentScope = __cpApplySessionSnapshot;", "sidepanel bundle");
  assertIncludes(source, "const __cpSynchronizeExternalActiveSession = __cpSyncExternalActiveSession;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPairingContract = globalThis.__CP_CONTRACT__?.pairing || {};", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPairingQueryKeyRequestId = __cpSidepanelPairingQueryKeys.REQUEST_ID || \"request_id\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelOutgoingMessageTypePairingConfirmed = __cpSidepanelPairingContractMessages.pairing_confirmed ?? \"pairing_confirmed\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpBridgeContract = globalThis.__CP_CONTRACT__?.mcpBridge || {};", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpPermissionPopupProtocol = globalThis.__CP_MCP_PERMISSION_POPUP_PROTOCOL__ || {};", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpPermissionPromptStorageFields = __cpSidepanelMcpPermissionPopupProtocol.STORAGE_FIELDS || __cpSidepanelMcpBridgeContract.PERMISSION_PROMPT_STORAGE_FIELDS || {};", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpPermissionPopupQueryKeys = __cpSidepanelMcpPermissionPopupProtocol.QUERY_KEYS || __cpSidepanelMcpBridgeContract.PERMISSION_POPUP_QUERY_KEYS || {};", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpRuntimeMessageFields = __cpSidepanelMcpPermissionPopupProtocol.RESPONSE_FIELDS || __cpSidepanelMcpBridgeContract.RUNTIME_MESSAGE_FIELDS || {};", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPageQueryKeyMode = \"mode\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPageQueryKeyTabId = __cpSidepanelMcpPermissionPopupQueryKeys.TAB_ID || \"tabId\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPageQueryKeyMcpPermissionOnly = __cpSidepanelMcpPermissionPopupQueryKeys.PERMISSION_ONLY || \"mcpPermissionOnly\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPageQueryKeyRequestId = __cpSidepanelMcpPermissionPopupQueryKeys.REQUEST_ID || \"requestId\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPageQueryKeyModel = \"model\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPageMcpPromptStoragePrefix = __cpSidepanelMcpPermissionPopupProtocol.STORAGE_KEY_PREFIX || __cpSidepanelMcpBridgeContract.PERMISSION_PROMPT_STORAGE_KEY_PREFIX || \"mcp_prompt_\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpPromptStorageFieldPrompt = __cpSidepanelMcpPermissionPromptStorageFields.PROMPT || \"prompt\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpRuntimeMessageFieldRequestId = __cpSidepanelMcpRuntimeMessageFields.REQUEST_ID || \"requestId\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpRuntimeMessageFieldAllowed = __cpSidepanelMcpRuntimeMessageFields.ALLOWED || \"allowed\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpPermissionPopupBuildStorageKey = __cpSidepanelMcpPermissionPopupProtocol.buildPromptStorageKey || (e => `${__cpSidepanelPageMcpPromptStoragePrefix}${e}`);", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpPermissionPopupParseSearch = __cpSidepanelMcpPermissionPopupProtocol.parsePopupSearch || (e => {", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMcpPermissionPopupBuildResponse = __cpSidepanelMcpPermissionPopupProtocol.buildResponseMessage || ((e, t) => ({", "sidepanel bundle");
  assertIncludes(source, "type: globalThis.__CP_CONTRACT__?.messages?.MCP_PERMISSION_RESPONSE ?? \"MCP_PERMISSION_RESPONSE\",", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelPageWindowCloseDelayMs = __cpSidepanelMcpPermissionPopupProtocol.WINDOW_CLOSE_DELAY_MS || 50;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelStorageKeyPurlPrompt = \"chrome_ext_purl_prompt\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelStorageKeyVersionInfo = \"chrome_ext_version_info\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelStorageKeyAnnouncement = \"chrome_ext_announcement\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelEditorQueryKeyTabId = \"tabId\";", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBlockedTabsQueryKeyTabId = \"tabId\";", "sidepanel bundle");
  assertIncludes(source, "语义锚点：首屏模型 bootstrap 主链", "sidepanel bundle");
  assertIncludes(source, "语义锚点：这里是 sidepanel 的凭据刷新主入口", "sidepanel bundle");
  assertIncludes(source, "语义锚点：工具结果汇总与权限闸门", "sidepanel bundle");
  assertIncludes(source, "语义锚点：工具执行主循环里的 permission_required 分支。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：工具执行返回 `permission_required` 时，统一从这里转到 sidepanel 权限弹窗。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：当前 sidepanel 权限请求的 Promise resolve 挂点。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 页面 query 参数协议（主窗口/独立窗口、目标 tab、MCP 权限窗、模型注入）。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：MCP permission popup 的 query 消费分两段，tabId 走通用 sidepanel bootstrap，mcpPermissionOnly/requestId 走权限弹窗链。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 已打开时，优先在当前面板内消费 show_pairing_prompt，而不是退化为新开 pages/pairing.html。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：mcpPermissionOnly 独立窗口启动后，会从 storage 注入 prompt，并在用户决策后立即回包关闭。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：MCP permission popup consumer 挂载点 1，负责从 storage 注入 prompt 并绑定当前 requestId 的回包回调。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 的 MCP permission popup consumer 只消费 storage payload 里的 prompt；tabId/timestamp 不参与此处上下文恢复。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：MCP 权限窗回包字段 requestId/allowed 与 mcpBridge runtime 字段契约保持一致；真正关联 pending promise 的是 requestId，不是 tabId。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：MCP permission popup consumer 挂载点 2，复用同一份 storage prompt 与 requestId 回包逻辑给主面板状态层。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：主面板状态层同样只读取 prompt；storage payload 里的 tabId/timestamp 不在这里消费。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 主面板里的 MCP 权限弹窗复用同一组 requestId/allowed runtime 字段。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：mcpPermissionOnly 专用窗口会绕过普通 sidepanel 的权限提示 UI 分支，直接走 requestId 回包后关窗。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：Ee.current(true) 实际上会 resolve 当前 requestId 对应的 MCP permission pending promise。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：Ee.current(false) 会把当前 requestId 对应的 MCP permission pending promise 解析为拒绝。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：权限弹窗“拒绝”处理器。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：普通 sidepanel 权限链里，toolUseId 只用于一次性授权账本；", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 内联 pairing 弹层状态。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：PANEL_OPENED / PANEL_CLOSED 只表示 sidepanel 可见性生命周期，不等于 MCP permission response。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：PANEL_CLOSED 由 visibilitychange(hidden) 触发，只表示页面进入 hidden，不等价于 MCP permission 拒绝。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 内联 pairing 确认后，复用 pairing_confirmed 协议把 request_id/name 回传给 bridge。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 内联 pairing 的 dismiss 只关闭本地弹层；pairing_dismissed 仅由独立 pages/pairing.html 发出。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel <-> service worker / runtime.onMessage 消息协议", "sidepanel bundle");
  assertIncludes(source, "语义锚点：scope 切换后的 session hydrate 总入口", "sidepanel bundle");
  assertIncludes(source, "语义锚点：scope 切换后的 session hydrate 主流程", "sidepanel bundle");
  assertIncludes(source, "语义锚点：scope 绑定的 storage 变化同步桥", "sidepanel bundle");
  assertIncludes(source, "语义锚点：旧的 group/tab 历史恢复链已退役；跨重启只按 URL restore anchor 找回旧 scope。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：hydrate 恢复只把 URL anchor 当作跨重启的持久身份。", "sidepanel bundle");
  assertIncludes(source, "chromeGroupId/mainTabId 仍只服务当前运行期 live scope，不再参与历史 scope 的恢复匹配。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：detached window 启动时，旧 query tabId 失效后要回退到 restoreUrl/live targetTab，不能把历史 tabId 当持久身份。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：会话恢复主链从这里开始", "sidepanel bundle");
  assertIncludes(source, "语义锚点：scope hydrate 主流程", "sidepanel bundle");
  assertIncludes(source, "语义锚点：把草稿态恢复回当前 sidepanel 会话的入口。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：把持久化 snapshot 恢复回当前 sidepanel 会话的入口。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：外部 active session 变化后的统一同步入口。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：独立窗口打开前，会先把当前 scope 的 snapshot/draft 持久化", "sidepanel bundle");
  assertIncludes(source, "语义锚点：权限弹窗“允许”处理器", "sidepanel bundle");
  assertIncludes(source, "语义锚点：detached window 锁记录的归一化入口", "sidepanel bundle");
  assertIncludes(source, "语义锚点：plan 审批型 permission_required 对象的产出点", "sidepanel bundle");
  assertIncludes(source, "语义锚点：detached window 锁状态的 storage 同步监听", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel <-> service worker / runtime.onMessage 消息协议（ping/主副 tab ack/执行/填充/停止）。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 工具标题压缩器。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：read_page 标题只消费 filter，不在头部透出 depth/ref_id/max_chars。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：find 标题只展示截断后的 query，避免把长提示词直接灌进时间线头部。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：navigate 标题只展示截断后的 url，真正结果文本留在展开态内容里。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 的工具结果卡片 consumer。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：computer 结果卡片优先读 input.action；如果 result.content 里还能解析出 action，就用它兜底恢复展示分支。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：debug 展开态会把 click 坐标和 drag 路径叠加到最近一张 screenshot 上，帮助人工回放动作。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：timeline group 的缩略图优先显示工具结果自带图片；没有图片时才退回 lastScreenshot + 坐标覆盖层。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelTimelineRenderContext = _s;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelHasVisibleUserPrompt = s1;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelIsToolLifecycleMessage = r1;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBuildMessageGroups = i1;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：messageGroups 构造前，会先找“真实 user 文本”边界，避免把纯 tool_result / syntheticResult 误算成普通对话。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：tool_group 起始判定。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：messageGroups 构造入口。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：tool_group 扩张边界。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 的 tool_result 账本入口。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：tool_result 图片会顺手写入 screenshotsByTab。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：tool_use 渲染时会向后扫描同消息后的 user tool_result，按 tool_use_id 把结果补回当前卡片。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：TimelineGroup 构造器会把连续的 tool_use/tool_result 相邻块折成一个 group。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBuildToolRenderContext = _s;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMaintainBottomViewportSpacer = Ds;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：Ds(...) 维护滚动底部 extraSpace；会同时观测 lastAssistantMessage / lastHumanMessage / extras / chatInput。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：当消息长度回退时，renderContext 会整体重建，避免沿用旧的 tool_result / screenshot 增量账本。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelViewportScrollRefs = Ve;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：scrollRefs 聚合 lastHuman / lastAssistant / extras / extraSpace / chatInput 这五组 viewport ref。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderTimelineThumbnailWithPreview = mb;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderClickCoordinateOverlay = Fb;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderDragPathOverlay = zb;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderBrowserToolResultCard = Vb;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderBrowserToolTimelineCard = $b;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderMessageBlockDispatcher = Jw;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBuildAssistantTimelineGroups = Yw;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBuildActiveTimelinePhaseWindow = ik;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderActiveToolTimeline = ik;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderMessageGroups = ok;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderConversationScrollLayer = ak;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelTimelineGroupShell = Ul;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：timeline block renderer 读的是 tool_use 块，但展示时会去 toolResultsByToolId 账本里取对应结果。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：turn_answer_start 会把 assistant 输出切成“时间线阶段”和“最终回答阶段”两段。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：turn_answer_start 只是阶段分割标记，本身不渲染。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：Yw(...) 只处理单条 assistant 消息内部的 block 组装；tool_group 路径不会经过这里，而是走 ok -> ik。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：messageGroups 里的 tool_group 会被渲染成可折叠 TimelineGroup，里面再逐条消费 tool_use/tool_result。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：ok(...) 只消费已构造好的 messageGroups；tool_group 走 ik(...)，single 消息走 rk/sk，自己不做 assistant block 级分组。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：_s(...) 返回的是 sidepanel timeline renderContext 账本，负责 tool_result/screenshot 对账，不负责 messageGroups 构造。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：compact summary 不走普通消息 renderer，而是单独走 Conversation summary 折叠卡片。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：isLastMessage 只在当前块之后只剩 result/user 尾巴时为 true。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：showThumbs 只给 assistant 正文块；要么它已经到对话尾部，要么后面已经出现新的真实 user 提问。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：lastHumanMessage 绑定最后一个真实 user 组；lastAssistantMessage 绑定其后的 assistant 尾段容器。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：_s(...) 也会给 messageHistory 提供同一套 renderContext，保证历史块和当前时间线共用 tool_result/screenshot 对账。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：ak(...) 负责把 messageHistory -> compact divider -> 当前 messageGroups -> extras/footer/chatInput 拼成同一滚动层。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：extras 属于滚动层内的底部附加区；children/chatInput/footer 作为 sticky 底栏拼在 messageGroups 之后。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：底部 thinking/compacting 状态只在“仍在跑、没有 permission prompt、且最后一组没有展开 timeline”时显示。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 当前消息会先折成 messageGroups，再交给 ok/ak 做 tool_group 与普通消息分流渲染。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBuildCurrentTurnMessageGroups = At;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderChatInputFooter = YY;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelProvideComposerShortcutMenuState = FY;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderInputAnchoredShortcutMenu = HY;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderComposerCommandMenu = BY;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelBuildSlashShortcutSuggestionConfig = GY;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelSlashShortcutSuggestionExtension = KY;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：YY(...) 是 sidepanel 底部 sticky chatInput/footer 根组件；负责 banner、输入框、附件与发送控制，不参与 messageGroups 渲染。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：chatInputContainerRef 真正挂在输入卡片容器上，供 viewport extraSpace 计算与 sticky 底栏定位复用。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：YY(...) 作为 ak(children) 注入 sticky 底栏；它本身不参与 messageGroups 渲染，只负责底部输入区。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderScrollToBottomGuard = BR;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelAutoscrollControllerRef = Pe;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelMessageBottomSentinelRef = ze;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：BR(...) 是底部输入区的“滚动到底部”守卫；依赖 sentinelElement 与 autoscrollRef 判断按钮显隐。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：activeBanner 复用输入区顶部 banner 槽；eligibility/error/refusal/messageLimit/highRisk/notification/announcement 都从这里分流。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：Wx(...) 是可折叠的状态 pill 头部；负责 working 文案、caret 展开和 summary suffix，不决定时间线窗口裁剪策略。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderTimelineStatusPillHeader = Wx;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：Kx(...) 是 sidepanel 最后一组工具时间线的状态 pill 容器。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelRenderTimelineStatusWindow = Kx;", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelTimelineStatusPill = Kx;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：turnIsOver 命中过一次后，会在当前非空时间线里锁存；只有 blocks 清空才重置回“可继续流式追加”。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：working status 可见条件。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：fadeOnStatus 会把状态文案变化当成时间线阶段切点。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：切点记录的是状态变化当下的 blocks.length；变化前旧块归前一阶段，变化后新块归当前阶段。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：collapse 模式只保留“等待输入工具 + 最近 N 个非 thinking 工具”；手动展开后才看全量。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：collapse 与 fadeOnStatus 是两套互斥窗口策略；当前 ik 链固定不走 collapse。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：fadeOnStatus 模式下，状态文案一旦变化，就只展示最近一次状态切点之后的新阶段 blocks。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：可见时间线窗口收缩时，会把被移出的块暂存到退出缓冲区，给 fade/collapse 动画一个短暂收尾。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：退出缓冲区只服务窗口收缩动画，不参与新的可见窗口计算。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：onStatusDisplayVisibilityChange 只在 live working status 真正显示时通知父层。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：ik(...) 里的 turnIsOver 判定。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：有 timelineBlocks 时，foundTurnAnswerStart 还不够收口；必须等 final text / later result-user / completion signal。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：timeline statusText 优先吃 currentStatusProp，没有外部状态时才回退默认 Working。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：ik(...) 固定把 Kx 切到 fadeOnStatus；状态文案变化会把最后一组时间线切成新的可见阶段。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：当前活跃执行时间线固定走 fadeOnStatus，不使用 collapse，也不传 actionedToolIds/isToolAwaitingInput/streamingMinHeight。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：等待输入工具判定。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：等待输入工具保活链。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：streamingMinHeight 只在“未展开、当前窗口里没有等待输入工具、且还有可见 blocks”时生效。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：它只修饰最后一个可见 block；当前 ik 链没有传这个参数。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：状态 pill 文案切换。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：ik(...) 当前不会额外传 actionedToolIds / isToolAwaitingInput。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：PING_SIDEPANEL 只是活性探针，收到后立即回 success + 当前 tabId。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：MAIN_TAB_ACK_REQUEST 只让主 tab 回 ACK；secondary tab 收到但不匹配时直接忽略。", "sidepanel bundle");
  assertIncludes(source, "const __cpSidepanelConsumeRuntimeInputBridgeMessage = a;", "sidepanel bundle");
  assertIncludes(source, "语义锚点：sidepanel 的输入桥 runtime listener；真正消费 STOP_AGENT / EXECUTE_TASK / POPULATE_INPUT_TEXT。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：STOP_AGENT 先按 targetTabId 过滤；只有命中当前 tab 的 sidepanel 才会走 cancel + permission deny 收口。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：EXECUTE_TASK 会先按 windowSessionId / targetTabId 过滤目标 sidepanel，再决定是否真正落 prompt。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：EXECUTE_TASK 是“过滤后直接发送”分支，不灌草稿、不注入附件/模型。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：scheduled task 只是给 prompt 加任务名前缀；真正发送仍复用普通 sendMessage 主链。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：POPULATE_INPUT_TEXT 负责把 prompt / permissionMode / selectedModel / attachments 一次性灌进 sidepanel 草稿态。", "sidepanel bundle");
  assertIncludes(source, "它本身不按 tabId/sessionId 过滤；真正的面板选路发生在 service-worker 打开目标 panel 和 EXECUTE_TASK 分支里。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：POPULATE_INPUT_TEXT 是“草稿灌入 + 条件满足时延迟自动发送”分支；pendingPrompt 也从这里建立。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：带附件的 populate 走“先注入草稿/附件，再延迟触发发送”，避免 UI 状态还没准备好就开跑。", "sidepanel bundle");
  assertIncludes(source, "语义锚点：浏览器控制权限放行后，如果还有 pendingPrompt，会补发一次 sendMessage。", "sidepanel bundle");
}

async function testPermissionManagerAnchorsExist() {
  const source = read(permissionManagerPath);
  assertIncludes(source, "const __cpPermissionModesWithRelaxedPrompts = Sy;", "PermissionManager bundle");
  assertIncludes(source, "const __cpDefaultPlanApprovalMode = Ty;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionScopeTypesEnum = vy;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionScopeTypeNetloc = \"netloc\";", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionActionAllow = by.ALLOW;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionDurationOnce = wy.ONCE;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionStoragePayloadPermissionsField = \"permissions\";", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionCacheKeyNoTool = \"no-tool\";", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionModeFollowPlan = \"follow_a_plan\";", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionStoragePersistenceKey = B.PERMISSION_STORAGE;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerClass = xy;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerStorageKeysEnum = B;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerStorageKeyUpdateAvailable = B.UPDATE_AVAILABLE;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerCheckPermission = xy.prototype.checkPermission;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerNormalizeDomain = xy.prototype.normalizeDomain;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerFindApplicablePermission = xy.prototype.findApplicablePermission;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerIsLocalhostUrl = xy.prototype.isLocalhostUrl;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerSetupStorageListener = xy.prototype.setupStorageListener;", "PermissionManager bundle");
  assertIncludes(source, "const __cpPermissionManagerSetTurnApprovedDomains = xy.prototype.setTurnApprovedDomains;", "PermissionManager bundle");
  assertIncludes(source, "语义锚点：follow_a_plan 批准后的域名白名单入口", "PermissionManager bundle");
  assertIncludes(source, "turn-approved domain 生效时，计划外域名会被直接挡住", "PermissionManager bundle");
  assertIncludes(source, "域间跳转权限和普通 netloc 权限是两套规则", "PermissionManager bundle");
  assertIncludes(source, "语义锚点：把 URL / host / IPv6 / host:port 统一归一化为可比较的域名字符串。", "PermissionManager bundle");
  assertIncludes(source, "语义锚点：普通站点权限命中链，先查一次性 toolUseId，再查持久 ALLOW/DENY 规则。", "PermissionManager bundle");
  assertIncludes(source, "语义锚点：netloc 匹配支持 *.example.com 通配和 www. 归一化比较。", "PermissionManager bundle");
  assertIncludes(source, "语义锚点：MCP localhost 旁路判定使用的 hostname 归类入口。", "PermissionManager bundle");
  assertIncludes(source, "语义锚点：本地存储变化后，重新加载权限并清空匹配缓存", "PermissionManager bundle");
}

async function testStorageChunkAnchorExists() {
  const source = read(storageChunkPath);
  assertIncludes(source, "const __cpSidepanelStorageSupportChunk = true;", "useStorageState bundle");
  assertIncludes(source, "const __cpNormalizeCookieDomain = S;", "useStorageState bundle");
  assertIncludes(source, "const __cpEnumerateParentCookieDomains = T;", "useStorageState bundle");
  assertIncludes(source, "const __cpCookieRemovalExpiresAt = A;", "useStorageState bundle");
  assertIncludes(source, "const __cpModelsConfigStorageKey = globalThis.__CP_CONTRACT__?.models?.CONFIG_STORAGE_KEY || \"chrome_ext_models\";", "useStorageState bundle");
  assertIncludes(source, "const __cpModelsConfigReader = xU;", "useStorageState bundle");
  assertIncludes(source, "const __cpModelsConfigDefaultValue = xUDefaultModelConfig;", "useStorageState bundle");
  assertIncludes(source, "const __cpResolveModelDisplayName = EU;", "useStorageState bundle");
  assertIncludes(source, "const __cpCrossTabLocalStorageSyncKeyPrefix = \"LSS-\";", "useStorageState bundle");
  assertIncludes(source, "const __cpCrossTabLocalStorageEventName = \"storage\";", "useStorageState bundle");
  assertIncludes(source, "const __cpCrossTabLocalStoragePayloadFieldValue = \"value\";", "useStorageState bundle");
  assertIncludes(source, "const __cpCrossTabLocalStoragePayloadFieldTabId = \"tabId\";", "useStorageState bundle");
  assertIncludes(source, "const __cpCrossTabLocalStoragePayloadFieldTimestamp = \"timestamp\";", "useStorageState bundle");
  assertIncludes(source, "const __cpUseLocalStorageStateHook = V;", "useStorageState bundle");
  assertIncludes(source, "const __cpCookieDomainStorageBridge = O;", "useStorageState bundle");
  assertIncludes(source, "const __cpCookieStorageAdapter = O;", "useStorageState bundle");
  assertIncludes(source, "const __cpWebStorageKeyEnum = H;", "useStorageState bundle");
  assertIncludes(source, "const __cpCrossTabLocalStorageSyncHook = U;", "useStorageState bundle");
  assertIncludes(source, "const __cpOptionsAccountCustomProviderStorageKey = \"customProviderConfig\";", "useStorageState bundle");
  assertIncludes(source, "const __cpOptionsAccountProfileApiPath = \"/api/oauth/profile\";", "useStorageState bundle");
  assertIncludes(source, "语义锚点：跨 tab 的 localStorage 同步桥，sidepanel 如果依赖本地持久态会经过这里。", "useStorageState bundle");
  assertIncludes(source, "语义锚点：options / sidepanel 鉴权探测时使用的 profile query", "useStorageState bundle");
  assertIncludes(source, "语义锚点：options 页账号态 bootstrap", "useStorageState bundle");
}

async function testMcpPermissionsAnchorsExist() {
  const source = read(mcpPermissionsPath);
  assertIncludes(source, "const __cpDebugContract = globalThis.__CP_CONTRACT__?.debug || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeKeepaliveAlarmName = Ea;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeKeepalivePingIntervalMs = 20000;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeDisplayNameStorageKey = \"bridgeDisplayName\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeDeviceIdStorageKey = \"bridgeDeviceId\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeWebSocketUrlPrefix = \"wss://bridge.claudeusercontent.com/chrome/\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketMessageTypeConnect = \"connect\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketMessageTypePaired = \"paired\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketFieldRequestId = \"request_id\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketFieldClientType = \"client_type\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketFieldToolUseId = \"tool_use_id\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeClientTypeChromeExtension = \"chrome-extension\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeDefaultPeerClientType = \"desktop\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpGifCreatorToolName = \"gif_creator\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpGifCreatorActionExport = \"export\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpGifCreatorOffscreenMessageTypeGenerateGif = __cpGifCreatorContractMessages.GENERATE_GIF || \"GENERATE_GIF\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeEnsureConnected = Pa;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSend = La;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeNotify = Oa;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgePendingPermissionResponseLedger = Ca;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeContractMessages = globalThis.__CP_CONTRACT__?.messages || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeContract = globalThis.__CP_CONTRACT__?.mcpBridge || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupProtocol = globalThis.__CP_MCP_PERMISSION_POPUP_PROTOCOL__ || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeRuntimeMessageFields = __cpMcpPermissionPopupProtocol.RESPONSE_FIELDS || __cpMcpBridgeContract.RUNTIME_MESSAGE_FIELDS || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPromptStorageFields = __cpMcpPermissionPopupProtocol.STORAGE_FIELDS || __cpMcpBridgeContract.PERMISSION_PROMPT_STORAGE_FIELDS || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupQueryKeys = __cpMcpPermissionPopupProtocol.QUERY_KEYS || __cpMcpBridgeContract.PERMISSION_POPUP_QUERY_KEYS || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpPairingContract = globalThis.__CP_CONTRACT__?.pairing || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpPairingQueryKeys = __cpPairingContract.QUERY_KEYS || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpAgentIndicatorContract = globalThis.__CP_CONTRACT__?.agentIndicator || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpAgentIndicatorRuntimeMessageTypes = __cpAgentIndicatorContract.RUNTIME_MESSAGE_TYPES || {};", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeRuntimeMessageTypePairingConfirmed = __cpMcpBridgeContractMessages.pairing_confirmed || \"pairing_confirmed\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeRuntimeMessageTypePairingDismissed = __cpMcpBridgeContractMessages.pairing_dismissed || \"pairing_dismissed\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeRuntimeMessageTypeShowPairingPrompt = __cpMcpBridgeContractMessages.show_pairing_prompt || \"show_pairing_prompt\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpSidepanelRuntimeMessageTypeExecuteTask = __cpMcpBridgeContractMessages.EXECUTE_TASK || \"EXECUTE_TASK\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeRuntimeMessageTypeMcpPermissionResponse = __cpMcpBridgeContractMessages.MCP_PERMISSION_RESPONSE || \"MCP_PERMISSION_RESPONSE\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeRuntimeMessageFieldRequestId = __cpMcpBridgeRuntimeMessageFields.REQUEST_ID || \"requestId\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeRuntimeMessageFieldAllowed = __cpMcpBridgeRuntimeMessageFields.ALLOWED || \"allowed\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPromptStorageFieldPrompt = __cpMcpPermissionPromptStorageFields.PROMPT || \"prompt\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketMessageTypeToolCall = __cpMcpBridgeContractMessages.tool_call || \"tool_call\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketMessageTypeToolResult = __cpMcpBridgeContractMessages.tool_result || \"tool_result\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketMessageTypePairingRequest = __cpMcpBridgeContractMessages.pairing_request || \"pairing_request\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgeSocketMessageTypePermissionResponse = __cpMcpBridgeContractMessages.permission_response || \"permission_response\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpShortcutsExecuteQueryKeyMode = \"mode\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPromptStorageKeyPrefix = __cpMcpPermissionPopupProtocol.STORAGE_KEY_PREFIX || __cpMcpBridgeContract.PERMISSION_PROMPT_STORAGE_KEY_PREFIX || \"mcp_prompt_\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupBuildStorageKey = __cpMcpPermissionPopupProtocol.buildPromptStorageKey || (e => `${__cpMcpPermissionPromptStorageKeyPrefix}${e}`);", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupCreateStorageEntry = __cpMcpPermissionPopupProtocol.createPromptStorageEntry || ((e, t, r = Date.now()) => ({", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBridgePairingQueryKeyRequestId = __cpPairingQueryKeys.REQUEST_ID || \"request_id\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupQueryKeyTabId = __cpMcpPermissionPopupQueryKeys.TAB_ID || \"tabId\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupCreateUrl =\n  __cpMcpPermissionPopupProtocol.buildPopupUrl ||", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupCreateWindowOptions = __cpMcpPermissionPopupProtocol.createPopupWindowOptions || ((e, t) => ({", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPermissionPopupResponseTimeoutMs = __cpMcpPermissionPopupProtocol.RESPONSE_TIMEOUT_MS || __cpMcpBridgeContract.PERMISSION_POPUP_RESPONSE_TIMEOUT_MS || 30000;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpAgentIndicatorRuntimeMessageTypeShowAgentIndicators = __cpAgentIndicatorRuntimeMessageTypes.SHOW_AGENT_INDICATORS || \"SHOW_AGENT_INDICATORS\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpAgentIndicatorRuntimeMessageTypeHideStaticIndicator = __cpAgentIndicatorRuntimeMessageTypes.HIDE_STATIC_INDICATOR || \"HIDE_STATIC_INDICATOR\";", "mcpPermissions bundle");
  assertIncludes(source, "const __cpShortcutsExecuteStartInPopupWindow = Wa;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpToolErrorResultFactory = bn;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpToolExecutor = wn;", "mcpPermissions bundle");
  assertIncludes(source, "const Xa = [\"tabs_context_mcp\", \"tabs_create_mcp\", \"tabs_close_mcp\"];", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpTablessToolNames = [\n  \"update_plan\",\n  \"turn_answer_start\",\n  \"shortcuts_list\",\n];", "mcpPermissions bundle");
  assertIncludes(source, "if (\n          !this.context.tabId &&\n          !Xa.includes(e) &&\n          !__cpMcpTablessToolNames.includes(e)\n        ) {", "mcpPermissions bundle");
  assertIncludes(source, "name: \"tabs_context_mcp\",", "mcpPermissions bundle");
  assertIncludes(source, "CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist.", "mcpPermissions bundle");
  assertIncludes(source, "name: \"tabs_create_mcp\",", "mcpPermissions bundle");
  assertIncludes(source, "description: \"Creates a new empty tab in the MCP tab group.\"", "mcpPermissions bundle");
  assertIncludes(source, "No tab group exists for this session yet. Call tabs_context_mcp with createIfEmpty: true first — that creates this session's group and returns its tab IDs.", "mcpPermissions bundle");
  assertIncludes(source, "name: \"tabs_close_mcp\",", "mcpPermissions bundle");
  assertIncludes(source, "If the closed tab is the last one in the group, Chrome auto-removes the group.", "mcpPermissions bundle");
  assertIncludes(source, "Tab ${o} is not in this session's tab group. Only tabs visible to this session can be closed. Call tabs_context_mcp to see closable tabs.", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：tabId 是实际执行目标键，只从 tool args 进入后台工具链；", "mcpPermissions bundle");
  assertIncludes(source, "toolUseId 继续负责外层 tool_call/tool_result 归属，requestId 仍留给权限握手。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：tool executor 上下文对象：", "mcpPermissions bundle");
  assertIncludes(source, "toolUseId 是本次工具调用/结果的稳定归属键；tabId/tabGroupId/sessionScope 只负责选择执行环境。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：GIF 录制/导出主状态机（start/stop/export/clear）。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：GIF 导出上传前的 permission_required 产出点。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：GIF 导出后的页面内拖拽上传分支（DataTransfer + dragenter/dragover/drop）。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge 连接握手 payload（connect / client_type / device_id / display_name）", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge 入站消息分发（paired/waiting/ping/tool_call/pairing_request/permission_response）", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：MCP Bridge 连接与消息发送入口", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge runtime listener 当前只显式消费 pairing_confirmed；pairing_dismissed 未在此处回 bridge，表现为用户取消配对的协议级 no-op。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge permission_request 待回包账本（key=requestId -> { resolve }）。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：requestId 只负责 bridge permission_request/permission_response 对账；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：requestId 是 bridge permission_request/permission_response 的对账键；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge 断连/重连时，未完成的 permission_request 一律按拒绝收口，避免 requestId 账本泄漏。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：permission prompt storage payload 里的 tabId/timestamp 主要给 background 账本与清理链使用；sidepanel consumer 实际只读 prompt。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：这里把 requestId 绑定到 pending permission promise；sidepanel 的 requestId/allowed 回包会 resolve 它。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：popup 权限链的 requestId 是 background <-> sidepanel 的唯一关联键；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：收到 runtime MCP_PERMISSION_RESPONSE 后，background 会主动关闭 popup；手动关闭则留给 timeout 兜底。", "mcpPermissions bundle");
  assertIncludes(source, "pairing_dismissed 属于配对链 no-op，不会触发这里的 pending permission promise。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：popup 创建失败按拒绝处理，避免 pending promise 长时间悬挂。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：手动关闭 permission popup 不会立即回包；background 侧最终由 30s timeout 兜底拒绝。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：agent indicator 内容脚本显隐消息类型（bridge / sidepanel 都会跨 tab 发送）", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：shortcuts_execute 通过新 sidepanel 窗口发送 EXECUTE_TASK 启动任务", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge 权限请求握手（permission_request -> permission_response）", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：MCP tool_call 的标准错误返回结构（tool_result.error 的兼容格式）", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：MCP 工具执行主入口", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge tool_call -> tool executor 交接点：", "mcpPermissions bundle");
  assertIncludes(source, "这里把 tabId/tabGroupId/sessionScope 作为执行上下文传给 wn，而 toolUseId 保留给最终 tool_result 对账。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：tool_result 外层回包会复用原始 toolUseId；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：bridge tool_call 异常收口为标准 error tool_result；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：内层 tool_use id 与外层 toolUseId 分工：", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：tool executor 的标准 tool_result 封装器：", "mcpPermissions bundle");
  assertIncludes(source, "tool_use_id 对应外层 tool_call id，错误统一降成 is_error + content，不引入 requestId。", "mcpPermissions bundle");
  assertIncludes(source, "普通工具的 permission_required sentinel 统一形状是 { type, tool, url, toolUseId, actionData? }；", "mcpPermissions bundle");
  assertIncludes(source, "actionData 只回填 permission popup 预览所需的最小字段，不是完整执行上下文。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：handleToolCall 返回的 permission_required 仍是 sentinel；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：tool executor permission_required 重试链：", "mcpPermissions bundle");
  assertIncludes(source, "先等 permission handler resolve，再按 toolUseId 写一次性授权，最后重跑原始 tool_call。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：update_plan 在 permission approve 后直接返回“plan approved”文本，", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：计划审批 permission 链可以在无 tab 场景下运行；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：PLAN_APPROVAL 这类 tab-less 审批允许 tabId 为空；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：tab 编排阶段。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：执行前的 indicator/debugger 挂载链。", "mcpPermissions bundle");
  assertIncludes(source, "tabs_context_mcp 首次建组前若还没有真实 tab，上面的 no-tab 例外会先放行，但不会提前点亮 indicator。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：真正执行工具的 provider 主调用。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：执行结束后的 indicator/completion prefix 收口链。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：强制移除 indicator/prefix 的兜底清理入口。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：service worker 重启或恢复时，批量清理遗留的运行态前缀。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：computer 是浏览器前台交互总入口。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：computer 的 action -> permission 映射与 wait 例外。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：permission_required 的 actionData 回填边界。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：javascript_tool 的 permission_required 只透出脚本文本。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：form_input / upload_image 这类 DOM 命中型 permission_required，", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：find / get_page_text / read_page / read_console_messages / read_network_requests / navigate", "mcpPermissions bundle");
  assertIncludes(source, "它复用 upload_image 家族，但 permission popup 这里只需要 coordinate 预览，不携带 gif 二进制。", "mcpPermissions bundle");
  assertIncludes(source, "back / forward 复用浏览器历史栈，不会重新走域名 permission gate。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：get_page_text / read_page 共用“先 permission，后 hideIndicator/read DOM”的读页模板。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：upload_image 先过目标域 permission，再做原始 URL 安全校验和 message image 解析。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：A(...) 是域权限放行后的同域重校验闸门。", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpPreExecuteSameDomainGuard = A;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpBeforeunloadNavigationGuard = Me;", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：M 是 screenshot viewport context 账本。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：setContext 只登记缩放所需的 4 个尺寸字段。", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpScreenshotViewportContextLedger = M;", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：clearContext / clearAllContexts 是预留的 screenshot context 清理接口。", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpClearScreenshotViewportContextForTab = e => M.clearContext(e);", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpClearAllScreenshotViewportContexts = () => M.clearAllContexts();", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：click / double_click / triple_click 属于“定位/指针动作”家族。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：type / key / javascript_tool 属于“页面级动作”家族。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：file upload / form_input / upload_image / GIF export upload 属于“表单/上传动作”家族。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：form_input 和 file/upload 家族共用同一层 A(...) 同域 guard；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：ref lookup 先从 __claudeElementMap 解引用；元素已失效或脱离文档时会顺手清理陈旧 ref。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：ref 解析命中后，会先把元素滚到可视区中心，再取 bounding rect 中心点坐标。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：ref_lookup_ms 记录一次 ref -> 中心点坐标解析的总耗时。", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpScaleScreenshotCoordinatesToViewport = ne;", "mcpPermissions bundle");
  assertIncludes(source, "const __cpMcpResolveRefToViewportCenter = me;", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：click(ref) 会先把 ref 解析成中心点坐标，再进入 A(...) guard。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：click(coordinate) 会先按截图上下文做坐标缩放，再进入 A(...) guard。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：drag 是纯 coordinate 路径；start/end 两端都会先按截图上下文缩放，再进入 A(...) guard。", "mcpPermissions bundle");
  assertIncludes(source, "顺序上，scroll_to 会先过 A(...) guard，再去解析 ref / scrollIntoView。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：hover(ref) 会先把 ref 解析成中心点坐标，再进入 A(...) guard。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：hover(coordinate) 会先按截图上下文做坐标缩放，再进入 A(...) guard。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：scroll_to / hover 与 read_page/find ref 链。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：统一 tabContext。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：click helper 会先临时隐藏 indicator，再走 mouseMoved -> mousePressed -> mouseReleased。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：screenshot 先探测 viewport，再走 CDP captureScreenshot；超限时回退内容脚本压缩链。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：screenshot 会把 viewport/screenshot 尺寸写进上下文，供后续坐标动作做缩放换算。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：scroll 也会复用 screenshot context 做坐标缩放；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：scroll 优先尝试 CDP scrollWheel；无效或超时再回退 DOM/事件注入滚动。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：scroll 成功后会尽量补一张新截图，给后续模型继续定位。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：left_click_drag 复用截图上下文做坐标换算，再串成完整拖拽事件序列。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：zoom 只消费最近一次 screenshot context，不会回写或清理这本尺寸账本。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：zoom 会校验 region 边界，并用 CDP clip 截取局部高分辨率截图。", "mcpPermissions bundle");
  assertIncludes(source, "它不走 me(ref)->坐标 helper，而是在页面上下文里直接验活 __claudeElementMap 的 WeakRef。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：upload_image(ref) 不走 me(ref)->坐标 helper，而是在页面上下文里直接验活 __claudeElementMap。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：find 的 accessibility tree -> createAnthropicMessage(modelClass=small_fast) -> provider 文本提取。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：find 的 query 裁剪。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：provider 文本提取兼容层。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：find 只消费 provider 文本里的 ref_X 行，不会回到 __claudeElementMap 验活。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：find 这里只解析 provider 回传的 `ref | role | name | type | reason` 文本格式；", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：navigate 的 Me beforeunload / unsaved changes(force)。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：navigate 的 back / forward / 普通 URL 三路。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：普通 URL 补 https + blocklist + permission。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：read_page 的 hideIndicatorForToolUse。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：read_page 的 main frame 失败转 allFrames。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：read_page 的 finally restoreIndicatorAfterToolUse。", "mcpPermissions bundle");
  assertIncludes(source, "语义锚点：DOMAIN_TRANSITION 专用 permission_required producer。", "mcpPermissions bundle");
  assertIncludes(source, "const __cpDomainTransitionPermissionRequiredFactory = rn;", "mcpPermissions bundle");
}

async function testServiceWorkerBundleAnchorsExist() {
  const source = read(serviceWorkerBundlePath);
  assertIncludes(source, "const __cpNativeMessagingContract = globalThis.__CP_CONTRACT__?.nativeMessaging || {};", "service-worker bundle");
  assertIncludes(source, "const __cpNativeMessagingPermission = __cpNativeMessagingContract.PERMISSION || \"nativeMessaging\";", "service-worker bundle");
  assertIncludes(source, "const __cpNativeHostDesktopName = __cpNativeMessagingContract.HOST_DESKTOP || \"com.anthropic.claude_browser_extension\";", "service-worker bundle");
  assertIncludes(source, "const __cpNativeHostClaudeCodeName = __cpNativeMessagingContract.HOST_CLAUDE_CODE || \"com.anthropic.claude_code_browser_extension\";", "service-worker bundle");
  assertIncludes(source, "const __cpAlarmPrefixPrompt = \"prompt_\";", "service-worker bundle");
  assertIncludes(source, "const __cpAlarmPrefixRetry = \"retry_\";", "service-worker bundle");
  assertIncludes(source, "const __cpContractMessages = globalThis.__CP_CONTRACT__?.messages || {};", "service-worker bundle");
  assertIncludes(source, "const __cpAgentIndicatorContract = globalThis.__CP_CONTRACT__?.agentIndicator || {};", "service-worker bundle");
  assertIncludes(source, "const __cpBackgroundMessageTypeOpenSidePanel = __cpContractMessages.open_side_panel || \"open_side_panel\";", "service-worker bundle");
  assertIncludes(source, "const __cpBackgroundMessageTypePopulateInputText = __cpContractMessages.POPULATE_INPUT_TEXT || \"POPULATE_INPUT_TEXT\";", "service-worker bundle");
  assertIncludes(source, "const __cpBackgroundMessageTypeExecuteTask = __cpContractMessages.EXECUTE_TASK || \"EXECUTE_TASK\";", "service-worker bundle");
  assertIncludes(source, "const __cpBackgroundMessageTypeOffscreenPlaySound = __cpContractMessages.OFFSCREEN_PLAY_SOUND || \"OFFSCREEN_PLAY_SOUND\";", "service-worker bundle");
  assertIncludes(source, "const __cpAgentIndicatorCurrentTabSentinel = __cpAgentIndicatorContract.CURRENT_TAB_SENTINEL || \"CURRENT_TAB\";", "service-worker bundle");
  assertIncludes(source, "const __cpStaticIndicatorAckPayloadFieldSecondaryTabId = \"secondaryTabId\";", "service-worker bundle");
  assertIncludes(source, "const __cpStaticIndicatorAckCacheTtlMs = 3000;", "service-worker bundle");
  assertIncludes(source, "const __cpBackgroundMessageTypeLogout = \"logout\";", "service-worker bundle");
  assertIncludes(source, "const __cpExternalMessageTypeOauthRedirect = \"oauth_redirect\";", "service-worker bundle");
  assertIncludes(source, "const __cpTrustedExternalOriginClaudeAi = \"https://claude.ai\";", "service-worker bundle");
  assertIncludes(source, "const __cpTrustedExternalOrigins = [__cpTrustedExternalOriginClaudeAi];", "service-worker bundle");
  assertIncludes(source, "const __cpNativePortNotificationJsonRpcVersion = \"2.0\";", "service-worker bundle");
  assertIncludes(source, "const __cpChromeNotificationTypeBasic = \"basic\";", "service-worker bundle");
  assertIncludes(source, "const __cpScheduledTaskFallbackName = \"Scheduled Task\";", "service-worker bundle");
  assertIncludes(source, "const __cpScheduledTaskExecutionTypeManual = \"manual\";", "service-worker bundle");
  assertIncludes(source, "const __cpSwitchToMainTabErrorNoMainTab = \"No main tab found\";", "service-worker bundle");
  assertIncludes(source, "const __cpExternalBridgeErrorUntrustedOrigin = \"Untrusted origin\";", "service-worker bundle");
  assertIncludes(source, "原生宿主桥初始化入口", "service-worker bundle");
  assertIncludes(source, "原生宿主消息分发：工具执行、连接状态同步、状态查询回包。", "service-worker bundle");
  assertIncludes(source, "原生宿主 tool_response 回包桥：把后台工具结果 / 用户拒绝统一包装回 native host。", "service-worker bundle");
  assertIncludes(source, "网络请求头注入入口：统一给外部 API 请求附加扩展版 User-Agent。", "service-worker bundle");
  assertIncludes(source, "clau.de deep-link / 扩展路由桥：", "service-worker bundle");
  assertIncludes(source, "permissions 深链接：跳到 options#permissions，再关闭当前 clau.de 中转页。", "service-worker bundle");
  assertIncludes(source, "reconnect 深链接：断开旧 native host / bridge，再重新初始化后台连接。", "service-worker bundle");
  assertIncludes(source, "tab 深链接：聚焦指定 tab，并把 sidepanel 绑定到对应主标签组上下文。", "service-worker bundle");
  assertIncludes(source, "service worker 启动链", "service-worker bundle");
  assertIncludes(source, "detached window 锁巡检、group/session cleanup 则由 loader 后注册的 recovered runtime 追加，不在这里展开。", "service-worker bundle");
  assertIncludes(source, "recovered runtime 只额外消费 OPEN_GROUP_DETACHED_WINDOW；这里继续承接 ACK/indicator/native-host 等主桥消息。", "service-worker bundle");
  assertIncludes(source, "后台主桥消息分区：", "service-worker bundle");
  assertIncludes(source, "轻量 ACK 类消息：仅回包确认", "service-worker bundle");
  assertIncludes(source, "PANEL_OPENED / PANEL_CLOSED 只是面板生命周期 ACK，不参与 MCP permission promise 的解析。", "service-worker bundle");
  assertIncludes(source, "OAuth 探测桥：当前恢复层不在此 bundle 内做刷新，只回传固定探测结果。", "service-worker bundle");
  assertIncludes(source, "非音频类消息继续在主桥里细分；PLAY_NOTIFICATION_SOUND 则单独走 offscreen document。", "service-worker bundle");
  assertIncludes(source, "sidepanel 打开主链：打开侧栏后，按重试策略把 prompt/模型/附件注入输入框。", "service-worker bundle");
  assertIncludes(source, "语义锚点：OPEN_SIDE_PANEL 的 tabId 只负责打开/绑定目标 sidepanel；后续 POPULATE_INPUT_TEXT 不再携带 tabId。", "service-worker bundle");
  assertIncludes(source, "退出登录探测：当前发行版只需要告诉调用方该能力已禁用。", "service-worker bundle");
  assertIncludes(source, "原生宿主 / MCP bridge 状态读取：优先向 native host 请求最新状态，失败时回退本地缓存。", "service-worker bundle");
  assertIncludes(source, "MCP 通知桥：优先走 native host 的 notification 通道", "service-worker bundle");
  assertIncludes(source, "options 引导桥：把待执行任务先写入 storage，再聚焦或打开 options#prompts。", "service-worker bundle");
  assertIncludes(source, "定时任务执行桥：由后台统一落埋点并把任务转交 sidepanel 独立窗口。", "service-worker bundle");
  assertIncludes(source, "agent / tab-group 协调链：Stop、主副 tab 切换、ACK 探测、静态提示条心跳都从这里汇总。", "service-worker bundle");
  assertIncludes(source, "语义锚点：background 会给 STOP_AGENT 补 targetTabId，供 sidepanel consumer 过滤多面板广播。", "service-worker bundle");
  assertIncludes(source, "secondary -> main 聚焦桥：把副 tab 切回主 tab，并同步聚焦对应窗口。", "service-worker bundle");
  assertIncludes(source, "静态提示条心跳会遍历同组 tab，并缓存 3s ACK 结果以避免重复探测", "service-worker bundle");
  assertIncludes(source, "语义锚点：scheduled task 通过 windowSessionId 定向独立 sidepanel；当前 bundle 不生产 targetTabId。", "service-worker bundle");
  assertIncludes(source, "语义锚点：MCP_PERMISSION_RESPONSE 在 service-worker 主桥里只是轻量 ACK；requestId/allowed 不在这里解析。", "service-worker bundle");
  assertIncludes(source, "secondary -> main 的 ACK 请求桥：只确认主 tab 是否还活着，不负责 detached popup 的生命周期。", "service-worker bundle");
  assertIncludes(source, "主 tab ACK 回包：这里只透传 success，供 secondary heartbeat 判断主 tab 存活。", "service-worker bundle");
  assertIncludes(source, "secondaryTabId/mainTabId/timestamp 只服务探测阶段与 ACK cache，不进入最终收口结果。", "service-worker bundle");
  assertIncludes(source, "静态提示条心跳：遍历同组 tab 做 ACK 探测；detached window 是否复用/新开由 recovered runtime 单独判断。", "service-worker bundle");
  assertIncludes(source, "这里只清静态提示条；tab group 关闭后的 session scope / detached lock 清理由 recovered runtime 的事件处理链负责。", "service-worker bundle");
  assertIncludes(source, "offscreen 音频播放桥：确保 offscreen document 存在后", "service-worker bundle");
  assertIncludes(source, "定时任务窗口会话入口：新建目标窗口、弹出独立 sidepanel，并向面板投递执行动作。", "service-worker bundle");
  assertIncludes(source, "更新可用态同步入口：写入后台状态，供 options/sidepanel 提示升级。", "service-worker bundle");
  assertIncludes(source, "定时任务闹钟桥：`prompt_` 负责执行任务，`retry_` 负责补偿重排。", "service-worker bundle");
  assertIncludes(source, "tab 关闭同步入口：先让 tab-group 管理器更新主副 tab 账本；", "service-worker bundle");
  assertIncludes(source, "clau.de navigation bridge：消费 `/chrome/permissions` / `reconnect` / `tab/<id>` 这类扩展深链接。", "service-worker bundle");
  assertIncludes(source, "外部页面桥：只信任 claude.ai", "service-worker bundle");
}

async function testAccessibilityTreeAnchorsExist() {
  const source = read(accessibilityTreeBundlePath);
  assertIncludes(source, "const __cpAccessibilityTreeElementWeakRefLedger = window.__claudeElementMap;", "accessibility-tree bundle");
  assertIncludes(source, "const __cpAccessibilityTreeGlobalGeneratorKey = \"__generateAccessibilityTree\";", "accessibility-tree bundle");
  assertIncludes(source, "const __cpAccessibilityTreeGenerate = window.__generateAccessibilityTree;", "accessibility-tree bundle");
  assertIncludes(source, "const __cpAccessibilityTreeInferRole = h;", "accessibility-tree bundle");
  assertIncludes(source, "const __cpAccessibilityTreeInferLabel = g;", "accessibility-tree bundle");
  assertIncludes(source, "const __cpAccessibilityTreeTraverseAndSerialize = b;", "accessibility-tree bundle");
  assertIncludes(source, "const __cpAccessibilityTreeDefaultDepth = 15;", "accessibility-tree bundle");
  assertIncludes(source, "const __cpAccessibilityTreeFilterInteractive = \"interactive\";", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：页面可访问性树生成器", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：read_page / find 共享的 ref writer 主入口。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：read_page 共享这组 filter/depth/ref_id 常量，避免 bundle 内部魔法字符串继续扩散。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：read_page 主入口：支持 filter/depth/charLimit/ref_id 四段参数，返回文本化可访问性树与 viewport。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：interactive filter 只保留可操作控件；all 模式则继续接受结构节点、具名节点和非 generic role 节点。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：ref writer 会先复用旧 ref，再为首次命中的元素分配新的 ref_X。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：read_page 参数规约：filter 默认 all，depth 默认 15，ref_id 命中时只展开目标子树。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：ref_id 增量读取链：通过 WeakRef 账本定位旧节点；映射失效时返回指导性错误，让调用方重新 read_page 全量拉树。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：一次生成结束后，会对 WeakRef 账本做全表 sweep，删掉已经失效的陈旧 ref。", "accessibility-tree bundle");
  assertIncludes(source, "语义锚点：序列化结果超限时不截断正文，而是返回收窄 depth / ref_id 的操作建议。", "accessibility-tree bundle");
}

async function testAgentVisualIndicatorAnchorsExist() {
  const source = read(agentVisualIndicatorBundlePath);
  assertIncludes(source, "const __cpAgentIndicatorContractMessages = globalThis.__CP_CONTRACT__?.messages || {};", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorContract = globalThis.__CP_CONTRACT__?.agentIndicator || {};", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorRuntimeMessageTypes = __cpAgentIndicatorContract.RUNTIME_MESSAGE_TYPES || {};", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorDomIds = __cpAgentIndicatorContract.DOM_IDS || {};", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorMessageTypeStopAgent = __cpAgentIndicatorContractMessages.STOP_AGENT || \"STOP_AGENT\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorMessageTypeStaticIndicatorHeartbeat = __cpAgentIndicatorContractMessages.STATIC_INDICATOR_HEARTBEAT || \"STATIC_INDICATOR_HEARTBEAT\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorRuntimeMessageShowAgentIndicators = __cpAgentIndicatorRuntimeMessageTypes.SHOW_AGENT_INDICATORS || \"SHOW_AGENT_INDICATORS\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorCurrentTabSentinel = __cpAgentIndicatorContract.CURRENT_TAB_SENTINEL || \"CURRENT_TAB\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorAnimationStylesId = __cpAgentIndicatorDomIds.ANIMATION_STYLES || \"claude-agent-animation-styles\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorStopButtonId = __cpAgentIndicatorDomIds.STOP_BUTTON || \"claude-agent-stop-button\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpStaticIndicatorContainerId = __cpAgentIndicatorDomIds.STATIC_CONTAINER || \"claude-static-indicator-container\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpStaticIndicatorChatButtonId = __cpAgentIndicatorDomIds.STATIC_CHAT_BUTTON || \"claude-static-chat-button\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpStaticIndicatorCloseButtonId = __cpAgentIndicatorDomIds.STATIC_CLOSE_BUTTON || \"claude-static-close-button\";", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpAgentIndicatorHideTransitionDelayMs = __cpAgentIndicatorContract.HIDE_TRANSITION_DELAY_MS || 300;", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpStaticIndicatorHeartbeatIntervalMs = __cpAgentIndicatorContract.HEARTBEAT_INTERVAL_MS || 5000;", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpShowActiveAgentIndicators = p;", "agent-visual-indicator bundle");
  assertIncludes(source, "const __cpHideStaticTabGroupIndicator = L;", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：执行态边框 / Stop 按钮 / tab group 常驻提示条共享的后台消息协议。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：tab group 常驻提示条入口；关闭时会同步停止心跳并移除 DOM。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：tab group 指示器通过后台心跳确认自己仍属于活跃主标签组。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：active agent indicator 显示主链：注入动画样式 -> 创建 glow border -> 非 MCP 模式挂载 Stop 按钮 -> requestAnimationFrame 做入场动画。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：Stop 按钮上报链：内容脚本只发送 STOP_AGENT + CURRENT_TAB 哨兵，真正的停止执行逻辑由后台收口。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：indicator Stop 只负责上报，不直接消费 sidepanel 输入桥协议。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：active agent indicator 隐藏主链：先做离场动画，再延迟回收 DOM，避免快速切换时闪烁。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：静态提示条“Open chat”只请求后台切回主 tab，不直接在内容脚本里操作窗口焦点。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：静态提示条“Dismiss”只上报 group 级关闭请求，真正的 group dismiss 账本由后台维护。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：静态提示条关闭链：清理心跳定时器并移除 DOM；heartbeat 失败、后台 hide、页面卸载都复用这里。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：indicator runtime handler：SHOW/HIDE 控制执行态显隐，HIDE_FOR_TOOL_USE/SHOW_AFTER_TOOL_USE 处理临时收起恢复，SHOW/HIDE_STATIC_INDICATOR 控制 tab group 常驻条。", "agent-visual-indicator bundle");
  assertIncludes(source, "语义锚点：页面卸载时强制收口动态/静态 indicator，避免残留定时器和悬空 DOM。", "agent-visual-indicator bundle");
}

async function testStartRecordingAnchorsExist() {
  const source = read(startRecordingBundlePath);
  assertIncludes(source, "const __cpSessionReplayRecordTypeFullSnapshot = J;", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayRecordSourceBrowser = \"browser\";", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplaySegmentUploadMimeType = \"application/octet-stream\";", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplaySegmentMetadataMimeType = \"application/json\";", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplaySegmentCreationReasonBytesLimit = \"segment_bytes_limit\";", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayWorkerRecordChannel = \"record\";", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayTransportBuilderDependency = \"sessionReplayEndpointBuilder\";", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayMissingEmitFunctionsError = \"emit functions are required\";", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayMouseMoveThrottleMs = 50;", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayMutationFlushThrottleMs = 16;", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplaySegmentDurationLimitMs = fe;", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplaySegmentByteLimit = pe;", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayRecorderRuntime = de;", "startRecording bundle");
  assertIncludes(source, "const __cpSessionReplayStartRecordingExport = he;", "startRecording bundle");
}

async function testPairingAnchorsExist() {
  const pairingSource = read(pairingBootstrapBundlePath);
  assertIncludes(pairingSource, "const __cpPairingContract = globalThis.__CP_CONTRACT__?.pairing || {};", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingQueryKeys = __cpPairingContract.QUERY_KEYS || {};", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingQueryKeyRequestId = __cpPairingQueryKeys.REQUEST_ID || \"request_id\";", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingDefaultClientType = __cpPairingContract.DEFAULT_CLIENT_TYPE || \"desktop\";", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingContractMessages = globalThis.__CP_CONTRACT__?.messages || {};", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingRuntimeMessageTypeConfirmed = __cpPairingContractMessages.pairing_confirmed || \"pairing_confirmed\";", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingRuntimeMessageTypeDismissed = __cpPairingContractMessages.pairing_dismissed || \"pairing_dismissed\";", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingMessageFields = __cpPairingContract.MESSAGE_FIELDS || {};", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingMessageFieldRequestId = __cpPairingMessageFields.REQUEST_ID || \"request_id\";", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingMessageFieldName = __cpPairingMessageFields.NAME || \"name\";", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingCloseDelayMs = __cpPairingContract.CLOSE_DELAY_MS || 100;", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingPageRootMountId = __cpPairingContract.PAGE_ROOT_MOUNT_ID || \"root\";", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingCloseCurrentTab = n;", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingPromptComponent = i;", "pairing bundle");
  assertIncludes(pairingSource, "const __cpPairingPageAppRootComponent = m;", "pairing bundle");
  assertIncludes(pairingSource, "语义锚点：pairing_confirmed / pairing_dismissed 消息 payload 字段名", "pairing bundle");
  assertIncludes(pairingSource, "语义锚点：pairing 页面关闭策略（当前 tab 自我关闭）", "pairing bundle");
  assertIncludes(pairingSource, "语义锚点：关闭 pairing 当前标签页（确认/忽略后都会触发）", "pairing bundle");
  assertIncludes(pairingSource, "语义锚点：独立 pairing 页只消费 request_id/client_type/current_name 这 3 个 query 字段；", "pairing bundle");
  assertIncludes(pairingSource, "语义锚点：pairing 页面 React Root 组件入口", "pairing bundle");
  assertIncludes(pairingSource, "当前恢复层里未观察到后台显式消费 pairing_dismissed，运行时更接近“取消配对”的协议级 no-op。", "pairing bundle");

  const promptSource = read(pairingPromptBundlePath);
  assertIncludes(promptSource, "const __cpPairingClientTypeClaudeCode = \"claude-code\";", "PairingPrompt bundle");
  assertIncludes(promptSource, "const __cpPairingPromptSubmitKey = \"Enter\";", "PairingPrompt bundle");
  assertIncludes(promptSource, "const __cpPairingPromptInputRef = u;", "PairingPrompt bundle");
  assertIncludes(promptSource, "const __cpPairingPromptConfirmHandler = b;", "PairingPrompt bundle");
  assertIncludes(promptSource, "const __cpPairingPromptKeydownHandler = f;", "PairingPrompt bundle");
  assertIncludes(promptSource, "const __cpPairingPromptResolvedClientLabel = g;", "PairingPrompt bundle");
  assertIncludes(promptSource, "const __cpPairingPromptExportedComponent = r;", "PairingPrompt bundle");
  assertIncludes(promptSource, "语义锚点：PairingPrompt 组件只负责浏览器命名输入与回调，不直接决定 runtime message。", "PairingPrompt bundle");
  assertIncludes(promptSource, "语义锚点：pairing 对话框打开后，默认把焦点放到浏览器命名输入框。", "PairingPrompt bundle");
  assertIncludes(promptSource, "语义锚点：确认分支会先 trim 浏览器名称；空字符串不会触发上层 onConfirm。", "PairingPrompt bundle");
  assertIncludes(promptSource, "语义锚点：PairingPrompt 组件导出（供 pairing 页面引用）", "PairingPrompt bundle");
}

async function testContentScriptAnchorsExist() {
  const source = read(contentScriptBundlePath);
  assertIncludes(source, "const __cpClaudeOnboardingButtonSelector = \"#claude-onboarding-button\";", "content-script bundle");
  assertIncludes(source, "const __cpClaudeOnboardingPromptDataAttribute = \"data-task-prompt\";", "content-script bundle");
  assertIncludes(source, "const __cpContentScriptContractMessages = globalThis.__CP_CONTRACT__?.messages || {};", "content-script bundle");
  assertIncludes(source, "const __cpContentScriptMessageTypeOpenSidePanel = __cpContentScriptContractMessages.open_side_panel || \"open_side_panel\";", "content-script bundle");
}

async function testOptionsBundleAnchorsExist() {
  const source = read(optionsBundlePath);
  assertIncludes(source, "const __cpOptionsSettingsTabHashParser = cpGetSettingsTabFromHash;", "options bundle");
  assertIncludes(source, "const __cpOptionsSubviewHashParser = cpGetOptionsSubviewFromHash;", "options bundle");
  assertIncludes(source, "const __cpOptionsSettingsTabWhitelist = __cpOptionsSettingsTabTokens;", "options bundle");
  assertIncludes(source, "const __cpOptionsHashParamTruthyValue = \"true\";", "options bundle");
  assertIncludes(source, "const __cpOptionsHashChangeEventName = \"hashchange\";", "options bundle");
  assertIncludes(source, "const __cpOptionsProviderSubviewToken = \"provider\";", "options bundle");
  assertIncludes(source, "const __cpOptionsGithubRuntimeMessageBridge = cpGithubSendRuntimeMessage;", "options bundle");
  assertIncludes(source, "__cpOptionsGithubUpdateInfoStorageKey = a.INFO;", "options bundle");
  assertIncludes(source, "__cpOptionsGithubUpdateAutoCheckStorageKey = a.AUTO_CHECK_ENABLED;", "options bundle");
  assertIncludes(source, "__cpOptionsGithubUpdateCheckNowAction = r.CHECK_NOW;", "options bundle");
  assertIncludes(source, "__cpOptionsProviderMountAnchorId = \"cp-options-provider-anchor\";", "options bundle");
  assertIncludes(source, "__cpOptionsSessionMountAnchorId = \"cp-options-session-anchor\";", "options bundle");
  assertIncludes(source, "__cpOptionsMcpMountAnchorId = \"cp-options-mcp-anchor\";", "options bundle");
  assertIncludes(source, "const __cpOptionsPermissionManagerContract = globalThis.__CP_CONTRACT__?.permissionManager || {};", "options bundle");
  assertIncludes(source, "const __cpOptionsPendingScheduledTaskStorageKey = __cpOptionsPermissionManagerContract.PENDING_SCHEDULED_TASK_STORAGE_KEY || T.PENDING_SCHEDULED_TASK;", "options bundle");
  assertIncludes(source, "const __cpOptionsCustomProviderContract = globalThis.__CP_CONTRACT__?.customProvider || {};", "options bundle");
  assertIncludes(source, "const __cpOptionsAccountBootstrapStorageKey = __cpOptionsCustomProviderContract.ANTHROPIC_API_KEY_STORAGE_KEY || T.ANTHROPIC_API_KEY;", "options bundle");
  assertIncludes(source, "const __cpOptionsProviderNavItemId = \"cp-options-provider-nav-item\";", "options bundle");
  assertIncludes(source, "const __cpOptionsNavHrefOptionsProvider = \"/settings/options?provider=true\";", "options bundle");
  assertIncludes(source, "const __cpOptionsNavHrefOptionsMcp = \"/settings/options?provider=mcp\";", "options bundle");
  assertIncludes(source, "const __cpOptionsSettingsTabHashWriter = f;", "options bundle");
  assertIncludes(source, "const __cpOptionsSubviewHashWriter = g;", "options bundle");
  assertIncludes(source, "const __cpOptionsRootMountElementId = \"root\";", "options bundle");
  assertIncludes(source, "window.addEventListener(__cpOptionsHashChangeEventName, t);", "options bundle");
  assertIncludes(source, "语义锚点：options 页 hash -> 状态同步入口（一级 tab、二级子视图、麦克风回跳）", "options bundle");
  assertIncludes(source, "语义锚点：一级 tab 点击后，直接写回 window.location.hash 并清空 options 子视图。", "options bundle");
  assertIncludes(source, "语义锚点：options 二级子视图切换（provider/session/prompt/mcp -> hash 持久化）", "options bundle");
  assertIncludes(source, "const __cpOptionsBootstrapRuntimeChain = [R, _, L];", "options bundle");
}

async function testOffscreenAnchorsExist() {
  const source = read(offscreenPath);
  assertIncludes(source, "const __cpOffscreenContractMessages = globalThis.__CP_CONTRACT__?.messages || {};", "offscreen");
  assertIncludes(source, "const __cpOffscreenContract = globalThis.__CP_CONTRACT__?.offscreen || {};", "offscreen");
  assertIncludes(source, "const __cpOffscreenKeepaliveMessageType = __cpOffscreenContractMessages.SW_KEEPALIVE || \"SW_KEEPALIVE\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenKeepaliveIntervalMs = __cpOffscreenContract.KEEPALIVE_INTERVAL_MS || 20000;", "offscreen");
  assertIncludes(source, "const __cpOffscreenMessageTypePlaySound = __cpOffscreenContractMessages.OFFSCREEN_PLAY_SOUND || \"OFFSCREEN_PLAY_SOUND\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenMessageTypeGenerateGif = __cpOffscreenContractMessages.GENERATE_GIF || \"GENERATE_GIF\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenMessageTypeRevokeBlobUrl = __cpOffscreenContractMessages.REVOKE_BLOB_URL || \"REVOKE_BLOB_URL\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenAudioFieldUrl = __cpOffscreenContract.AUDIO_FIELD_URL || \"audioUrl\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenAudioFieldVolume = __cpOffscreenContract.AUDIO_FIELD_VOLUME || \"volume\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenDefaultVolume = __cpOffscreenContract.DEFAULT_VOLUME || 0.5;", "offscreen");
  assertIncludes(source, "const __cpOffscreenGifFieldFrames = __cpOffscreenContract.GIF_FIELD_FRAMES || \"frames\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenGifFieldOptions = __cpOffscreenContract.GIF_FIELD_OPTIONS || \"options\";", "offscreen");
  assertIncludes(source, "const __cpOffscreenGifFieldBlobUrl = __cpOffscreenContract.GIF_FIELD_BLOB_URL || \"blobUrl\";", "offscreen");
  assertIncludes(source, "语义锚点：offscreen document <-> service worker 的消息协议", "offscreen");
}

async function testDetachedWindowRuntimeAnchorsExist() {
  const source = read(detachedWindowRuntimePath);
  assertIncludes(source, "detached window lock 归一化边界：", "detached window runtime");
  assertIncludes(source, "detached lock 读取边界：从 storage.local 拉全量账本后逐项归一化，", "detached window runtime");
  assertIncludes(source, "detached window URL 契约：", "detached window runtime");
  assertIncludes(source, "restoreUrl 是跨重启唯一稳定的会话锚点；tabId/groupId 只服务当前运行期复用/聚焦。", "detached window runtime");
  assertIncludes(source, "sessionId 只用于区分“同 URL 下的不同本地会话”，避免别的会话抢占正在使用的独立窗口。", "detached window runtime");
  assertIncludes(source, "detached window URL 解析边界：", "detached window runtime");
  assertIncludes(source, "detached window 查找链：", "detached window runtime");
  assertIncludes(source, "detached lock 巡检链：", "detached window runtime");
  assertIncludes(source, "openDetachedWindowForGroup 的职责边界：", "detached window runtime");
  assertIncludes(source, "同 URL 下若已有别的 session 占用独立窗，当前请求只能新开，不能切走占用中的窗口。", "detached window runtime");
}

async function testServiceWorkerRuntimeAnchorsExist() {
  const source = read(serviceWorkerRuntimePath);
  assertIncludes(source, "session cleanup 子链只关心 storage 里的 scope 账本，不负责 popup/ack/message 分发。", "service-worker runtime");
  assertIncludes(source, "storage 快照索引层：", "service-worker runtime");
  assertIncludes(source, "tab group 被关闭后的清理链：", "service-worker runtime");
  assertIncludes(source, "启动/安装时做一次孤儿组扫描，只删 chrome-group:* 这类“组已经消失”的残留 scope。", "service-worker runtime");
  assertIncludes(source, "安装/启动维护链：清掉发行版留下的 uninstall survey，再做 scope + detached lock 巡检。", "service-worker runtime");
  assertIncludes(source, "这里故意只消费 OPEN_GROUP_DETACHED_WINDOW。", "service-worker runtime");
}

async function testServiceWorkerLoaderAnchorsExist() {
  const source = read(serviceWorkerLoaderPath);
  assertIncludes(source, "先加载发行版 bundle，保留原有 background 主桥。", "service-worker loader");
  assertIncludes(source, "再加载 detached window runtime，与 recovered runtime 组合出第二轮恢复层。", "service-worker loader");
  assertIncludes(source, "loader 的职责边界：", "service-worker loader");
  assertIncludes(source, "通过依赖注入把 lock sweep/open/close/remove 串到 recovered runtime", "service-worker loader");
}

async function testDeobfuscationMapMentionsCurrentFocusFiles() {
  const source = read(mapPath);
  assertIncludes(source, "assets/sidepanel-BoLm9pmH.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/accessibility-tree.js-D8KNCIWO.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/agent-visual-indicator.js-Ct7LqXhp.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/pairing-H3Cs7KHl.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/PairingPrompt-Do4C6yFu.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/startRecording-BeCDKY84.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/service-worker.ts-H0DVM1LS.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/options-Hyb_OzME.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/content-script.ts-Bwa5rY9t.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "offscreen.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/PermissionManager-9s959502.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/mcpPermissions-qqAoJjJ8.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "assets/useStorageState-hbwNMVUA.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "service-worker-detached-window-runtime.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "service-worker-runtime.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "service-worker-loader.js", "DEOBFUSCATION_MAP");
  assertIncludes(source, "OPEN_GROUP_DETACHED_WINDOW", "DEOBFUSCATION_MAP");
  assertIncludes(source, "sidepanel 打开主链：打开侧栏后，按重试策略把 prompt/模型/附件注入输入框。", "DEOBFUSCATION_MAP");
  assertIncludes(source, "原生宿主 / MCP bridge 状态读取：优先向 native host 请求最新状态，失败时回退本地缓存。", "DEOBFUSCATION_MAP");
  assertIncludes(source, "options 引导桥：把待执行任务先写入 storage，再聚焦或打开 options#prompts。", "DEOBFUSCATION_MAP");
  assertIncludes(source, "定时任务执行桥：由后台统一落埋点并把任务转交 sidepanel 独立窗口。", "DEOBFUSCATION_MAP");
  assertIncludes(source, "secondary -> main 聚焦桥：把副 tab 切回主 tab，并同步聚焦对应窗口。", "DEOBFUSCATION_MAP");
  assertIncludes(source, "clau.de deep-link / 扩展路由桥", "DEOBFUSCATION_MAP");
  assertIncludes(source, "sidepanel 工具标题压缩器", "DEOBFUSCATION_MAP");
  assertIncludes(source, "read_page 标题只消费 filter，不在头部透出 depth/ref_id/max_chars", "DEOBFUSCATION_MAP");
  assertIncludes(source, "find 标题只展示截断后的 query", "DEOBFUSCATION_MAP");
  assertIncludes(source, "navigate 标题只展示截断后的 url", "DEOBFUSCATION_MAP");
  assertIncludes(source, "sidepanel 的工具结果卡片 consumer", "DEOBFUSCATION_MAP");
  assertIncludes(source, "computer 结果卡片优先读 input.action；如果 result.content 里还能解析出 action，就用它兜底恢复展示分支", "DEOBFUSCATION_MAP");
  assertIncludes(source, "debug 展开态会把 click 坐标和 drag 路径叠加到最近一张 screenshot 上", "DEOBFUSCATION_MAP");
  assertIncludes(source, "timeline group 的缩略图优先显示工具结果自带图片；没有图片时才退回 lastScreenshot + 坐标覆盖层", "DEOBFUSCATION_MAP");
  assertIncludes(source, "sidepanel 的 tool_result 账本入口", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool_result 图片会顺手写入 screenshotsByTab", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool_use 渲染时会向后扫描同消息后的 user tool_result", "DEOBFUSCATION_MAP");
  assertIncludes(source, "TimelineGroup 构造器会把连续的 tool_use/tool_result 相邻块折成一个 group", "DEOBFUSCATION_MAP");
  assertIncludes(source, "__cpSidepanelBuildToolRenderContext", "DEOBFUSCATION_MAP");
  assertIncludes(source, "__cpSidepanelRenderBrowserToolTimelineCard", "DEOBFUSCATION_MAP");
  assertIncludes(source, "__cpSidepanelRenderBrowserToolResultCard", "DEOBFUSCATION_MAP");
  assertIncludes(source, "timeline block renderer 读的是 tool_use 块，但展示时会去 toolResultsByToolId 账本里取对应结果", "DEOBFUSCATION_MAP");
  assertIncludes(source, "turn_answer_start 会把 assistant 输出切成“时间线阶段”和“最终回答阶段”两段", "DEOBFUSCATION_MAP");
  assertIncludes(source, "messageGroups 里的 tool_group 会被渲染成可折叠 TimelineGroup", "DEOBFUSCATION_MAP");
  assertIncludes(source, "sidepanel timeline renderContext 账本，不负责 messageGroups 构造", "DEOBFUSCATION_MAP");
  assertIncludes(source, "messageGroups 构造入口", "DEOBFUSCATION_MAP");
  assertIncludes(source, "运行中且后面已无真实 user 文本的 assistant 尾段", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool_group 起始判定", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool_group / single / result / compact summary", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool_group -> ik(...)`，`single assistant -> sk(...) -> Yw(...)", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool_group` 路径不会经过这里", "DEOBFUSCATION_MAP");
  assertIncludes(source, "showThumbs", "DEOBFUSCATION_MAP");
  assertIncludes(source, "messageHistory -> compact divider -> 当前 messageGroups -> extras/footer/chatInput", "DEOBFUSCATION_MAP");
  assertIncludes(source, "Ds(...) / __cpSidepanelMaintainBottomViewportSpacer", "DEOBFUSCATION_MAP");
  assertIncludes(source, "ak(...) / __cpSidepanelRenderConversationScrollLayer", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scrollRefs`：聚合 `lastHuman / lastAssistant / extras / extraSpace / chatInput` 五组 viewport ref", "DEOBFUSCATION_MAP");
  assertIncludes(source, "YY(...) / __cpSidepanelRenderChatInputFooter", "DEOBFUSCATION_MAP");
  assertIncludes(source, "chatInputContainerRef`：真正挂在输入卡片容器上，供 `extraSpace` 计算与 sticky 底栏定位复用", "DEOBFUSCATION_MAP");
  assertIncludes(source, "BR(...) / __cpSidepanelRenderScrollToBottomGuard", "DEOBFUSCATION_MAP");
  assertIncludes(source, "__cpSidepanelAutoscrollControllerRef", "DEOBFUSCATION_MAP");
  assertIncludes(source, "__cpSidepanelMessageBottomSentinelRef", "DEOBFUSCATION_MAP");
  assertIncludes(source, "activeBanner`：复用 `YY(...)` 顶部 banner 槽", "DEOBFUSCATION_MAP");
  assertIncludes(source, "FY(...) / __cpSidepanelProvideComposerShortcutMenuState", "DEOBFUSCATION_MAP");
  assertIncludes(source, "HY(...) / __cpSidepanelRenderInputAnchoredShortcutMenu", "DEOBFUSCATION_MAP");
  assertIncludes(source, "BY(...) / __cpSidepanelRenderComposerCommandMenu", "DEOBFUSCATION_MAP");
  assertIncludes(source, "GY(...) / __cpSidepanelBuildSlashShortcutSuggestionConfig", "DEOBFUSCATION_MAP");
  assertIncludes(source, "KY(...) / __cpSidepanelSlashShortcutSuggestionExtension", "DEOBFUSCATION_MAP");
  assertIncludes(source, "底部 thinking/compacting 状态", "DEOBFUSCATION_MAP");
  assertIncludes(source, "Wx(...)`：可折叠的状态 pill 头部，只管文案/caret/summary suffix", "DEOBFUSCATION_MAP");
  assertIncludes(source, "Wx(...) / __cpSidepanelRenderTimelineStatusPillHeader", "DEOBFUSCATION_MAP");
  assertIncludes(source, "Kx(...)`：最后一组工具时间线的状态 pill 容器", "DEOBFUSCATION_MAP");
  assertIncludes(source, "Kx(...) / __cpSidepanelRenderTimelineStatusWindow", "DEOBFUSCATION_MAP");
  assertIncludes(source, "working status 可见条件", "DEOBFUSCATION_MAP");
  assertIncludes(source, "fadeOnStatus", "DEOBFUSCATION_MAP");
  assertIncludes(source, "collapse 模式", "DEOBFUSCATION_MAP");
  assertIncludes(source, "退出缓冲区", "DEOBFUSCATION_MAP");
  assertIncludes(source, "onStatusDisplayVisibilityChange", "DEOBFUSCATION_MAP");
  assertIncludes(source, "timeline statusText", "DEOBFUSCATION_MAP");
  assertIncludes(source, "ik(...) -> Kx(fadeOnStatus)", "DEOBFUSCATION_MAP");
  assertIncludes(source, "等待输入工具判定", "DEOBFUSCATION_MAP");
  assertIncludes(source, "等待输入工具保活链", "DEOBFUSCATION_MAP");
  assertIncludes(source, "streamingMinHeight 生效边界", "DEOBFUSCATION_MAP");
  assertIncludes(source, "状态 pill 文案切换", "DEOBFUSCATION_MAP");
  assertIncludes(source, "当前不会额外传 actionedToolIds / isToolAwaitingInput", "DEOBFUSCATION_MAP");
  assertIncludes(source, "PING_SIDEPANEL 只是活性探针，收到后立即回 success + 当前 tabId", "DEOBFUSCATION_MAP");
  assertIncludes(source, "MAIN_TAB_ACK_REQUEST 只让主 tab 回 ACK；secondary tab 收到但不匹配时直接忽略", "DEOBFUSCATION_MAP");
  assertIncludes(source, "EXECUTE_TASK 会先按 windowSessionId / targetTabId 过滤目标 sidepanel", "DEOBFUSCATION_MAP");
  assertIncludes(source, "OPEN_SIDE_PANEL`：`tabId` 只负责打开/绑定目标 panel；后续 `POPULATE_INPUT_TEXT` 不再携带 `tabId`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scheduled task 只是给 prompt 加任务名前缀；真正发送仍复用普通 sendMessage 主链", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scheduled task`：真正的定向键是 `windowSessionId`；当前 bridge 不生产 `targetTabId`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "POPULATE_INPUT_TEXT 负责把 prompt / permissionMode / selectedModel / attachments 一次性灌进 sidepanel 草稿态", "DEOBFUSCATION_MAP");
  assertIncludes(source, "POPULATE_INPUT_TEXT` 自身不按 `tabId/sessionId` 过滤；选路发生在 OPEN_SIDE_PANEL / EXECUTE_TASK", "DEOBFUSCATION_MAP");
  assertIncludes(source, "草稿灌入 + 条件满足时延迟自动发送", "DEOBFUSCATION_MAP");
  assertIncludes(source, "background 会补 `targetTabId`，但 sidepanel 当前 consumer 不读取这个字段", "DEOBFUSCATION_MAP");
  assertIncludes(source, "带附件的 populate 走“先注入草稿/附件，再延迟触发发送”", "DEOBFUSCATION_MAP");
  assertIncludes(source, "MCP_PERMISSION_RESPONSE`：service-worker 主桥只做轻量 ACK；`requestId/allowed` 留给 `mcpPermissions`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "ACK 回包收口`：只消费 `success`；`secondaryTabId/mainTabId/timestamp` 只服务探测阶段", "DEOBFUSCATION_MAP");
  assertIncludes(source, "const Xa = [\"tabs_context_mcp\", \"tabs_create_mcp\", \"tabs_close_mcp\"];", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tabs_context_mcp / tabs_create_mcp / tabs_close_mcp", "DEOBFUSCATION_MAP");
  assertIncludes(source, "No tab available", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tabId 是实际执行目标键，只从 tool args 进入后台工具链；toolUseId 继续负责外层 tool_call/tool_result 归属，requestId 仍留给权限握手", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool executor 上下文对象", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool executor 的标准 tool_result 封装器", "DEOBFUSCATION_MAP");
  assertIncludes(source, "permission_required sentinel", "DEOBFUSCATION_MAP");
  assertIncludes(source, "普通工具的 permission_required sentinel 统一形状", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tool executor permission_required 重试链", "DEOBFUSCATION_MAP");
  assertIncludes(source, "update_plan`：审批通过后直接回 `plan approved` 文本，不重跑普通工具", "DEOBFUSCATION_MAP");
  assertIncludes(source, "__cpDomainTransitionPermissionRequiredFactory / rn(...)", "DEOBFUSCATION_MAP");
  assertIncludes(source, "只要工具落到真实 tab，这里就会登记运行态、点亮前缀，并记录 requestId -> tab 的运行中账本", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tabs_context_mcp` 首次建组前若还没有真实 tab，会先放行 no-tab 例外，但不会提前点亮 indicator", "DEOBFUSCATION_MAP");
  assertIncludes(source, "tab 执行完成后的延迟收尾", "DEOBFUSCATION_MAP");
  assertIncludes(source, "computer 是浏览器前台交互总入口", "DEOBFUSCATION_MAP");
  assertIncludes(source, "computer 的 action -> permission 映射与 wait 例外", "DEOBFUSCATION_MAP");
  assertIncludes(source, "permission_required 的 actionData 回填边界", "DEOBFUSCATION_MAP");
  assertIncludes(source, "javascript_tool` 的 `permission_required`：只透出脚本文本，不带 timeout / eval 细节", "DEOBFUSCATION_MAP");
  assertIncludes(source, "form_input / upload_image` 的 `permission_required`：只回填 `ref/coordinate/value/imageId`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "find / get_page_text / read_page / read_console_messages / read_network_requests / navigate`：默认只返回基础四元组", "DEOBFUSCATION_MAP");
  assertIncludes(source, "GIF 导出上传`：复用 `upload_image` 家族，但 popup 只吃 `coordinate` 预览", "DEOBFUSCATION_MAP");
  assertIncludes(source, "navigate`：只有普通 URL 分支会做协议补全、blocklist 与域 permission；`back/forward` 复用历史栈，不重走 permission gate", "DEOBFUSCATION_MAP");
  assertIncludes(source, "get_page_text / read_page`：共用“先 permission，后 hideIndicator/read DOM”的读页模板", "DEOBFUSCATION_MAP");
  assertIncludes(source, "upload_image`：先过目标域 permission，再做原始 URL 安全校验与 message image 解析", "DEOBFUSCATION_MAP");
  assertIncludes(source, "A(...) / __cpMcpPreExecuteSameDomainGuard", "DEOBFUSCATION_MAP");
  assertIncludes(source, "A(...)` 的调用家族", "DEOBFUSCATION_MAP");
  assertIncludes(source, "页面级动作：`type / key / javascript_tool`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "定位/指针动作：`click / double_click / triple_click / drag / scroll_to / hover`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "表单/上传动作：`file upload / form_input / upload_image / GIF export upload`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "M / __cpMcpScreenshotViewportContextLedger", "DEOBFUSCATION_MAP");
  assertIncludes(source, "ne(...) / __cpMcpScaleScreenshotCoordinatesToViewport", "DEOBFUSCATION_MAP");
  assertIncludes(source, "me(...) / __cpMcpResolveRefToViewportCenter", "DEOBFUSCATION_MAP");
  assertIncludes(source, "window.__generateAccessibilityTree` 才是 `read_page/find` 共用的 ref writer；`file_upload / form_input / upload_image(ref)` 都是直接 consumer，不走 `me(...)`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "clearContext / clearAllContexts`：当前只见定义，没有显式调用；screenshot context 主要靠后续 `setContext(...)` 覆盖刷新", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scroll`：会复用 screenshot context 做坐标缩放，但不像 `click / hover / drag` 那样再进 `A(...)`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "zoom`：只消费最近一次 screenshot context，不会回写或清理账本", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scrollIntoView(center)", "DEOBFUSCATION_MAP");
  assertIncludes(source, "ref_lookup_ms", "DEOBFUSCATION_MAP");
  assertIncludes(source, "click(ref)` / `hover(ref)`：先解 `ref` 成中心点坐标，再进 `A(...)`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scroll_to`：先过 `A(...)`，再解 `ref` / `scrollIntoView`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "click(coordinate)` / `hover(coordinate)` / `drag`：先按截图上下文做坐标缩放，再进 `A(...)`", "DEOBFUSCATION_MAP");
  assertIncludes(source, "Me(...) / __cpMcpBeforeunloadNavigationGuard", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scroll_to / hover 与 read_page/find ref 链", "DEOBFUSCATION_MAP");
  assertIncludes(source, "find 的 accessibility tree -> createAnthropicMessage(modelClass=small_fast) -> provider 文本提取", "DEOBFUSCATION_MAP");
  assertIncludes(source, "find`：只解析 provider 文本里的 `ref_X | role | name | type | reason` 行，不回到 `__claudeElementMap` 验活；stale ref 留给后续 consumer 暴露", "DEOBFUSCATION_MAP");
  assertIncludes(source, "click helper 会先临时隐藏 indicator，再走 mouseMoved -> mousePressed -> mouseReleased", "DEOBFUSCATION_MAP");
  assertIncludes(source, "screenshot 先探测 viewport，再走 CDP captureScreenshot；超限时回退内容脚本压缩链", "DEOBFUSCATION_MAP");
  assertIncludes(source, "screenshot 会把 viewport/screenshot 尺寸写进上下文，供后续坐标动作做缩放换算", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scroll 优先尝试 CDP scrollWheel；无效或超时再回退 DOM/事件注入滚动", "DEOBFUSCATION_MAP");
  assertIncludes(source, "scroll 成功后会尽量补一张新截图，给后续模型继续定位", "DEOBFUSCATION_MAP");
  assertIncludes(source, "left_click_drag 复用截图上下文做坐标换算，再串成完整拖拽事件序列", "DEOBFUSCATION_MAP");
  assertIncludes(source, "zoom 会校验 region 边界，并用 CDP clip 截取局部高分辨率截图", "DEOBFUSCATION_MAP");
  assertIncludes(source, "find 的 query 裁剪", "DEOBFUSCATION_MAP");
  assertIncludes(source, "provider 文本提取兼容层", "DEOBFUSCATION_MAP");
  assertIncludes(source, "navigate 的 Me beforeunload / unsaved changes(force)", "DEOBFUSCATION_MAP");
  assertIncludes(source, "navigate 的 back / forward / 普通 URL 三路", "DEOBFUSCATION_MAP");
  assertIncludes(source, "普通 URL 补 https + blocklist + permission", "DEOBFUSCATION_MAP");
  assertIncludes(source, "read_page 的 hideIndicatorForToolUse", "DEOBFUSCATION_MAP");
  assertIncludes(source, "read_page 的 main frame 失败转 allFrames", "DEOBFUSCATION_MAP");
  assertIncludes(source, "read_page 的 finally restoreIndicatorAfterToolUse", "DEOBFUSCATION_MAP");
}

async function testSessionRecoveryDocMentionsServiceWorkerBridgePartitions() {
  const source = read(sessionRecoveryDetachedWindowDocPath);
  assertIncludes(source, "service worker 启动链：先恢复 bridge/listener/offscreen，再探测 native host 和定时任务。", "session recovery doc");
  assertIncludes(source, "detached window 锁巡检、group/session cleanup 则由 loader 后注册的 recovered runtime 追加，不在这里展开。", "session recovery doc");
  assertIncludes(source, "recovered runtime 只额外消费 OPEN_GROUP_DETACHED_WINDOW；这里继续承接 ACK/indicator/native-host 等主桥消息。", "session recovery doc");
  assertIncludes(source, "轻量 ACK 类消息：仅回包确认，让 sidepanel / 指示器 / keepalive 调用方快速结束。", "session recovery doc");
  assertIncludes(source, "sidepanel 打开主链：打开侧栏后，按重试策略把 prompt/模型/附件注入输入框。", "session recovery doc");
  assertIncludes(source, "原生宿主 / MCP bridge 状态读取：优先向 native host 请求最新状态，失败时回退本地缓存。", "session recovery doc");
  assertIncludes(source, "options 引导桥：把待执行任务先写入 storage，再聚焦或打开 options#prompts。", "session recovery doc");
  assertIncludes(source, "定时任务执行桥：由后台统一落埋点并把任务转交 sidepanel 独立窗口。", "session recovery doc");
  assertIncludes(source, "secondary -> main 聚焦桥：把副 tab 切回主 tab，并同步聚焦对应窗口。", "session recovery doc");
  assertIncludes(source, "主 tab ACK 回包：这里只透传 success，供 secondary heartbeat 判断主 tab 存活。", "session recovery doc");
  assertIncludes(source, "clau.de deep-link / 扩展路由桥", "session recovery doc");
}

async function testToolExecutorIndicatorDocMentionsCurrentChain() {
  const source = read(toolExecutorIndicatorDocPath);
  assertIncludes(source, "tool_call", "tool executor doc");
  assertIncludes(source, "tool executor", "tool executor doc");
  assertIncludes(source, "tool_result", "tool executor doc");
  assertIncludes(source, "bridge tool_call -> tool executor -> tool_result 总链", "tool executor doc");
  assertIncludes(source, "tabs_context_mcp", "tool executor doc");
  assertIncludes(source, "tabs_create_mcp", "tool executor doc");
  assertIncludes(source, "tabs_close_mcp", "tool executor doc");
  assertIncludes(source, "const Xa = [\"tabs_context_mcp\", \"tabs_create_mcp\", \"tabs_close_mcp\"];", "tool executor doc");
  assertIncludes(source, "No tab available", "tool executor doc");
  assertIncludes(source, "Call tabs_context_mcp with createIfEmpty: true first", "tool executor doc");
  assertIncludes(source, "Only tabs visible to this session can be closed", "tool executor doc");
  assertIncludes(source, "内层 tool_use / 外层 toolUseId 分工", "tool executor doc");
  assertIncludes(source, "tabId 是实际执行目标键，只从 tool args 进入后台工具链；", "tool executor doc");
  assertIncludes(source, "requestId 仍留给权限握手。", "tool executor doc");
  assertIncludes(source, "tab 编排阶段", "tool executor doc");
  assertIncludes(source, "tool executor 上下文对象", "tool executor doc");
  assertIncludes(source, "tool executor 的标准 tool_result 封装器", "tool executor doc");
  assertIncludes(source, "permission_required sentinel", "tool executor doc");
  assertIncludes(source, "{ type, tool, url, toolUseId, actionData? }", "tool executor doc");
  assertIncludes(source, "tool executor permission_required 重试链", "tool executor doc");
  assertIncludes(source, "update_plan`：审批通过后直接回", "tool executor doc");
  assertIncludes(source, "__cpDomainTransitionPermissionRequiredFactory", "tool executor doc");
  assertIncludes(source, "`toolUseId` 留在 bridge/tool 层，`tabId` 只负责 sidepanel 作用域与前缀恢复，不参与最终 resolve。", "tool executor doc");
  assertIncludes(source, "执行前的 indicator/debugger 挂载链", "tool executor doc");
  assertIncludes(source, "执行结束后的 indicator/completion prefix 收口链", "tool executor doc");
  assertIncludes(source, "只要工具落到真实 tab，这里就会登记运行态、点亮前缀，并记录 requestId -> tab 的运行中账本。", "tool executor doc");
  assertIncludes(source, "tabs_context_mcp 首次建组前若还没有真实 tab，上面的 no-tab 例外会先放行，但不会提前点亮 indicator。", "tool executor doc");
  assertIncludes(source, "tab 执行完成后的延迟收尾。", "tool executor doc");
  assertIncludes(source, "requestId", "tool executor doc");
  assertIncludes(source, "toolUseId", "tool executor doc");
  assertIncludes(source, "computer 是浏览器前台交互总入口。", "tool executor doc");
  assertIncludes(source, "computer 的 action -> permission 映射与 wait 例外。", "tool executor doc");
  assertIncludes(source, "permission_required 的 actionData 回填边界。", "tool executor doc");
  assertIncludes(source, "javascript_tool`：只透出脚本文本，不带 timeout / eval 细节。", "tool executor doc");
  assertIncludes(source, "form_input / upload_image`：只回填 `ref / coordinate / value / imageId`", "tool executor doc");
  assertIncludes(source, "find / get_page_text / read_page / read_console_messages / read_network_requests / navigate`：默认只返回基础四元组", "tool executor doc");
  assertIncludes(source, "GIF 导出上传`：复用 `upload_image` 家族，但 popup 只吃 `coordinate` 预览", "tool executor doc");
  assertIncludes(source, "navigate`：只有普通 URL 分支会做协议补全、blocklist 与域 permission；`back / forward` 只复用历史栈，不重走 permission gate。", "tool executor doc");
  assertIncludes(source, "get_page_text / read_page`：共用“先 permission，后 hideIndicator/read DOM”的读页模板；permission popup 分支不会提前隐藏 indicator。", "tool executor doc");
  assertIncludes(source, "upload_image`：先过目标域 permission，再做原始 URL 安全校验与 message image 解析；permission popup 不会读取历史图片二进制。", "tool executor doc");
  assertIncludes(source, "A(...) / __cpMcpPreExecuteSameDomainGuard`：域权限通过后的同域重校验闸门", "tool executor doc");
  assertIncludes(source, "A(...)` 当前覆盖 `click / type / key / drag / scroll_to / hover / javascript_tool / file upload / form_input / GIF export upload / upload_image`。", "tool executor doc");
  assertIncludes(source, "页面级动作：`type / key / javascript_tool`。", "tool executor doc");
  assertIncludes(source, "定位/指针动作：`click / double_click / triple_click / drag / scroll_to / hover`。", "tool executor doc");
  assertIncludes(source, "表单/上传动作：`file upload / form_input / upload_image / GIF export upload`。", "tool executor doc");
  assertIncludes(source, "M / __cpMcpScreenshotViewportContextLedger`：screenshot viewport context 账本，只保存 `viewportWidth / viewportHeight / screenshotWidth / screenshotHeight` 这 4 个尺寸字段", "tool executor doc");
  assertIncludes(source, "ne(...) / __cpMcpScaleScreenshotCoordinatesToViewport`：截图坐标 -> 当前 viewport 坐标缩放器；纯 coordinate 路径先缩放，再进 guard。", "tool executor doc");
  assertIncludes(source, "me(...) / __cpMcpResolveRefToViewportCenter`：`read_page/find` 的 ref 解析器；会先从 `__claudeElementMap` 解引用并清理失效 ref，`scrollIntoView` 到可视区中心，再返回中心点坐标，并给 span 记一笔 `ref_lookup_ms`。", "tool executor doc");
  assertIncludes(source, "`window.__generateAccessibilityTree` 才是 `read_page/find` 共用的 ref writer；`file_upload / form_input / upload_image(ref)` 都是直接 consumer，不走 `me(...)` 这条“ref -> 中心点坐标”链。", "tool executor doc");
  assertIncludes(source, "`clearContext / clearAllContexts`：当前只看到定义，没有显式调用；这本 screenshot context 账本实际主要靠后续 `screenshot -> setContext(...)` 覆盖刷新，不靠主动 clear。", "tool executor doc");
  assertIncludes(source, "`scroll`：也会先复用 screenshot context 做坐标缩放，但不像 `click / hover / drag` 那样再进入 `A(...)` 同域重校验。", "tool executor doc");
  assertIncludes(source, "`zoom`：只消费最近一次 screenshot context，不会回写或清理这本账本。", "tool executor doc");
  assertIncludes(source, "`click(ref)` / `hover(ref)`：先解 ref 成中心点坐标，再进 `A(...)`。", "tool executor doc");
  assertIncludes(source, "`scroll_to`：先过 `A(...)`，再解 ref / `scrollIntoView`。", "tool executor doc");
  assertIncludes(source, "`click(coordinate)` / `hover(coordinate)` / `drag`：先按截图上下文做坐标缩放，再进 `A(...)`。", "tool executor doc");
  assertIncludes(source, "Me(...) / __cpMcpBeforeunloadNavigationGuard`：`navigate` 专用的 beforeunload 三态收口器", "tool executor doc");
  assertIncludes(source, "scroll_to / hover 与 read_page/find ref 链。", "tool executor doc");
  assertIncludes(source, "click helper 会先临时隐藏 indicator，再走 mouseMoved -> mousePressed -> mouseReleased。", "tool executor doc");
  assertIncludes(source, "screenshot 先探测 viewport，再走 CDP captureScreenshot；超限时回退内容脚本压缩链。", "tool executor doc");
  assertIncludes(source, "screenshot 会把 viewport/screenshot 尺寸写进上下文，供后续坐标动作做缩放换算。", "tool executor doc");
  assertIncludes(source, "scroll 优先尝试 CDP scrollWheel；无效或超时再回退 DOM/事件注入滚动。", "tool executor doc");
  assertIncludes(source, "scroll 成功后会尽量补一张新截图，给后续模型继续定位。", "tool executor doc");
  assertIncludes(source, "left_click_drag 复用截图上下文做坐标换算，再串成完整拖拽事件序列。", "tool executor doc");
  assertIncludes(source, "zoom 会校验 region 边界，并用 CDP clip 截取局部高分辨率截图。", "tool executor doc");
  assertIncludes(source, "find 的 accessibility tree -> createAnthropicMessage(modelClass=small_fast) -> provider 文本提取。", "tool executor doc");
  assertIncludes(source, "`find` 只解析 provider 文本里的 `ref_X | role | name | type | reason` 行，不会回到 `__claudeElementMap` 验活；拿到 stale ref 时，真正报错发生在后续 click / form_input / upload_image 等 consumer。", "tool executor doc");
  assertIncludes(source, "find 的 query 裁剪。", "tool executor doc");
  assertIncludes(source, "provider 文本提取兼容层。", "tool executor doc");
  assertIncludes(source, "navigate 的 Me beforeunload / unsaved changes(force)。", "tool executor doc");
  assertIncludes(source, "navigate 的 back / forward / 普通 URL 三路。", "tool executor doc");
  assertIncludes(source, "普通 URL 补 https + blocklist + permission。", "tool executor doc");
  assertIncludes(source, "read_page 的 hideIndicatorForToolUse。", "tool executor doc");
  assertIncludes(source, "read_page 的 main frame 失败转 allFrames。", "tool executor doc");
  assertIncludes(source, "read_page 的 finally restoreIndicatorAfterToolUse。", "tool executor doc");
  assertIncludes(source, "sidepanel 工具标题压缩器。", "tool executor doc");
  assertIncludes(source, "read_page 标题只消费 filter，不在头部透出 depth/ref_id/max_chars。", "tool executor doc");
  assertIncludes(source, "find 标题只展示截断后的 query。", "tool executor doc");
  assertIncludes(source, "navigate 标题只展示截断后的 url。", "tool executor doc");
  assertIncludes(source, "sidepanel 的工具结果卡片 consumer。", "tool executor doc");
  assertIncludes(source, "computer 结果卡片优先读 input.action；如果 result.content 里还能解析出 action，就用它兜底恢复展示分支。", "tool executor doc");
  assertIncludes(source, "debug 展开态会把 click 坐标和 drag 路径叠加到最近一张 screenshot 上。", "tool executor doc");
  assertIncludes(source, "timeline group 的缩略图优先显示工具结果自带图片；没有图片时才退回 lastScreenshot + 坐标覆盖层。", "tool executor doc");
  assertIncludes(source, "sidepanel 的 tool_result 账本入口。", "tool executor doc");
  assertIncludes(source, "tool_result 图片会顺手写入 screenshotsByTab。", "tool executor doc");
  assertIncludes(source, "tool_use 渲染时会向后扫描同消息后的 user tool_result。", "tool executor doc");
  assertIncludes(source, "TimelineGroup 构造器会把连续的 tool_use/tool_result 相邻块折成一个 group。", "tool executor doc");
  assertIncludes(source, "timeline block renderer 读的是 tool_use 块，但展示时会去 toolResultsByToolId 账本里取对应结果。", "tool executor doc");
  assertIncludes(source, "turn_answer_start 会把 assistant 输出切成“时间线阶段”和“最终回答阶段”两段。", "tool executor doc");
  assertIncludes(source, "`_s(...) / __cpSidepanelBuildToolRenderContext`：扫描整段消息，建立 `toolResultsByToolId + screenshotsByTab` 共用账本；不负责 `messageGroups` 分组。", "tool executor doc");
  assertIncludes(source, "`$b(...) / __cpSidepanelRenderBrowserToolTimelineCard`：浏览器工具统一卡片壳；在 `TimelineGroup` 模式下同时消费 `toolResult / screenshotsByTab / coordinate`。", "tool executor doc");
  assertIncludes(source, "`Vb(...) / __cpSidepanelRenderBrowserToolResultCard`：`computer / read_page / find / navigate` 等结果卡片正文 consumer；debug overlay 也统一在这里。", "tool executor doc");
  assertIncludes(source, "messageGroups 里的 tool_group 会被渲染成可折叠 TimelineGroup。", "tool executor doc");
  assertIncludes(source, "sidepanel timeline renderContext 账本，不负责 messageGroups 构造。", "tool executor doc");
  assertIncludes(source, "messageGroups 构造入口。", "tool executor doc");
  assertIncludes(source, "运行中且后面已无真实 user 文本”的 assistant 尾段", "tool executor doc");
  assertIncludes(source, "tool_group 起始判定：当前消息已是工具态，或后 3 条内仍会继续接工具链。", "tool executor doc");
  assertIncludes(source, "tool_group / single / result / compact summary", "tool executor doc");
  assertIncludes(source, "tool_group -> ik(...)`，`single assistant -> sk(...) -> Yw(...)", "tool executor doc");
  assertIncludes(source, "tool_group` 路径不会经过 `Yw(...)`", "tool executor doc");
  assertIncludes(source, "showThumbs 只给 assistant 正文块；要么它已经到对话尾部，要么后面已经出现新的真实 user 提问。", "tool executor doc");
  assertIncludes(source, "lastHumanMessage 绑定最后一个真实 user 组；lastAssistantMessage 绑定其后的 assistant 尾段容器。", "tool executor doc");
  assertIncludes(source, "messageHistory -> compact divider -> 当前 messageGroups -> extras/footer/chatInput", "tool executor doc");
  assertIncludes(source, "__cpSidepanelRenderConversationScrollLayer", "tool executor doc");
  assertIncludes(source, "底部 thinking/compacting 状态只在“仍在跑、没有 permission prompt、且最后一组没有展开 timeline”时显示。", "tool executor doc");
  assertIncludes(source, "sidepanel 当前消息会先折成 messageGroups，再交给 ok/ak 做 tool_group 与普通消息分流渲染。", "tool executor doc");
  assertIncludes(source, "__cpSidepanelMaintainBottomViewportSpacer", "tool executor doc");
  assertIncludes(source, "__cpSidepanelRenderChatInputFooter", "tool executor doc");
  assertIncludes(source, "chatInputContainerRef` 真正挂在输入卡片容器上", "tool executor doc");
  assertIncludes(source, "__cpSidepanelRenderScrollToBottomGuard", "tool executor doc");
  assertIncludes(source, "__cpSidepanelAutoscrollControllerRef", "tool executor doc");
  assertIncludes(source, "__cpSidepanelMessageBottomSentinelRef", "tool executor doc");
  assertIncludes(source, "FY(...) / __cpSidepanelProvideComposerShortcutMenuState", "tool executor doc");
  assertIncludes(source, "HY(...) / __cpSidepanelRenderInputAnchoredShortcutMenu", "tool executor doc");
  assertIncludes(source, "BY(...) / __cpSidepanelRenderComposerCommandMenu", "tool executor doc");
  assertIncludes(source, "GY(...) / __cpSidepanelBuildSlashShortcutSuggestionConfig", "tool executor doc");
  assertIncludes(source, "KY(...) / __cpSidepanelSlashShortcutSuggestionExtension", "tool executor doc");
  assertIncludes(source, "activeBanner` 复用 `YY(...)` 顶部 banner 槽", "tool executor doc");
  assertIncludes(source, "Wx(...)` 是可折叠的状态 pill 头部，只负责文案、caret 展开和 summary suffix。", "tool executor doc");
  assertIncludes(source, "__cpSidepanelRenderTimelineStatusPillHeader", "tool executor doc");
  assertIncludes(source, "Kx(...)` 是最后一组工具时间线的状态 pill 容器。", "tool executor doc");
  assertIncludes(source, "__cpSidepanelRenderTimelineStatusWindow", "tool executor doc");
  assertIncludes(source, "working status 可见条件：仍在流式执行、已有 timeline blocks、且还没进入 turn over 锁存。", "tool executor doc");
  assertIncludes(source, "fadeOnStatus 会把状态文案变化当成时间线阶段切点。", "tool executor doc");
  assertIncludes(source, "collapse 模式只保留“等待输入工具 + 最近 N 个非 thinking 工具”；fadeOnStatus 则只展示最近一次状态切点之后的新阶段 blocks。", "tool executor doc");
  assertIncludes(source, "当前活跃的 ik 链固定走 fadeOnStatus，不走 collapse，也不传 streamingMinHeight。", "tool executor doc");
  assertIncludes(source, "可见时间线窗口收缩时，会把被移出的块暂存到退出缓冲区，给 fade/collapse 动画一个短暂收尾。", "tool executor doc");
  assertIncludes(source, "onStatusDisplayVisibilityChange 只在 live working status 真正显示时通知父层。", "tool executor doc");
  assertIncludes(source, "`turnIsOver`：有 timelineBlocks 时，需要 finalBlocks/后续 result-user/completion signal 任一命中；纯 answer_start 场景则靠 foundTurnAnswerStart 等边界兜底。", "tool executor doc");
  assertIncludes(source, "turn_answer_start` 只是阶段分割标记，本身不渲染。", "tool executor doc");
  assertIncludes(source, "timeline statusText 优先吃 currentStatusProp，没有外部状态时才回退默认 Working。", "tool executor doc");
  assertIncludes(source, "`ik(...)` 固定把 `Kx` 切到 `fadeOnStatus`；状态文案变化会把最后一组时间线切成新的可见阶段。", "tool executor doc");
  assertIncludes(source, "等待输入工具判定：approval_options+approval_key、mcp_auth_required、外部 isToolAwaitingInput 谓词，以及 AskUserQuestion 都算“等待用户动作”。", "tool executor doc");
  assertIncludes(source, "等待输入工具保活链：只要 tool_use 还没被 actionedToolIds 标记消费，就算窗口裁剪也必须继续保留可见。", "tool executor doc");
  assertIncludes(source, "streamingMinHeight 只在“未展开、当前窗口里没有等待输入工具、且还有可见 blocks”时生效。", "tool executor doc");
  assertIncludes(source, "状态 pill 文案切换：live status 可见且位置在 pill 内时显示 statusText；否则回退成 step count summary。", "tool executor doc");
  assertIncludes(source, "当前不会额外传 `actionedToolIds / isToolAwaitingInput`；当前主链的等待输入主要靠 tool_use 自带 `approval/mcp_auth_required/AskUserQuestion` 字段兜底。", "tool executor doc");
  assertIncludes(source, "PING_SIDEPANEL 只是活性探针，收到后立即回 success + 当前 tabId。", "tool executor doc");
  assertIncludes(source, "MAIN_TAB_ACK_REQUEST 只让主 tab 回 ACK；secondary tab 收到但不匹配时直接忽略。", "tool executor doc");
  assertIncludes(source, "STOP_AGENT` 当前不按 `targetTabId` 过滤；sidepanel 收到后会直接走 `cancel + permission deny` 收口。", "tool executor doc");
  assertIncludes(source, "EXECUTE_TASK 会先按 windowSessionId / targetTabId 过滤目标 sidepanel。", "tool executor doc");
  assertIncludes(source, "`OPEN_SIDE_PANEL` 的 `tabId` 只负责打开/绑定目标 sidepanel；后续 `POPULATE_INPUT_TEXT` 不再携带 `tabId`。", "tool executor doc");
  assertIncludes(source, "scheduled task 只是给 prompt 加任务名前缀；真正发送仍复用普通 sendMessage 主链。", "tool executor doc");
  assertIncludes(source, "`scheduled task` 真正的定向键是 `windowSessionId`；当前这条 bridge 不生产 `targetTabId`。", "tool executor doc");
  assertIncludes(source, "POPULATE_INPUT_TEXT 负责把 prompt / permissionMode / selectedModel / attachments 一次性灌进 sidepanel 草稿态。", "tool executor doc");
  assertIncludes(source, "`POPULATE_INPUT_TEXT` 自身不再按 `tabId/sessionId` 过滤；面板选路发生在 `service-worker` 打开目标 panel 和 `EXECUTE_TASK` 分支里。", "tool executor doc");
  assertIncludes(source, "pendingPrompt` 也从这里建立。", "tool executor doc");
  assertIncludes(source, "带附件的 populate 走“先注入草稿/附件，再延迟触发发送”。", "tool executor doc");
  assertIncludes(source, "浏览器控制权限放行后，如果 sidepanel 里还有 pendingPrompt，会补发一次 sendMessage。", "tool executor doc");
  assertIncludes(source, "`MCP_PERMISSION_RESPONSE` 在 `service-worker` 主桥里只是轻量 ACK；`requestId/allowed` 不在这里解析，而是留给 `mcpPermissions` 背景账本。", "tool executor doc");
  assertIncludes(source, "`MAIN_TAB_ACK_RESPONSE` 收口时只消费 `success`；`secondaryTabId / mainTabId / timestamp` 只服务探测阶段与 ACK cache。", "tool executor doc");
}

async function testTaskPlanMentionsThirdRoundClosure() {
  const source = read(taskPlanPath);
  assertIncludes(source, "第三轮收口状态（2026-04-15）：", "task plan");
  assertIncludes(source, "tabs_context_mcp", "task plan");
  assertIncludes(source, "tabs_create_mcp", "task plan");
  assertIncludes(source, "tabs_close_mcp", "task plan");
  assertIncludes(source, "toolUseId", "task plan");
  assertIncludes(source, "requestId", "task plan");
  assertIncludes(source, "tabId", "task plan");
  assertIncludes(source, "不会提前点亮 indicator", "task plan");
  assertIncludes(source, "completion prefix / debugger detach / 延迟收尾 / worker 重启兜底清理", "task plan");
  assertIncludes(source, "第三轮下一批工具链（进行中）：", "task plan");
  assertIncludes(source, "action -> permission", "task plan");
  assertIncludes(source, "click / screenshot / scroll / drag / zoom 的 helper 语义已开始细拆", "task plan");
  assertIncludes(source, "accessibility tree -> small_fast -> provider 文本提取", "task plan");
  assertIncludes(source, "back / forward / 普通 URL", "task plan");
  assertIncludes(source, "hideIndicatorForToolUse", "task plan");
  assertIncludes(source, "main frame -> allFrames", "task plan");
  assertIncludes(source, "finally restoreIndicatorAfterToolUse", "task plan");
  assertIncludes(source, "第三轮衔接面（继续推进）：", "task plan");
  assertIncludes(source, "工具标题压缩器", "task plan");
  assertIncludes(source, "结果卡片 consumer", "task plan");
  assertIncludes(source, "点击坐标 / 拖拽路径叠图", "task plan");
  assertIncludes(source, "image-result / lastScreenshot 回退逻辑", "task plan");
  assertIncludes(source, "tool_result -> tool_use_id -> screenshotsByTab -> TimelineGroup", "task plan");
  assertIncludes(source, "runtime.onMessage", "task plan");
  assertIncludes(source, "PING/ACK/EXECUTE_TASK/POPULATE_INPUT_TEXT", "task plan");
  assertIncludes(source, "service-worker / sidepanel / mcpPermissions` 现已可以拆成三层", "task plan");
  assertIncludes(source, "OPEN_SIDE_PANEL`：`tabId` 只负责打开/绑定目标 sidepanel；后续 `POPULATE_INPUT_TEXT` 不再携带 `tabId`", "task plan");
  assertIncludes(source, "scheduled task`：真正的定向键是 `windowSessionId`；当前 bridge 不生产 `targetTabId`", "task plan");
  assertIncludes(source, "POPULATE_INPUT_TEXT`：自身不按 `tabId/sessionId` 过滤；选路发生在 `OPEN_SIDE_PANEL / EXECUTE_TASK`", "task plan");
  assertIncludes(source, "__cpSidepanelBuildToolRenderContext", "task plan");
  assertIncludes(source, "__cpSidepanelRenderBrowserToolTimelineCard", "task plan");
  assertIncludes(source, "## 11. 第四波任务计划（自 2026-04-15 起）", "task plan");
  assertIncludes(source, "还原 `messageHistory -> renderContext -> messageGroups -> tool_group -> TimelineGroup -> status pill -> chatInput/footer` 的前台编排链", "task plan");
  assertIncludes(source, "彻底区分“账本层 / 分组层 / 渲染层 / 状态层 / 输入桥”五个前台层次", "task plan");
  assertIncludes(source, "第四波重点文件：", "task plan");
  assertIncludes(source, "`assets/sidepanel-BoLm9pmH.js`", "task plan");
  assertIncludes(source, "`assets/agent-visual-indicator.js-Ct7LqXhp.js`", "task plan");
  assertIncludes(source, "第四波分阶段拆解：", "task plan");
  assertIncludes(source, "`messageGroups / timeline` 组装层", "task plan");
  assertIncludes(source, "工具结果卡片与调试图层", "task plan");
  assertIncludes(source, "状态层与执行阶段窗口", "task plan");
  assertIncludes(source, "输入桥与前台执行入口", "task plan");
  assertIncludes(source, "第四波明确不做：", "task plan");
  assertIncludes(source, "不重写 sidepanel UI", "task plan");
  assertIncludes(source, "第四波完成标准：", "task plan");
  assertIncludes(source, "能把 sidepanel 前台链稳定拆成“账本 / 分组 / 渲染 / 状态 / 输入桥”五层", "task plan");
  assertIncludes(source, "第三轮时间线层补齐（2026-04-15）：", "task plan");
  assertIncludes(source, "sidepanel timeline renderContext 账本，不负责 messageGroups 构造", "task plan");
  assertIncludes(source, "messageGroups 构造入口", "task plan");
  assertIncludes(source, "tool_group 起始判定", "task plan");
  assertIncludes(source, "tool_group / single / result / compact summary", "task plan");
  assertIncludes(source, "showThumbs", "task plan");
  assertIncludes(source, "lastHumanMessage / lastAssistantMessage", "task plan");
  assertIncludes(source, "messageHistory -> compact divider -> 当前 messageGroups -> extras/footer/chatInput", "task plan");
  assertIncludes(source, "底部 thinking/compacting 状态", "task plan");
  assertIncludes(source, "第三轮状态层补齐（2026-04-15）：", "task plan");
  assertIncludes(source, "Wx(...)`：可折叠的状态 pill 头部，只管文案/caret/summary suffix", "task plan");
  assertIncludes(source, "__cpSidepanelRenderTimelineStatusPillHeader", "task plan");
  assertIncludes(source, "Kx(...)`：最后一组工具时间线的状态 pill 容器", "task plan");
  assertIncludes(source, "__cpSidepanelRenderTimelineStatusWindow", "task plan");
  assertIncludes(source, "working status 可见条件", "task plan");
  assertIncludes(source, "fadeOnStatus", "task plan");
  assertIncludes(source, "collapse 模式", "task plan");
  assertIncludes(source, "退出缓冲区", "task plan");
  assertIncludes(source, "onStatusDisplayVisibilityChange", "task plan");
  assertIncludes(source, "timeline statusText", "task plan");
  assertIncludes(source, "ik(...) -> Kx(fadeOnStatus)", "task plan");
  assertIncludes(source, "等待输入工具判定", "task plan");
  assertIncludes(source, "等待输入工具保活链", "task plan");
  assertIncludes(source, "streamingMinHeight 生效边界", "task plan");
  assertIncludes(source, "状态 pill 文案切换", "task plan");
  assertIncludes(source, "当前不会额外传 actionedToolIds / isToolAwaitingInput", "task plan");
  assertIncludes(source, "运行中且后面已无真实 user 文本的 assistant 尾段", "task plan");
  assertIncludes(source, "tool_group -> ik(...)`，`single assistant -> sk(...) -> Yw(...)", "task plan");
  assertIncludes(source, "__cpSidepanelRenderConversationScrollLayer", "task plan");
  assertIncludes(source, "__cpSidepanelMaintainBottomViewportSpacer", "task plan");
  assertIncludes(source, "scrollRefs`：聚合 `lastHuman / lastAssistant / extras / extraSpace / chatInput` 五组 viewport ref", "task plan");
  assertIncludes(source, "__cpSidepanelRenderChatInputFooter", "task plan");
  assertIncludes(source, "chatInputContainerRef`：真正挂在输入卡片容器上，供 `extraSpace` 计算与 sticky 底栏定位复用", "task plan");
  assertIncludes(source, "__cpSidepanelRenderScrollToBottomGuard", "task plan");
  assertIncludes(source, "__cpSidepanelAutoscrollControllerRef", "task plan");
  assertIncludes(source, "__cpSidepanelMessageBottomSentinelRef", "task plan");
  assertIncludes(source, "activeBanner`：复用 `YY(...)` 顶部 banner 槽", "task plan");
  assertIncludes(source, "FY(...) / __cpSidepanelProvideComposerShortcutMenuState", "task plan");
  assertIncludes(source, "HY(...) / __cpSidepanelRenderInputAnchoredShortcutMenu", "task plan");
  assertIncludes(source, "BY(...) / __cpSidepanelRenderComposerCommandMenu", "task plan");
  assertIncludes(source, "GY(...) / __cpSidepanelBuildSlashShortcutSuggestionConfig", "task plan");
  assertIncludes(source, "KY(...) / __cpSidepanelSlashShortcutSuggestionExtension", "task plan");
  assertIncludes(source, "固定走 `fadeOnStatus`，不走 `collapse`，也不传 `streamingMinHeight`", "task plan");
  assertIncludes(source, "STOP_AGENT` 当前 consumer 不读取 background 补的 `targetTabId`", "task plan");
  assertIncludes(source, "POPULATE_INPUT_TEXT` 是“草稿灌入 + 条件满足时延迟自动发送”；浏览器控制权限放行后会补发 `pendingPrompt`", "task plan");
  assertIncludes(source, "第三轮 permission sentinel 补齐（2026-04-15）：", "task plan");
  assertIncludes(source, "handleToolCall(...)` 返回带 `type` 的对象时，当前约定它仍是 `permission_required sentinel`", "task plan");
  assertIncludes(source, "普通工具的 permission_required sentinel 统一形状", "task plan");
  assertIncludes(source, "actionData` 只回填 permission popup 预览所需的最小字段", "task plan");
  assertIncludes(source, "javascript_tool`：只透出脚本文本，不带 timeout / eval 细节", "task plan");
  assertIncludes(source, "form_input / upload_image`：只回填 `ref/coordinate/value/imageId`", "task plan");
  assertIncludes(source, "find / get_page_text / read_page / read_console_messages / read_network_requests / navigate`：默认只返回基础四元组", "task plan");
  assertIncludes(source, "GIF 导出上传`：复用 `upload_image` 家族，但 popup 只吃 `coordinate` 预览", "task plan");
  assertIncludes(source, "navigate`：只有普通 URL 分支会做协议补全、blocklist 与域 permission；`back/forward` 不重走 permission gate", "task plan");
  assertIncludes(source, "get_page_text / read_page`：共用“先 permission，后 hideIndicator/read DOM”的读页模板", "task plan");
  assertIncludes(source, "upload_image`：先过目标域 permission，再做原始 URL 安全校验与 message image 解析", "task plan");
  assertIncludes(source, "A(...) / __cpMcpPreExecuteSameDomainGuard", "task plan");
  assertIncludes(source, "A(...)` 的调用家族：", "task plan");
  assertIncludes(source, "页面级动作：`type / key / javascript_tool`", "task plan");
  assertIncludes(source, "定位/指针动作：`click / double_click / triple_click / drag / scroll_to / hover`", "task plan");
  assertIncludes(source, "表单/上传动作：`file upload / form_input / upload_image / GIF export upload`", "task plan");
  assertIncludes(source, "M / __cpMcpScreenshotViewportContextLedger", "task plan");
  assertIncludes(source, "ne(...) / __cpMcpScaleScreenshotCoordinatesToViewport", "task plan");
  assertIncludes(source, "me(...) / __cpMcpResolveRefToViewportCenter", "task plan");
  assertIncludes(source, "file_upload / form_input / upload_image(ref)`：都是直接 ref consumer，不走 `me(...)`；它们会在各自页面注入函数里直接验活 `__claudeElementMap`", "task plan");
  assertIncludes(source, "只解析 provider 文本里的 `ref_X | role | name | type | reason` 行，不回到 `__claudeElementMap` 验活", "task plan");
  assertIncludes(source, "clearContext / clearAllContexts`：当前只见定义，没有显式调用；screenshot context 主要靠后续 `setContext(...)` 覆盖刷新", "task plan");
  assertIncludes(source, "scroll`：会复用 screenshot context 做坐标缩放，但不像 `click / hover / drag` 那样再进 `A(...)`", "task plan");
  assertIncludes(source, "zoom`：只消费最近一次 screenshot context，不会回写或清理账本", "task plan");
  assertIncludes(source, "ref_lookup_ms", "task plan");
  assertIncludes(source, "click(ref)` / `hover(ref)`：先解 `ref`，再进 `A(...)`", "task plan");
  assertIncludes(source, "scroll_to`：先过 `A(...)`，再解 `ref / scrollIntoView`", "task plan");
  assertIncludes(source, "click(coordinate)` / `hover(coordinate)` / `drag`：先按截图上下文做坐标缩放，再进 `A(...)`", "task plan");
  assertIncludes(source, "Me(...) / __cpMcpBeforeunloadNavigationGuard", "task plan");
  assertIncludes(source, "update_plan`：审批通过后直接回 `plan approved` 文本", "task plan");
  assertIncludes(source, "__cpDomainTransitionPermissionRequiredFactory", "task plan");
}

async function main() {
  await testCompactConversationCompactsWithoutTdz();
  await testSidepanelContextUsageIndicatorAnchorsExist();
  await testSidepanelContextUsageIndicatorUsesConfiguredWindowForDisplay();
  await testSidepanelStripsCustomToolTypeForCustomAnthropicProviders();
  await testSidepanelCompactionBlocksConcurrentSendAnchorsExist();
  await testSidepanelRetriesTransientStreamErrorsAnchorsExist();
  await testSidepanelAnchorsExist();
  await testServiceWorkerBundleAnchorsExist();
  await testAccessibilityTreeAnchorsExist();
  await testAgentVisualIndicatorAnchorsExist();
  await testStartRecordingAnchorsExist();
  await testPairingAnchorsExist();
  await testContentScriptAnchorsExist();
  await testOptionsBundleAnchorsExist();
  await testOffscreenAnchorsExist();
  await testDetachedWindowRuntimeAnchorsExist();
  await testServiceWorkerRuntimeAnchorsExist();
  await testServiceWorkerLoaderAnchorsExist();
  await testPermissionManagerAnchorsExist();
  await testMcpPermissionsAnchorsExist();
  await testStorageChunkAnchorExists();
  console.log("deobfuscation anchor regression tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
