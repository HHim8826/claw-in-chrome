const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");
const { inspectRuntime } = require(path.join(
  repoRoot,
  "scripts",
  "inspect-runtime.js",
));

function read(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

function normalize(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function assertIncludes(source, snippet, label) {
  assert.equal(normalize(source).includes(normalize(snippet)), true, label);
}

function testManifestRegistersManagedPolicySchema() {
  const manifest = JSON.parse(read("src", "manifest.json"));
  assert.deepEqual(manifest.storage, { managed_schema: "managed_schema.json" });

  const schema = JSON.parse(read("src", "managed_schema.json"));
  assert.equal(schema.properties.blockedUrlPatterns.type, "array");
  assert.ok(!Object.hasOwn(schema.properties, "forceLoginOrgUUID"));
}

function testManagedPolicyRuntimeLoadsBeforeGeneratedConsumers() {
  const workerLoader = read("src", "background", "service-worker-loader.js");
  const sidepanel = read("src", "sidepanel", "sidepanel.html");
  const options = read("src", "options", "options.html");

  assert.ok(
    workerLoader.indexOf('../shared/managed-policy.js') <
      workerLoader.indexOf('../assets/service-worker.ts-H0DVM1LS.js'),
  );
  for (const page of [sidepanel, options]) {
    assert.ok(
      page.indexOf('/shared/managed-policy.js') < page.indexOf('type="module"'),
      "managed policy runtime must load before generated page modules",
    );
  }
}

function testGeneratedUrlConsumerDelegatesToTheReadablePolicyRuntime() {
  const permissions = read("src", "assets", "mcpPermissions-qqAoJjJ8.js");
  const storageState = read("src", "assets", "useStorageState-hbwNMVUA.js");

  assertIncludes(
    permissions,
    "return globalThis.__CP_MANAGED_POLICY__.getRuntime(chrome).isUrlBlocked(e);",
    "MCP URL policy must use the readable managed-policy runtime",
  );
  assert.ok(!storageState.includes("forceLoginOrgUUID"));
}

function testRuntimeInspectionReportsManagedPolicyAndMermaidVendor() {
  const inspection = inspectRuntime();
  assert.deepEqual(inspection.managedPolicy, {
    schema: "managed_schema.json",
    keys: ["blockedUrlPatterns"],
  });
  assert.equal(
    inspection.mermaidVendor,
    "assets/vendor/mermaid-11.15.0.min.js",
  );
}

function main() {
  testManifestRegistersManagedPolicySchema();
  testManagedPolicyRuntimeLoadsBeforeGeneratedConsumers();
  testGeneratedUrlConsumerDelegatesToTheReadablePolicyRuntime();
  testRuntimeInspectionReportsManagedPolicyAndMermaidVendor();
  console.log("managed policy integration regression tests passed");
}

main();
