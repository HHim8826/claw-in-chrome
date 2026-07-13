const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");

function testVendorCheckAcceptsEquivalentTextLineEndings() {
  const repoRoot = path.join(__dirname, "..", "..");
  const result = childProcess.spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "vendor-mermaid.js"), "--check"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Vendored Mermaid 11\.15\.0 is current/);
}

try {
  testVendorCheckAcceptsEquivalentTextLineEndings();
  console.log("vendor Mermaid Windows line-ending tests passed");
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
