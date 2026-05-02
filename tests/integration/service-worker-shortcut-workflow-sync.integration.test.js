const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createChromeMock,
  flushMicrotasks,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const contractPath = path.join(__dirname, "..", "..", "src", "shared", "claw-contract.js");
const syncPath = path.join(__dirname, "..", "..", "src", "background", "service-worker-shortcut-workflow-sync.js");

function createFixedDate(isoString) {
  const RealDate = Date;
  const fixedTime = new RealDate(isoString).getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fixedTime]));
    }

    static now() {
      return fixedTime;
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  }
  return FixedDate;
}

function createConsoleMock() {
  return {
    warnCalls: [],
    warn(...args) {
      this.warnCalls.push(args);
    },
    log() {},
    debug() {},
    error() {}
  };
}

function createSyncHarness(options = {}) {
  const chromeMock = createChromeMock({
    storageState: options.storageState || {}
  });
  const setCalls = [];
  const scheduledTimers = [];
  const consoleMock = options.consoleMock || createConsoleMock();
  const originalSet = chromeMock.chrome.storage.local.set.bind(chromeMock.chrome.storage.local);

  chromeMock.chrome.storage.local.set = async payload => {
    setCalls.push(JSON.parse(JSON.stringify(payload)));
    return originalSet(payload);
  };

  const sandbox = {
    console: consoleMock,
    chrome: chromeMock.chrome,
    URL,
    setTimeout(callback, delay) {
      scheduledTimers.push({
        callback,
        delay
      });
      return scheduledTimers.length;
    },
    clearTimeout() {},
    Date: options.DateImpl || Date
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(contractPath, sandbox);
  runScriptInSandbox(syncPath, sandbox);

  async function flushScheduledWork() {
    let guard = 20;
    while (scheduledTimers.length > 0 && guard > 0) {
      guard -= 1;
      const batch = scheduledTimers.splice(0);
      for (const timer of batch) {
        timer.callback();
        await flushMicrotasks();
        await flushMicrotasks();
      }
    }
    if (scheduledTimers.length > 0) {
      throw new Error("scheduled work did not settle");
    }
  }

  return {
    chromeMock,
    consoleMock,
    setCalls,
    flushScheduledWork
  };
}

function getWorkflowStore(chromeMock) {
  return chromeMock.storageMock.state.claw_site_workflows_v1;
}

async function testInitialSyncBuildsShortcutWorkflowsAndPreservesManualEntries() {
  const harness = createSyncHarness({
    DateImpl: createFixedDate("2026-04-19T01:10:00.000Z"),
    storageState: {
      savedPrompts: [{
        id: "prompt-1",
        command: "open_settings",
        prompt: "Open settings\nCheck the toggle state",
        url: "https://example.com/path?q=1",
        createdAt: 1000,
        model: "gpt-5.4"
      }, {
        id: "prompt-2",
        command: "open_settings",
        prompt: "Open billing page",
        url: "not-a-valid-url",
        createdAt: 2000
      }],
      claw_site_workflows_v1: {
        version: 1,
        updatedAt: 100,
        workflows: [{
          name: "manual-review",
          source: "manual",
          prompt: "keep me",
          enabled: true,
          updatedAt: 500,
          inputs: [],
          url_patterns: []
        }]
      }
    }
  });

  await harness.flushScheduledWork();

  const workflowStore = getWorkflowStore(harness.chromeMock);
  assert.ok(workflowStore, "workflow store should be created");
  assert.equal(workflowStore.workflows.length, 3);

  const manualWorkflow = workflowStore.workflows.find(entry => entry.name === "manual-review");
  const firstShortcut = workflowStore.workflows.find(entry => entry.linkedPromptId === "prompt-1");
  const secondShortcut = workflowStore.workflows.find(entry => entry.linkedPromptId === "prompt-2");

  assert.ok(manualWorkflow, "manual workflow should be preserved");
  assert.ok(firstShortcut, "first shortcut workflow should exist");
  assert.ok(secondShortcut, "second shortcut workflow should exist");

  assert.equal(firstShortcut.name, "open_settings");
  assert.equal(secondShortcut.name, "open_settings-shortcut-2");
  assert.equal(firstShortcut.label, "Open Settings");
  assert.equal(firstShortcut.description, "Open settings");
  assert.equal(firstShortcut.prompt, "Open settings\nCheck the toggle state");
  assert.deepEqual(firstShortcut.url_patterns, ["https://example.com/*"]);
  assert.equal(firstShortcut.source, "shortcut");
  assert.equal(firstShortcut.linkedCommand, "open_settings");
  assert.equal(firstShortcut.linkedPromptId, "prompt-1");
  assert.equal(firstShortcut.shortcutMeta.model, "gpt-5.4");
  assert.equal(secondShortcut.description, "Open billing page");
  assert.deepEqual(secondShortcut.url_patterns, []);
}

async function testSyncDropsOrphanShortcutsAndIgnoresInvalidPromptEntries() {
  const harness = createSyncHarness({
    DateImpl: createFixedDate("2026-04-19T01:20:00.000Z"),
    storageState: {
      savedPrompts: [{
        id: "prompt-live",
        command: "capture_page",
        prompt: "Capture this page",
        url: "https://docs.example.com/guide"
      }, {
        id: "prompt-invalid",
        command: "missing_prompt"
      }],
      claw_site_workflows_v1: {
        version: 1,
        updatedAt: 100,
        workflows: [{
          name: "manual-workflow",
          source: "manual",
          prompt: "keep manual",
          enabled: true,
          updatedAt: 300,
          inputs: [],
          url_patterns: []
        }, {
          name: "old-shortcut",
          source: "shortcut",
          linkedPromptId: "prompt-gone",
          prompt: "stale",
          enabled: true,
          updatedAt: 200,
          inputs: [],
          url_patterns: []
        }]
      }
    }
  });

  await harness.flushScheduledWork();

  const workflowStore = getWorkflowStore(harness.chromeMock);
  const workflowNames = workflowStore.workflows.map(entry => entry.name).sort();

  assert.deepEqual(workflowNames, ["capture_page", "manual-workflow"]);
  assert.equal(workflowStore.workflows.some(entry => entry.linkedPromptId === "prompt-gone"), false);
  assert.equal(workflowStore.workflows.some(entry => entry.linkedPromptId === "prompt-invalid"), false);
}

async function testStorageListenerOnlySyncsForSavedPromptChanges() {
  const harness = createSyncHarness({
    DateImpl: createFixedDate("2026-04-19T01:30:00.000Z"),
    storageState: {}
  });

  await harness.flushScheduledWork();
  assert.equal(getWorkflowStore(harness.chromeMock), undefined);

  const beforeUnrelatedSet = harness.setCalls.length;
  await harness.chromeMock.chrome.storage.local.set({
    unrelatedFlag: true
  });
  await harness.flushScheduledWork();
  assert.equal(harness.setCalls.length, beforeUnrelatedSet + 1);
  assert.equal(getWorkflowStore(harness.chromeMock), undefined);

  const beforePromptSet = harness.setCalls.length;
  await harness.chromeMock.chrome.storage.local.set({
    savedPrompts: [{
      id: "prompt-storage",
      command: "open_console",
      prompt: "Open devtools console",
      url: "https://app.example.com"
    }]
  });
  await harness.flushScheduledWork();

  assert.ok(harness.setCalls.length >= beforePromptSet + 2);
  const workflowStore = getWorkflowStore(harness.chromeMock);
  assert.ok(workflowStore, "workflow store should be written after savedPrompts change");
  assert.equal(workflowStore.workflows.length, 1);
  assert.equal(workflowStore.workflows[0].linkedPromptId, "prompt-storage");
}

async function main() {
  await testInitialSyncBuildsShortcutWorkflowsAndPreservesManualEntries();
  await testSyncDropsOrphanShortcutsAndIgnoresInvalidPromptEntries();
  await testStorageListenerOnlySyncsForSavedPromptChanges();
  console.log("service worker shortcut workflow sync integration tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
