const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "sidepanel-BoLm9pmH.js");
const visualizerCorePath = path.join(__dirname, "..", "..", "src", "visualizer", "visualizer-core.js");
const source = fs.readFileSync(bundlePath, "utf8");
const visualizerCoreSource = fs.readFileSync(visualizerCorePath, "utf8");

function normalizeAnchorWhitespace(value) {
  return String(value)
    .replace(/\basync\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "async $1 =>")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "$1 =>")
    .replace(/\s+/g, " ")
    .replace(/\(\s+(?=[`"'A-Za-z_$[{])/g, "(")
    .replace(/,\s+(?=[)\]}])/g, "")
    .trim();
}

function assertIncludesNormalized(haystack, needle, message) {
  assert.equal(
    normalizeAnchorWhitespace(haystack).includes(
      normalizeAnchorWhitespace(needle),
    ),
    true,
    message,
  );
}

function main() {
  assert.match(
    visualizerCoreSource,
    /message\.role !== "user" \|\|[\s\S]*message\.isSynthetic === true[\s\S]*message\.isSyntheticResult === true[\s\S]*message\.isCompactSummary === true/,
    "session title builder should skip synthetic and compact summary user messages"
  );
  assert.match(
    visualizerCoreSource,
    /message\?\.isSynthetic === true[\s\S]*message\?\.isSyntheticResult === true[\s\S]*message\?\.isCompactSummary === true[\s\S]*message\?\.isCompactionMessage === true/,
    "session preview builder should skip synthetic and compaction messages"
  );
  assertIncludesNormalized(
    source,
    "if (e._synthetic === true) { s._synthetic = true; }",
    "session serializer should preserve synthetic message flags"
  );
  assertIncludesNormalized(
    source,
    "if (e._syntheticResult === true) { s._syntheticResult = true; }",
    "session serializer should preserve synthetic result flags"
  );
  console.log("visualizer synthetic session regression test passed");
}

main();
