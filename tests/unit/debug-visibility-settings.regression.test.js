const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const contractPath = path.join(rootDir, "src", "shared", "claw-contract.js");
const settingsPath = path.join(rootDir, "src", "shared", "custom-provider-settings.js");
const optionsEnhancerPath = path.join(
  rootDir,
  "src",
  "options",
  "options-update-enhancer.js"
);
const permissionManagerPath = path.join(
  rootDir, "src", "assets",
  "PermissionManager-9s959502.js",
);
const sidepanelPath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");
const sidepanelLoggerPath = path.join(rootDir, "src", "sidepanel", "sidepanel-debug-logger.js");
const zhCustomI18nPath = path.join(rootDir, "src", "i18n", "custom", "zh-CN.js");
const zhTwCustomI18nPath = path.join(rootDir, "src", "i18n", "custom", "zh-TW.js");

function main() {
  const contractSource = fs.readFileSync(contractPath, "utf8");
  const settingsSource = fs.readFileSync(settingsPath, "utf8");
  const optionsEnhancerSource = fs.readFileSync(optionsEnhancerPath, "utf8");
  const permissionManagerSource = fs.readFileSync(permissionManagerPath, "utf8");
  const sidepanelSource = fs.readFileSync(sidepanelPath, "utf8");
  const sidepanelLoggerSource = fs.readFileSync(sidepanelLoggerPath, "utf8");
  const zhCustomI18nSource = fs.readFileSync(zhCustomI18nPath, "utf8");
  const zhTwCustomI18nSource = fs.readFileSync(zhTwCustomI18nPath, "utf8");

  assert.match(
    contractSource,
    /DEBUG_MODE_STORAGE_KEY:\s*"debugMode"/,
    "shared contract should expose the debug mode storage key",
  );

  assert.match(
    contractSource,
    /SHOW_TRACE_IDS_STORAGE_KEY:\s*"showTraceIds"/,
    "shared contract should expose the trace ID storage key",
  );

  assert.match(
    contractSource,
    /SHOW_SYSTEM_REMINDERS_STORAGE_KEY:\s*"showSystemReminders"/,
    "shared contract should expose the system reminders storage key",
  );

  assert.match(
    contractSource,
    /INCOGNITO_MODE_STORAGE_KEY:\s*"incognitoMode"/,
    "shared contract should expose the incognito mode storage key"
  );

  assert.match(
    optionsEnhancerSource,
    /function renderIncognitoPanel\(panel\) \{[\s\S]*toggle\.className = "cp-page-toggle cp-update-enhancer-toggle";/s,
    "options enhancer should render the incognito switch"
  );

  assert.match(
    settingsSource,
    /const DEBUG_MODE_STORAGE_KEY =\s*uiContract\.DEBUG_MODE_STORAGE_KEY \|\|\s*"debugMode";/s,
    "settings page should read the shared debug mode storage key",
  );

  assert.match(
    settingsSource,
    /const SHOW_TRACE_IDS_STORAGE_KEY =\s*uiContract\.SHOW_TRACE_IDS_STORAGE_KEY \|\|\s*"showTraceIds";/s,
    "settings page should read the shared trace IDs storage key",
  );

  assert.match(
    settingsSource,
    /const SHOW_SYSTEM_REMINDERS_STORAGE_KEY =\s*uiContract\.SHOW_SYSTEM_REMINDERS_STORAGE_KEY \|\|\s*"showSystemReminders";/s,
    "settings page should read the shared system reminders storage key",
  );

  assert.match(
    settingsSource,
    /debugTitle:\s*"Developer \/ debug"/,
    "settings page should expose a dedicated developer/debug section title",
  );

  assert.match(
    settingsSource,
    /traceIdsTitle:\s*"Show trace IDs"/,
    "settings page should define a trace IDs toggle label",
  );

  assert.match(
    settingsSource,
    /systemRemindersTitle:\s*"Show system reminders"/,
    "settings page should define a system reminders toggle label",
  );

  assert.doesNotMatch(
    settingsSource,
    /debugStack\.appendChild\(debugModeRow\);/,
    "settings page should no longer surface a manual debug mode row",
  );

  assert.match(
    settingsSource,
    /const traceIdsToggle = createNode\(\s*"button",\s*"cp-page-toggle cp-update-enhancer-toggle",\s*\);/s,
    "settings page should render the trace IDs switch with the shared toggle styling",
  );

  assert.match(
    settingsSource,
    /const systemRemindersToggle = createNode\(\s*"button",\s*"cp-page-toggle cp-update-enhancer-toggle",\s*\);/s,
    "settings page should render the system reminders switch with the shared toggle styling",
  );

  assert.match(
    settingsSource,
    /const createToggleMetaNode = function \(\) \{[\s\S]*metaNode\.hidden = true;[\s\S]*metaNode\.setAttribute\("aria-hidden", "true"\);[\s\S]*return metaNode;[\s\S]*\};/s,
    "settings page should create hidden toggle meta nodes so the row no longer shows enabled or disabled text",
  );

  assert.match(
    settingsSource,
    /function renderDebugToggle\(metaNode, toggleNode, enabled, pending\) \{[\s\S]*metaNode\.textContent = "";[\s\S]*metaNode\.hidden = true;[\s\S]*metaNode\.setAttribute\("aria-hidden", "true"\);/s,
    "settings page should keep toggle status copy hidden during re-renders",
  );

  assert.match(
    settingsSource,
    /if \(stored\[DEBUG_MODE_STORAGE_KEY\] !== true\) \{[\s\S]*\[DEBUG_MODE_STORAGE_KEY\]: true,/s,
    "settings page should auto-correct the persisted debug mode flag to true",
  );

  assert.match(
    settingsSource,
    /storageKey:\s*SHOW_TRACE_IDS_STORAGE_KEY/,
    "settings page should persist the trace IDs preference",
  );

  assert.match(
    settingsSource,
    /storageKey:\s*SHOW_SYSTEM_REMINDERS_STORAGE_KEY/,
    "settings page should persist the system reminders preference",
  );

  assert.match(
    settingsSource,
    /DEBUG_MODE_STORAGE_KEY in changes[\s\S]*SHOW_TRACE_IDS_STORAGE_KEY in changes[\s\S]*SHOW_SYSTEM_REMINDERS_STORAGE_KEY in changes[\s\S]*refreshDebug\(\)\.catch/s,
    "settings page should refresh the debug section when hidden debug preferences change",
  );

  assert.match(
    permissionManagerSource,
    /t\.DEBUG_MODE = "debugMode";/,
    "permission manager bundle should expose the debug mode key",
  );

  assert.match(
    permissionManagerSource,
    /t\.SHOW_TRACE_IDS = "showTraceIds";/,
    "permission manager bundle should expose the trace IDs key",
  );

  assert.match(
    permissionManagerSource,
    /t\.SHOW_SYSTEM_REMINDERS = "showSystemReminders";/,
    "permission manager bundle should expose the system reminders key",
  );

  assert.match(
    sidepanelSource,
    /const \[k, C\] = a\.useState\(true\);/,
    "sidepanel bundle should default debug mode to enabled",
  );

  assert.doesNotMatch(
    sidepanelSource,
    /y\(v\.DEBUG_MODE\)\.then\(e => \{/,
    "sidepanel bundle should no longer hydrate debug mode from storage",
  );

  assert.match(
    sidepanelSource,
    /y\(v\.SHOW_TRACE_IDS\)\.then\(e => \{/,
    "sidepanel bundle should read the trace IDs preference from storage",
  );

  assert.match(
    sidepanelSource,
    /y\(v\.SHOW_SYSTEM_REMINDERS\)\.then\(e => \{/,
    "sidepanel bundle should read the system reminders preference from storage",
  );

  assert.match(
    sidepanelLoggerSource,
    /const DEBUG_MODE_STORAGE_KEY = uiContract\.DEBUG_MODE_STORAGE_KEY \|\| "debugMode";/,
    "sidepanel debug logger should reuse the shared debug mode storage key",
  );

  assert.match(
    sidepanelLoggerSource,
    /let debugEnabled = true;/,
    "sidepanel debug logger should default to enabled",
  );

  assert.match(
    sidepanelLoggerSource,
    /function installIncognitoStorageGuard\(\) \{/,
    "sidepanel logger should install the incognito storage boundary"
  );

  assert.match(
    sidepanelSource,
    /let p = be\(__cpFilterIncognitoRequestMessages\(L\)\);/,
    "standard chat requests should use incognito-filtered context"
  );

  assert.match(
    sidepanelSource,
    /let f = AQ\(__cpIncognitoRuntime\?\.filterMessagesForRequest\?\.\(r, I\.current\) \|\| r\);/,
    "quick-mode requests should use incognito-filtered context"
  );

  assert.match(
    sidepanelSource,
    /const __cpPersistentMessages = __cpIncognitoRuntime\?\.filterMessagesForPersistence\?\.\(dt, o\.sessionId\) \|\| dt;/,
    "session snapshots should exclude temporary incognito messages"
  );

  assert.match(
    sidepanelLoggerSource,
    /if \(stored\[DEBUG_MODE_STORAGE_KEY\] !== true\) \{[\s\S]*\[DEBUG_MODE_STORAGE_KEY\]: true/s,
    "sidepanel debug logger should auto-correct the persisted debug mode flag to true",
  );

  assert.match(
    sidepanelLoggerSource,
    /if \(DEBUG_MODE_STORAGE_KEY in changes\) \{[\s\S]*debugEnabled = true;[\s\S]*\[DEBUG_MODE_STORAGE_KEY\]: true/s,
    "sidepanel debug logger should ignore attempts to disable debug mode",
  );

  assert.match(
    zhCustomI18nSource,
    /"debugTitle": "开发 \/ 调试"/,
    "zh-CN custom strings should translate the developer/debug section",
  );

  assert.match(
    zhCustomI18nSource,
    /"traceIdsTitle": "显示追踪 ID"/,
    "zh-CN custom strings should translate the trace IDs toggle",
  );

  assert.match(
    zhCustomI18nSource,
    /"systemRemindersTitle": "显示系统提醒"/,
    "zh-CN custom strings should translate the system reminders toggle",
  );

  assert.match(
    zhTwCustomI18nSource,
    /"debugTitle": "開發 \/ 偵錯"/,
    "zh-TW custom strings should translate the developer/debug section",
  );

  assert.match(
    zhTwCustomI18nSource,
    /"traceIdsTitle": "顯示追蹤 ID"/,
    "zh-TW custom strings should translate the trace IDs toggle",
  );

  assert.match(
    zhTwCustomI18nSource,
    /"systemRemindersTitle": "顯示系統提醒"/,
    "zh-TW custom strings should translate the system reminders toggle",
  );

  assert.match(
    zhTwCustomI18nSource,
    /"toolResultDetailsTitle": "顯示工具結果詳情"/,
    "zh-TW custom strings should translate the tool result details toggle",
  );

  console.log("debug visibility settings regression test passed");
}

main();
