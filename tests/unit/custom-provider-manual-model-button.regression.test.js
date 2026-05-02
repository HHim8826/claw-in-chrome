const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sourcePath = path.join(rootDir, "src", "shared", "custom-provider-settings.js");

function main() {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(
    source,
    /const addModelButton = createNode\(\s*"button",\s*"cp-model-action-btn cp-model-action-btn-add [^"]+",\s*strings\.manualAddModelTitle,\s*\);/s,
    "manual add model button should render the localized manualAddModelTitle text"
  );

  assert.match(
    source,
    /resolveCustomI18nSection\(\s*"customProvider",/s,
    "manual add model copy should come from the custom provider language pack section"
  );

  assert.match(
    source,
    /addModelAria: "Add model manually"/,
    "manual add model button should keep an English fallback accessibility label in source"
  );

  assert.doesNotMatch(
    source,
    /const addModelButton = createNode\("button", "cp-model-action-btn cp-model-action-btn-add [^"]+", "\+"\);/,
    "manual add model button should no longer render as a plus sign"
  );

  console.log("custom provider manual model button regression test passed");
}

main();
