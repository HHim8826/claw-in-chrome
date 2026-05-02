const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sourcePath = path.join(rootDir, "src", "shared", "custom-provider-settings.js");

function main() {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(
    source,
    /const uiContract = rootContract\.ui \|\| \{\};/,
    "custom provider settings should read the shared UI contract"
  );

  assert.match(
    source,
    /const PREFERRED_LOCALE_STORAGE_KEY =\s*uiContract\.PREFERRED_LOCALE_STORAGE_KEY \|\| "preferred_locale";/s,
    "custom provider settings should use the shared preferred locale storage key"
  );

  assert.match(
    source,
    /async function readStoredPreferredUiLocaleKey\(\) \{/,
    "custom provider settings should load the preferred locale from storage before rendering"
  );

  assert.match(
    source,
    /function getUiLocaleKey\(\) \{\s*return preferredUiLocaleKey \|\| detectDocumentUiLocaleKey\(\);\s*\}/s,
    "custom provider settings should prioritize the stored preferred locale and only fall back to document detection"
  );

  assert.match(
    source,
    /document\?\.documentElement\?\.dataset\?\.cpUiLocale/,
    "custom provider settings should honor the explicit options page locale marker before guessing from browser language"
  );

  assert.match(
    source,
    /resolveCustomI18nSection\(\s*"customProvider",/s,
    "custom provider settings should load its copy from the custom language pack section"
  );

  assert.match(
    source,
    /if \(\s*PREFERRED_LOCALE_STORAGE_KEY in changes &&\s*applyPreferredUiLocaleKey\(\s*changes\[PREFERRED_LOCALE_STORAGE_KEY\]\?\.newValue,\s*\)\s*\) \{\s*scheduleUiRebuild\(\);\s*return;\s*\}/s,
    "preferred locale changes should trigger a full UI rebuild"
  );

  assert.match(
    source,
    /async function bootstrapUi\(\) \{[\s\S]*applyPreferredUiLocaleKey\(await readStoredPreferredUiLocaleKey\(\)\);[\s\S]*await buildUiForCurrentLocale\(\);/s,
    "bootstrap should resolve the preferred locale before the first render"
  );

  assert.match(
    source,
    /window\.addEventListener\("cp:ui-locale-changed", handleExternalUiLocaleChanged\);/,
    "custom provider settings should listen for explicit options locale change events"
  );

  assert.match(
    source,
    /scheduleDeferredUiLocaleCheck\(20\);/,
    "custom provider settings should probe for a late-resolved locale after bootstrap to avoid mixed-language first paint"
  );

  assert.doesNotMatch(
    source,
    /document\.addEventListener\("DOMContentLoaded", buildUi, \{\s*once: true\s*\}\);/s,
    "custom provider settings should no longer render immediately on DOMContentLoaded without loading the preferred locale first"
  );

  console.log("custom provider locale regression test passed");
}

main();
