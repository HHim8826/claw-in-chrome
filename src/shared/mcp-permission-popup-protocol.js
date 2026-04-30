(function () {
  if (globalThis.__CP_MCP_PERMISSION_POPUP_PROTOCOL__) {
    return;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        deepFreeze(child);
      }
    }
    return value;
  }

  const mcpBridgeContract = globalThis.__CP_CONTRACT__?.mcpBridge || {};
  const contractMessages = globalThis.__CP_CONTRACT__?.messages || {};
  const queryKeys = deepFreeze({
    TAB_ID: mcpBridgeContract.PERMISSION_POPUP_QUERY_KEYS?.TAB_ID || "tabId",
    PERMISSION_ONLY:
      mcpBridgeContract.PERMISSION_POPUP_QUERY_KEYS?.PERMISSION_ONLY ||
      "mcpPermissionOnly",
    REQUEST_ID:
      mcpBridgeContract.PERMISSION_POPUP_QUERY_KEYS?.REQUEST_ID || "requestId",
  });
  const storageFields = deepFreeze({
    PROMPT:
      mcpBridgeContract.PERMISSION_PROMPT_STORAGE_FIELDS?.PROMPT || "prompt",
    TAB_ID:
      mcpBridgeContract.PERMISSION_PROMPT_STORAGE_FIELDS?.TAB_ID || "tabId",
    TIMESTAMP:
      mcpBridgeContract.PERMISSION_PROMPT_STORAGE_FIELDS?.TIMESTAMP ||
      "timestamp",
  });
  const responseFields = deepFreeze({
    REQUEST_ID:
      mcpBridgeContract.RUNTIME_MESSAGE_FIELDS?.REQUEST_ID || "requestId",
    ALLOWED: mcpBridgeContract.RUNTIME_MESSAGE_FIELDS?.ALLOWED || "allowed",
  });
  const popupWindow = deepFreeze({
    TYPE: "popup",
    WIDTH: 600,
    HEIGHT: 600,
    FOCUSED: true,
  });
  const STORAGE_KEY_PREFIX =
    mcpBridgeContract.PERMISSION_PROMPT_STORAGE_KEY_PREFIX || "mcp_prompt_";
  const RESPONSE_TIMEOUT_MS = Number.isFinite(
    Number(mcpBridgeContract.PERMISSION_POPUP_RESPONSE_TIMEOUT_MS),
  )
    ? Math.trunc(Number(mcpBridgeContract.PERMISSION_POPUP_RESPONSE_TIMEOUT_MS))
    : 30000;
  const WINDOW_CLOSE_DELAY_MS = 50;
  const RESPONSE_MESSAGE_TYPE =
    contractMessages.MCP_PERMISSION_RESPONSE || "MCP_PERMISSION_RESPONSE";
  const PAGE_PATH = "sidepanel.html";

  function normalizePositiveInteger(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
  }

  function normalizeRequestId(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function toSearchParams(value) {
    if (value instanceof URLSearchParams) {
      return value;
    }
    if (value && typeof value.get === "function") {
      return value;
    }
    return new URLSearchParams(typeof value === "string" ? value : "");
  }

  function parsePopupSearch(search) {
    const params = toSearchParams(search);
    const requestId = normalizeRequestId(params.get(queryKeys.REQUEST_ID));
    return {
      tabId: normalizePositiveInteger(params.get(queryKeys.TAB_ID)),
      permissionOnly: params.get(queryKeys.PERMISSION_ONLY) === "true",
      requestId,
    };
  }

  function isPermissionPopupSearch(search) {
    const parsed = parsePopupSearch(search);
    return parsed.permissionOnly === true && parsed.requestId !== "";
  }

  function buildPromptStorageKey(requestId) {
    return `${STORAGE_KEY_PREFIX}${normalizeRequestId(requestId)}`;
  }

  function createPromptStorageEntry(prompt, tabId, timestamp = Date.now()) {
    return {
      [storageFields.PROMPT]: prompt,
      [storageFields.TAB_ID]: normalizePositiveInteger(tabId),
      [storageFields.TIMESTAMP]: Number(timestamp),
    };
  }

  function getPromptStorageEntry(storageSnapshot, requestId) {
    const storageKey = buildPromptStorageKey(requestId);
    const snapshot =
      storageSnapshot && typeof storageSnapshot === "object"
        ? storageSnapshot
        : {};
    return snapshot[storageKey] || null;
  }

  function buildResponseMessage(requestId, allowed) {
    return {
      type: RESPONSE_MESSAGE_TYPE,
      [responseFields.REQUEST_ID]: normalizeRequestId(requestId),
      [responseFields.ALLOWED]: allowed === true,
    };
  }

  function buildPopupUrl(getRuntimeUrl, payload) {
    if (typeof getRuntimeUrl !== "function") {
      throw new Error("buildPopupUrl requires getRuntimeUrl");
    }
    const requestId = normalizeRequestId(payload?.requestId);
    const tabId = normalizePositiveInteger(payload?.tabId);
    const params = new URLSearchParams();
    if (tabId !== null) {
      params.set(queryKeys.TAB_ID, String(tabId));
    }
    params.set(queryKeys.PERMISSION_ONLY, "true");
    params.set(queryKeys.REQUEST_ID, requestId);
    return getRuntimeUrl(`${PAGE_PATH}?${params.toString()}`);
  }

  function createPopupWindowOptions(getRuntimeUrl, payload) {
    return {
      url: buildPopupUrl(getRuntimeUrl, payload),
      type: popupWindow.TYPE,
      width: popupWindow.WIDTH,
      height: popupWindow.HEIGHT,
      focused: popupWindow.FOCUSED,
    };
  }

  globalThis.__CP_MCP_PERMISSION_POPUP_PROTOCOL__ = deepFreeze({
    QUERY_KEYS: queryKeys,
    STORAGE_KEY_PREFIX,
    STORAGE_FIELDS: storageFields,
    RESPONSE_FIELDS: responseFields,
    RESPONSE_MESSAGE_TYPE,
    RESPONSE_TIMEOUT_MS,
    WINDOW_CLOSE_DELAY_MS,
    POPUP_WINDOW: popupWindow,
    PAGE_PATH,
    normalizePositiveInteger,
    normalizeRequestId,
    parsePopupSearch,
    isPermissionPopupSearch,
    buildPromptStorageKey,
    createPromptStorageEntry,
    getPromptStorageEntry,
    buildResponseMessage,
    buildPopupUrl,
    createPopupWindowOptions,
  });
})();
