const assert = require("node:assert/strict");
const path = require("node:path");

const {
  USER_BLOCKED_URL_PATTERNS_KEY,
  MAX_USER_BLOCKED_URL_PATTERNS,
  createManagedPolicyRuntime,
  matchesBlockedUrlPattern,
  normalizeUserBlockedUrlPattern,
} = require(path.join(__dirname, "..", "..", "src", "shared", "managed-policy.js"));

function createPolicyChrome({ managed = {}, local = {} } = {}) {
  const listeners = [];
  const state = { managed, local };
  return {
    state,
    listeners,
    chrome: {
      storage: {
        managed: { get: async () => state.managed },
        local: { get: async () => state.local },
        onChanged: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
      },
    },
    emit(changes, areaName) {
      for (const listener of listeners) {
        listener(changes, areaName);
      }
    },
  };
}

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

async function testUserBlocklistBlocksAndReportsItsSource() {
  const policy = createPolicyChrome({
    managed: { blockedUrlPatterns: ["intranet.example"] },
    local: { [USER_BLOCKED_URL_PATTERNS_KEY]: ["news.example", "intranet.example", 42, ""] },
  });
  const runtime = createManagedPolicyRuntime(policy.chrome);

  assert.equal(USER_BLOCKED_URL_PATTERNS_KEY, "userBlockedUrlPatterns");
  assert.equal(await runtime.getBlockSource("https://news.example/today"), "user");
  assert.equal(await runtime.isUrlBlocked("https://news.example/today"), true);
  assert.equal(
    await runtime.getBlockSource("https://intranet.example/"),
    "managed",
    "an administrator rule wins when both lists match",
  );
  assert.equal(await runtime.getBlockSource("https://open.example/"), null);
  assert.deepEqual([...(await runtime.loadUserBlockedUrlPatterns())], ["news.example", "intranet.example"]);

  policy.emit({ [USER_BLOCKED_URL_PATTERNS_KEY]: { newValue: ["open.example"] } }, "local");
  assert.equal(await runtime.getBlockSource("https://news.example/today"), null, "removing a user rule applies immediately");
  assert.equal(await runtime.getBlockSource("https://open.example/"), "user");

  policy.emit({ [USER_BLOCKED_URL_PATTERNS_KEY]: { newValue: undefined } }, "local");
  assert.equal(await runtime.isUrlBlocked("https://open.example/"), false, "clearing the list unblocks everything");
}

async function testMissingLocalStorageKeepsManagedBehavior() {
  const runtime = createManagedPolicyRuntime({
    storage: {
      managed: { get: async () => ({ blockedUrlPatterns: ["intranet.example"] }) },
      onChanged: { addListener() {} },
    },
  });
  assert.equal(await runtime.getBlockSource("https://intranet.example/"), "managed");
  assert.equal(await runtime.isUrlBlocked("https://open.example/"), false);
}

function testUserPatternNormalization() {
  assert.equal(normalizeUserBlockedUrlPattern("  https://www.Example.com/Admin/?tab=1#top "), "example.com/admin/");
  assert.equal(normalizeUserBlockedUrlPattern("*.Example.com"), "*.example.com");
  for (const wholeSite of ["example.com", "https://example.com/", "example.com/*"]) {
    assert.equal(normalizeUserBlockedUrlPattern(wholeSite), "example.com", `${wholeSite} is stored as the whole-site form`);
  }
  assert.equal(normalizeUserBlockedUrlPattern("localhost:3000/app/*"), "localhost/app/*", "ports never reach the matcher, so they're dropped");
  assert.equal(normalizeUserBlockedUrlPattern("例子.测试"), "xn--fsqu00a.xn--0zwm56d", "internationalized domains use their punycode host");
  for (const invalid of ["", "   ", "*", "*/*", "example .com", "exa mple.com/path", "http://", "a".repeat(600)]) {
    assert.equal(normalizeUserBlockedUrlPattern(invalid), "", `${JSON.stringify(invalid)} is rejected`);
  }
  assert.equal(MAX_USER_BLOCKED_URL_PATTERNS, 200);
  assert.equal(matchesBlockedUrlPattern("https://shop.example.com/cart", normalizeUserBlockedUrlPattern("*.example.com")), true);
  assert.equal(matchesBlockedUrlPattern("https://example.com/cart", normalizeUserBlockedUrlPattern("*.example.com")), false);
  assert.equal(matchesBlockedUrlPattern("http://localhost:3000/app/x", normalizeUserBlockedUrlPattern("localhost:3000/app/*")), true);
}

async function main() {
  testBlockedUrlPatternsMatchNormalizedUrls();
  await testBlockedPolicyUpdatesWithoutReloadingTheExtension();
  await testUserBlocklistBlocksAndReportsItsSource();
  await testMissingLocalStorageKeepsManagedBehavior();
  testUserPatternNormalization();
  console.log("managed policy tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
