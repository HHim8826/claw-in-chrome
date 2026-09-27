(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_MANAGED_POLICY__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Site blocking has two sources: administrator patterns from
  // chrome.storage.managed, which the extension can only read, and the user's
  // own blocked-sites list in chrome.storage.local. Both use the same matcher.
  const BLOCKED_URL_PATTERNS_KEY = "blockedUrlPatterns";
  const USER_BLOCKED_URL_PATTERNS_KEY = "userBlockedUrlPatterns";
  const MAX_USER_BLOCKED_URL_PATTERNS = 200;
  const MAX_USER_BLOCKED_URL_PATTERN_LENGTH = 512;
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

  // Returns the stored form of a user pattern, or "" when it can't match
  // anything useful. The matcher compares hostname and path only, so the
  // scheme, "www.", port, query, and fragment are dropped here.
  function normalizeUserBlockedUrlPattern(value) {
    const text = String(value ?? "").trim();
    if (!text || text.length > MAX_USER_BLOCKED_URL_PATTERN_LENGTH || /\s/.test(text)) {
      return "";
    }
    const withoutScheme = text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/[?#].*$/, "");
    const slashIndex = withoutScheme.indexOf("/");
    const rawHost = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
    let path = slashIndex === -1 ? "" : withoutScheme.slice(slashIndex).toLowerCase();
    // "example.com/" and "example.com/*" block the same pages as "example.com".
    if (path === "/" || path === "/*") {
      path = "";
    }
    const hostWithoutPort = rawHost.replace(/:\d*$/, "");
    let host;
    if (hostWithoutPort.includes("*")) {
      host = hostWithoutPort.toLowerCase();
      if (!/^[a-z0-9*.-]+$/.test(host)) {
        return "";
      }
    } else {
      try {
        host = new URL(`https://${hostWithoutPort}`).hostname;
      } catch {
        return "";
      }
    }
    host = host.replace(/\.$/, "").replace(/^www\./, "");
    if (!/[a-z0-9]/.test(host)) {
      return "";
    }
    return `${host}${path}`;
  }

  function normalizePatternList(value) {
    return Array.isArray(value)
      ? value.filter((pattern) => typeof pattern === "string" && pattern)
      : [];
  }

  function normalizeUserPatternList(value) {
    const seen = new Set();
    const patterns = [];
    for (const entry of normalizePatternList(value)) {
      const pattern = normalizeUserBlockedUrlPattern(entry);
      if (pattern && !seen.has(pattern) && patterns.length < MAX_USER_BLOCKED_URL_PATTERNS) {
        seen.add(pattern);
        patterns.push(pattern);
      }
    }
    return patterns;
  }

  function createManagedPolicyRuntime(chromeApi) {
    let blockedUrlPatterns = null;
    let userBlockedUrlPatterns = null;
    let listenerRegistered = false;

    async function loadBlockedUrlPatterns() {
      try {
        const values = await chromeApi.storage.managed.get(
          BLOCKED_URL_PATTERNS_KEY,
        );
        return normalizePatternList(values?.[BLOCKED_URL_PATTERNS_KEY]);
      } catch {
        return [];
      }
    }

    async function loadUserBlockedUrlPatterns() {
      try {
        const values = await chromeApi.storage.local.get(
          USER_BLOCKED_URL_PATTERNS_KEY,
        );
        return normalizeUserPatternList(values?.[USER_BLOCKED_URL_PATTERNS_KEY]);
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
        if (areaName === "managed" && changes[BLOCKED_URL_PATTERNS_KEY]) {
          blockedUrlPatterns = normalizePatternList(
            changes[BLOCKED_URL_PATTERNS_KEY].newValue,
          );
        }
        if (areaName === "local" && changes[USER_BLOCKED_URL_PATTERNS_KEY]) {
          userBlockedUrlPatterns = normalizeUserPatternList(
            changes[USER_BLOCKED_URL_PATTERNS_KEY].newValue,
          );
        }
      });
    }

    async function ensureLoaded() {
      if (blockedUrlPatterns === null || userBlockedUrlPatterns === null) {
        // Listen first so a change that lands during the initial read wins.
        registerChangeListener();
        const [managed, user] = await Promise.all([
          blockedUrlPatterns === null ? loadBlockedUrlPatterns() : blockedUrlPatterns,
          userBlockedUrlPatterns === null ? loadUserBlockedUrlPatterns() : userBlockedUrlPatterns,
        ]);
        blockedUrlPatterns ??= managed;
        userBlockedUrlPatterns ??= user;
      }
    }

    // "managed" wins over "user" so the administrator wording shows whenever
    // an administrator rule applies.
    async function getBlockSource(url) {
      await ensureLoaded();
      if (blockedUrlPatterns.some((pattern) => matchesBlockedUrlPattern(url, pattern))) {
        return "managed";
      }
      if (userBlockedUrlPatterns.some((pattern) => matchesBlockedUrlPattern(url, pattern))) {
        return "user";
      }
      return null;
    }

    async function isUrlBlocked(url) {
      return (await getBlockSource(url)) !== null;
    }

    return Object.freeze({
      getBlockSource,
      isUrlBlocked,
      loadBlockedUrlPatterns,
      loadUserBlockedUrlPatterns,
    });
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
    USER_BLOCKED_URL_PATTERNS_KEY,
    MAX_USER_BLOCKED_URL_PATTERNS,
    createManagedPolicyRuntime,
    getRuntime,
    matchesBlockedUrlPattern,
    normalizeUserBlockedUrlPattern,
    normalizeUserPatternList,
  });
});
