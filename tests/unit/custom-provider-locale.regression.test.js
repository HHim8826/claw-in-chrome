const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const sourcePath = path.join(rootDir, "src", "shared", "custom-provider-settings.js");
const sidepanelPath = path.join(
  rootDir,
  "src",
  "assets",
  "sidepanel-BoLm9pmH.js"
);

function extractSourceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `source should include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `source should include ${endNeedle}`);
  return source.slice(start, end);
}

function testPromptRulePayloadRoutesByContext(source) {
  const helpersSource = extractSourceBetween(
    source,
    "function normalizePromptRuleScopes",
    "function normalizePromptProfile"
  );
  const { normalizePromptRuleScopes, buildPromptRulePayload } =
    vm.runInNewContext(`
      const PROMPT_RULE_CONTEXTS = Object.freeze(["main", "relaxed", "quick"]);
      const DEFAULT_PROMPT_RULE_CONTEXTS = PROMPT_RULE_CONTEXTS.slice();
      const PROMPT_RULE_CONTEXT_SET = new Set(PROMPT_RULE_CONTEXTS);
      ${helpersSource}
      ({ normalizePromptRuleScopes, buildPromptRulePayload });
    `, {});

  assert.deepEqual(
    Array.from(normalizePromptRuleScopes([])),
    ["main", "relaxed", "quick"]
  );
  const rules = [
    {
      name: "Language & tone",
      prompt: "Always answer in Traditional Chinese.",
      scopes: ["main", "quick"],
      enabled: true
    },
    {
      name: "Relaxed only",
      prompt: "Be cautious with automatic approval.",
      scopes: ["relaxed"],
      enabled: true
    },
    {
      name: "Disabled",
      prompt: "SHOULD_NOT_BE_SENT",
      scopes: ["main", "relaxed", "quick"],
      enabled: false
    }
  ];
  const mainPayload = buildPromptRulePayload(rules, "main");
  assert.match(mainPayload, /<claw_user_rules context="main">/);
  assert.match(mainPayload, /name="Language &amp; tone"/);
  assert.match(mainPayload, /Traditional Chinese/);
  assert.doesNotMatch(mainPayload, /automatic approval/);
  assert.doesNotMatch(mainPayload, /SHOULD_NOT_BE_SENT/);

  const relaxedPayload = buildPromptRulePayload(rules, "relaxed");
  assert.match(relaxedPayload, /automatic approval/);
  assert.doesNotMatch(relaxedPayload, /Traditional Chinese/);
}

function testPromptRuleSettingsAnchors(source) {
  assert.match(
    source,
    /const PROMPT_RULE_CONTEXTS = Object\.freeze\(\["main", "relaxed", "quick"\]\);/
  );
  assert.match(
    source,
    /current\.systemPrompt = mainPrompt;[\s\S]*current\.relaxedSystemPrompt = relaxedPrompt;[\s\S]*current\.quickSystemPrompt = quickPrompt;/
  );
  assert.match(
    source,
    /async function readPromptBasePromptState\(\)[\s\S]*normalizePromptBaseOverrides\(record\)/
  );
  assert.match(
    source,
    /async function handleActivatePromptProfile\(profileId, enabled\)[\s\S]*setActivePromptProfile\([\s\S]*enabled,\s*\);/
  );
}

function testSidepanelPromptRuleBranches() {
  const source = fs.readFileSync(sidepanelPath, "utf8");
  assert.match(
    source,
    /const __cpHasRuleRecord = Array\.isArray\(e\.rules\);[\s\S]*const __cpMainRulePrompt = typeof e\.systemPrompt == "string"[\s\S]*const __cpRelaxedRulePrompt = typeof e\.relaxedSystemPrompt == "string"/
  );
  assert.match(
    source,
    /const __cpQuickRulePromptRecord = __cpUseChromeStorageValue\(__cpSidepanelStorageKeySystemPrompt, __cpStableEmptyObject\);[\s\S]*text: __cpQuickRulePrompt/
  );
  [
    "statusPrompt",
    "conversationTitlePrompt",
    "shortcutNamePrompt",
    "workflowStepPrompt",
    "workflowSummaryPrompt",
    "compactionUserPrompt",
    "compactionSystemPrompt",
    "scheduledTaskPrompt",
  ].forEach((field) => {
    assert.match(
      source,
      new RegExp(`__cpReadBuiltInPromptOverride\\("${field}"\\)`),
      `sidepanel should consume the ${field} override`,
    );
  });
}

function main() {
  const source = fs.readFileSync(sourcePath, "utf8");

  testPromptRulePayloadRoutesByContext(source);
  testPromptRuleSettingsAnchors(source);
  testSidepanelPromptRuleBranches();

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
