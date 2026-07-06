(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_MANAGED_POLICY__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BLOCKED_URL_PATTERNS_KEY = "blockedUrlPatterns";
  const FORCE_LOGIN_ORG_UUID_KEY = "forceLoginOrgUUID";
  let runtimeChromeApi = null;
  let runtimeInstance = null;

  function matchesBlockedUrlPattern(url, pattern) {
    let parsed;
    try {
      parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      return false;
    }

    const candidate = `${parsed.hostname
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "")}${parsed.pathname.toLowerCase()}`;
    let normalizedPattern = String(pattern || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "/*");
    if (!normalizedPattern.includes("/")) {
      normalizedPattern += "/*";
    }

    const expression = normalizedPattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${expression}$`).test(candidate);
  }

  function createManagedPolicyRuntime(chromeApi) {
    let blockedUrlPatterns = null;
    let listenerRegistered = false;

    async function loadBlockedUrlPatterns() {
      try {
        const values = await chromeApi.storage.managed.get(
          BLOCKED_URL_PATTERNS_KEY,
        );
        const patterns = values?.[BLOCKED_URL_PATTERNS_KEY];
        return Array.isArray(patterns)
          ? patterns.filter((pattern) => typeof pattern === "string" && pattern)
          : [];
      } catch {
        return [];
      }
    }

    function registerChangeListener() {
      if (listenerRegistered) {
        return;
      }
      listenerRegistered = true;
      chromeApi.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "managed" || !changes[BLOCKED_URL_PATTERNS_KEY]) {
          return;
        }
        const nextValue = changes[BLOCKED_URL_PATTERNS_KEY].newValue;
        blockedUrlPatterns = Array.isArray(nextValue)
          ? nextValue.filter(
              (pattern) => typeof pattern === "string" && pattern,
            )
          : [];
      });
    }

    async function isUrlBlocked(url) {
      if (blockedUrlPatterns === null) {
        blockedUrlPatterns = await loadBlockedUrlPatterns();
        registerChangeListener();
      }
      return blockedUrlPatterns.some((pattern) =>
        matchesBlockedUrlPattern(url, pattern),
      );
    }

    return Object.freeze({
      isUrlBlocked,
      loadBlockedUrlPatterns,
    });
  }

  function parseForceLoginOrgUUIDs(value) {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (!normalized.startsWith("[")) {
      return [normalized.toLowerCase()];
    }
    try {
      const parsed = JSON.parse(normalized);
      if (
        !Array.isArray(parsed) ||
        parsed.length === 0 ||
        !parsed.every((item) => typeof item === "string")
      ) {
        return null;
      }
      return parsed.map((item) => item.trim().toLowerCase());
    } catch {
      return null;
    }
  }

  function isOrganizationAllowed(organizationUUID, allowedOrganizationUUIDs) {
    if (!allowedOrganizationUUIDs) {
      return true;
    }
    return allowedOrganizationUUIDs.includes(
      String(organizationUUID || "").toLowerCase(),
    );
  }

  function getRuntime(chromeApi) {
    if (!runtimeInstance || runtimeChromeApi !== chromeApi) {
      runtimeChromeApi = chromeApi;
      runtimeInstance = createManagedPolicyRuntime(chromeApi);
    }
    return runtimeInstance;
  }

  return Object.freeze({
    BLOCKED_URL_PATTERNS_KEY,
    FORCE_LOGIN_ORG_UUID_KEY,
    createManagedPolicyRuntime,
    getRuntime,
    isOrganizationAllowed,
    matchesBlockedUrlPattern,
    parseForceLoginOrgUUIDs,
  });
});
