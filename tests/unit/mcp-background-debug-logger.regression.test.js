const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createStorageMock } = require("../helpers/chrome-test-utils");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "mcpPermissions-qqAoJjJ8.js");
const bundleSource = fs.readFileSync(bundlePath, "utf8");

function extractFunction(source, name) {
  const asyncSignature = `async function ${name}`;
  const signature = `function ${name}`;
  const start = source.indexOf(asyncSignature) >= 0 ? source.indexOf(asyncSignature) : source.indexOf(signature);

  assert.ok(start >= 0, `expected to find ${name}`);

  const braceStart = source.indexOf("{", start);
  assert.ok(braceStart >= 0, `expected ${name} to have a body`);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === "'" && source[index - 1] !== "\\") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"' && source[index - 1] !== "\\") {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === "`" && source[index - 1] !== "\\") {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`failed to extract ${name}`);
}

function extractBackgroundLoggerSource() {
  const startToken = "const __cpDebugContract = globalThis.__CP_CONTRACT__?.debug || {};";
  const endToken = "class T extends Error {";
  const start = bundleSource.indexOf(startToken);
  const end = bundleSource.indexOf(endToken, start);

  assert.ok(start >= 0, "expected MCP bundle to expose background debug helpers");
  assert.ok(end > start, "expected to find the end of the background debug helper block");

  return bundleSource.slice(start, end);
}

function createConsoleMock() {
  return {
    debugCalls: [],
    errorCalls: [],
    debug(...args) {
      this.debugCalls.push(args);
    },
    error(...args) {
      this.errorCalls.push(args);
    }
  };
}

function createBackgroundLoggerHarness(initialStorageState = {}) {
  const storageMock = createStorageMock(initialStorageState);
  const consoleMock = createConsoleMock();
  const sandbox = {
    module: {
      exports: {}
    },
    chrome: {
      storage: {
        local: storageMock.area
      }
    },
    console: consoleMock,
    URL,
    Date,
    WeakSet
  };
  sandbox.globalThis = sandbox;

  const source = `${extractBackgroundLoggerSource()}
module.exports = {
  __cpBackgroundDebugLog,
  __cpBackgroundDebugTrack,
  __cpBackgroundDebugSanitizeEntry
};`;

  vm.runInNewContext(source, sandbox, {
    filename: "mcpPermissions-background-debug-snippet.js"
  });

  return {
    storageMock,
    consoleMock,
    ...sandbox.module.exports
  };
}

function normalizeAnchorWhitespace(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\(\s+(?=[`"'A-Za-z_$[{])/g, "(")
    .replace(/,\s+(?=[)\]}])/g, "")
    .trim();
}

function assertIncludes(source, needle, label) {
  assert.equal(
    source.includes(needle) ||
      normalizeAnchorWhitespace(source).includes(
        normalizeAnchorWhitespace(needle),
      ),
    true,
    `${label} should include ${needle}`,
  );
}

async function testBackgroundLoggerPersistsSanitizedMcpEntries() {
  const harness = createBackgroundLoggerHarness();

  await harness.__cpBackgroundDebugLog("claude_chrome.bridge.tool_call", {
    apiKey: "sk-top-secret",
    authorization: "Bearer hidden-token",
    requestUrl: "https://api.example.com/v1/messages?api_key=123",
    prompt: "please keep this private",
    action_data: {
      text: "typed customer secret",
      selector: "#private-form"
    },
    note: "Authorization: Bearer should-not-leak",
    customProviderConfig: {
      apiKey: "provider-secret",
      baseUrl: "http://localhost:11434/v1",
      defaultModel: "gpt-5.4",
      reasoningEffort: "high",
      name: "Local HTTP provider",
      notes: "sensitive local notes",
      fetchedModels: [{
        value: "claude-sonnet"
      }, {
        value: "gpt-5.4"
      }]
    }
  }, "warn");

  const logs = harness.storageMock.state.sidepanelDebugLogs;
  const meta = harness.storageMock.state.sidepanelDebugMeta;

  assert.equal(Array.isArray(logs), true);
  assert.equal(logs.length, 1);
  assert.equal(meta.sessionId, "service-worker");
  assert.equal(meta.href, "/service-worker");
  assert.equal(typeof meta.lastFlushAt, "string");

  const entry = logs[0];
  assert.equal(entry.sessionId, "service-worker");
  assert.equal(entry.level, "warn");
  assert.equal(entry.type, "claude_chrome.bridge.tool_call");
  assert.equal(entry.href, "/service-worker");
  assert.equal(entry.payload.apiKey, "[redacted-secret]");
  assert.equal(entry.payload.authorization, "[redacted-secret]");
  assert.equal(entry.payload.requestUrl, "[redacted-url]");
  assert.equal(entry.payload.prompt.startsWith("[redacted-text]:"), true);
  assert.equal(String(entry.payload.action_data).startsWith("[redacted-text]"), true);
  assert.equal(String(entry.payload.note).includes("[redacted]"), true);
  assert.equal(String(entry.payload.note).includes("should-not-leak"), false);
  assert.equal(entry.payload.customProviderConfig.enabled, true);
  assert.equal(entry.payload.customProviderConfig.defaultModel, "gpt-5.4");
  assert.equal(entry.payload.customProviderConfig.reasoningEffort, "high");
  assert.equal(entry.payload.customProviderConfig.name, "Local HTTP provider");
  assert.equal(entry.payload.customProviderConfig.fetchedModelCount, 2);
  assert.equal(entry.payload.customProviderConfig.hasApiKey, true);
  assert.equal(entry.payload.customProviderConfig.hasBaseUrl, true);
  assert.equal(entry.payload.customProviderConfig.hasDefaultModel, true);
  assert.equal(entry.payload.customProviderConfig.hasNotes, true);
  assert.equal(Object.prototype.hasOwnProperty.call(entry.payload.customProviderConfig, "apiKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(entry.payload.customProviderConfig, "baseUrl"), false);
  assert.equal(harness.consoleMock.debugCalls.length >= 1, true);
  const consolePayload = harness.consoleMock.debugCalls.at(-1)[2];
  assert.equal(consolePayload.apiKey, "[redacted-secret]");
  assert.equal(consolePayload.requestUrl, "[redacted-url]");
  assert.equal(String(consolePayload.action_data).startsWith("[redacted-text]"), true);
  assert.equal(JSON.stringify(harness.consoleMock.debugCalls).includes("typed customer secret"), false);
}

async function testBackgroundLoggerReSanitizesExistingEntriesBeforePersisting() {
  const harness = createBackgroundLoggerHarness({
    sidepanelDebugLogs: [{
      id: "legacy-1",
      sessionId: "legacy-session",
      ts: "2026-04-20T00:00:00.000Z",
      level: "info",
      type: "legacy.log",
      href: "https://example.com/private?q=1",
      payload: {
        authorization: "Bearer old-secret",
        prompt: "legacy prompt content"
      }
    }]
  });

  await harness.__cpBackgroundDebugLog("claude_chrome.permission.prompted", {
    url: "https://target.example/path"
  });

  const logs = harness.storageMock.state.sidepanelDebugLogs;
  assert.equal(logs.length, 2);
  assert.equal(logs[0].href, "[redacted-url]");
  assert.equal(logs[0].payload.authorization, "[redacted-secret]");
  assert.equal(logs[0].payload.prompt.startsWith("[redacted-text]:"), true);
  assert.equal(logs[1].payload.url, "[redacted-url]");
}

function testBundleKeepsMcpDebugHooksAndPermissionOutcomeReasons() {
  assertIncludes(bundleSource, '"actiondata",', "MCP bundle private diagnostic fields");
  assertIncludes(bundleSource, 'console.debug("[service-worker-debug]", e, a.payload);', "MCP bundle sanitized console output");
  assertIncludes(bundleSource, 'console.debug("[service-worker-debug] log_failed", e, o);', "MCP bundle sanitized logging failure");
  assertIncludes(bundleSource, "__cpBackgroundDebugTrack(\"claude_chrome.bridge.tool_received\"", "MCP bundle");
  assertIncludes(bundleSource, "__cpBackgroundDebugTrack(\"claude_chrome.mcp.tool_called\"", "MCP bundle");
  assertIncludes(bundleSource, "__cpBackgroundDebugTrack(\"claude_chrome.permission.prompted\"", "MCP bundle");
  assertIncludes(bundleSource, "__cpBackgroundDebugTrack(\"claude_chrome.permission.responded\"", "MCP bundle");
  assertIncludes(bundleSource, "__cpBackgroundDebugTrack(\"claude_chrome.permission.pending_cleared\"", "MCP bundle");
  assertIncludes(bundleSource, "i(e[__cpMcpBridgeRuntimeMessageFieldAllowed], \"runtime_response\");", "MCP bundle");
  assertIncludes(bundleSource, "i(false, \"popup_create_failed\");", "MCP bundle");
  assertIncludes(bundleSource, "i(false, \"timeout\");", "MCP bundle");
}

function testPermissionPromptQueueFunctionParsesAfterDebugHookEdits() {
  const functionSource = extractFunction(bundleSource, "Sn");

  assert.doesNotThrow(() => {
    new vm.Script(`${functionSource}\nSn;`, {
      filename: "mcpPermissions-Sn-snippet.js"
    });
  }, "permission prompt queue function should stay syntactically valid after debug hook edits");
}

async function main() {
  await testBackgroundLoggerPersistsSanitizedMcpEntries();
  await testBackgroundLoggerReSanitizesExistingEntriesBeforePersisting();
  testBundleKeepsMcpDebugHooksAndPermissionOutcomeReasons();
  testPermissionPromptQueueFunctionParsesAfterDebugHookEdits();
  console.log("mcp background debug logger regression test passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
