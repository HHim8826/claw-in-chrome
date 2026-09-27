(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_OPTIONS_CARD__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Readable Options cards share one locale rule, one mount anchor inside the
  // React settings column, and one remount observer.
  const MOUNT_ANCHOR_ID = "cp-options-debug-anchor";

  function localeKey() {
    const value = String(
      document.documentElement?.dataset?.cpUiLocale ||
      document.documentElement?.lang ||
      navigator?.language ||
      "en",
    ).toLowerCase();
    if (value.startsWith("zh-tw") || value.startsWith("zh-hant")) {
      return "zh-TW";
    }
    if (value.startsWith("zh")) {
      return "zh-CN";
    }
    return "en";
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text != null) {
      element.textContent = String(text);
    }
    return element;
  }

  function isDefaultOptionsRoute() {
    const parts = String(window.location?.hash || "").split("?");
    return parts[0] === "#options" && !/(?:^|&)provider=/.test(parts[1] || "");
  }

  function getMountTarget() {
    return document.getElementById(MOUNT_ANCHOR_ID);
  }

  // Re-renders a card whenever React replaces the mount anchor.
  function observeMountTarget(rootId, render) {
    if (typeof MutationObserver !== "function") {
      return null;
    }
    const observer = new MutationObserver(function () {
      const mountTarget = getMountTarget();
      const root = document.getElementById(rootId);
      if (mountTarget && root?.parentNode !== mountTarget) {
        render();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  return Object.freeze({
    MOUNT_ANCHOR_ID,
    localeKey,
    node,
    isDefaultOptionsRoute,
    getMountTarget,
    observeMountTarget,
  });
});
