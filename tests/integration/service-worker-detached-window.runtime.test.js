const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createChromeMock,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const contractPath = path.join(__dirname, "..", "..", "src", "shared", "claw-contract.js");
const runtimePath = path.join(__dirname, "..", "..", "src", "background", "service-worker-detached-window-runtime.js");

function createDetachedWindowHarness(options = {}) {
  const chromeMock = createChromeMock({
    storageState: options.storageState || {},
    existingGroupIds: options.existingGroupIds || [],
    tabById: options.tabById || {},
    windowsList: options.windowsList || [],
    createdWindowId: options.createdWindowId,
    createdPopupTabId: options.createdPopupTabId,
    groupIdResult: options.groupIdResult
  });
  const consoleApi = options.consoleOverride || console;
  const sandbox = {
    console: consoleApi,
    chrome: chromeMock.chrome,
    URL,
    URLSearchParams
  };
  sandbox.globalThis = sandbox;
  runScriptInSandbox(contractPath, sandbox);
  runScriptInSandbox(runtimePath, sandbox);
  const api = sandbox.__CP_DETACHED_WINDOW_RUNTIME__.createDetachedWindowRuntime({
    chrome: chromeMock.chrome,
    console: consoleApi,
    now: options.now
  });
  return {
    api,
    chromeMock,
    sandbox
  };
}

async function testReadDetachedWindowLocksDropsInvalidEntries() {
  const { api } = createDetachedWindowHarness({
    storageState: {
      "claw.detachedWindowLocks": {
        "12": {
          groupId: 12,
          windowId: 91,
          popupTabId: "92",
          mainTabId: "55"
        },
        invalid: {
          groupId: "not-a-group",
          windowId: 93
        }
      }
    }
  });

  const locks = await api.readDetachedWindowLocks();

  assert.deepEqual(Object.keys(locks), ["12"]);
  assert.equal(locks["12"].popupTabId, 92);
  assert.equal(locks["12"].mainTabId, 55);
}

async function testOpenDetachedWindowCreatesPopupAndPersistsLock() {
  const restoreUrl = "https://example.com/search";
  const sessionId = "session-a";
  const { api, chromeMock } = createDetachedWindowHarness({
    tabById: {
      55: {
        id: 55,
        windowId: 7,
        groupId: -1,
        url: restoreUrl
      }
    },
    groupIdResult: 777,
    createdWindowId: 901,
    createdPopupTabId: 902
  });

  const result = await api.openDetachedWindowForGroup({
    tabId: 55,
    sessionId
  });

  assert.equal(result.success, true);
  assert.equal(result.reused, false);
  assert.equal(result.groupId, 777);
  assert.equal(chromeMock.calls.tabs.group.length, 1);
  assert.equal(chromeMock.calls.windows.create.length, 1);
  assert.equal(
    chromeMock.calls.windows.create[0].url,
    `chrome-extension://test-extension-id/sidepanel/sidepanel.html?mode=window&tabId=55&groupId=777&restoreUrl=${encodeURIComponent(restoreUrl)}&sessionId=${encodeURIComponent(sessionId)}`
  );
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["777"].windowId, 901);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["777"].mainTabId, 55);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["777"].hostWindowId, 7);
}

async function testOpenDetachedWindowReusesExistingPopupAndRefreshesTargetTab() {
  const restoreUrl = "https://example.com/search";
  const sessionId = "session-a";
  const { api, chromeMock } = createDetachedWindowHarness({
    tabById: {
      55: {
        id: 55,
        windowId: 7,
        groupId: 12,
        url: restoreUrl
      }
    },
    windowsList: [
      {
        id: 501,
        type: "popup",
        tabs: [
          {
            id: 601,
            url: `chrome-extension://test-extension-id/sidepanel/sidepanel.html?mode=window&tabId=44&groupId=12&restoreUrl=${encodeURIComponent(restoreUrl)}&sessionId=${encodeURIComponent(sessionId)}`
          }
        ]
      }
    ]
  });

  const result = await api.openDetachedWindowForGroup({
    tabId: 55,
    sessionId
  });

  assert.equal(result.success, true);
  assert.equal(result.reused, true);
  assert.equal(result.windowId, 501);
  assert.equal(chromeMock.calls.windows.create.length, 0);
  assert.equal(chromeMock.calls.tabs.update.length >= 1, true);
  assert.equal(chromeMock.calls.tabs.update[0].tabId, 601);
  assert.equal(
    String(chromeMock.calls.tabs.update[0].payload.url || ""),
    `chrome-extension://test-extension-id/sidepanel/sidepanel.html?mode=window&tabId=55&groupId=12&restoreUrl=${encodeURIComponent(restoreUrl)}&sessionId=${encodeURIComponent(sessionId)}`
  );
  assert.deepEqual(chromeMock.calls.windows.update, [
    {
      windowId: 501,
      payload: {
        focused: true
      }
    }
  ]);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["12"].popupTabId, 601);
}

async function testOpenDetachedWindowReusesRestoredPopupByRestoreUrlAcrossGroupChange() {
  const restoreUrl = "https://example.com/search";
  const sessionId = "session-a";
  const { api, chromeMock } = createDetachedWindowHarness({
    storageState: {
      "claw.detachedWindowLocks": {
        "12": {
          groupId: 12,
          windowId: 501,
          popupTabId: 601,
          mainTabId: 55,
          hostWindowId: 7
        }
      }
    },
    tabById: {
      77: {
        id: 77,
        windowId: 8,
        groupId: 88,
        url: restoreUrl
      }
    },
    windowsList: [
      {
        id: 501,
        type: "popup",
        tabs: [
          {
            id: 601,
            url: `chrome-extension://test-extension-id/sidepanel/sidepanel.html?mode=window&tabId=55&groupId=12&restoreUrl=${encodeURIComponent(restoreUrl)}&sessionId=${encodeURIComponent(sessionId)}`
          }
        ]
      }
    ]
  });

  const result = await api.openDetachedWindowForGroup({
    tabId: 77,
    sessionId
  });

  assert.equal(result.success, true);
  assert.equal(result.reused, true);
  assert.equal(result.groupId, 88);
  assert.equal(result.windowId, 501);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["12"], undefined);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["88"].popupTabId, 601);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["88"].mainTabId, 77);
}

async function testOpenDetachedWindowCreatesNewPopupWhenSameUrlIsOccupiedByAnotherSession() {
  const restoreUrl = "https://example.com/search";
  const occupiedSessionId = "session-a";
  const nextSessionId = "session-b";
  const { api, chromeMock } = createDetachedWindowHarness({
    storageState: {
      "claw.detachedWindowLocks": {
        "12": {
          groupId: 12,
          windowId: 501,
          popupTabId: 601,
          mainTabId: 55,
          hostWindowId: 7
        }
      }
    },
    tabById: {
      77: {
        id: 77,
        windowId: 8,
        groupId: 88,
        url: restoreUrl
      }
    },
    windowsList: [
      {
        id: 501,
        type: "popup",
        tabs: [
          {
            id: 601,
            url: `chrome-extension://test-extension-id/sidepanel/sidepanel.html?mode=window&tabId=55&groupId=12&restoreUrl=${encodeURIComponent(restoreUrl)}&sessionId=${encodeURIComponent(occupiedSessionId)}`
          }
        ]
      }
    ]
  });

  const result = await api.openDetachedWindowForGroup({
    tabId: 77,
    sessionId: nextSessionId
  });

  assert.equal(result.success, true);
  assert.equal(result.reused, false);
  assert.equal(result.groupId, 88);
  assert.equal(chromeMock.calls.windows.create.length, 1);
  assert.equal(chromeMock.calls.tabs.update.length, 0);
  assert.equal(chromeMock.calls.windows.update.length, 0);
  assert.notEqual(chromeMock.storageMock.state["claw.detachedWindowLocks"]["12"], undefined);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["88"].mainTabId, 77);
}

async function testSweepDetachedWindowLocksRemovesMissingPopupAndRefreshesHostWindow() {
  const restoreUrl = "https://example.com/search";
  const sessionId = "session-a";
  const { api, chromeMock } = createDetachedWindowHarness({
    storageState: {
      "claw.detachedWindowLocks": {
        "12": {
          groupId: 12,
          windowId: 501,
          popupTabId: 601,
          mainTabId: 55,
          hostWindowId: 7
        },
        "14": {
          groupId: 14,
          windowId: 700,
          popupTabId: 701,
          mainTabId: 56,
          hostWindowId: 8
        }
      }
    },
    tabById: {
      55: {
        id: 55,
        windowId: 88,
        groupId: 12,
        url: restoreUrl
      }
    },
    windowsList: [
      {
        id: 501,
        type: "popup",
        tabs: [
          {
            id: 601,
            url: `chrome-extension://test-extension-id/sidepanel/sidepanel.html?mode=window&tabId=55&groupId=12&restoreUrl=${encodeURIComponent(restoreUrl)}&sessionId=${encodeURIComponent(sessionId)}`
          }
        ]
      }
    ]
  });

  const nextLocks = await api.sweepDetachedWindowLocks();

  assert.deepEqual(Object.keys(nextLocks), ["12"]);
  assert.equal(nextLocks["12"].hostWindowId, 88);
  assert.equal(nextLocks["12"].popupTabId, 601);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["14"], undefined);
}

async function testSweepDetachedWindowLocksDoesNotRekeyAcrossSameUrlOtherSession() {
  const restoreUrl = "https://example.com/recovered";
  const occupiedSessionId = "session-a";
  const { api, chromeMock } = createDetachedWindowHarness({
    storageState: {
      "claw.detachedWindowLocks": {
        "12": {
          groupId: 12,
          windowId: 501,
          popupTabId: 601,
          mainTabId: 55,
          hostWindowId: 7
        }
      }
    },
    tabById: {},
    windowsList: [
      {
        id: 501,
        type: "popup",
        tabs: [
          {
            id: 601,
            url: `chrome-extension://test-extension-id/sidepanel/sidepanel.html?mode=window&tabId=55&groupId=12&restoreUrl=${encodeURIComponent(restoreUrl)}&sessionId=${encodeURIComponent(occupiedSessionId)}`
          }
        ]
      },
      {
        id: 88,
        type: "normal",
        tabs: [
          {
            id: 77,
            url: restoreUrl,
            groupId: 99
          }
        ]
      }
    ]
  });

  const nextLocks = await api.sweepDetachedWindowLocks();

  assert.deepEqual(Object.keys(nextLocks), ["12"]);
  assert.equal(nextLocks["12"].mainTabId, 55);
  assert.equal(nextLocks["12"].hostWindowId, 7);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["12"].popupTabId, 601);
}

async function testCloseDetachedWindowForLockEntryRemovesWindowAndLock() {
  const { api, chromeMock } = createDetachedWindowHarness({
    storageState: {
      "claw.detachedWindowLocks": {
        "12": {
          groupId: 12,
          windowId: 91
        },
        "13": {
          groupId: 13,
          windowId: 92
        }
      }
    }
  });

  const result = await api.closeDetachedWindowForLockEntry({
    groupId: 12,
    windowId: 91
  });

  assert.equal(result, true);
  assert.deepEqual(chromeMock.calls.windows.remove, [91]);
  assert.equal(chromeMock.storageMock.state["claw.detachedWindowLocks"]["12"], undefined);
  assert.notEqual(chromeMock.storageMock.state["claw.detachedWindowLocks"]["13"], undefined);
}

async function testBuildAndParseDetachedWindowUrlRoundTrip() {
  const { api } = createDetachedWindowHarness({});
  const restoreUrl = "https://example.com/search";
  const sessionId = "session-a";

  const url = api.buildDetachedWindowUrl({
    tabId: 55,
    groupId: 12,
    restoreUrl,
    sessionId
  });
  const parsed = api.parseDetachedWindowUrl(url);

  assert.equal(parsed.groupId, 12);
  assert.equal(parsed.tabId, 55);
  assert.equal(parsed.restoreUrl, restoreUrl);
  assert.equal(parsed.sessionId, sessionId);
}

async function main() {
  await testReadDetachedWindowLocksDropsInvalidEntries();
  await testOpenDetachedWindowCreatesPopupAndPersistsLock();
  await testOpenDetachedWindowReusesExistingPopupAndRefreshesTargetTab();
  await testOpenDetachedWindowReusesRestoredPopupByRestoreUrlAcrossGroupChange();
  await testOpenDetachedWindowCreatesNewPopupWhenSameUrlIsOccupiedByAnotherSession();
  await testSweepDetachedWindowLocksRemovesMissingPopupAndRefreshesHostWindow();
  await testSweepDetachedWindowLocksDoesNotRekeyAcrossSameUrlOtherSession();
  await testCloseDetachedWindowForLockEntryRemovesWindowAndLock();
  await testBuildAndParseDetachedWindowUrlRoundTrip();
  console.log("service worker detached window runtime integration tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
