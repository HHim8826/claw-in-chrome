(function (root, factory) {
  const api = factory(root.__CP_CONTRACT__?.auth || {});
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_AUTH_SESSION__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (contract) {
  const AUTH_SESSION_STORAGE_KEYS = Object.freeze([
    contract.ACCESS_TOKEN_STORAGE_KEY || "accessToken",
    contract.REFRESH_TOKEN_STORAGE_KEY || "refreshToken",
    contract.TOKEN_EXPIRY_STORAGE_KEY || "tokenExpiry",
    contract.OAUTH_STATE_STORAGE_KEY || "oauthState",
    contract.CODE_VERIFIER_STORAGE_KEY || "codeVerifier",
    contract.LAST_AUTH_FAILURE_REASON_STORAGE_KEY || "lastAuthFailureReason",
    contract.ACCOUNT_UUID_STORAGE_KEY || "accountUuid",
  ]);

  async function clearAuthSession(chromeApi) {
    if (!chromeApi?.storage?.local?.remove) {
      throw new Error("clearAuthSession requires chrome.storage.local.remove");
    }
    await chromeApi.storage.local.remove(AUTH_SESSION_STORAGE_KEYS);
    return { success: true };
  }

  return Object.freeze({
    AUTH_SESSION_STORAGE_KEYS,
    clearAuthSession,
  });
});
