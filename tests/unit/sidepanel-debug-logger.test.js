const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createChromeMock,
  flushMicrotasks,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");
const {
  FakeDocument,
  FakeElement
} = require("../helpers/fake-dom");

const scriptPath = path.join(__dirname, "..", "..", "src", "sidepanel", "sidepanel-debug-logger.js");

function createConsoleMock() {
  return {
    debugCalls: [],
    warnCalls: [],
    errorCalls: [],
    logCalls: [],
    groupCalls: [],
    debug(...args) {
      this.debugCalls.push(args);
    },
    warn(...args) {
      this.warnCalls.push(args);
    },
    error(...args) {
      this.errorCalls.push(args);
    },
    log(...args) {
      this.logCalls.push(args);
    },
    group(...args) {
      this.groupCalls.push(args);
    },
    groupEnd() {}
  };
}

function createLoggerHarness(initialStorageState = {}) {
  const chromeMock = createChromeMock({
    runtimeId: "sidepanel-debug-test",
    storageState: initialStorageState
  });
  const windowListeners = new Map();
  const document = new FakeDocument({
    readyState: "complete"
  });
  document.title = "Claw Sidepanel";
  document.visibilityState = "visible";
  const consoleMock = createConsoleMock();

  const sandbox = {
    console: consoleMock,
    chrome: chromeMock.chrome,
    document,
    Element: FakeElement,
    Event: class FakeEvent {
      constructor(type) {
        this.type = type;
      }
    },
    URL,
    location: {
      pathname: "/sidepanel.html",
      hash: "#chat"
    },
    navigator: {
      clipboard: {
        async writeText() {}
      }
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    window: {
      addEventListener(type, listener) {
        const current = windowListeners.get(type) || [];
        current.push(listener);
        windowListeners.set(type, current);
      }
    }
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(scriptPath, sandbox);

  async function flushLogs() {
    await flushMicrotasks();
    await flushMicrotasks();
  }

  return {
    chromeMock,
    consoleMock,
    api: sandbox.__CP_SIDEPANEL_DEBUG__,
    async flushLogs() {
      await flushLogs();
      await sandbox.__CP_SIDEPANEL_DEBUG__.flush();
      await flushLogs();
    }
  };
}

async function testLoggerSummarizesProviderAvailabilityWithoutLegacyEnabledFlag() {
  const harness = createLoggerHarness({
    debugMode: true
  });
  await harness.flushLogs();

  const entry = harness.api.log("provider.update", {
    customProviderConfig: {
      apiKey: "sk-secret-value",
      baseUrl: "https://api.example.com/v1",
      defaultModel: "gpt-5.4",
      notes: "internal notes",
      fetchedModels: [{
        value: "claude-sonnet"
      }, {
        value: "gpt-5"
      }]
    }
  });

  assert.equal(entry.payload.customProviderConfig.enabled, true);
  assert.equal(entry.payload.customProviderConfig.hasApiKey, true);
  assert.equal(entry.payload.customProviderConfig.hasBaseUrl, true);
  assert.equal(entry.payload.customProviderConfig.hasDefaultModel, true);
  assert.equal(entry.payload.customProviderConfig.fetchedModelCount, 2);

  await harness.flushLogs();

  const logs = await harness.api.read();
  const target = logs.find(item => item.type === "provider.update");
  assert.ok(target, "provider.update log should be persisted");
  assert.equal(target.payload.customProviderConfig.enabled, true);
  assert.equal(target.payload.customProviderConfig.hasDefaultModel, true);
  assert.equal(harness.consoleMock.debugCalls.length >= 1, true);
}

async function testLoggerStaysEnabledRegardlessOfStoredDebugPreference() {
  const harness = createLoggerHarness({
    debugMode: false
  });
  await harness.flushLogs();

  const initialEntry = harness.api.log("debug.always_on.initial", {
    value: 1
  });
  assert.ok(initialEntry, "logger should still accept entries when stored debug mode is false");
  await harness.flushLogs();
  let logs = await harness.api.read();
  assert.equal(
    logs.some(entry => entry.type === "debug.always_on.initial"),
    true,
    "stored false debug mode should no longer block new sidepanel logs"
  );

  await harness.chromeMock.chrome.storage.local.set({
    debugMode: true
  });
  const enabledEntry = harness.api.log("debug.always_on.after_true", {
    value: 2
  });
  assert.ok(enabledEntry, "logger should keep accepting entries when debug mode is true");
  await harness.flushLogs();

  logs = await harness.api.read();
  assert.equal(
    logs.some(entry => entry.type === "debug.always_on.after_true"),
    true,
    "stored true debug mode should still persist new entries"
  );

  await harness.chromeMock.chrome.storage.local.set({
    debugMode: false
  });
  const afterDisableEntry = harness.api.log("debug.always_on.after_false", {
    value: 3
  });
  assert.ok(afterDisableEntry, "logger should ignore attempts to disable debug mode");
  await harness.flushLogs();

  logs = await harness.api.read();
  assert.equal(
    logs.some(entry => entry.type === "debug.always_on.after_false"),
    true,
    "new entries should still persist after stored debug mode flips back to false"
  );
  const storedDebugMode = await harness.chromeMock.chrome.storage.local.get("debugMode");
  assert.equal(
    storedDebugMode.debugMode,
    true,
    "logger should auto-correct the persisted debug mode flag back to true"
  );
}

async function testLegacyFloatingPanelInterfaceIsRemoved() {
  const harness = createLoggerHarness({
    debugMode: true
  });
  await harness.flushLogs();

  assert.equal(
    "openPanel" in harness.api,
    false,
    "legacy floating log panel openPanel interface should be removed"
  );
  assert.equal(
    "closePanel" in harness.api,
    false,
    "legacy floating log panel closePanel interface should be removed"
  );
  assert.equal(
    "togglePanel" in harness.api,
    false,
    "legacy floating log panel togglePanel interface should be removed"
  );
}

async function main() {
  await testLoggerSummarizesProviderAvailabilityWithoutLegacyEnabledFlag();
  await testLoggerStaysEnabledRegardlessOfStoredDebugPreference();
  await testLegacyFloatingPanelInterfaceIsRemoved();
  console.log("sidepanel debug logger tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
