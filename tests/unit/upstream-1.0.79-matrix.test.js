const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");
const {
  UPSTREAM_1_0_79_SOURCE,
  UPSTREAM_1_0_79_BEHAVIOR_MATRIX,
} = require(path.join(repoRoot, "scripts", "upstream-1.0.79-matrix.js"));

function testSourceIdentityIsPinned() {
  assert.deepEqual(UPSTREAM_1_0_79_SOURCE, {
    manifestVersion: "1.0.79",
    gitHash: "84be9f3a200dd6d7aea5b06ceeb8faf753f0a443",
  });
}

function testEveryBehaviorHasAnAuditableOwner() {
  const allowedStatuses = new Set([
    "missing",
    "equivalent",
    "divergent",
    "excluded",
  ]);

  assert.ok(UPSTREAM_1_0_79_BEHAVIOR_MATRIX.length >= 6);
  for (const behavior of UPSTREAM_1_0_79_BEHAVIOR_MATRIX) {
    assert.ok(behavior.id, "behavior must have a stable id");
    assert.ok(allowedStatuses.has(behavior.status), `${behavior.id} has invalid status`);
    assert.ok(behavior.evidence, `${behavior.id} must record source evidence`);
    assert.ok(behavior.testTarget, `${behavior.id} must record a test target`);
    assert.ok(behavior.owners.length > 0, `${behavior.id} must have an owner`);
    for (const owner of behavior.owners) {
      assert.equal(
        fs.existsSync(path.join(repoRoot, owner)),
        true,
        `${behavior.id} owner is missing: ${owner}`,
      );
    }
    if (behavior.status === "excluded") {
      assert.ok(behavior.risk, `${behavior.id} exclusion must record its risk`);
    }
  }
}

function main() {
  testSourceIdentityIsPinned();
  testEveryBehaviorHasAnAuditableOwner();
  console.log("upstream 1.0.79 behavior matrix tests passed");
}

main();
