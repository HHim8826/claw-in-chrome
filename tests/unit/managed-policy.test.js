const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createManagedPolicyRuntime,
  isOrganizationAllowed,
  matchesBlockedUrlPattern,
  parseForceLoginOrgUUIDs,
} = require(path.join(__dirname, "..", "..", "src", "shared", "managed-policy.js"));

function testBlockedUrlPatternsMatchNormalizedUrls() {
  assert.equal(
    matchesBlockedUrlPattern("https://www.Example.com/admin/users", "example.com/admin/*"),
    true,
  );
  assert.equal(
    matchesBlockedUrlPattern("https://example.com/public", "example.com/admin/*"),
    false,
  );
  assert.equal(
    matchesBlockedUrlPattern("https://example.com/anything", "https://example.com"),
    true,
  );
  assert.equal(matchesBlockedUrlPattern("not a url", "example.com/*"), false);
}

function testForcedOrganizationPolicyAcceptsOneOrManyNormalizedIds() {
  assert.deepEqual(parseForceLoginOrgUUIDs(" ORG-A "), ["org-a"]);
  assert.deepEqual(parseForceLoginOrgUUIDs('["ORG-A", "org-b"]'), [
    "org-a",
    "org-b",
  ]);
  assert.equal(parseForceLoginOrgUUIDs("[]"), null);
  assert.equal(parseForceLoginOrgUUIDs('["org-a", 3]'), null);
  assert.equal(isOrganizationAllowed("ORG-B", ["org-a", "org-b"]), true);
  assert.equal(isOrganizationAllowed("org-c", ["org-a", "org-b"]), false);
  assert.equal(isOrganizationAllowed("org-c", null), true);
}

async function testBlockedPolicyUpdatesWithoutReloadingTheExtension() {
  const listeners = [];
  let managedValues = {
    blockedUrlPatterns: ["example.com/private/*"],
  };
  const runtime = createManagedPolicyRuntime({
    storage: {
      managed: {
        get: async () => managedValues,
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    },
  });

  assert.equal(await runtime.isUrlBlocked("https://example.com/private/a"), true);
  managedValues = { blockedUrlPatterns: ["example.com/new/*"] };
  listeners[0](
    { blockedUrlPatterns: { newValue: managedValues.blockedUrlPatterns } },
    "managed",
  );
  assert.equal(await runtime.isUrlBlocked("https://example.com/private/a"), false);
  assert.equal(await runtime.isUrlBlocked("https://example.com/new/a"), true);
}

async function main() {
  testBlockedUrlPatternsMatchNormalizedUrls();
  testForcedOrganizationPolicyAcceptsOneOrManyNormalizedIds();
  await testBlockedPolicyUpdatesWithoutReloadingTheExtension();
  console.log("managed policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
