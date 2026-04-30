const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const intlRuntimePath = path.join(rootDir, "src", "assets", "index-5uYI7rOK.js");
const optionsBundlePath = path.join(rootDir, "src", "assets", "options-Hyb_OzME.js");
const optionsEnhancerPath = path.join(rootDir, "src", "options", "options-update-enhancer.js");
const optionsUpdatePreviewPath = path.join(rootDir, "src", "options", "options-update-preview.local.js");

function main() {
  const intlRuntimeSource = fs.readFileSync(intlRuntimePath, "utf8");
  const optionsBundleSource = fs.readFileSync(optionsBundlePath, "utf8");
  const optionsEnhancerSource = fs.readFileSync(optionsEnhancerPath, "utf8");
  const optionsUpdatePreviewSource = fs.readFileSync(optionsUpdatePreviewPath, "utf8");

  assert.match(
    optionsBundleSource,
    /function cpGetOptionsLocaleKey\(e\) \{/,
    "options bundle should normalize locale through a shared helper"
  );

  assert.match(
    optionsBundleSource,
    /const intl = e\(\);\s*const locale = intl\?\.locale \|\| "en-US";/s,
    "update card should read locale from the options page intl context"
  );

  assert.match(
    optionsBundleSource,
    /const h = cpGetGithubUpdateStrings\(locale\);/,
    "update card copy should be derived from the intl locale"
  );

  assert.match(
    optionsBundleSource,
    /function ce\(\) \{\s*const intl = e\(\);\s*const navStrings = cpGetOptionsNavStrings\(intl\?\.locale \|\| "en-US"\);/s,
    "options sub-navigation should use the already resolved intl locale on the first visible render"
  );

  assert.doesNotMatch(
    optionsBundleSource,
    /useState\(\(\) => cpGetOptionsNavStrings\(navigator\.language\)\)/,
    "options sub-navigation should no longer bootstrap from navigator.language and then correct itself later"
  );

  assert.doesNotMatch(
    optionsBundleSource,
    /const p = String\(navigator\.language \|\| ""\)\.toLowerCase\(\)\.startsWith\("zh"\) \? "zh-CN" : "en-US";/,
    "update card timestamps should no longer derive locale directly from navigator.language"
  );

  assert.doesNotMatch(
    optionsBundleSource,
    /const cpGithubUpdateStrings = String\(navigator\.language \|\| ""\)\.toLowerCase\(\)\.startsWith\("zh"\)/,
    "update card copy should no longer hardcode locale selection from navigator.language at bundle load time"
  );

  assert.match(
    intlRuntimeSource,
    /document\.documentElement\.dataset\.cpUiLocale = t;/,
    "shared intl runtime should expose the resolved page locale through documentElement.dataset for option add-ons"
  );

  assert.match(
    intlRuntimeSource,
    /new CustomEvent\("cp:ui-locale-changed"/,
    "shared intl runtime should dispatch a locale change event for late-mounted option add-ons"
  );

  assert.match(
    optionsEnhancerSource,
    /function getOptionsLocaleKey\(\) \{/,
    "options enhancer should resolve locale from the current options page instead of freezing browser language at load time"
  );

  assert.match(
    optionsEnhancerSource,
    /return detectUiLocaleKey\(getOptionsLocaleOptions\(\)\);/,
    "options enhancer should delegate locale detection to the shared github update locale helper"
  );

  assert.match(
    optionsEnhancerSource,
    /resolveCustomI18nSection\(\s*"optionsUpdateEnhancer",/s,
    "options enhancer should hydrate its copy from the custom language pack"
  );

  assert.match(
    optionsEnhancerSource,
    /const DEFAULT_STRINGS = \{/,
    "options enhancer should keep English defaults in source as the fallback copy"
  );

  assert.doesNotMatch(
    optionsEnhancerSource,
    /const STRINGS = \{\s*zh:/s,
    "options enhancer should no longer ship a local zh/en split copy table"
  );

  assert.match(
    optionsUpdatePreviewSource,
    /function getOptionsLocaleKey\(\) \{/,
    "update preview addon should resolve locale from the live options page instead of freezing browser language"
  );

  assert.match(
    optionsUpdatePreviewSource,
    /return detectUiLocaleKey\(getOptionsLocaleOptions\(\)\);/,
    "update preview addon should delegate locale detection to the shared github update locale helper"
  );

  assert.match(
    optionsUpdatePreviewSource,
    /resolveCustomI18nSection\(\s*"optionsUpdatePreview",/s,
    "update preview addon should hydrate its copy from the custom language pack"
  );

  assert.match(
    optionsUpdatePreviewSource,
    /const DEFAULT_STRINGS = \{/,
    "update preview addon should keep English defaults in source as the fallback copy"
  );

  assert.doesNotMatch(
    optionsUpdatePreviewSource,
    /const STRINGS = \{\s*zh:/s,
    "update preview addon should no longer ship a local zh/en split copy table"
  );

  console.log("options nav locale regression test passed");
}

main();
