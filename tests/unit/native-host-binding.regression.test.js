const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const loaderPath = path.join(rootDir, "src", "background", "service-worker-loader.js");
const bindingPath = path.join(rootDir, "src", "shared", "native-host-binding.js");

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source, snippet, label) {
  assert.equal(
    source.includes(snippet),
    true,
    `${label} should include the expected snippet`,
  );
}

async function flushMicrotasks() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function runBehaviorRegression(bindingSource) {
  const store = {
    "claw.nativeHostBinding.instanceId.v1": "instance-a",
  };

  function createPort() {
    return {
      messages: [],
      onDisconnect: {
        addListener() {},
      },
      postMessage(message) {
        this.messages.push(message);
      },
      disconnect() {},
    };
  }

  let activePort = null;
  const sandbox = {
    Promise,
    console,
    setImmediate,
    setTimeout,
    clearTimeout,
    crypto: {
      randomUUID() {
        return "generated-instance";
      },
    },
    navigator: {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36",
      userAgentData: {
        brands: [{ brand: "Google Chrome" }],
      },
    },
    chrome: {
      runtime: {
        id: "ext-test-id",
        getManifest() {
          return { version: "1.2.3" };
        },
        connectNative(hostName) {
          activePort = createPort();
          activePort.hostName = hostName;
          return activePort;
        },
      },
      storage: {
        local: {
          get(keys, callback) {
            const response = {};
            for (const key of keys || []) {
              response[key] = store[key];
            }
            callback(response);
          },
          set(value, callback) {
            for (const [key, nextValue] of Object.entries(value || {})) {
              store[key] = nextValue;
            }
            callback?.();
          },
        },
      },
    },
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(bindingSource, sandbox, {
    filename: "native-host-binding.js",
  });

  const port = sandbox.chrome.runtime.connectNative(
    "com.anthropic.claude_code_browser_extension",
  );
  await flushMicrotasks();

  assert.equal(port.messages.length, 1, "binding hello should be sent on connect");
  assert.equal(port.messages[0]?.type, "binding_hello");
  assert.equal(port.messages[0]?.browser, "chrome");
  assert.equal(port.messages[0]?.extensionId, "ext-test-id");
  assert.equal(port.messages[0]?.extensionVersion, "1.2.3");
  assert.equal(
    port.messages[0]?.hostName,
    "com.anthropic.claude_code_browser_extension",
  );
  assert.equal(port.messages[0]?.instanceId, "instance-a");
  assert.equal("profileToken" in port.messages[0], false);
}

async function main() {
  const loaderSource = readSource(loaderPath);
  const bindingSource = readSource(bindingPath);

  assertIncludes(
    loaderSource,
    'import "../shared/native-host-binding.js";',
    "service-worker loader",
  );

  assert.ok(
    loaderSource.indexOf('import "../shared/native-host-binding.js";') <
      loaderSource.indexOf('import "../assets/service-worker.ts-H0DVM1LS.js";'),
    "native-host binding patch must load before the bundled service worker runtime",
  );

  assertIncludes(
    bindingSource,
    "runtimeApi.connectNative = function patchedConnectNative",
    "native-host binding module",
  );

  assertIncludes(
    bindingSource,
    '"binding_hello"',
    "native-host binding module",
  );

  assertIncludes(
    bindingSource,
    "chrome.storage.local",
    "native-host binding module",
  );

  assertIncludes(
    bindingSource,
    "getOrCreateInstanceId",
    "native-host binding module",
  );

  assertIncludes(
    bindingSource,
    "instanceId: await getOrCreateInstanceId()",
    "native-host binding module",
  );

  assert.equal(
    bindingSource.includes("profileToken:"),
    false,
    "native-host binding module should no longer include profile token metadata",
  );

  assert.equal(
    bindingSource.includes("chrome.storage.onChanged.addListener"),
    false,
    "native-host binding module should not rebroadcast on token rotation anymore",
  );

  assertIncludes(
    bindingSource,
    "crypto.randomUUID",
    "native-host binding module",
  );

  assertIncludes(
    bindingSource,
    "com.anthropic.claude_code_browser_extension",
    "native-host binding module",
  );

  await runBehaviorRegression(bindingSource);

  console.log("native host binding regression test passed");
}

main();
