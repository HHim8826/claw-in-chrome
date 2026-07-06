const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

function testIdentityPermissionMatchesReviewedBaseline() {
  const manifest = JSON.parse(read("src", "manifest.json"));
  const baseline = JSON.parse(read(".github", "manifest-permissions.json"));
  assert.ok(manifest.permissions.includes("identity"));
  assert.ok(baseline.permissions.includes("identity"));
}

function testOAuthFlowRetainsPkceStateAndTimeoutGuards() {
  const source = read("src", "assets", "PermissionManager-9s959502.js");
  const normalized = source.replace(/\s+/g, " ");
  for (const anchor of [
    "chrome.identity.getRedirectURL()",
    "chrome.identity .launchWebAuthFlow({",
    'code_challenge_method: "S256"',
    'u.searchParams.get("state") !== n',
    'setTimeout(() => e(new Error("launchWebAuthFlow timeout")), 15000)',
  ]) {
    assert.ok(normalized.includes(anchor), `OAuth guard is missing: ${anchor}`);
  }
}

function main() {
  testIdentityPermissionMatchesReviewedBaseline();
  testOAuthFlowRetainsPkceStateAndTimeoutGuards();
  console.log("MCP OAuth identity regression tests passed");
}

main();
