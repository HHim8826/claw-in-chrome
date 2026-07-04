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

const scriptPath = path.join(__dirname, "..", "..", "src", "options", "options-debug-logger.js");

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
    groupCollapsed(...args) {
      this.groupCalls.push(args);
    },
    groupEnd() {}
  };
}

function createLoggerHarness(options = {}) {
  const chromeMock = createChromeMock({
    runtimeId: "options-debug-test"
  });
  const windowListeners = new Map();
  const document = new FakeDocument({
    readyState: "complete"
  });
  const consoleMock = createConsoleMock();
  const fetchCalls = [];

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
    fetch: async url => {
      fetchCalls.push(url);
      return {
        ok: options.localPreviewAvailable === true
      };
    },
    location: {
      pathname: "/options.html",
      hash: "#options",
      search: options.search || ""
    },
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
    document,
    fetchCalls,
    api: sandbox.__CP_OPTIONS_DEBUG__,
    async emitWindow(type, payload) {
      for (const listener of windowListeners.get(type) || []) {
        listener(payload || {
          type
        });
      }
      await flushLogs();
    },
    async emitDocument(type, payload) {
      document.dispatchEvent({
        type,
        ...(payload || {})
      });
      await flushLogs();
    },
    flushLogs
  };
}

async function testLocalPreviewAddonIsExplicitlyOptIn() {
  const defaultHarness = createLoggerHarness();
  await defaultHarness.flushLogs();
  assert.deepEqual(defaultHarness.fetchCalls, [], "normal options startup must not request the local preview addon");

  const previewHarness = createLoggerHarness({
    search: "?clawLocalUpdatePreview=1"
  });
  await previewHarness.flushLogs();
  assert.equal(previewHarness.fetchCalls.length, 1, "the local preview query flag must request the addon");
}

async function testLoggerSanitizesSensitiveValuesAndSupportsReadClearDump() {
  const harness = createLoggerHarness();
  await harness.flushLogs();

  const entry = harness.api.log("provider.update", {
    apiKey: "sk-secret-value",
    authorization: "Bearer top-secret-token",
    url: "https://api.example.com/v1/messages",
    prompt: "please keep this prompt private",
    note: "token=visible",
    customProviderConfig: {
      apiKey: "another-secret",
      baseUrl: "https://api.example.com/v1",
      defaultModel: "gpt-5.4",
      name: "OpenRouter mirror",
      notes: "internal notes",
      fetchedModels: [{
        value: "claude-sonnet"
      }, {
        value: "gpt-5"
      }]
    }
  }, "warn");

  assert.equal(entry.level, "warn");
  assert.equal(entry.payload.customProviderConfig.enabled, true);
  assert.equal(entry.payload.customProviderConfig.hasApiKey, true);
  assert.equal(entry.payload.customProviderConfig.hasBaseUrl, true);
  assert.equal(entry.payload.customProviderConfig.hasDefaultModel, true);
  assert.equal(entry.payload.customProviderConfig.fetchedModelCount, 2);
  assert.equal(entry.payload.customProviderConfig.hasNotes, true);
  await harness.flushLogs();

  const logs = await harness.api.read();
  const target = logs.find(item => item.type === "provider.update");

  assert.ok(target, "custom log entry should be persisted");
  assert.equal(target.payload.apiKey, "[redacted-secret]");
  assert.equal(target.payload.authorization, "[redacted-secret]");
  assert.equal(target.payload.url, "[redacted-url]");
  assert.equal(target.payload.prompt.startsWith("[redacted-text]:"), true);
  assert.equal(target.payload.customProviderConfig.enabled, true);
  assert.equal(target.payload.customProviderConfig.name, "OpenRouter mirror");
  assert.equal(target.payload.customProviderConfig.hasDefaultModel, true);
  assert.equal(harness.consoleMock.warnCalls.length >= 1, true);

  const dumped = await harness.api.dumpToConsole();
  assert.equal(Array.isArray(dumped), true);
  assert.equal(harness.consoleMock.groupCalls.length, 1);

  await harness.api.clear();
  const cleared = await harness.api.read();
  assert.deepEqual(JSON.parse(JSON.stringify(cleared)), []);
}

async function testLoggerCapturesWindowAndDocumentEvents() {
  const harness = createLoggerHarness();
  await harness.flushLogs();

  await harness.emitWindow("error", {
    message: "boom",
    filename: "https://example.com/secret.js",
    lineno: 10,
    colno: 2,
    error: new Error("authorization: abc123")
  });

  await harness.emitWindow("unhandledrejection", {
    reason: "Bearer hidden-token"
  });

  harness.document.readyState = "interactive";
  await harness.emitDocument("readystatechange");

  const button = harness.document.createElement("button");
  button.textContent = "Open panel";
  button.id = "open-panel";
  button.className = "btn-primary";
  await harness.emitDocument("click", {
    target: button
  });

  await harness.emitWindow("hashchange", {
    type: "hashchange"
  });

  const logs = await harness.api.read();
  const errorEntry = logs.find(item => item.type === "window.error");
  const rejectionEntry = logs.find(item => item.type === "window.unhandledrejection");
  const readyStateEntry = logs.find(item => item.type === "document.readyState");
  const clickEntry = logs.find(item => item.type === "document.click");
  const hashEntry = logs.find(item => item.type === "window.hashchange");

  assert.ok(errorEntry, "window.error should be logged");
  assert.equal(errorEntry.payload.filename, "[redacted-url]");
  assert.equal(JSON.stringify(errorEntry.payload.error || {}).includes("abc123"), false);
  assert.ok(rejectionEntry, "unhandledrejection should be logged");
  assert.equal(String(rejectionEntry.payload.reason).includes("[redacted]"), true);
  assert.equal(readyStateEntry.payload.readyState, "interactive");
  assert.equal(clickEntry.payload.tag, "BUTTON");
  assert.equal(clickEntry.payload.id, "open-panel");
  assert.equal(clickEntry.payload.text, "Open panel");
  assert.equal(hashEntry.payload.hash, "#options");
}

async function main() {
  await testLocalPreviewAddonIsExplicitlyOptIn();
  await testLoggerSanitizesSensitiveValuesAndSupportsReadClearDump();
  await testLoggerCapturesWindowAndDocumentEvents();
  console.log("options debug logger tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
