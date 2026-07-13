(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.__CP_SETTINGS_BACKUP__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const backupContract = globalThis.__CP_CONTRACT__?.settingsBackup || {};
  const BACKUP_KIND = backupContract.KIND || "claw-in-chrome-settings-backup";
  const SCHEMA_VERSION = Number(backupContract.SCHEMA_VERSION) || 1;
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
    "chrome_ext_skip_perms_system_prompt",
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
    const normalized = normalizeFieldName(name);
    return SECRET_FIELD_NAMES.has(normalized) ||
      normalized.endsWith("apikey") ||
      normalized.endsWith("accesstoken") ||
      normalized.endsWith("refreshtoken") ||
      normalized.endsWith("authtoken") ||
      normalized.endsWith("secret") ||
      normalized.endsWith("password") ||
      normalized.endsWith("privatekey") ||
      normalized.endsWith("credential") ||
      normalized.endsWith("credentials") ||
      normalized.includes("authorization");
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

  function inspectBackup(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      return { ok: false, errorCode: "invalid_document", settings: {} };
    }
    if (document.kind !== BACKUP_KIND) {
      return { ok: false, errorCode: "wrong_kind", settings: {} };
    }
    if (Number(document.schemaVersion) !== SCHEMA_VERSION) {
      return { ok: false, errorCode: "unsupported_schema", settings: {} };
    }
    if (!document.settings || typeof document.settings !== "object" || Array.isArray(document.settings)) {
      return { ok: false, errorCode: "invalid_settings", settings: {} };
    }
    const settings = {};
    for (const key of REVIEWED_STORAGE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(document.settings, key)) {
        continue;
      }
      const cloned = cloneReviewedValue(
        document.settings[key],
        { includeSecrets: document.includesSecrets === true },
        key,
      );
      if (cloned !== undefined) {
        settings[key] = cloned;
      }
    }
    if (Object.keys(settings).length === 0) {
      return { ok: false, errorCode: "empty_settings", settings: {} };
    }
    return {
      ok: true,
      errorCode: "",
      schemaVersion: SCHEMA_VERSION,
      includesSecrets: document.includesSecrets === true,
      keys: Object.keys(settings),
      settings,
    };
  }

  function mergeImportedValue(current, incoming, includesSecrets, fieldName) {
    if (Array.isArray(incoming)) {
      const currentList = Array.isArray(current) ? current : [];
      return incoming.map(function (entry) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return cloneReviewedValue(entry, { includeSecrets: includesSecrets }, "");
        }
        const identity = String(entry.id || entry.name || "").trim();
        const previous = identity
          ? currentList.find(function (candidate) {
              return String(candidate?.id || candidate?.name || "").trim() === identity;
            })
          : null;
        return mergeImportedValue(previous, entry, includesSecrets, "");
      });
    }
    if (incoming && typeof incoming === "object") {
      const currentObject = current && typeof current === "object" && !Array.isArray(current)
        ? current
        : {};
      const output = {};
      for (const key of Object.keys(currentObject)) {
        if (!includesSecrets && isSecretField(key)) {
          output[key] = cloneReviewedValue(currentObject[key], { includeSecrets: true }, key);
        }
      }
      for (const key of Object.keys(incoming)) {
        output[key] = mergeImportedValue(
          currentObject[key],
          incoming[key],
          includesSecrets,
          key,
        );
      }
      return output;
    }
    if (!includesSecrets && isSecretField(fieldName) && incoming === undefined) {
      return current;
    }
    return cloneReviewedValue(incoming, { includeSecrets: includesSecrets }, fieldName);
  }

  function buildRestoreChanges(inspectedBackup, currentSnapshot) {
    if (!inspectedBackup || inspectedBackup.ok !== true) {
      return {};
    }
    const current = currentSnapshot && typeof currentSnapshot === "object"
      ? currentSnapshot
      : {};
    const changes = {};
    for (const key of Object.keys(inspectedBackup.settings || {})) {
      if (!REVIEWED_STORAGE_KEYS.includes(key)) {
        continue;
      }
      changes[key] = mergeImportedValue(
        current[key],
        inspectedBackup.settings[key],
        inspectedBackup.includesSecrets === true,
        key,
      );
    }
    return changes;
  }

  return Object.freeze({
    BACKUP_KIND,
    SCHEMA_VERSION,
    REVIEWED_STORAGE_KEYS,
    createBackup,
    inspectBackup,
    buildRestoreChanges,
    isSecretField,
  });
});
