const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sidepanelBundlePath = path.join(
  rootDir, "src", "assets",
  "sidepanel-BoLm9pmH.js",
);

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source, snippet, label) {
  assert.equal(
    source.includes(snippet),
    true,
    `${label} should include the expected snippet`,
  );
}

function main() {
  const source = readSource(sidepanelBundlePath);

  assertIncludes(
    source,
    'if (!e.startsWith("data:")) {\n    window.open(e, "_blank", "noopener,noreferrer");\n    return;\n  }\n  const n = window.open("", "_blank");',
    "image preview helper should open data URLs through a blank tab instead of navigating the top frame to data:",
  );

  assertIncludes(
    source,
    "const r = () => {\n    __cpSidepanelOpenImageInNewTab(e);\n  };",
    "generic image preview should use the safe image-open helper",
  );

  assertIncludes(
    source,
    "onClick: () => __cpSidepanelOpenImageInNewTab(e, a),",
    "screenshot preview should use the safe image-open helper",
  );

  console.log("sidepanel image preview navigation regression test passed");
}

main();
