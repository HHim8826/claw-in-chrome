const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", "..", ...parts), "utf8");
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function assertIncludesNormalized(source, snippet, label) {
  assert.equal(
    normalizeWhitespace(source).includes(normalizeWhitespace(snippet)),
    true,
    label,
  );
}

function testManifestNoLongerRegistersManagedSchema() {
  const manifest = JSON.parse(readRepoFile("src", "manifest.json"));
  assert.equal(Object.prototype.hasOwnProperty.call(manifest, "storage"), false, "manifest should no longer register a managed storage schema");
}

function testManagedSchemaHasNoEnterprisePolicyEntries() {
  const schema = JSON.parse(readRepoFile("src", "managed_schema.json"));
  assert.deepEqual(schema, {
    type: "object",
    properties: {}
  });
}

function testRuntimeNoLongerReadsManagedEnterprisePolicies() {
  const mcpPermissions = readRepoFile("src", "assets", "mcpPermissions-qqAoJjJ8.js");
  const sharedState = readRepoFile("src", "assets", "useStorageState-hbwNMVUA.js");

  assert.equal(mcpPermissions.includes("chrome.storage.managed.get(P)"), false, "domain blocklist runtime should not read managed policy");
  assert.equal(sharedState.includes('chrome.storage.managed.get("forceLoginOrgUUID")'), false, "organization lock runtime should not read managed policy");
}

function testBlockingCategoriesAreNormalizedToAllowed() {
  const mcpPermissions = readRepoFile("src", "assets", "mcpPermissions-qqAoJjJ8.js");

  assertIncludesNormalized(
    mcpPermissions,
    'function __cpNormalizeDomainCategory(e) { return e === "category1" || e === "category2" || e === "category_org_blocked" ? "category0" : e; }',
    "blocking categories should normalize blocked variants back to category0",
  );
  assertIncludesNormalized(
    mcpPermissions,
    'const a = t.includes("pages/blocked.html") ? "category0" : await O.getCategory(t);',
    "string URLs pointing at blocked.html should normalize to category0",
  );
  assertIncludesNormalized(
    mcpPermissions,
    'const a = t.url?.includes("pages/blocked.html") ? "category0" : await O.getCategory(t.url || "");',
    "tab URLs pointing at blocked.html should normalize to category0",
  );
  assertIncludesNormalized(
    mcpPermissions,
    'r.categoriesByTab.set(o.id, "category0");',
    "blocked tabs should be tracked as category0 in the tab ledger",
  );
}

function main() {
  testManifestNoLongerRegistersManagedSchema();
  testManagedSchemaHasNoEnterprisePolicyEntries();
  testRuntimeNoLongerReadsManagedEnterprisePolicies();
  testBlockingCategoriesAreNormalizedToAllowed();
  console.log("domain policy disabled regression tests passed");
}

main();
