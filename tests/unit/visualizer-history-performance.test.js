const assert = require("node:assert/strict");
const core = require("../../src/visualizer/visualizer-core.js");

const storage = {};
let normalizedBodies = 0;
for (let i = 0; i < 500; i += 1) {
  const meta = { id: `session-${i}`, scopeId: `scope-${i}`, title: `Chat ${i}`, updatedAt: i + 100 };
  const snapshot = {
    meta,
    messages: Array.from({ length: 50 }, (_, j) => ({
      role: j % 2 ? "assistant" : "user",
      get content() {
        normalizedBodies += 1;
        return [{ type: "text", text: "x".repeat(510) }];
      },
    })),
  };
  const prefix = `claw.chat.scopes.scope-${i}`;
  storage[`${prefix}.index`] = [meta];
  storage[`${prefix}.activeSession`] = snapshot;
  storage[`${prefix}.byId.session-${i}`] = snapshot;
}
const start = performance.now();
assert.equal(core.collectVisualizerSessionGroups(storage).length, 500);
assert.equal(normalizedBodies, 0, "session listing must not normalize message bodies");
let builds = 0;
const select = core.createVisualizerRunSelector({ buildRun(...args) {
  builds += 1;
  return core.buildVisualizerRun(...args);
} });
const query = { scopeId: "scope-0", sessionId: "session-0" };
const selected = select(storage, query);
const initialMs = performance.now() - start;
assert.equal(normalizedBodies, 50);
assert.equal(builds, 1, "active and historical copies must be deduplicated before building");
for (let i = 1; i < 30; i += 1) {
  const changed = core.applyStorageChanges(storage, {
    [`claw.chat.scopes.scope-${i}.activeSession`]: { newValue: { ...storage[`claw.chat.scopes.scope-${i}.activeSession`] } },
  });
  assert.equal(select(changed, query) === selected, true, "unchanged graph retains identity");
}
assert.equal(builds, 1, "unrelated updates must reuse the selected graph");
assert.equal(normalizedBodies, 50);
const changed = core.applyStorageChanges(storage, {
  "claw.chat.scopes.scope-0.activeSession": { newValue: { ...storage["claw.chat.scopes.scope-0.activeSession"] } },
});
assert.notStrictEqual(select(changed, query), selected, "same-timestamp content updates invalidate the cache");
assert.equal(builds, 2);
console.log(`500-session metadata/selection regression passed (${Math.round(initialMs)}ms initial selection; ${Math.round(performance.now() - start)}ms including 30 updates, ${builds} graph builds)`);
