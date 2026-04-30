const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const inlineProviderPath = path.join(rootDir, "src", "sidepanel", "sidepanel-inline-provider.js");
const sidepanelBundlePath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");
const onboardingBundlePath = path.join(rootDir, "src", "assets", "useStorageState-hbwNMVUA.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function normalizeAnchorWhitespace(value) {
  return String(value)
    .replace(/\basync\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "async $1 =>")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "$1 =>")
    .replace(/\s+/g, " ")
    .replace(/\(\s+(?=[`"'A-Za-z_$[{])/g, "(")
    .replace(/,\s+(?=[)\]}])/g, "")
    .trim();
}

function assertIncludesNormalized(source, snippet, label) {
  assert.equal(
    normalizeAnchorWhitespace(source).includes(
      normalizeAnchorWhitespace(snippet),
    ),
    true,
    label,
  );
}

function testInlineProviderOverlayIsRetired() {
  const source = read(inlineProviderPath);

  assert.doesNotMatch(
    source,
    /直接配置模型供应商|保存并应用|获取模型/,
    "sidepanel inline provider script should no longer inject the legacy inline configuration form"
  );

  assert.match(
    source,
    /统一引导用户前往设置页的“模型供应商”子界面完成配置/,
    "sidepanel inline provider script should document the settings-page handoff"
  );
}

function testSidepanelPromptOpensProviderSettingsSubview() {
  const source = read(sidepanelBundlePath);

  assert.match(
    source,
    /function __cpGetLocalizedProviderPromptDescription\(e\) \{\s*return __cpIsChineseLocale\(e\) \? "请前往设置页的“模型供应商”界面完成配置。填写 Base URL、API Key 和默认模型后再继续。" : "Open the Model Providers settings page and finish configuring your provider before continuing. Fill in the Base URL, API Key, and default model first\.";\s*\}/,
    "sidepanel prompt should localize the provider settings guidance from the current browser locale"
  );

  assertIncludesNormalized(
    source,
    "onClick: () => chrome.tabs.create({",
    "sidepanel prompt should deep-link into the provider settings subview",
  );
  assertIncludesNormalized(
    source,
    'url: chrome.runtime.getURL("options/options.html#options?provider=true")',
    "sidepanel prompt should open the provider settings subview URL",
  );
  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderPromptActionText(ye?.locale)",
    "sidepanel prompt should render the localized provider settings action label",
  );

  assert.match(
    source,
    /__cpGetLocalizedProviderPromptDescription\(ye\?\.locale\)[\s\S]{0,500}l\.jsx\("button", \{\s*className: "px-4 py-2\.5 rounded-\[14px\] bg-text-100 hover:bg-text-200 active:bg-text-000 text-bg-100/,
    "provider settings prompt should reuse the existing black primary button token"
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderPromptTitle(n?.locale)",
    "secondary sidepanel entry should reuse the localized provider prompt title",
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderPromptDescription(n?.locale)",
    "secondary sidepanel entry should reuse the localized provider prompt description",
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderPromptActionText(n?.locale)",
    "secondary sidepanel entry should reuse the localized provider prompt action label",
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderPromptRetryText(n?.locale)",
    "secondary sidepanel entry should reuse the same localized provider prompt copy",
  );

  assert.doesNotMatch(
    source,
    /__cpGetLocalizedProviderPromptDescription\(ye\?\.locale\)[\s\S]{0,500}l\.jsx\(Q, \{/,
    "provider settings prompt should not render through the local Q symbol because that name is shadowed inside the sidepanel scope"
  );

  assert.doesNotMatch(
    source,
    /当前还没有可用的供应商配置。/,
    "provider settings prompt should no longer render the redundant helper footnote"
  );
}

function testOnboardingPromptUsesLocalizedProviderSettingsCopy() {
  const source = read(onboardingBundlePath);

  assert.match(
    source,
    /function __cpGetLocalizedProviderOnboardingDescription\(e, t\) \{[\s\S]*Open settings, fill in the Base URL, API Key, and default model, then reopen the side panel\./,
    "first-run onboarding should localize its provider guidance from the browser locale"
  );

  assertIncludesNormalized(
    source,
    "onClick: () => chrome.tabs.create({",
    "first-run onboarding should deep-link into the provider settings subview",
  );
  assertIncludesNormalized(
    source,
    'url: chrome.runtime.getURL("options/options.html#options?provider=true")',
    "first-run onboarding should open the provider settings subview URL",
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderOnboardingTitle()",
    "first-run onboarding should render through the localized provider onboarding title helper",
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderOnboardingDescription(void 0, e)",
    "first-run onboarding should render through the localized provider onboarding description helper",
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderOnboardingActionText()",
    "first-run onboarding should render through the localized provider onboarding action helper",
  );

  assertIncludesNormalized(
    source,
    "children: __cpGetLocalizedProviderOnboardingRetryText()",
    "first-run onboarding should render through the localized provider onboarding helpers",
  );
}

function main() {
  testInlineProviderOverlayIsRetired();
  testSidepanelPromptOpensProviderSettingsSubview();
  testOnboardingPromptUsesLocalizedProviderSettingsCopy();
  console.log("sidepanel provider settings entry regression test passed");
}

main();
