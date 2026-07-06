const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const {
  AUTH_SESSION_STORAGE_KEYS,
  clearAuthSession,
} = require(path.join(root, "src", "shared", "auth-session.js"));

async function testLogoutRemovesOnlyOAuthSessionState() {
  let removedKeys;
  await clearAuthSession({
    storage: {
      local: {
        async remove(keys) {
          removedKeys = keys;
        },
      },
    },
  });
  assert.deepEqual(removedKeys, AUTH_SESSION_STORAGE_KEYS);
  assert.ok(removedKeys.includes("accessToken"));
  assert.ok(removedKeys.includes("refreshToken"));
  assert.ok(removedKeys.includes("accountUuid"));
  assert.equal(removedKeys.includes("customProviderConfig"), false);
  assert.equal(removedKeys.includes("anthropicApiKey"), false);
}

function testServiceWorkerRoutesLogoutThroughReadableRuntime() {
  const loader = fs.readFileSync(
    path.join(root, "src", "background", "service-worker-loader.js"),
    "utf8",
  );
  const worker = fs.readFileSync(
    path.join(root, "src", "assets", "service-worker.ts-H0DVM1LS.js"),
    "utf8",
  );
  assert.ok(loader.includes('../shared/auth-session.js'));
  assert.ok(worker.includes("await globalThis.__CP_AUTH_SESSION__.clearAuthSession(chrome);"));
  const logoutBranch = worker.slice(
    worker.indexOf("if (e.type === __cpBackgroundMessageTypeLogout)"),
    worker.indexOf("if (e.type === __cpBackgroundMessageTypeLogout)") + 900,
  );
  assert.equal(logoutBranch.includes("disabled: true"), false);
}

async function main() {
  await testLogoutRemovesOnlyOAuthSessionState();
  testServiceWorkerRoutesLogoutThroughReadableRuntime();
  console.log("auth session tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
