const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sourcePath = path.join(rootDir, "src", "shared", "custom-provider-settings.js");

function main() {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(
    source,
    /function syncSubviewVisibility\(\) \{/,
    "custom provider UI should centralize subview visibility updates"
  );

  assert.match(
    source,
    /providerRoot\.hidden = !providerActive;/,
    "provider root visibility should be driven by the shared visibility helper"
  );

  assert.match(
    source,
    /sessionRoot\.hidden = !sessionActive;/,
    "session root visibility should be driven by the shared visibility helper"
  );

  assert.match(
    source,
    /promptRoot\.hidden = !promptActive;/,
    "prompt root visibility should be driven by the shared visibility helper"
  );

  assert.match(
    source,
    /mcpRoot\.hidden = !mcpActive;/,
    "MCP root visibility should be driven by the shared visibility helper"
  );

  assert.match(
    source,
    /const handleHashChange = function \(\) \{\s*syncSubviewVisibility\(\);\s*queueSyncMount\("hashchange"\);\s*\};/s,
    "hash changes should update subview visibility immediately before the deferred mount sync runs"
  );

  assert.match(
    source,
    /const \{\s*providerActive,\s*workflowActive,\s*sessionActive,\s*promptActive,\s*mcpActive,\s*\}\s*=\s*syncSubviewVisibility\(\);/s,
    "mount sync should reuse the same visibility computation instead of duplicating delayed state updates"
  );

  console.log("custom provider subview visibility regression test passed");
}

main();
