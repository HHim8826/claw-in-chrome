const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createChromeMock,
  flushMicrotasks,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const sharedPath = path.join(__dirname, "..", "..", "src", "shared", "github-update-shared.js");
const runtimePath = path.join(__dirname, "..", "..", "src", "background", "github-update-worker-runtime.js");

function createGithubRuntimeHarness(options = {}) {
  const chromeMock = createChromeMock({
    manifestVersion: options.manifestVersion || "1.0.0.0",
    storageState: options.storageState || {}
  });
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    Response,
    Headers,
    chrome: chromeMock.chrome,
    fetch: options.fetchImpl
  };
  sandbox.globalThis = sandbox;
  runScriptInSandbox(sharedPath, sandbox);
  runScriptInSandbox(runtimePath, sandbox);
  const runtime = sandbox.__CP_GITHUB_UPDATE_WORKER_RUNTIME__.registerGithubUpdateWorker({
    chrome: chromeMock.chrome,
    console: options.consoleApi || console,
    fetch: options.fetchImpl,
    shared: sandbox.__CP_GITHUB_UPDATE_SHARED__,
    bootstrap: options.bootstrap === true,
    now: options.now
  });
  return {
    chromeMock,
    runtime,
    shared: sandbox.__CP_GITHUB_UPDATE_SHARED__
  };
}

function invokeMessageHandler(listener, message, sender = {}) {
  return new Promise((resolve, reject) => {
    try {
      listener(message, sender, resolve);
    } catch (error) {
      reject(error);
    }
  });
}

async function testCheckNowMessageFetchesAndPersistsInfo() {
  const fetchCalls = [];
  const { chromeMock, shared } = createGithubRuntimeHarness({
    fetchImpl: async (url) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify({
        version: "1.0.2.0",
        notes: "Bug fixes"
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  const listener = chromeMock.events.runtimeOnMessage.listeners[0];
  const response = await invokeMessageHandler(listener, {
    type: shared.MESSAGE_TYPES.CHECK_NOW
  });

  assert.equal(response.ok, true);
  assert.equal(response.info.latestVersion, "1.0.2.0");
  assert.equal(fetchCalls.length, 1);
  assert.equal(chromeMock.storageMock.state[shared.STORAGE_KEYS.INFO].latestVersion, "1.0.2.0");
}

async function testDismissMessagePersistsDismissedVersion() {
  const { chromeMock, shared } = createGithubRuntimeHarness({});
  const listener = chromeMock.events.runtimeOnMessage.listeners[0];

  const response = await invokeMessageHandler(listener, {
    type: shared.MESSAGE_TYPES.DISMISS,
    version: "v1.0.9.0"
  });

  assert.equal(response.ok, true);
  assert.equal(chromeMock.storageMock.state[shared.STORAGE_KEYS.DISMISSED_VERSION], "1.0.9.0");
}

async function testAlarmSkipsNetworkWhenAutoCheckDisabled() {
  let fetchCalls = 0;
  const { chromeMock, shared } = createGithubRuntimeHarness({
    storageState: {
      githubUpdateAutoCheckEnabled: false
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    }
  });

  const listener = chromeMock.events.alarmsOnAlarm.listeners[0];
  listener({
    name: shared.ALARM_NAME
  });
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(fetchCalls, 0);
  assert.deepEqual(chromeMock.calls.alarms.clear, [shared.ALARM_NAME]);
}

async function testStorageToggleReconfiguresAlarm() {
  const { chromeMock, shared } = createGithubRuntimeHarness({});

  await chromeMock.chrome.storage.local.set({
    [shared.STORAGE_KEYS.AUTO_CHECK_ENABLED]: false
  });
  await flushMicrotasks();

  assert.deepEqual(chromeMock.calls.alarms.clear, [shared.ALARM_NAME]);
}

async function testLifecycleHandlersSplitEnabledAndDisabledPaths() {
  let installFetchCalls = 0;
  const enabledHarness = createGithubRuntimeHarness({
    fetchImpl: async () => {
      installFetchCalls += 1;
      return new Response(JSON.stringify({
        version: "1.0.3.0"
      }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });
  await enabledHarness.chromeMock.events.runtimeOnInstalled.listeners[0]({
    reason: "install"
  });
  assert.equal(installFetchCalls, 1);

  let startupFetchCalls = 0;
  const disabledHarness = createGithubRuntimeHarness({
    storageState: {
      githubUpdateAutoCheckEnabled: false
    },
    fetchImpl: async () => {
      startupFetchCalls += 1;
      throw new Error("fetch should not be called");
    }
  });
  await disabledHarness.chromeMock.events.runtimeOnStartup.listeners[0]();
  assert.equal(startupFetchCalls, 0);
}

async function testCheckNowMessageReturnsFailurePayloadWhenFetchFails() {
  const { chromeMock, shared } = createGithubRuntimeHarness({
    fetchImpl: async () => new Response("boom", {
      status: 503,
      headers: {
        "content-type": "text/plain"
      }
    })
  });
  const listener = chromeMock.events.runtimeOnMessage.listeners[0];

  const response = await invokeMessageHandler(listener, {
    type: shared.MESSAGE_TYPES.CHECK_NOW
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /HTTP 503/);
}

async function testUnknownMessageReturnsFalseWithoutCallingSendResponse() {
  const { chromeMock } = createGithubRuntimeHarness({});
  const listener = chromeMock.events.runtimeOnMessage.listeners[0];
  let sendResponseCalls = 0;

  const handled = listener({
    type: "UNKNOWN_MESSAGE"
  }, {}, () => {
    sendResponseCalls += 1;
  });

  assert.equal(handled, false);
  assert.equal(sendResponseCalls, 0);
}

async function testPerformUpdateCheckSkipsRecentCachedInfo() {
  let fetchCalls = 0;
  const nowValue = Date.UTC(2026, 0, 2, 12, 0, 0);
  const recentIso = new Date(nowValue - 60 * 1000).toISOString();
  const { runtime } = createGithubRuntimeHarness({
    now: () => nowValue,
    storageState: {
      githubUpdateInfo: {
        currentVersion: "1.0.0.0",
        latestVersion: "1.0.1.0",
        lastCheckedAt: recentIso
      }
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    }
  });

  const result = await runtime.performUpdateCheck({
    force: false,
    silent: false,
    reason: "test_recent_cache"
  });

  assert.equal(result.ok, true);
  assert.equal(result.fromCache, true);
  assert.equal(result.info.lastCheckedAt, recentIso);
  assert.equal(fetchCalls, 0);
}

async function testStorageHandlerIgnoresNonLocalAreaAndUnrelatedKeys() {
  const { runtime, chromeMock, shared } = createGithubRuntimeHarness({});

  runtime.handlers.onStorageChanged({
    someOtherKey: {
      oldValue: true,
      newValue: false
    }
  }, "local");
  runtime.handlers.onStorageChanged({
    [shared.STORAGE_KEYS.AUTO_CHECK_ENABLED]: {
      oldValue: true,
      newValue: false
    }
  }, "sync");
  await flushMicrotasks();

  assert.deepEqual(chromeMock.calls.alarms.clear, []);
  assert.deepEqual(chromeMock.calls.alarms.create, []);
}

async function testBootstrapPersistsNormalizedStoredInfoAndBadge() {
  const bootstrapStorageState = {
    githubUpdateInfo: {
      latestVersion: "1.0.4.0",
      release_url: "https://example.com/release",
      download_url: "https://example.com/download",
      min_supported_version: "1.0.0.0"
    }
  };
  const { chromeMock, shared } = createGithubRuntimeHarness({
    bootstrap: true,
    storageState: bootstrapStorageState
  });
  await flushMicrotasks();
  await flushMicrotasks();

  const storedInfo = chromeMock.storageMock.state[shared.STORAGE_KEYS.INFO];
  assert.equal(storedInfo.currentVersion, "1.0.0.0");
  assert.equal(storedInfo.latestVersion, "1.0.4.0");
  assert.equal(storedInfo.releaseUrl, "https://example.com/release");
  assert.equal(chromeMock.storageMock.state[shared.STORAGE_KEYS.UPDATE_AVAILABLE], true);
  assert.deepEqual(chromeMock.calls.action.setBadgeText[0], {
    text: "NEW"
  });
}

async function testSyncBadgeClearsBadgeTextWhenNoUpdate() {
  const { runtime, chromeMock } = createGithubRuntimeHarness({});

  await runtime.syncBadge(false);

  assert.deepEqual(chromeMock.calls.action.setBadgeText.at(-1), {
    text: ""
  });
  assert.equal(chromeMock.calls.action.setBadgeBackgroundColor.length, 0);
  assert.equal(chromeMock.calls.action.setBadgeTextColor.length, 0);
}

async function testAlarmHandlerIgnoresUnknownAlarmName() {
  let fetchCalls = 0;
  const { runtime } = createGithubRuntimeHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    }
  });

  runtime.handlers.onAlarm({
    name: "some_other_alarm"
  });
  await flushMicrotasks();

  assert.equal(fetchCalls, 0);
}

async function main() {
  await testCheckNowMessageFetchesAndPersistsInfo();
  await testDismissMessagePersistsDismissedVersion();
  await testAlarmSkipsNetworkWhenAutoCheckDisabled();
  await testStorageToggleReconfiguresAlarm();
  await testLifecycleHandlersSplitEnabledAndDisabledPaths();
  await testCheckNowMessageReturnsFailurePayloadWhenFetchFails();
  await testUnknownMessageReturnsFalseWithoutCallingSendResponse();
  await testPerformUpdateCheckSkipsRecentCachedInfo();
  await testStorageHandlerIgnoresNonLocalAreaAndUnrelatedKeys();
  await testBootstrapPersistsNormalizedStoredInfoAndBadge();
  await testSyncBadgeClearsBadgeTextWhenNoUpdate();
  await testAlarmHandlerIgnoresUnknownAlarmName();
  console.log("github update worker runtime integration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
