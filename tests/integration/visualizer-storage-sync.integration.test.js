const assert = require("node:assert/strict");
const path = require("node:path");

const core = require(path.join(__dirname, "..", "..", "src", "visualizer", "visualizer-core.js"));
const {
  createStorageMock
} = require("../helpers/chrome-test-utils");

function buildSnapshot(sessionId, updatedAt, messageText, scopeId = "scope-sync") {
  return {
    meta: {
      id: sessionId,
      scopeId,
      title: "Visualizer sync",
      updatedAt,
      createdAt: updatedAt - 50,
      selectedModel: "gpt-5.4"
    },
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: messageText
      }]
    }, {
      role: "assistant",
      content: [{
        type: "text",
        text: "收到"
      }]
    }]
  };
}

async function testStorageChangesPromoteActiveRunWithoutFullReload() {
  const storageMock = createStorageMock({
    "claw.chat.scopes.scope-sync.index": [{
      id: "session-old",
      scopeId: "scope-sync",
      updatedAt: 100
    }],
    "claw.chat.scopes.scope-sync.byId.session-old": buildSnapshot("session-old", 100, "旧请求")
  });

  let cachedStorage = await storageMock.area.get(null);
  let selectedRun = core.selectVisualizerRun(cachedStorage);
  assert.equal(selectedRun.meta.sessionId, "session-old");
  assert.equal(selectedRun.meta.source, "recent");

  storageMock.onChanged.addListener(async function (changes) {
    cachedStorage = core.applyStorageChanges(cachedStorage, changes);
    selectedRun = core.selectVisualizerRun(cachedStorage);
  });

  await storageMock.area.set({
    "claw.chat.scopes.scope-sync.activeSession": buildSnapshot("session-live", 300, "新请求"),
    "claw.chat.scopes.scope-sync.index": [{
      id: "session-live",
      scopeId: "scope-sync",
      updatedAt: 300
    }, {
      id: "session-old",
      scopeId: "scope-sync",
      updatedAt: 100
    }],
    "claw.chat.scopes.scope-sync.byId.session-live": buildSnapshot("session-live", 300, "新请求")
  });

  assert.equal(selectedRun.meta.sessionId, "session-live");
  assert.equal(selectedRun.meta.source, "active");

  await storageMock.area.remove("claw.chat.scopes.scope-sync.activeSession");

  assert.equal(selectedRun.meta.sessionId, "session-live");
  assert.equal(selectedRun.meta.source, "recent");
}

async function testQueryOverrideSurvivesUnrelatedScopeChanges() {
  const storageMock = createStorageMock({
    "claw.chat.scopes.scope-a.index": [{
      id: "session-a",
      scopeId: "scope-a",
      updatedAt: 120
    }],
    "claw.chat.scopes.scope-a.byId.session-a": buildSnapshot("session-a", 120, "A 请求", "scope-a"),
    "claw.chat.scopes.scope-b.index": [{
      id: "session-b",
      scopeId: "scope-b",
      updatedAt: 220
    }],
    "claw.chat.scopes.scope-b.byId.session-b": {
      ...buildSnapshot("session-b", 220, "B 请求", "scope-b"),
      meta: {
        id: "session-b",
        scopeId: "scope-b",
        title: "Visualizer sync",
        updatedAt: 220,
        createdAt: 180,
        selectedModel: "gpt-5.4"
      }
    }
  });

  let cachedStorage = await storageMock.area.get(null);
  let selectedRun = core.selectVisualizerRun(cachedStorage, {
    scopeId: "scope-a",
    sessionId: "session-a"
  });
  assert.equal(selectedRun.meta.scopeId, "scope-a");

  storageMock.onChanged.addListener(async function (changes) {
    cachedStorage = core.applyStorageChanges(cachedStorage, changes);
    selectedRun = core.selectVisualizerRun(cachedStorage, {
      scopeId: "scope-a",
      sessionId: "session-a"
    });
  });

  await storageMock.area.set({
    "claw.chat.scopes.scope-b.activeSession": buildSnapshot("session-b-live", 500, "B 新请求", "scope-b")
  });

  assert.equal(selectedRun.meta.scopeId, "scope-a");
  assert.equal(selectedRun.meta.sessionId, "session-a");
}

async function main() {
  await testStorageChangesPromoteActiveRunWithoutFullReload();
  await testQueryOverrideSurvivesUnrelatedScopeChanges();
  console.log("visualizer storage sync integration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
