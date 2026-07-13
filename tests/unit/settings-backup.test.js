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
      chrome_ext_skip_perms_system_prompt: "Use the relaxed permission prompt.",
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
  assert.equal(
    document.settings.chrome_ext_skip_perms_system_prompt,
    "Use the relaxed permission prompt.",
  );
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

function testInspectBackupRejectsUnsupportedSchemaWithoutChanges() {
  const result = backup.inspectBackup({
    kind: "claw-in-chrome-settings-backup",
    schemaVersion: 99,
    settings: {
      preferred_locale: "zh-TW",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "unsupported_schema");
  assert.deepEqual(result.settings, {});
}

function testInspectBackupRejectsWrongKindAndUnknownOnlyPayload() {
  const wrongKind = backup.inspectBackup({
    kind: "other-backup",
    schemaVersion: 1,
    settings: { preferred_locale: "zh-TW" },
  });
  const unknownOnly = backup.inspectBackup({
    kind: "claw-in-chrome-settings-backup",
    schemaVersion: 1,
    settings: { unknownSetting: "not reviewed" },
  });

  assert.equal(wrongKind.ok, false);
  assert.equal(wrongKind.errorCode, "wrong_kind");
  assert.deepEqual(wrongKind.settings, {});
  assert.equal(unknownOnly.ok, false);
  assert.equal(unknownOnly.errorCode, "empty_settings");
  assert.deepEqual(unknownOnly.settings, {});
}

function testRestoreMergePreservesSecretsOmittedFromBackup() {
  const exported = backup.createBackup({
    customProviderProfiles: [{
      id: "provider-main",
      name: "Moved provider",
      apiKey: "secret-not-exported",
      defaultModel: "model-new",
    }],
    preferred_locale: "zh-TW",
  });
  const inspected = backup.inspectBackup(exported);
  const changes = backup.buildRestoreChanges(inspected, {
    customProviderProfiles: [{
      id: "provider-main",
      name: "Old provider",
      apiKey: "secret-already-installed",
      defaultModel: "model-old",
    }],
    preferred_locale: "en-US",
    unknownSetting: "leave untouched",
  });

  assert.deepEqual(changes.customProviderProfiles, [{
    id: "provider-main",
    name: "Moved provider",
    apiKey: "secret-already-installed",
    defaultModel: "model-new",
  }]);
  assert.equal(changes.preferred_locale, "zh-TW");
  assert.equal("unknownSetting" in changes, false);
}

function testExplicitSecretExportIncludesCredentialsAndMarksDocument() {
  const document = backup.createBackup({
    customProviderProfiles: [{ id: "provider-main", apiKey: "sk-exported" }],
    anthropicApiKey: "legacy-exported",
  }, {
    includeSecrets: true,
  });

  assert.equal(document.includesSecrets, true);
  assert.equal(document.settings.customProviderProfiles[0].apiKey, "sk-exported");
  assert.equal(document.settings.anthropicApiKey, "legacy-exported");
}

function testDefaultBackupExcludesNestedCredentialNameVariants() {
  const document = backup.createBackup({
    customProviderConfig: {
      baseUrl: "https://gateway.example.test",
      clientSecret: "client-secret-private",
      privateKey: "private-key-private",
      headers: {
        authorization: "Bearer private",
        xAuthToken: "header-token-private",
        xTenant: "tenant-safe",
      },
    },
  });
  const serialized = JSON.stringify(document);

  assert.equal(serialized.includes("client-secret-private"), false);
  assert.equal(serialized.includes("private-key-private"), false);
  assert.equal(serialized.includes("Bearer private"), false);
  assert.equal(serialized.includes("header-token-private"), false);
  assert.equal(serialized.includes("tenant-safe"), true);
}

function main() {
  testDefaultBackupExportsReviewedSettingsWithoutPrivateData();
  testInspectBackupRejectsUnsupportedSchemaWithoutChanges();
  testInspectBackupRejectsWrongKindAndUnknownOnlyPayload();
  testRestoreMergePreservesSecretsOmittedFromBackup();
  testExplicitSecretExportIncludesCredentialsAndMarksDocument();
  testDefaultBackupExcludesNestedCredentialNameVariants();
  console.log("settings backup tests passed");
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
