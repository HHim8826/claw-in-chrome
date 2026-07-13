const assert = require("node:assert/strict");

const backup = require("../../src/shared/settings-backup.js");

function testDefaultBackupExportsReviewedSettingsWithoutPrivateData() {
  const document = backup.createBackup(
    {
      customProviderProfiles: [
        {
          id: "provider-main",
          name: "Main provider",
          format: "openai_chat",
          baseUrl: "https://gateway.example.test/v1",
          apiKey: "sk-private",
          defaultModel: "model-main",
        },
      ],
      customProviderActiveProfileId: "provider-main",
      customSystemPromptProfiles: [
        {
          id: "rule-1",
          name: "Concise answers",
          prompt: "Keep replies concise.",
          enabled: true,
        },
      ],
      claw_site_workflows_v1: [
        {
          name: "weekly-report",
          label: "Weekly report",
          prompt: "Prepare the weekly report.",
        },
      ],
      preferred_locale: "zh-TW",
      permissionStorage: { "https://example.test": "ask" },
      "claw.chat.scopes.private": { messages: ["private conversation"] },
      sidepanelDebugLogs: [{ message: "private log" }],
      providerObservabilityRecords: [{ model: "private-metric" }],
      unknownSetting: "must not leave the extension",
    },
    {
      now: "2026-07-13T00:00:00.000Z",
    },
  );

  assert.equal(document.kind, "claw-in-chrome-settings-backup");
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.exportedAt, "2026-07-13T00:00:00.000Z");
  assert.equal(document.includesSecrets, false);
  assert.deepEqual(document.settings.customProviderProfiles, [
    {
      id: "provider-main",
      name: "Main provider",
      format: "openai_chat",
      baseUrl: "https://gateway.example.test/v1",
      defaultModel: "model-main",
    },
  ]);
  assert.equal(document.settings.customProviderActiveProfileId, "provider-main");
  assert.equal(document.settings.preferred_locale, "zh-TW");
  assert.deepEqual(document.settings.permissionStorage, {
    "https://example.test": "ask",
  });
  assert.equal("claw.chat.scopes.private" in document.settings, false);
  assert.equal("sidepanelDebugLogs" in document.settings, false);
  assert.equal("providerObservabilityRecords" in document.settings, false);
  assert.equal("unknownSetting" in document.settings, false);
  assert.equal(JSON.stringify(document).includes("sk-private"), false);
  assert.equal(JSON.stringify(document).includes("private conversation"), false);
}

function main() {
  testDefaultBackupExportsReviewedSettingsWithoutPrivateData();
  console.log("settings backup tests passed");
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}

