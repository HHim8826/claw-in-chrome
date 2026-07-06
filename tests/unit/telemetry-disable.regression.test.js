const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "..",
    "src",
    "assets",
    "useStorageState-hbwNMVUA.js",
  ),
  "utf8",
);

assert.ok(
  source.replace(/\s+/g, " ").includes(
    "if (globalThis.__CP_TELEMETRY_DISABLED__ === true) { return { analytics: null }; }",
  ),
  "account bootstrap must honor the page-level telemetry disable contract",
);

console.log("telemetry disable regression test passed");
