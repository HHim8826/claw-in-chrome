(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_LINK_SAFETY__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // The external-link dialog keeps its open button disabled this long after it
  // becomes visible, so a click or keypress aimed elsewhere can't confirm it.
  const OPEN_LINK_ACTIVATION_DELAY_MS = 400;

  // Detects user:password@ prefixes that can make a link look like another site.
  function inspectUserinfo(value) {
    try {
      const url = new URL(String(value ?? ""));
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { hasUserinfo: false, host: null };
      }
      const hasUserinfo = url.username !== "" || url.password !== "";
      return { hasUserinfo, host: hasUserinfo ? url.host : null };
    } catch {
      return { hasUserinfo: false, host: null };
    }
  }

  return Object.freeze({
    OPEN_LINK_ACTIVATION_DELAY_MS,
    inspectUserinfo,
  });
});
