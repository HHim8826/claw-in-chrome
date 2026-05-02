const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "sidepanel-BoLm9pmH.js");

function readSource() {
  return fs.readFileSync(bundlePath, "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source, snippet, label) {
  assert.equal(source.includes(snippet), true, `${label} should include the expected snippet`);
}

function assertNotIncludes(source, snippet, label) {
  assert.equal(source.includes(snippet), false, `${label} should not include the removed snippet`);
}

function main() {
  const source = readSource();

  assertIncludes(
    source,
    "Think about it, then suggest a title based on the first message, putting it between <title> tags.",
    "group title generator"
  );

  assertIncludes(
    source,
    "Here is a clear, concise title for this browser automation conversation:\\n\\n<title>",
    "group title generator"
  );

  assertIncludes(
    source,
    "Generate a <title> based on the first message in the conversation.",
    "group title generator"
  );

  assertIncludes(
    source,
    "const s = __cpExtractSessionDisplayText(e?.content, __CP_CHAT_SESSION_TEXT_LIMIT);",
    "group title generator"
  );

  assertIncludes(
    source,
    "return i ? t(i[1]) : t(n);",
    "group title generator"
  );

  assertIncludes(
    source,
    'return t && t.toLowerCase() !== "title" ? __cpTrimSessionText(__cpStripSessionDisplayArtifacts(t), __CP_GROUP_TITLE_LIMIT) : "";',
    "group title generator"
  );

  assertNotIncludes(
    source,
    "Here is a concise task-style title for this browser tab group:\\n\\n<title>",
    "group title generator"
  );

  console.log("sidepanel group title generation regression test passed");
}

main();
