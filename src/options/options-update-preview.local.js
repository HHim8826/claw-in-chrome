(() => {
  if (globalThis.__CP_OPTIONS_UPDATE_PREVIEW_LOCAL__) {
    return;
  }
  globalThis.__CP_OPTIONS_UPDATE_PREVIEW_LOCAL__ = true;

  const shared = globalThis.__CP_GITHUB_UPDATE_SHARED__;
  if (!shared || !globalThis.chrome?.storage?.local) {
    return;
  }

  const ROOT_ID = "cp-local-update-preview-root";
  const BACKUP_KEY = "githubUpdateLocalPreviewBackup";
  const DEFAULT_STRINGS = {
    title: "Update UI Preview",
    subtitle:
      "Local debug only. These buttons simulate update states so you can preview the settings card, sidepanel banner, toolbar NEW badge, and blocked overlay.",
    cardPreview: "Preview settings card",
    bannerPreview: "Preview sidepanel banner",
    badgePreview: "Preview toolbar NEW",
    blockedPreview: "Preview blocked version",
    reset: "Restore real state",
    hint:
      "Tip: after switching a preview, reopen the sidepanel if you want to inspect sidepanel states.",
    cardDone:
      "Switched to settings-card preview. This page will show the update card without the extra banner or NEW badge.",
    bannerDone:
      "Switched to sidepanel-banner preview. Reopen the sidepanel to inspect the banner.",
    badgeDone:
      "Switched to toolbar-NEW preview. Check the extension icon in the browser toolbar.",
    blockedDone:
      "Switched to blocked-version preview. Reopen the sidepanel to inspect the overlay.",
    resetDone: "Restored the real pre-preview state.",
    statusError: "Preview switch failed: {message}",
    cardNotes: "Local preview: settings-page update card.",
    bannerNotes: "Local preview: sidepanel top update banner.",
    badgeNotes: "Local preview: toolbar NEW badge.",
    blockedNotes: "Local preview: blocked-version overlay.",
  };

  const {
    STORAGE_KEYS,
    createDefaultUpdateInfo,
    detectUiLocaleKey,
    getUiLocaleTag,
    cloneLocaleValue,
    normalizeUiLocaleTag,
    resolveCustomI18nSection,
    normalizeStoredInfo,
    normalizeVersion,
  } = shared;

  function getOptionsLocaleOptions() {
    return {
      document,
      navigatorLanguage: navigator.language,
      ignoredSelectors: ["#" + ROOT_ID],
      zhPageHints: [
        "Claw in Chrome 设置",
        "Claude in Chrome 设置",
        "权限",
        "快捷方式",
        "选项",
        "扩展更新",
        "自动检查更新",
      ],
      enPagePatterns: [
        /\bPermissions\b/i,
        /\bShortcuts\b/i,
        /\bOptions\b/i,
        /\bExtension updates\b/i,
        /\bAuto-check updates\b/i,
      ],
    };
  }

  function getOptionsLocaleKey() {
    return detectUiLocaleKey(getOptionsLocaleOptions());
  }

  function getOptionsLocaleTag() {
    return getUiLocaleTag(getOptionsLocaleOptions());
  }

  let currentStrings = DEFAULT_STRINGS;

  function cloneStrings(value) {
    return typeof cloneLocaleValue === "function"
      ? cloneLocaleValue(value)
      : JSON.parse(JSON.stringify(value));
  }

  async function ensureStrings(localeTag) {
    const nextLocaleTag =
      (typeof normalizeUiLocaleTag === "function"
        ? normalizeUiLocaleTag(localeTag)
        : String(localeTag || "").trim()) || "en-US";
    if (typeof resolveCustomI18nSection === "function") {
      currentStrings = await resolveCustomI18nSection(
        "optionsUpdatePreview",
        nextLocaleTag,
        DEFAULT_STRINGS,
      );
      return;
    }
    currentStrings = cloneStrings(DEFAULT_STRINGS);
  }

  function getStrings() {
    return currentStrings;
  }

  let root = null;
  let host = null;
  let statusText = "";
  let statusKind = "";
  let refreshScheduled = false;

  function interpolate(template, values) {
    return String(template || "").replace(/\{(\w+)\}/g, function (_, key) {
      return values && values[key] != null ? String(values[key]) : "";
    });
  }

  function getCurrentVersion() {
    return normalizeVersion(chrome.runtime.getManifest().version || "");
  }

  function bumpVersion(version, step) {
    const parts = String(version || "")
      .split(".")
      .map(function (item) {
        return Number(item) || 0;
      });
    while (parts.length < 4) {
      parts.push(0);
    }
    parts[3] += step || 1;
    return parts.join(".");
  }

  function getBlockedVersion(version) {
    const parts = String(version || "")
      .split(".")
      .map(function (item) {
        return Number(item) || 0;
      });
    while (parts.length < 4) {
      parts.push(0);
    }
    parts[2] += 1;
    parts[3] = 0;
    return parts.join(".");
  }

  function getHashQuery() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    const parts = hash.split("?");
    return new URLSearchParams(parts[1] || "");
  }

  function getActiveTab() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    return (hash.split("?")[0] || "permissions").toLowerCase();
  }

  function isOptionsRootView() {
    if (getActiveTab() !== "options") {
      return false;
    }
    const subview = String(getHashQuery().get("provider") || "")
      .trim()
      .toLowerCase();
    return !subview;
  }

  function findSidebarNavList() {
    const navLists = Array.from(document.querySelectorAll("nav ul"));
    return (
      navLists.find(function (node) {
        const text = String(node.textContent || "");
        return text.includes("Options") || text.includes("选项");
      }) || null
    );
  }

  function findOptionsContentRoot() {
    const list = findSidebarNavList();
    const nav = list ? list.closest("nav") : null;
    const grid = nav ? nav.parentElement : null;
    if (!grid) {
      return null;
    }
    return (
      Array.from(grid.children).find(function (node) {
        return node !== nav && node && node.nodeType === Node.ELEMENT_NODE;
      }) || null
    );
  }

  function ensureRoot(nextHost) {
    if (root && root.isConnected && host === nextHost) {
      return root;
    }
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "space-y-6 mb-6";
    }
    if (nextHost && root.parentNode !== nextHost) {
      nextHost.appendChild(root);
    }
    host = nextHost;
    return root;
  }

  function createButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  async function setBadge(text) {
    if (!chrome.action?.setBadgeText) {
      return;
    }
    await chrome.action.setBadgeText({
      text: text || "",
    });
    if (text) {
      await chrome.action.setBadgeBackgroundColor?.({
        color: "#ca4330",
      });
      await chrome.action.setBadgeTextColor?.({
        color: "#ffffff",
      });
    }
  }

  async function ensureBackup() {
    const stored = await chrome.storage.local.get([BACKUP_KEY]);
    if (stored[BACKUP_KEY]) {
      return stored[BACKUP_KEY];
    }
    const snapshot = await chrome.storage.local.get([
      STORAGE_KEYS.INFO,
      STORAGE_KEYS.DISMISSED_VERSION,
      STORAGE_KEYS.UPDATE_AVAILABLE,
      STORAGE_KEYS.VERSION_INFO,
    ]);
    await chrome.storage.local.set({
      [BACKUP_KEY]: snapshot,
    });
    return snapshot;
  }

  async function applyPreview(payload) {
    const currentVersion = getCurrentVersion();
    const normalizedInfo = normalizeStoredInfo(
      {
        ...createDefaultUpdateInfo(currentVersion),
        ...payload.info,
        currentVersion,
      },
      currentVersion,
    );
    await ensureBackup();
    await chrome.storage.local.set({
      [STORAGE_KEYS.INFO]: normalizedInfo,
      [STORAGE_KEYS.UPDATE_AVAILABLE]: payload.updateAvailable === true,
      [STORAGE_KEYS.VERSION_INFO]: payload.versionInfo || {},
      [STORAGE_KEYS.DISMISSED_VERSION]: payload.dismissedVersion || "",
    });
    await setBadge(payload.badgeText || "");
  }

  async function previewSettingsCard() {
    const strings = getStrings();
    const currentVersion = getCurrentVersion();
    const nextVersion = bumpVersion(currentVersion, 1);
    await applyPreview({
      info: {
        latestVersion: nextVersion,
        hasUpdate: true,
        notes: strings.cardNotes,
        publishedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        minSupportedVersion: currentVersion,
      },
      updateAvailable: false,
      versionInfo: {
        min_supported_version: currentVersion,
      },
      dismissedVersion: nextVersion,
      badgeText: "",
    });
    statusKind = "success";
    statusText = strings.cardDone;
    render();
  }

  async function previewBanner() {
    const strings = getStrings();
    const currentVersion = getCurrentVersion();
    const nextVersion = bumpVersion(currentVersion, 1);
    await applyPreview({
      info: {
        latestVersion: nextVersion,
        hasUpdate: true,
        notes: strings.bannerNotes,
        publishedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        minSupportedVersion: currentVersion,
      },
      updateAvailable: true,
      versionInfo: {
        min_supported_version: currentVersion,
      },
      dismissedVersion: "",
      badgeText: "",
    });
    statusKind = "success";
    statusText = strings.bannerDone;
    render();
  }

  async function previewBadge() {
    const strings = getStrings();
    const currentVersion = getCurrentVersion();
    await applyPreview({
      info: {
        latestVersion: currentVersion,
        hasUpdate: false,
        notes: strings.badgeNotes,
        publishedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        minSupportedVersion: currentVersion,
      },
      updateAvailable: false,
      versionInfo: {
        min_supported_version: currentVersion,
      },
      dismissedVersion: "",
      badgeText: "NEW",
    });
    statusKind = "success";
    statusText = strings.badgeDone;
    render();
  }

  async function previewBlocked() {
    const strings = getStrings();
    const currentVersion = getCurrentVersion();
    const blockedVersion = getBlockedVersion(currentVersion);
    await applyPreview({
      info: {
        latestVersion: blockedVersion,
        hasUpdate: false,
        notes: strings.blockedNotes,
        publishedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        minSupportedVersion: blockedVersion,
      },
      updateAvailable: false,
      versionInfo: {
        min_supported_version: blockedVersion,
      },
      dismissedVersion: blockedVersion,
      badgeText: "",
    });
    statusKind = "success";
    statusText = strings.blockedDone;
    render();
  }

  async function restorePreview() {
    const strings = getStrings();
    const stored = await chrome.storage.local.get([BACKUP_KEY]);
    const backup = stored[BACKUP_KEY];
    if (!backup) {
      await chrome.storage.local.remove([
        STORAGE_KEYS.INFO,
        STORAGE_KEYS.DISMISSED_VERSION,
        STORAGE_KEYS.UPDATE_AVAILABLE,
        STORAGE_KEYS.VERSION_INFO,
      ]);
      await setBadge("");
      statusKind = "success";
      statusText = strings.resetDone;
      render();
      return;
    }
    const nextState = {};
    if (Object.prototype.hasOwnProperty.call(backup, STORAGE_KEYS.INFO)) {
      nextState[STORAGE_KEYS.INFO] = backup[STORAGE_KEYS.INFO];
    } else {
      nextState[STORAGE_KEYS.INFO] =
        createDefaultUpdateInfo(getCurrentVersion());
    }
    if (
      Object.prototype.hasOwnProperty.call(
        backup,
        STORAGE_KEYS.DISMISSED_VERSION,
      )
    ) {
      nextState[STORAGE_KEYS.DISMISSED_VERSION] =
        backup[STORAGE_KEYS.DISMISSED_VERSION];
    } else {
      nextState[STORAGE_KEYS.DISMISSED_VERSION] = "";
    }
    if (
      Object.prototype.hasOwnProperty.call(
        backup,
        STORAGE_KEYS.UPDATE_AVAILABLE,
      )
    ) {
      nextState[STORAGE_KEYS.UPDATE_AVAILABLE] =
        backup[STORAGE_KEYS.UPDATE_AVAILABLE];
    } else {
      nextState[STORAGE_KEYS.UPDATE_AVAILABLE] = false;
    }
    if (
      Object.prototype.hasOwnProperty.call(backup, STORAGE_KEYS.VERSION_INFO)
    ) {
      nextState[STORAGE_KEYS.VERSION_INFO] = backup[STORAGE_KEYS.VERSION_INFO];
    } else {
      nextState[STORAGE_KEYS.VERSION_INFO] = {};
    }
    await chrome.storage.local.set(nextState);
    await chrome.storage.local.remove([BACKUP_KEY]);
    const restoredInfo = normalizeStoredInfo(
      nextState[STORAGE_KEYS.INFO],
      getCurrentVersion(),
    );
    await setBadge(restoredInfo.hasUpdate ? "NEW" : "");
    statusKind = "success";
    statusText = strings.resetDone;
    render();
  }

  async function runAction(action) {
    try {
      await action();
    } catch (error) {
      const strings = getStrings();
      statusKind = "error";
      statusText = interpolate(strings.statusError, {
        message: String(error?.message || error || "unknown"),
      });
      render();
    }
  }

  function render() {
    const strings = getStrings();
    if (!isOptionsRootView()) {
      if (root?.parentNode) {
        root.remove();
      }
      host = null;
      return;
    }
    const nextHost = findOptionsContentRoot();
    if (!nextHost) {
      return;
    }
    const mount = ensureRoot(nextHost);
    mount.textContent = "";
    const panel = document.createElement("section");
    panel.className =
      "cp-page-card cp-page-panel bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8";
    const stack = document.createElement("div");
    stack.className = "cp-page-stack";
    stack.appendChild(
      Object.assign(document.createElement("h3"), {
        className: "cp-page-heading text-text-100 font-xl-bold",
        textContent: strings.title,
      }),
    );
    stack.appendChild(
      Object.assign(document.createElement("p"), {
        className: "cp-page-subheading text-text-300 font-base",
        textContent: strings.subtitle,
      }),
    );
    const hint = document.createElement("div");
    hint.className = "cp-page-meta";
    hint.textContent = strings.hint;
    stack.appendChild(hint);
    const actionRow = document.createElement("div");
    actionRow.className = "cp-page-btn-row";
    actionRow.appendChild(
      createButton(
        strings.cardPreview,
        "cp-page-btn cp-page-btn-quiet",
        function () {
          runAction(previewSettingsCard);
        },
      ),
    );
    actionRow.appendChild(
      createButton(
        strings.bannerPreview,
        "cp-page-btn cp-page-btn-quiet",
        function () {
          runAction(previewBanner);
        },
      ),
    );
    actionRow.appendChild(
      createButton(
        strings.badgePreview,
        "cp-page-btn cp-page-btn-quiet",
        function () {
          runAction(previewBadge);
        },
      ),
    );
    actionRow.appendChild(
      createButton(
        strings.blockedPreview,
        "cp-page-btn cp-page-btn-quiet",
        function () {
          runAction(previewBlocked);
        },
      ),
    );
    actionRow.appendChild(
      createButton(
        strings.reset,
        "cp-page-btn cp-page-btn-primary",
        function () {
          runAction(restorePreview);
        },
      ),
    );
    stack.appendChild(actionRow);
    if (statusText) {
      const status = document.createElement("div");
      status.className = "cp-page-status";
      status.dataset.kind = statusKind || "";
      status.textContent = statusText;
      stack.appendChild(status);
    }
    panel.appendChild(stack);
    mount.appendChild(panel);
  }

  function scheduleRender() {
    if (refreshScheduled) {
      return;
    }
    refreshScheduled = true;
    const scheduler =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : function (callback) {
            return setTimeout(callback, 16);
          };
    scheduler(function () {
      refreshScheduled = false;
      Promise.resolve(ensureStrings(getOptionsLocaleTag()))
        .catch(function () {})
        .then(function () {
          render();
        });
    });
  }

  function bootstrap() {
    scheduleRender();
    window.addEventListener("hashchange", scheduleRender);
    const observer = new MutationObserver(function (mutations) {
      const nextRoot = root;
      const isSelfMutation =
        !!nextRoot &&
        mutations.every(function (mutation) {
          const target = mutation.target;
          if (target === nextRoot || nextRoot.contains(target)) {
            return true;
          }
          return Array.from(mutation.addedNodes || []).every(function (node) {
            return node === nextRoot || nextRoot.contains(node);
          });
        });
      if (isSelfMutation) {
        return;
      }
      scheduleRender();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, {
      once: true,
    });
  } else {
    bootstrap();
  }
})();
