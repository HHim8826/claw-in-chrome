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
  const sessionContract = contract.session || {};
  const STORAGE_KEY = debugContract.SIDEPANEL_LOGS_STORAGE_KEY || "sidepanelDebugLogs";
  const META_KEY = debugContract.SIDEPANEL_META_STORAGE_KEY || "sidepanelDebugMeta";
  const DEBUG_MODE_STORAGE_KEY = uiContract.DEBUG_MODE_STORAGE_KEY || "debugMode";
  const INCOGNITO_MODE_STORAGE_KEY =
    uiContract.INCOGNITO_MODE_STORAGE_KEY || "incognitoMode";
  const CHAT_SCOPE_PREFIX =
    sessionContract.CHAT_SCOPE_PREFIX || "claw.chat.scopes.";
  const INCOGNITO_STORAGE_PATCH_FLAG = "__CP_INCOGNITO_STORAGE_PATCHED__";
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
        modelsContract.CONFIG_STORAGE_KEY || "chrome_ext_models",
        INCOGNITO_MODE_STORAGE_KEY
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
  function isSessionPersistenceKey(key) {
    return String(key || "").startsWith(CHAT_SCOPE_PREFIX);
  }
  function normalizeStorageKeyList(keys) {
    if (typeof keys === "string") {
      return [keys];
    }
    if (Array.isArray(keys)) {
      return keys.map(key => String(key || ""));
    }
    if (keys && typeof keys === "object") {
      return Object.keys(keys);
    }
    return null;
  }
  function cloneStorageGetResultWithoutSessionKeys(result) {
    if (!result || typeof result !== "object") {
      return result;
    }
    const next = {
      ...result
    };
    for (const key of Object.keys(next)) {
      if (isSessionPersistenceKey(key)) {
        delete next[key];
      }
    }
    return next;
  }
  function isToolResultContentBlock(value) {
    return !!value && typeof value === "object" && value.type === "tool_result";
  }
  function isIncognitoInternalUserMessage(message) {
    if (!message || typeof message !== "object" || message.role !== "user") {
      return false;
    }
    if (message._synthetic || message._syntheticResult) {
      return true;
    }
    if (!Array.isArray(message.content)) {
      return false;
    }
    const content = message.content.filter(Boolean);
    return content.length > 0 && content.every(isToolResultContentBlock);
  }
  function filterMessagesForIncognitoRequest(messages, enabled) {
    const list = Array.isArray(messages) ? messages : [];
    if (!enabled || list.length <= 1) {
      return list;
    }
    let startIndex = -1;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const message = list[index];
      if (
        message &&
        typeof message === "object" &&
        message.role === "user" &&
        !isIncognitoInternalUserMessage(message)
      ) {
        startIndex = index;
        break;
      }
    }
    return startIndex > 0 ? list.slice(startIndex) : list;
  }
  const DEFAULT_INCOGNITO_SESSION_KEY = "__default__";
  const incognitoMessageBoundaries = new Map();
  function normalizeIncognitoSessionKey(sessionKey) {
    const key = String(sessionKey || "").trim();
    return key || DEFAULT_INCOGNITO_SESSION_KEY;
  }
  function beginTemporaryMessages(messages, sessionKey) {
    const list = Array.isArray(messages) ? messages : [];
    const key = normalizeIncognitoSessionKey(sessionKey);
    const existing = incognitoMessageBoundaries.get(key);
    if (existing && existing.endIndex == null) {
      return list;
    }
    incognitoMessageBoundaries.set(key, {
      startIndex: list.length,
      endIndex: null
    });
    return list;
  }
  function stripTemporaryMessages(messages, sessionKey) {
    const list = Array.isArray(messages) ? messages : [];
    const key = normalizeIncognitoSessionKey(sessionKey);
    const boundary = incognitoMessageBoundaries.get(key);
    if (!boundary) {
      return list;
    }
    const startIndex = Math.max(
      0,
      Math.min(Number(boundary.startIndex) || 0, list.length)
    );
    const rawEndIndex =
      boundary.endIndex == null ? list.length : boundary.endIndex;
    const endIndex = Math.max(
      startIndex,
      Math.min(Number(rawEndIndex) || startIndex, list.length)
    );
    if (endIndex <= startIndex) {
      if (boundary.endIndex != null && list.length <= startIndex) {
        incognitoMessageBoundaries.delete(key);
      }
      return list;
    }
    return list.slice(0, startIndex).concat(list.slice(endIndex));
  }
  function endTemporaryMessages(messages, sessionKey) {
    const list = Array.isArray(messages) ? messages : [];
    const key = normalizeIncognitoSessionKey(sessionKey);
    const boundary = incognitoMessageBoundaries.get(key);
    if (!boundary) {
      return list;
    }
    if (boundary.endIndex == null) {
      boundary.endIndex = list.length;
    }
    return stripTemporaryMessages(list, key);
  }
  function withOptionalStorageCallback(promise, callback) {
    if (typeof callback !== "function") {
      return promise;
    }
    promise.then(
      value => callback(value),
      error => {
        console.warn("[sidepanel-incognito] storage guard failed", error);
        callback(undefined);
      }
    );
    return undefined;
  }
  function installIncognitoStorageGuard() {
    const localStorageArea = chrome?.storage?.local;
    if (!localStorageArea || globalThis[INCOGNITO_STORAGE_PATCH_FLAG]) {
      return;
    }
    const nativeGet = localStorageArea.get.bind(localStorageArea);
    const nativeSet = localStorageArea.set.bind(localStorageArea);
    const nativeRemove = localStorageArea.remove.bind(localStorageArea);
    let incognitoModeEnabled = false;
    let incognitoModeHydrated = false;
    async function readIncognitoModeEnabled() {
      if (incognitoModeHydrated) {
        return incognitoModeEnabled;
      }
      try {
        const stored = await nativeGet(INCOGNITO_MODE_STORAGE_KEY);
        incognitoModeEnabled =
          stored?.[INCOGNITO_MODE_STORAGE_KEY] === true;
      } catch {
        incognitoModeEnabled = false;
      }
      incognitoModeHydrated = true;
      return incognitoModeEnabled;
    }
    async function guardedGet(keys) {
      const result = await nativeGet(keys);
      if (!(await readIncognitoModeEnabled())) {
        return result;
      }
      return cloneStorageGetResultWithoutSessionKeys(result);
    }
    async function guardedSet(items) {
      if (
        !(await readIncognitoModeEnabled()) ||
        !items ||
        typeof items !== "object" ||
        Array.isArray(items)
      ) {
        return nativeSet(items);
      }
      const next = {};
      let blockedCount = 0;
      for (const [key, value] of Object.entries(items)) {
        if (isSessionPersistenceKey(key)) {
          blockedCount += 1;
          continue;
        }
        next[key] = value;
      }
      if (!Object.keys(next).length) {
        if (blockedCount) {
          console.debug(
            "[sidepanel-incognito] skipped session persistence write",
            { blockedCount }
          );
        }
        return undefined;
      }
      return nativeSet(next);
    }
    async function guardedRemove(keys) {
      if (!(await readIncognitoModeEnabled())) {
        return nativeRemove(keys);
      }
      const keyList = normalizeStorageKeyList(keys);
      if (!keyList) {
        return nativeRemove(keys);
      }
      const nextKeys = keyList.filter(key => !isSessionPersistenceKey(key));
      if (nextKeys.length === keyList.length) {
        return nativeRemove(keys);
      }
      if (!nextKeys.length) {
        console.debug(
          "[sidepanel-incognito] skipped session persistence removal",
          { blockedCount: keyList.length }
        );
        return undefined;
      }
      return nativeRemove(
        Array.isArray(keys) || (keys && typeof keys === "object")
          ? nextKeys
          : nextKeys[0]
      );
    }
    localStorageArea.get = function (keys, callback) {
      return withOptionalStorageCallback(guardedGet(keys), callback);
    };
    localStorageArea.set = function (items, callback) {
      return withOptionalStorageCallback(guardedSet(items), callback);
    };
    localStorageArea.remove = function (keys, callback) {
      return withOptionalStorageCallback(guardedRemove(keys), callback);
    };
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (
          areaName !== "local" ||
          !(INCOGNITO_MODE_STORAGE_KEY in (changes || {}))
        ) {
          return;
        }
        incognitoModeEnabled =
          changes[INCOGNITO_MODE_STORAGE_KEY]?.newValue === true;
        incognitoModeHydrated = true;
      });
    }
    globalThis.__CP_INCOGNITO__ = {
      storageKey: INCOGNITO_MODE_STORAGE_KEY,
      chatScopePrefix: CHAT_SCOPE_PREFIX,
      readEnabled: readIncognitoModeEnabled,
      isEnabled() {
        return incognitoModeEnabled;
      },
      filterMessagesForRequest(messages, sessionKey) {
        const visibleMessages = incognitoModeEnabled
          ? Array.isArray(messages)
            ? messages
            : []
          : stripTemporaryMessages(messages, sessionKey);
        return filterMessagesForIncognitoRequest(
          visibleMessages,
          incognitoModeEnabled
        );
      },
      beginTemporaryMessages,
      endTemporaryMessages,
      filterMessagesForPersistence(messages, sessionKey) {
        return stripTemporaryMessages(messages, sessionKey);
      },
      filterMessagesForRequestBySession(messages, sessionKey) {
        const visibleMessages = incognitoModeEnabled
          ? Array.isArray(messages)
            ? messages
            : []
          : stripTemporaryMessages(messages, sessionKey);
        return filterMessagesForIncognitoRequest(
          visibleMessages,
          incognitoModeEnabled
        );
      }
    };
    globalThis[INCOGNITO_STORAGE_PATCH_FLAG] = {
      storageKey: INCOGNITO_MODE_STORAGE_KEY,
      chatScopePrefix: CHAT_SCOPE_PREFIX,
      nativeGet,
      nativeSet,
      nativeRemove
    };
  }
  installIncognitoStorageGuard();
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
