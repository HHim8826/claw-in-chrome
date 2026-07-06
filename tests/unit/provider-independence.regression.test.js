const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const { inspectRuntime } = require(path.join(root, "scripts", "inspect-runtime.js"));

function testManifestIsProviderIndependent() {
  const manifest = JSON.parse(read("src", "manifest.json"));
  const permissionBaseline = JSON.parse(
    read(".github", "manifest-permissions.json"),
  );

  assert.ok(
    manifest.permissions.includes("nativeMessaging"),
    "provider independence must preserve the MCP Native Messaging bridge",
  );
  assert.ok(!manifest.permissions.includes("identity"));
  assert.ok(!permissionBaseline.permissions.includes("identity"));
  assert.deepEqual(permissionBaseline.externally_connectable_matches, []);

  const contentScriptMatches = (manifest.content_scripts || []).flatMap(
    (entry) => entry.matches || [],
  );
  const externalMatches = manifest.externally_connectable?.matches || [];
  const webAccessibleResources = (
    manifest.web_accessible_resources || []
  ).flatMap((entry) => entry.resources || []);

  assert.ok(!contentScriptMatches.some((value) => /claude\.ai/i.test(value)));
  assert.ok(!externalMatches.some((value) => /claude\.ai/i.test(value)));
  assert.ok(
    !webAccessibleResources.includes("assets/content-script.ts-Bwa5rY9t.js"),
  );
  assert.ok(
    !fs.existsSync(
      path.join(root, "src", "assets", "content-script.ts-Bwa5rY9t.js"),
    ),
    "the packaged assets directory must not retain the Claude onboarding script",
  );
}

function testBackgroundHasNoClaudeOnboardingBridge() {
  const worker = read("src", "assets", "service-worker.ts-H0DVM1LS.js");
  const loader = read("src", "background", "service-worker-loader.js");
  const architectureCheck = read("scripts", "check-architecture.js");
  const releaseItems = read(".github", "release-package-items.txt");

  for (const forbidden of [
    "__cpExternalMessageTypeOauthRedirect",
    "__cpExternalMessageTypeOnboardingTask",
    "__cpTrustedExternalOriginClaudeAi",
    "chrome.runtime.onMessageExternal.addListener",
    "onboardingTaskId",
    "__CP_ONBOARDING_TASKS__",
  ]) {
    assert.ok(!worker.includes(forbidden), `worker still includes ${forbidden}`);
  }
  assert.ok(
    worker.includes("const __cpOpenSidePanelPrompt = e.prompt;"),
    "generic internal side-panel prompt delivery must remain",
  );
  assert.ok(!loader.includes("onboarding-tasks.js"));
  assert.ok(!architectureCheck.includes("onboarding-tasks.js"));
  assert.ok(!releaseItems.includes("shared/onboarding-tasks.js"));
  assert.ok(
    !fs.existsSync(path.join(root, "src", "shared", "onboarding-tasks.js")),
  );
}

function testOrganizationAndPolicyAuthSlicesAreRemoved() {
  const schema = JSON.parse(read("src", "managed_schema.json"));
  const policy = read("src", "shared", "managed-policy.js");
  const accountBundle = read("src", "assets", "useStorageState-hbwNMVUA.js");
  const worker = read("src", "assets", "service-worker.ts-H0DVM1LS.js");
  const loader = read("src", "background", "service-worker-loader.js");
  const architectureCheck = read("scripts", "check-architecture.js");
  const releaseItems = read(".github", "release-package-items.txt");
  const contract = read("src", "shared", "claw-contract.js");

  assert.equal(schema.properties.blockedUrlPatterns.type, "array");
  assert.ok(!Object.hasOwn(schema.properties, "forceLoginOrgUUID"));
  assert.ok(policy.includes("isUrlBlocked"));
  for (const forbidden of [
    "FORCE_LOGIN_ORG_UUID_KEY",
    "parseForceLoginOrgUUIDs",
    "isOrganizationAllowed",
  ]) {
    assert.ok(!policy.includes(forbidden), `managed policy still includes ${forbidden}`);
  }
  assert.ok(!accountBundle.includes("forceLoginOrgUUID"));
  assert.ok(!worker.includes("__CP_AUTH_SESSION__"));
  assert.ok(!loader.includes("auth-session.js"));
  assert.ok(!architectureCheck.includes("auth-session.js"));
  assert.ok(!releaseItems.includes("shared/auth-session.js"));
  assert.ok(!fs.existsSync(path.join(root, "src", "shared", "auth-session.js")));
  for (const removedKey of [
    "TOKEN_EXPIRY_STORAGE_KEY",
    "OAUTH_STATE_STORAGE_KEY",
    "CODE_VERIFIER_STORAGE_KEY",
    "ACCOUNT_UUID_STORAGE_KEY",
  ]) {
    assert.ok(!contract.includes(removedKey));
  }
  for (const retainedMcpAnchor of [
    "__cpNativePortMessageTypeToolRequest",
    "__cpNativePortMessageTypeToolResponse",
    "__cpNativePortMessageTypeMcpConnected",
  ]) {
    assert.ok(worker.includes(retainedMcpAnchor));
  }
}

function testAgentEntryPointsDeclareProviderIndependence() {
  const agentGuide = read("AGENTS.md");
  const architecture = read("ARCHITECTURE.md");
  for (const source of [agentGuide, architecture]) {
    assert.match(source, /provider-independent/i);
    assert.match(source, /Claude-only/i);
    assert.match(source, /identity/);
  }
}

function testRuntimeInspectionExposesProviderBoundary() {
  const inspection = inspectRuntime();
  assert.equal(inspection.productBoundary.providerIndependent, true);
  assert.ok(!inspection.permissions.includes("identity"));
  assert.ok(inspection.permissions.includes("nativeMessaging"));
  assert.deepEqual(inspection.externallyConnectableOrigins, []);
  assert.ok(
    !inspection.contentScriptMatches.some((value) => /claude\.ai/i.test(value)),
  );
}

testManifestIsProviderIndependent();
testBackgroundHasNoClaudeOnboardingBridge();
testOrganizationAndPolicyAuthSlicesAreRemoved();
testAgentEntryPointsDeclareProviderIndependence();
testRuntimeInspectionExposesProviderBoundary();
console.log("provider independence regression tests passed");
