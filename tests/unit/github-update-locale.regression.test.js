const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sharedPath = path.join(rootDir, "src", "shared", "github-update-shared.js");
const optionsPath = path.join(rootDir, "src", "options", "github-update-options.js");
const sidepanelPath = path.join(rootDir, "src", "sidepanel", "github-update-sidepanel.js");

function main() {
  const sharedSource = fs.readFileSync(sharedPath, "utf8");
  const optionsSource = fs.readFileSync(optionsPath, "utf8");
  const sidepanelSource = fs.readFileSync(sidepanelPath, "utf8");

  assert.match(
    sharedSource,
    /function detectUiLocaleKey\(options\) \{/,
    "github update shared should expose a shared UI locale detector"
  );

  assert.match(
    sharedSource,
    /function getUiLocaleTag\(options\) \{/,
    "github update shared should expose a locale tag helper"
  );

  assert.match(
    sharedSource,
    /function resolveCustomI18nSection\(sectionPath, localeTag, defaults\) \{/,
    "github update shared should expose a reusable custom language pack loader"
  );

  assert.match(
    optionsSource,
    /return detectUiLocaleKey\(getLocaleOptions\(\)\);/,
    "github update options should derive locale from the shared detector"
  );

  assert.doesNotMatch(
    optionsSource,
    /const STRINGS = \{\s*zh:/s,
    "github update options should no longer ship a local zh/en split string table"
  );

  assert.match(
    sidepanelSource,
    /return detectUiLocaleKey\(getLocaleOptions\(\)\);/,
    "github update sidepanel should derive locale from the shared detector"
  );

  assert.doesNotMatch(
    sidepanelSource,
    /const STRINGS = \{\s*zh:/s,
    "github update sidepanel should no longer ship a local zh/en split string table"
  );

  assert.match(
    sidepanelSource,
    /if \(nextLocaleTag !== lastLocaleTag\) \{\s*Promise\.resolve\(ensureStrings\(nextLocaleTag\)\)/s,
    "github update sidepanel should rerender when the detected UI locale changes after bootstrap"
  );

  console.log("github update locale regression test passed");
}

main();
