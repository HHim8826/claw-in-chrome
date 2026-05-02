(function () {
  if (globalThis.__CP_SIDEPANEL_DEBUG__) {
    return;
  }
  const contract = globalThis.__CP_CONTRACT__ || {};
  const authContract = contract.auth || {};
  const modelsContract = contract.models || {};
  const providerContract = contract.customProvider || {};
  const permissionManagerContract = contract.permissionManager || {};
  const debugContract = contract.debug || {};
  const uiContract = contract.ui || {};
  const STORAGE_KEY = debugContract.SIDEPANEL_LOGS_STORAGE_KEY || "sidepanelDebugLogs";
  const META_KEY = debugContract.SIDEPANEL_META_STORAGE_KEY || "sidepanelDebugMeta";
  const DEBUG_MODE_STORAGE_KEY = uiContract.DEBUG_MODE_STORAGE_KEY || "debugMode";
  const MAX_ENTRIES = 500;
  const FLUSH_DELAY_MS = 150;
  const SESSION_ID = "sp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const RELEVANT_STORAGE_KEYS = new Set(
    Array.isArray(debugContract.RELEVANT_STORAGE_KEYS) && debugContract.RELEVANT_STORAGE_KEYS.length
      ? debugContract.RELEVANT_STORAGE_KEYS
      : [
        providerContract.STORAGE_KEY || "customProviderConfig",
        providerContract.ANTHROPIC_API_KEY_STORAGE_KEY || "anthropicApiKey",
        authContract.ACCESS_TOKEN_STORAGE_KEY || "accessToken",
        authContract.REFRESH_TOKEN_STORAGE_KEY || "refreshToken",
        authContract.LAST_AUTH_FAILURE_REASON_STORAGE_KEY || "lastAuthFailureReason",
        providerContract.SELECTED_MODEL_STORAGE_KEY || "selectedModel",
        providerContract.SELECTED_MODEL_QUICK_MODE_STORAGE_KEY || "selectedModelQuickMode",
        permissionManagerContract.LAST_PERMISSION_MODE_PREFERENCE_STORAGE_KEY || "lastPermissionModePreference",
        modelsContract.CONFIG_STORAGE_KEY || "chrome_ext_models"
      ]
  );
  const SENSITIVE_KEYS = new Set(["apikey", "anthropicapikey", "accesstoken", "refreshtoken", "authtoken", "authorization", "token", "secret", "password", "currentapikey", "originalapikey"]);
  const PRIVATE_URL_KEYS = new Set(["baseurl", "providerurl", "requesturl", "url", "href", "uri", "filename", "source", "origin"]);
  const PRIVATE_TEXT_KEYS = new Set(["bodypreview", "notes", "prompt", "content", "requestbody", "responsebody", "rawbody", "inputtext", "outputtext"]);
  const REDACTED_SECRET = "[redacted-secret]";
  const REDACTED_TEXT = "[redacted-text]";
  const REDACTED_URL = "[redacted-url]";
  let sequence = 0;
  let flushTimer = null;
  let isFlushing = false;
  // 调试模式固定开启，不再受本地 debugMode 偏好关闭。
  let debugEnabled = true;
  const pendingEntries = [];
  function normalizeKey(key) {
    return String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  }
  function isObjectLike(value) {
    return !!value && typeof value === "object";
  }
  function isSensitiveKey(key) {
    const normalized = normalizeKey(key);
    return !!normalized && SENSITIVE_KEYS.has(normalized);
  }
  function isPrivateUrlKey(key) {
    const normalized = normalizeKey(key);
    return !!normalized && PRIVATE_URL_KEYS.has(normalized);
  }
  function isPrivateTextKey(key) {
    const normalized = normalizeKey(key);
    return !!normalized && PRIVATE_TEXT_KEYS.has(normalized);
  }
  function redactUrlLikeValue(value, key) {
    const text = String(value || "");
    const normalized = normalizeKey(key);
    if (!text) {
      return text;
    }
    if (normalized === "href" && text.startsWith("/")) {
      return text.split(/[?#]/)[0] || REDACTED_URL;
    }
    return REDACTED_URL;
  }
  function sanitizeInlineSecrets(text) {
    return String(text || "").replace(/\b(?:https?|wss?|chrome-extension):\/\/[^\s"'<>]+/gi, REDACTED_URL).replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, "Bearer [redacted]").replace(/\b(?:sk|rk|pk)-[A-Za-z0-9*._-]{5,}\b/gi, function (token) {
      return token.split("-")[0] + "-[redacted]";
    }).replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization|[_-]?token)?|secret|password)\b\s*[:=]\s*[^\s,;]+/gi, function (match) {
      return match.replace(/[:=]\s*[^\s,;]+$/, ": [redacted]");
    });
  }
  function sanitizeString(value, key) {
    const normalized = normalizeKey(key);
    let text = String(value || "");
    if (!text) {
      return text;
    }
    if (isSensitiveKey(normalized)) {
      return REDACTED_SECRET;
    }
    if (normalized === "useragent") {
      return "[redacted-user-agent]";
    }
    if (isPrivateTextKey(normalized)) {
      return `${REDACTED_TEXT}:${text.length}`;
    }
    if (isPrivateUrlKey(normalized)) {
      return redactUrlLikeValue(text, normalized);
    }
    text = sanitizeInlineSecrets(text);
    if (text.length > 600) {
      return text.slice(0, 600) + "...[truncated]";
    }
    return text;
  }
  function summarizeProviderConfig(value) {
    const fetchedModels = Array.isArray(value?.fetchedModels) ? value.fetchedModels : [];
    const hasBaseUrl = typeof value?.hasBaseUrl === "boolean" ? value.hasBaseUrl : !!value?.baseUrl;
    const hasApiKey = typeof value?.hasApiKey === "boolean" ? value.hasApiKey : !!value?.apiKey;
    const hasDefaultModel = typeof value?.hasDefaultModel === "boolean" ? value.hasDefaultModel : !!value?.defaultModel;
    return {
      enabled: hasBaseUrl && hasApiKey && hasDefaultModel,
      format: sanitizeString(value?.format || "", "format"),
      defaultModel: sanitizeString(value?.defaultModel || "", "defaultModel"),
      reasoningEffort: sanitizeString(value?.reasoningEffort || "", "reasoningEffort"),
      maxOutputTokens: typeof value?.maxOutputTokens === "number" ? value.maxOutputTokens : value?.maxOutputTokens || undefined,
      contextWindow: typeof value?.contextWindow === "number" ? value.contextWindow : value?.contextWindow || undefined,
      name: sanitizeString(value?.name || "", "name"),
      fetchedModelCount: typeof value?.fetchedModelCount === "number" ? value.fetchedModelCount : fetchedModels.length,
      hasApiKey,
      hasBaseUrl,
      hasDefaultModel,
      hasNotes: typeof value?.hasNotes === "boolean" ? value.hasNotes : !!String(value?.notes || "").trim()
    };
  }
  function normalizeError(error) {
    if (!error) {
      return null;
    }
    if (error instanceof Error) {
      return {
        name: error.name,
        message: sanitizeString(error.message, "message"),
        stack: sanitizeString(error.stack || "", "stack")
      };
    }
    return safeClone(error, 0, new WeakSet());
  }
  function safeClone(value, depth, seen, parentKey) {
    if (value == null) {
      return value;
    }
    if (depth > 4) {
      return "[max-depth]";
    }
    if (typeof value === "string") {
      return sanitizeString(value, parentKey);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "function") {
      return "[function]";
    }
    if (value instanceof Error) {
      return normalizeError(value);
    }
    if (value instanceof URL) {
      return sanitizeString(value.toString(), parentKey);
    }
    if (value instanceof Event) {
      return {
        type: value.type,
        target: value.target && "tagName" in value.target ? value.target.tagName : typeof value.target
      };
    }
    if (Array.isArray(value)) {
      return value.slice(0, 20).map(item => safeClone(item, depth + 1, seen));
    }
    if (!isObjectLike(value)) {
      return String(value);
    }
    if (seen.has(value)) {
      return "[circular]";
    }
    seen.add(value);
    if (isSensitiveKey(parentKey)) {
      return maskSensitiveValue(parentKey, value);
    }
    if (normalizeKey(parentKey) === "customproviderconfig" || normalizeKey(parentKey) === "customprovider") {
      return summarizeProviderConfig(value);
    }
    const output = {};
    const keys = Object.keys(value).slice(0, 30);
    for (const key of keys) {
      const item = value[key];
      output[key] = isSensitiveKey(key) ? maskSensitiveValue(key, item) : safeClone(item, depth + 1, seen, key);
    }
    return output;
  }
  function maskSensitiveValue(key, value) {
    if (value == null || value === "") {
      return value;
    }
    if (typeof value === "string") {
      return REDACTED_SECRET;
    }
    if (isObjectLike(value)) {
      return {
        masked: true,
        key: normalizeKey(key)
      };
    }
    return REDACTED_SECRET;
  }
  function createEntry(level, type, payload) {
    sequence += 1;
    return {
      id: SESSION_ID + ":" + sequence,
      sessionId: SESSION_ID,
      ts: new Date().toISOString(),
      level,
      type,
      href: location.pathname,
      payload: safeClone(payload, 0, new WeakSet())
    };
  }
  function sanitizeLogEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries.slice(-MAX_ENTRIES).map(function (entry) {
      return safeClone(entry, 0, new WeakSet());
    });
  }
  async function hydrateDebugMode() {
    if (!chrome?.storage?.local) {
      debugEnabled = true;
      return debugEnabled;
    }
    const stored = await chrome.storage.local.get(DEBUG_MODE_STORAGE_KEY);
    debugEnabled = true;
    if (stored[DEBUG_MODE_STORAGE_KEY] !== true) {
      try {
        await chrome.storage.local.set({
          [DEBUG_MODE_STORAGE_KEY]: true
        });
      } catch {}
    }
    return debugEnabled;
  }
  function scheduleFlush() {
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, FLUSH_DELAY_MS);
  }
  async function flush() {
    if (isFlushing || !pendingEntries.length) {
      return;
    }
    if (!chrome?.storage?.local) {
      return;
    }
    isFlushing = true;
    const batch = pendingEntries.splice(0, pendingEntries.length);
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEY, META_KEY]);
      const existing = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
      const nextLogs = sanitizeLogEntries(existing.concat(batch));
      await chrome.storage.local.set({
        [STORAGE_KEY]: nextLogs,
        [META_KEY]: {
          sessionId: SESSION_ID,
          lastFlushAt: new Date().toISOString(),
          href: location.pathname
        }
      });
    } catch (error) {
      console.warn("[sidepanel-debug] flush failed", error);
    } finally {
      isFlushing = false;
      if (pendingEntries.length) {
        scheduleFlush();
      }
    }
  }
  function log(type, payload, level) {
    if (!debugEnabled) {
      return null;
    }
    const entry = createEntry(level || "info", type, payload);
    pendingEntries.push(entry);
    if (entry.level === "error") {
      console.error("[sidepanel-debug]", entry.type, entry.payload);
    } else {
      console.debug("[sidepanel-debug]", entry.type, entry.payload);
    }
    scheduleFlush();
    return entry;
  }
  async function readLogs() {
    if (!chrome?.storage?.local) {
      return [];
    }
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (Array.isArray(stored[STORAGE_KEY])) {
      return sanitizeLogEntries(stored[STORAGE_KEY]);
    } else {
      return [];
    }
  }
  async function clearLogs() {
    pendingEntries.length = 0;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!chrome?.storage?.local) {
      return;
    }
    await chrome.storage.local.remove([STORAGE_KEY, META_KEY]);
  }
  async function snapshot(label) {
    if (!chrome?.storage?.local) {
      log("snapshot.unavailable", {
        label
      }, "warn");
      return null;
    }
    const keys = Array.from(RELEVANT_STORAGE_KEYS);
    const snapshotValue = await chrome.storage.local.get(keys);
    log("storage.snapshot", {
      label,
      state: snapshotValue
    });
    return snapshotValue;
  }
  function dumpToConsole() {
    readLogs().then(entries => {
      console.group("[sidepanel-debug] dump");
      entries.forEach(entry => console.log(entry));
      console.groupEnd();
    });
  }
  globalThis.__CP_SIDEPANEL_DEBUG__ = {
    sessionId: SESSION_ID,
    log,
    flush,
    read: readLogs,
    clear: clearLogs,
    snapshot,
    dumpToConsole
  };
  window.addEventListener("error", function (event) {
    log("window.error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      source: [event.filename || "", event.lineno || 0, event.colno || 0].join(":"),
      error: normalizeError(event.error),
      fallbackStack: event.error?.stack || ""
    }, "error");
    flush().catch(() => {});
  });
  window.addEventListener("unhandledrejection", function (event) {
    log("window.unhandledrejection", {
      reason: normalizeError(event.reason),
      fallbackStack: event.reason instanceof Error ? event.reason.stack || "" : new Error("sidepanel.unhandledrejection").stack || ""
    }, "error");
    flush().catch(() => {});
  });
  document.addEventListener("visibilitychange", function () {
    log("document.visibilitychange", {
      state: document.visibilityState
    });
  });
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local") {
        return;
      }
      if (DEBUG_MODE_STORAGE_KEY in changes) {
        debugEnabled = true;
        if (changes[DEBUG_MODE_STORAGE_KEY].newValue !== true) {
          chrome.storage.local.set({
            [DEBUG_MODE_STORAGE_KEY]: true
          }).catch(() => {});
        }
      }
      const changedKeys = Object.keys(changes).filter(key => {
        return RELEVANT_STORAGE_KEYS.has(key) && key !== STORAGE_KEY && key !== META_KEY;
      });
      if (!changedKeys.length) {
        return;
      }
      const payload = {};
      for (const key of changedKeys) {
        payload[key] = {
          oldValue: safeClone(changes[key].oldValue, 0, new WeakSet(), key),
          newValue: safeClone(changes[key].newValue, 0, new WeakSet(), key)
        };
      }
      log("storage.changed", payload);
    });
  }
  hydrateDebugMode().then(() => {
    log("logger.ready", {
      sessionId: SESSION_ID,
      title: document.title
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        log("dom.content_loaded", {
          readyState: document.readyState
        });
        snapshot("dom-content-loaded").catch(() => {});
      });
    } else {
      log("dom.already_ready", {
        readyState: document.readyState
      });
      snapshot("dom-already-ready").catch(() => {});
    }
  }).catch(() => {});
  window.addEventListener("load", function () {
    log("window.load", {
      readyState: document.readyState
    });
  });
})();
