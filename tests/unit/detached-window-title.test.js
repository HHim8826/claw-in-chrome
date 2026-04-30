const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createEventMock,
  flushMicrotasks,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const scriptPath = path.join(__dirname, "..", "..", "src", "shared", "detached-window-title.js");

function createTitleHarness(options = {}) {
  const windowListeners = new Map();
  const onUpdated = createEventMock();
  const onRemoved = createEventMock();
  const document = {
    title: options.initialTitle || ""
  };
  const windowObject = {
    location: {
      search: options.search || "?mode=window&groupId=12"
    },
    addEventListener(type, listener) {
      const current = windowListeners.get(type) || [];
      current.push(listener);
      windowListeners.set(type, current);
    }
  };
  const chrome = {
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      onUpdated,
      onRemoved,
      get: options.getGroup || (async groupId => ({
        id: Number(groupId),
        title: options.initialGroupTitle || "Research group"
      }))
    }
  };
  const sandbox = {
    console,
    URLSearchParams,
    window: windowObject,
    document,
    chrome
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(scriptPath, sandbox);

  return {
    document,
    onUpdated,
    onRemoved,
    dispatchUnload() {
      for (const listener of windowListeners.get("unload") || []) {
        listener();
      }
    }
  };
}

async function testDetachedWindowTitleSyncsAndCleansUpListeners() {
  const harness = createTitleHarness({
    search: "?mode=window&groupId=12",
    initialGroupTitle: "Alpha workspace"
  });

  assert.equal(harness.document.title, "Claw in Chrome");
  assert.equal(harness.onUpdated.listeners.length, 1);
  assert.equal(harness.onRemoved.listeners.length, 1);

  await flushMicrotasks();
  assert.equal(harness.document.title, "Claw in Chrome - Alpha workspace");

  await harness.onUpdated.emit({
    id: 12,
    title: "Beta workspace"
  });
  assert.equal(harness.document.title, "Claw in Chrome - Beta workspace");

  await harness.onUpdated.emit({
    id: 99,
    title: "Ignored title"
  });
  assert.equal(harness.document.title, "Claw in Chrome - Beta workspace");

  await harness.onRemoved.emit({
    id: 12
  });
  assert.equal(harness.document.title, "Claw in Chrome");

  harness.dispatchUnload();
  assert.equal(harness.onUpdated.listeners.length, 0);
  assert.equal(harness.onRemoved.listeners.length, 0);
}

async function testInvalidDetachedWindowParamsSkipInitialization() {
  const harness = createTitleHarness({
    search: "?mode=sidepanel&groupId=12",
    initialTitle: "Initial title"
  });

  await flushMicrotasks();
  assert.equal(harness.document.title, "Initial title");
  assert.equal(harness.onUpdated.listeners.length, 0);
  assert.equal(harness.onRemoved.listeners.length, 0);
}

async function testFailedGroupLookupFallsBackToDefaultTitle() {
  const harness = createTitleHarness({
    search: "?mode=window&groupId=88",
    getGroup: async () => {
      throw new Error("group missing");
    }
  });

  await flushMicrotasks();
  assert.equal(harness.document.title, "Claw in Chrome");
}

async function main() {
  await testDetachedWindowTitleSyncsAndCleansUpListeners();
  await testInvalidDetachedWindowParamsSkipInitialization();
  await testFailedGroupLookupFallsBackToDefaultTitle();
  console.log("detached window title tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
