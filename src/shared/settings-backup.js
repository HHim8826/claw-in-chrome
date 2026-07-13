(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.__CP_SETTINGS_BACKUP__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BACKUP_KIND = "claw-in-chrome-settings-backup";
  const SCHEMA_VERSION = 1;
  const REVIEWED_STORAGE_KEYS = Object.freeze([
    "customProviderConfig",
    "customProviderProfiles",
    "customProviderActiveProfileId",
    "customProviderOriginalApiKey",
    "anthropicApiKey",
    "customProviderAllowHttp",
    "customProviderAllowHttpMigrated",
    "selectedModel",
    "selectedModelQuickMode",
    "chrome_ext_models",
    "chrome_ext_system_prompt",
    "chrome_ext_skip_permissions_system_prompt",
    "chrome_ext_multiple_tabs_system_prompt",
    "chrome_ext_explicit_permissions_prompt",
    "chrome_ext_tool_usage_prompt",
    "customSystemPromptProfiles",
    "customSystemPromptActiveProfileId",
    "claw_site_workflows_v1",
    "preferred_locale",
    "debugMode",
    "showTraceIds",
    "showSystemReminders",
    "showToolResultDetails",
    "incognitoMode",
    "permissionStorage",
    "lastPermissionModePreference",
    "autoApprovePermissionRequests",
    "savedPrompts",
    "githubUpdateAutoCheckEnabled",
  ]);
  const SECRET_FIELD_NAMES = new Set([
    "apikey",
    "anthropicapikey",
    "accesstoken",
    "refreshtoken",
    "authtoken",
    "authorization",
    "token",
    "secret",
    "password",
    "currentapikey",
    "originalapikey",
    "customprovideroriginalapikey",
  ]);

  function normalizeFieldName(value) {
    return String(value || "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  }

  function isSecretField(name) {
    return SECRET_FIELD_NAMES.has(normalizeFieldName(name));
  }

  function cloneReviewedValue(value, options, key) {
    const settings = options && typeof options === "object" ? options : {};
    if (!settings.includeSecrets && isSecretField(key)) {
      return undefined;
    }
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(function (entry) {
        return cloneReviewedValue(entry, settings, "");
      });
    }
    if (typeof value !== "object") {
      return undefined;
    }
    const output = {};
    for (const childKey of Object.keys(value)) {
      const cloned = cloneReviewedValue(value[childKey], settings, childKey);
      if (cloned !== undefined) {
        output[childKey] = cloned;
      }
    }
    return output;
  }

  function createBackup(storageSnapshot, options) {
    const source = storageSnapshot && typeof storageSnapshot === "object"
      ? storageSnapshot
      : {};
    const settings = options && typeof options === "object" ? options : {};
    const includeSecrets = settings.includeSecrets === true;
    const reviewedSettings = {};
    for (const key of REVIEWED_STORAGE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      const cloned = cloneReviewedValue(source[key], { includeSecrets }, key);
      if (cloned !== undefined) {
        reviewedSettings[key] = cloned;
      }
    }
    return {
      kind: BACKUP_KIND,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: settings.now || new Date().toISOString(),
      includesSecrets: includeSecrets,
      settings: reviewedSettings,
    };
  }

  return Object.freeze({
    BACKUP_KIND,
    SCHEMA_VERSION,
    REVIEWED_STORAGE_KEYS,
    createBackup,
    isSecretField,
  });
});

