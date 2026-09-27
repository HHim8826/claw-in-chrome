const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");
const {
  UPSTREAM_1_0_94_SOURCE,
  UPSTREAM_1_0_94_BEHAVIOR_MATRIX,
} = require(path.join(repoRoot, "scripts", "upstream-1.0.94-matrix.js"));

function testSourceIdentityIsPinned() {
  assert.deepEqual(UPSTREAM_1_0_94_SOURCE, {
    manifestVersion: "1.0.94",
    gitHash: "e884a41a3e844489d46a5eac649ad57d54a9c5bf",
  });
}

function testEveryBehaviorHasAnAuditableOwner() {
  const allowedStatuses = new Set(["missing", "equivalent", "divergent", "excluded"]);
  const ids = new Set();
  for (const behavior of UPSTREAM_1_0_94_BEHAVIOR_MATRIX) {
    assert.ok(behavior.id, "behavior must have a stable id");
    assert.equal(ids.has(behavior.id), false, `${behavior.id} is duplicated`);
    ids.add(behavior.id);
    assert.ok(allowedStatuses.has(behavior.status), `${behavior.id} has invalid status`);
    assert.ok(behavior.evidence, `${behavior.id} must record source evidence`);
    assert.ok(behavior.testTarget, `${behavior.id} must record a test target`);
    if (behavior.status !== "missing") {
      assert.equal(
        fs.existsSync(path.join(repoRoot, behavior.testTarget)),
        true,
        `${behavior.id} test target is missing: ${behavior.testTarget}`,
      );
    }
    assert.ok(behavior.owners.length > 0, `${behavior.id} must have an owner`);
    for (const owner of behavior.owners) {
      assert.equal(fs.existsSync(path.join(repoRoot, owner)), true, `${behavior.id} owner is missing: ${owner}`);
    }
    if (behavior.status === "excluded") {
      assert.ok(behavior.risk, `${behavior.id} exclusion must record its risk`);
    }
  }
}

function testClaudeSurfacesStayExcluded() {
  const statuses = Object.fromEntries(UPSTREAM_1_0_94_BEHAVIOR_MATRIX.map(({ id, status }) => [id, status]));
  assert.equal(statuses["claude-account-surfaces"], "excluded");
  assert.equal(statuses["element-selection-mcp-notification"], "excluded");
}

function testNoAcceptedBehaviorRemainsMissing() {
  const missing = UPSTREAM_1_0_94_BEHAVIOR_MATRIX.filter(({ status }) => status === "missing").map(({ id }) => id);
  assert.deepEqual(missing, [], "every accepted 1.0.94 behavior must be implemented or excluded with evidence");
}

function main() {
  testSourceIdentityIsPinned();
  testEveryBehaviorHasAnAuditableOwner();
  testClaudeSurfacesStayExcluded();
  testNoAcceptedBehaviorRemainsMissing();
  console.log("upstream 1.0.94 behavior matrix tests passed");
}

main();
