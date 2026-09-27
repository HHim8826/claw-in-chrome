(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_OPTIONS_CARD__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Readable Options cards share one locale rule, mount anchors inside the
  // React settings columns, one remount observer, and the panel and switch
  // markup that the built-in cards use.
  const MOUNT_ANCHOR_ID = "cp-options-debug-anchor";
  const PERMISSIONS_ANCHOR_ID = "cp-options-permissions-anchor";
  const SETTINGS_TABS = ["permissions", "prompts", "options", "internal"];
  const PANEL_CLASS =
    "cp-page-card cp-page-panel bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8";

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

  // Mirrors the options bundle: an unknown or empty tab shows Permissions.
  function currentSettingsTab() {
    const tab = String(window.location?.hash || "").replace(/^#/, "").split("?")[0];
    return SETTINGS_TABS.includes(tab) ? tab : "permissions";
  }

  function isDefaultOptionsRoute() {
    const parts = String(window.location?.hash || "").split("?");
    return parts[0] === "#options" && !/(?:^|&)provider=/.test(parts[1] || "");
  }

  function isPermissionsRoute() {
    return currentSettingsTab() === "permissions";
  }

  function getMountTarget(anchorId = MOUNT_ANCHOR_ID) {
    return document.getElementById(anchorId);
  }

  // Re-renders a card whenever React replaces the mount anchor.
  function observeMountTarget(rootId, render, anchorId = MOUNT_ANCHOR_ID) {
    if (typeof MutationObserver !== "function") {
      return null;
    }
    const observer = new MutationObserver(function () {
      const mountTarget = getMountTarget(anchorId);
      const root = document.getElementById(rootId);
      if (mountTarget && root?.parentNode !== mountTarget) {
        render();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  // A card shell with the same classes as the Incognito and HTTP cards.
  function panel(rootId, title, subtitle) {
    const root = node("section", PANEL_CLASS);
    root.id = rootId;
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.gap = "16px";
    const header = node("div", "cp-options-card-header");
    header.appendChild(node("h3", "cp-page-heading text-text-100 font-xl-bold", title));
    if (subtitle) {
      header.appendChild(node("p", "cp-page-subheading text-text-300 font-base", subtitle));
    }
    root.appendChild(header);
    return root;
  }

  // A title/help row with the shared on-off switch.
  function switchRow({ id, title, help, enabled, pending, onToggle }) {
    const row = node("div", "cp-page-row");
    const copy = node("div", "cp-page-row-copy");
    copy.appendChild(node("div", "cp-page-row-title", title));
    if (help) {
      copy.appendChild(node("p", "cp-page-row-help", help));
    }
    const control = node("div", "cp-update-enhancer-row-control");
    const toggle = node("button", "cp-page-toggle cp-update-enhancer-toggle");
    toggle.id = id;
    toggle.type = "button";
    toggle.dataset.enabled = enabled ? "true" : "false";
    toggle.disabled = !!pending;
    toggle.title = title;
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", enabled ? "true" : "false");
    toggle.setAttribute("aria-label", title);
    toggle.addEventListener("click", function () {
      if (!toggle.disabled) {
        onToggle(!enabled);
      }
    });
    control.appendChild(toggle);
    row.appendChild(copy);
    row.appendChild(control);
    return row;
  }

  return Object.freeze({
    MOUNT_ANCHOR_ID,
    PERMISSIONS_ANCHOR_ID,
    localeKey,
    node,
    currentSettingsTab,
    isDefaultOptionsRoute,
    isPermissionsRoute,
    getMountTarget,
    observeMountTarget,
    panel,
    switchRow,
  });
});
