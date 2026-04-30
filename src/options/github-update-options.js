(function () {
  const shared = globalThis.__CP_GITHUB_UPDATE_SHARED__;
  if (!shared || !globalThis.chrome?.runtime?.id) {
    return;
  }

  const {
    STORAGE_KEYS,
    MESSAGE_TYPES,
    formatTimestamp,
    summarizeNotes,
    detectUiLocaleKey,
    getUiLocaleTag,
    cloneLocaleValue,
    normalizeUiLocaleTag,
    resolveCustomI18nSection,
    readStoredState,
    openReleasePage,
    openDownloadPage,
  } = shared;

  const ROOT_ID = "cp-github-update-options-root";
  const ANCHOR_ID = "cp-github-update-options-anchor";
  const STYLE_ID = "cp-github-update-options-style";
  const DEFAULT_STRINGS = {
    title: "Extension updates",
    subtitle:
      "GitHub builds are updated manually. Check for new releases here and jump to the release page to download the latest ZIP.",
    currentVersion: "Current version",
    latestVersion: "Latest version",
    lastCheckedAt: "Last checked",
    notes: "Release notes",
    latestReady: "You are on the latest version",
    updateAvailable:
      "A newer version is available. Manual upgrade is recommended.",
    neverChecked: "No update check yet",
    notesFallback: "This release does not include detailed notes.",
    autoCheckLabel: "Auto-check updates",
    autoCheckHelp:
      "When enabled, the extension checks GitHub Releases on startup and once every 24 hours.",
    autoCheckOn: "Enabled",
    autoCheckOff: "Disabled",
    autoCheckSavedOn: "Automatic update checks enabled.",
    autoCheckSavedOff: "Automatic update checks disabled.",
    viewRelease: "Open release",
    downloadZip: "Download ZIP",
    checkNow: "Check now",
    checking: "Checking GitHub Release...",
    checkFailed: "Update check failed: {message}",
    checkSucceeded: "Release metadata refreshed.",
    openReleaseFailed: "Failed to open release page: {message}",
    openDownloadFailed: "Failed to open download page: {message}",
    unknown: "Unknown",
  };
  const PRIMARY_BUTTON_CLASS =
    "px-6 py-3 bg-brand-100 text-oncolor-100 rounded-xl hover:bg-brand-100/90 transition-all font-large disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  const SECONDARY_BUTTON_CLASS =
    "px-6 py-3 bg-bg-100 text-text-200 border border-border-300 rounded-xl hover:bg-bg-200 hover:text-text-100 transition-all font-large disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  const ACTIONS = {
    DOWNLOAD: "download",
    RELEASE: "release",
    CHECK_NOW: "check_now",
    TOGGLE_AUTO_CHECK: "toggle_auto_check",
  };
  let root = null;
  let host = null;
  let state = null;
  let renderScheduled = false;
  let refreshScheduled = false;
  let statusText = "";
  let statusTone = "";
  let lastRenderSignature = "";
  let currentLocaleTag = "";
  let currentStrings = DEFAULT_STRINGS;
  const strings = new Proxy(
    {},
    {
      get(_target, key) {
        return getStrings()[key];
      },
    },
  );

  function getLocaleOptions() {
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

  function getLocaleKey() {
    return detectUiLocaleKey(getLocaleOptions());
  }

  function getLocaleTag() {
    return getUiLocaleTag(getLocaleOptions());
  }

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
    if (nextLocaleTag === currentLocaleTag && currentStrings) {
      return false;
    }
    if (typeof resolveCustomI18nSection === "function") {
      currentStrings = await resolveCustomI18nSection(
        "githubUpdateOptions",
        nextLocaleTag,
        DEFAULT_STRINGS,
      );
    } else {
      currentStrings = cloneStrings(DEFAULT_STRINGS);
    }
    currentLocaleTag = nextLocaleTag;
    return true;
  }

  function getStrings() {
    return currentStrings;
  }

  function interpolate(template, values) {
    return String(template || "").replace(/\{(\w+)\}/g, function (_, key) {
      return values && values[key] != null ? String(values[key]) : "";
    });
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .cp-guo-stack {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      #${ROOT_ID} .cp-guo-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      #${ROOT_ID} .cp-guo-stat {
        border-radius: 16px;
        border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.25));
        background: rgba(248, 250, 252, 0.55);
        padding: 14px 16px;
      }
      #${ROOT_ID} .cp-guo-label {
        font-size: 12px;
        line-height: 1.5;
        color: #64748b;
      }
      #${ROOT_ID} .cp-guo-value {
        margin-top: 6px;
        font-size: 14px;
        line-height: 1.55;
        color: #0f172a;
        word-break: break-word;
      }
      #${ROOT_ID} .cp-guo-notes {
        white-space: pre-wrap;
      }
      #${ROOT_ID} .cp-guo-status {
        border-radius: 14px;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.55;
      }
      #${ROOT_ID} .cp-guo-status[data-tone="success"] {
        color: #166534;
        background: rgba(220, 252, 231, 0.72);
      }
      #${ROOT_ID} .cp-guo-status[data-tone="error"] {
        color: #b91c1c;
        background: rgba(254, 226, 226, 0.8);
      }
      #${ROOT_ID} .cp-guo-status[data-tone="info"] {
        color: #1d4ed8;
        background: rgba(219, 234, 254, 0.8);
      }
      #${ROOT_ID} .cp-guo-row-control {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        flex: 0 0 auto;
      }
      @media (max-width: 900px) {
        #${ROOT_ID} .cp-guo-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getActiveTab() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    return (hash.split("?")[0] || "permissions").toLowerCase();
  }

  function getHashQuery() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    const parts = hash.split("?");
    return new URLSearchParams(parts[1] || "");
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

  function findMountAnchor() {
    const anchor = document.getElementById(ANCHOR_ID);
    return anchor instanceof Element ? anchor : null;
  }

  function ensureRoot(nextHost) {
    ensureStyles();
    if (root && root.isConnected && host === nextHost) {
      return root;
    }
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "space-y-6 mb-6";
      root.style.position = "relative";
      root.style.zIndex = "20";
      root.style.pointerEvents = "auto";
    }
    if (nextHost && root.parentNode !== nextHost) {
      nextHost.appendChild(root);
    }
    host = nextHost;
    return root;
  }

  function bindAction(element, actionName) {
    element.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(handleAction(actionName)).catch(function (error) {
        statusTone = "error";
        statusText = String(error?.message || error || strings.unknown);
        scheduleRender();
      });
    });
  }

  function createButton(label, className, actionName) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.style.pointerEvents = "auto";
    bindAction(button, actionName);
    return button;
  }

  function createStat(label, value) {
    const shell = document.createElement("div");
    shell.className = "cp-guo-stat";
    const title = document.createElement("div");
    title.className = "cp-guo-label";
    title.textContent = label;
    const body = document.createElement("div");
    body.className = "cp-guo-value";
    body.textContent = value || strings.unknown;
    shell.appendChild(title);
    shell.appendChild(body);
    return shell;
  }

  async function setAutoCheckEnabled(enabled) {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.AUTO_CHECK_ENABLED]: enabled,
      });
      if (state) {
        state.autoCheckEnabled = enabled;
      }
      statusTone = "success";
      statusText = enabled
        ? strings.autoCheckSavedOn
        : strings.autoCheckSavedOff;
      render();
    } catch (error) {
      statusTone = "error";
      statusText = interpolate(strings.checkFailed, {
        message: String(error?.message || error || strings.unknown),
      });
      render();
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(message, function (response) {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          resolve(
            response || {
              ok: true,
            },
          );
        });
      } catch (error) {
        resolve({
          ok: false,
          error: String(error?.message || error || ""),
        });
      }
    });
  }

  async function handleCheckNow() {
    statusTone = "info";
    statusText = strings.checking;
    render();
    const response = await sendRuntimeMessage({
      type: MESSAGE_TYPES.CHECK_NOW,
    });
    if (!response?.ok) {
      statusTone = "error";
      statusText = interpolate(strings.checkFailed, {
        message: response?.error || strings.unknown,
      });
      render();
      return;
    }
    statusTone = "success";
    statusText = strings.checkSucceeded;
    await refreshState();
  }

  async function handleOpenRelease(info) {
    const opened = await openReleasePage(info);
    if (!opened) {
      statusTone = "error";
      statusText = interpolate(strings.openReleaseFailed, {
        message: strings.unknown,
      });
      render();
    }
  }

  async function handleOpenDownload(info) {
    const opened = await openDownloadPage(info);
    if (!opened) {
      statusTone = "error";
      statusText = interpolate(strings.openDownloadFailed, {
        message: strings.unknown,
      });
      render();
    }
  }

  async function handleAction(actionName) {
    const info = state?.info;
    if (!actionName || !info) {
      return;
    }
    if (actionName === ACTIONS.DOWNLOAD) {
      await handleOpenDownload(info);
      return;
    }
    if (actionName === ACTIONS.RELEASE) {
      await handleOpenRelease(info);
      return;
    }
    if (actionName === ACTIONS.CHECK_NOW) {
      await handleCheckNow();
      return;
    }
    if (actionName === ACTIONS.TOGGLE_AUTO_CHECK) {
      await setAutoCheckEnabled(!state.autoCheckEnabled);
    }
  }

  function buildRenderSignature() {
    const info = state?.info || {};
    return [
      info.currentVersion || "",
      info.latestVersion || "",
      info.hasUpdate ? "1" : "0",
      info.lastCheckedAt || "",
      info.notes || "",
      state?.autoCheckEnabled ? "1" : "0",
      statusTone || "",
      statusText || "",
    ].join("||");
  }

  function render() {
    if (!isOptionsRootView()) {
      if (root?.parentNode) {
        root.remove();
      }
      host = null;
      return;
    }
    const nextHost = findMountAnchor();
    if (!nextHost) {
      return;
    }
    const mount = ensureRoot(nextHost);
    if (!state) {
      return;
    }
    const renderSignature = buildRenderSignature();
    if (
      mount.childElementCount > 0 &&
      renderSignature === lastRenderSignature
    ) {
      return;
    }
    const info = state.info;
    const panel = document.createElement("section");
    panel.className =
      "cp-page-card cp-page-panel bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8";
    panel.style.position = "relative";
    panel.style.zIndex = "20";
    panel.style.isolation = "isolate";
    panel.style.pointerEvents = "auto";
    const stack = document.createElement("div");
    stack.className = "cp-page-stack cp-guo-stack";
    const header = document.createElement("div");
    header.appendChild(
      Object.assign(document.createElement("h3"), {
        className: "cp-page-heading text-text-100 font-xl-bold",
        textContent: strings.title,
      }),
    );
    header.appendChild(
      Object.assign(document.createElement("p"), {
        className: "cp-page-subheading text-text-300 font-base",
        textContent: strings.subtitle,
      }),
    );
    stack.appendChild(header);

    const summary = document.createElement("div");
    summary.className = "cp-page-meta";
    summary.textContent = info.hasUpdate
      ? strings.updateAvailable
      : strings.latestReady;
    summary.dataset.tone = info.hasUpdate ? "ready" : "loading";
    stack.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "cp-guo-grid";
    grid.appendChild(
      createStat(
        strings.currentVersion,
        info.currentVersion || strings.unknown,
      ),
    );
    grid.appendChild(
      createStat(
        strings.latestVersion,
        info.latestVersion || strings.latestReady,
      ),
    );
    grid.appendChild(
      createStat(
        strings.lastCheckedAt,
        info.lastCheckedAt
          ? formatTimestamp(info.lastCheckedAt, getLocaleTag())
          : strings.neverChecked,
      ),
    );
    stack.appendChild(grid);

    const notesField = document.createElement("div");
    notesField.className = "cp-page-field";
    notesField.appendChild(
      Object.assign(document.createElement("div"), {
        className: "cp-page-label",
        textContent: strings.notes,
      }),
    );
    notesField.appendChild(
      Object.assign(document.createElement("div"), {
        className: "cp-guo-value cp-guo-notes",
        textContent: info.notes
          ? summarizeNotes(info.notes, 600)
          : strings.notesFallback,
      }),
    );
    stack.appendChild(notesField);

    const autoCheckRow = document.createElement("div");
    autoCheckRow.className = "cp-page-row";
    const autoCheckCopy = document.createElement("div");
    autoCheckCopy.className = "cp-page-row-copy";
    autoCheckCopy.appendChild(
      Object.assign(document.createElement("div"), {
        className: "cp-page-row-title",
        textContent: strings.autoCheckLabel,
      }),
    );
    const autoCheckHelp = document.createElement("p");
    autoCheckHelp.className = "cp-page-row-help";
    autoCheckHelp.textContent = strings.autoCheckHelp;
    autoCheckCopy.appendChild(autoCheckHelp);
    const autoCheckControl = document.createElement("div");
    autoCheckControl.className = "cp-guo-row-control";
    const autoCheckMeta = document.createElement("div");
    autoCheckMeta.className = "cp-page-meta";
    autoCheckMeta.dataset.tone = state.autoCheckEnabled ? "ready" : "";
    autoCheckMeta.textContent = state.autoCheckEnabled
      ? strings.autoCheckOn
      : strings.autoCheckOff;
    const autoCheckToggle = document.createElement("button");
    autoCheckToggle.type = "button";
    autoCheckToggle.className = "cp-page-toggle";
    autoCheckToggle.dataset.enabled = state.autoCheckEnabled ? "true" : "false";
    autoCheckToggle.dataset.cpGuoAction = ACTIONS.TOGGLE_AUTO_CHECK;
    autoCheckToggle.setAttribute("role", "switch");
    autoCheckToggle.setAttribute(
      "aria-checked",
      state.autoCheckEnabled ? "true" : "false",
    );
    autoCheckToggle.setAttribute("aria-label", strings.autoCheckLabel);
    autoCheckToggle.title = strings.autoCheckLabel;
    autoCheckToggle.style.pointerEvents = "auto";
    bindAction(autoCheckToggle, ACTIONS.TOGGLE_AUTO_CHECK);
    autoCheckControl.appendChild(autoCheckMeta);
    autoCheckControl.appendChild(autoCheckToggle);
    autoCheckRow.appendChild(autoCheckCopy);
    autoCheckRow.appendChild(autoCheckControl);
    stack.appendChild(autoCheckRow);

    if (statusText) {
      const status = document.createElement("div");
      status.className = "cp-guo-status";
      status.dataset.tone = statusTone || "info";
      status.textContent = statusText;
      stack.appendChild(status);
    }

    const actionRow = document.createElement("div");
    actionRow.className = "cp-page-btn-row";
    actionRow.style.position = "relative";
    actionRow.style.zIndex = "21";
    actionRow.appendChild(
      createButton(strings.downloadZip, PRIMARY_BUTTON_CLASS, ACTIONS.DOWNLOAD),
    );
    actionRow.appendChild(
      createButton(
        strings.viewRelease,
        SECONDARY_BUTTON_CLASS,
        ACTIONS.RELEASE,
      ),
    );
    actionRow.appendChild(
      createButton(strings.checkNow, SECONDARY_BUTTON_CLASS, ACTIONS.CHECK_NOW),
    );
    stack.appendChild(actionRow);

    panel.appendChild(stack);
    mount.replaceChildren(panel);
    lastRenderSignature = renderSignature;
  }

  async function refreshState() {
    state = await readStoredState();
    await ensureStrings(getLocaleTag());
    scheduleRender();
  }

  function scheduleRender() {
    if (renderScheduled) {
      return;
    }
    renderScheduled = true;
    const scheduler =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : function (callback) {
            return setTimeout(callback, 16);
          };
    scheduler(function () {
      renderScheduled = false;
      Promise.resolve(ensureStrings(getLocaleTag()))
        .catch(function () {})
        .then(function () {
          render();
        });
    });
  }

  function scheduleRefresh() {
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
      refreshState().catch(function () {});
    });
  }

  function bootstrap() {
    refreshState().catch(function () {});
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local") {
        return;
      }
      if (
        changes[STORAGE_KEYS.INFO] ||
        changes[STORAGE_KEYS.AUTO_CHECK_ENABLED]
      ) {
        scheduleRefresh();
      }
    });
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
      if (isOptionsRootView()) {
        scheduleRender();
      }
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
