(function () {
  const shared = globalThis.__CP_GITHUB_UPDATE_SHARED__;
  if (!shared || !globalThis.chrome?.runtime?.id) {
    return;
  }

  const {
    STORAGE_KEYS,
    formatTimestamp,
    detectUiLocaleKey,
    getUiLocaleTag,
    cloneLocaleValue,
    normalizeUiLocaleTag,
    resolveCustomI18nSection,
    readStoredState,
    openReleasePage,
    openDownloadPage,
    isBlockedByMinVersion,
    normalizeVersion,
    renderMarkdownToHtml,
  } = shared;

  const ROOT_ID = "cp-github-update-sidepanel-root";
  const STYLE_ID = "cp-github-update-sidepanel-style";
  const BACKDROP_CLASS = "fixed inset-0 bg-always-black/50 z-50";
  const WRAPPER_CLASS =
    "fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-5 sm:p-6";
  const DEFAULT_STRINGS = {
    updateTitle: "New version available",
    updateBody:
      "You are on {current}. Version {latest} is available. Download the new build, replace the local extension folder, then reload it from chrome://extensions.",
    currentVersion: "Current version",
    latestVersion: "Latest version",
    publishedAt: "Published",
    releaseNotes: "What changed",
    manualBadge: "Manual update",
    requiredBadge: "Update required",
    viewRelease: "Open release",
    downloadZip: "Download ZIP",
    dismiss: "Later",
    skipVersion: "Skip this version",
    close: "Close",
    blockedTitle: "Manual update required",
    blockedBody:
      "Your current version ({current}) is no longer supported. Please update to {min} or later to keep using Claw.",
    blockedStep1: "Download the latest ZIP",
    blockedStep2: "Replace the local extension folder",
    blockedStep3: "Open chrome://extensions and click Reload",
    notesFallback: "This release did not include detailed notes.",
    unknown: "Unknown",
  };
  const CARD_CLASS =
    "relative w-full sm:max-w-[560px] pointer-events-auto bg-bg-000 border-[0.5px] border-border-300 rounded-[14px] overflow-hidden";
  const CLOSE_BUTTON_CLASS =
    "absolute top-4 right-4 z-10 inline-flex items-center justify-center bg-bg-100 border border-border-300 rounded-full hover:bg-bg-200 transition-colors";
  const PRIMARY_BUTTON_CLASS =
    "px-[14px] py-2 bg-brand-200 text-oncolor-100 rounded-[14px] hover:bg-brand-100 transition-colors font-ui font-medium text-[14px]";
  const SECONDARY_BUTTON_CLASS =
    "px-[14px] py-2 bg-brand-200 text-oncolor-100 rounded-[14px] hover:bg-brand-100 transition-colors font-ui font-medium text-[14px]";
  const OUTLINE_BUTTON_CLASS =
    "px-[14px] py-2 border border-border-300 text-text-200 rounded-[14px] hover:bg-bg-200 transition-colors font-ui font-medium text-[14px]";
  const BADGE_CLASS =
    "px-2 py-1 text-xs font-base-bold bg-brand-200 text-oncolor-100 rounded-md";
  const STEP_BADGE_CLASS =
    "inline-flex items-center justify-center rounded-md bg-bg-100 border border-border-300 px-2 text-xs font-base-bold text-brand-100";
  const BODY_TEXT_CLASS = "text-text-200 font-base mt-4";
  const META_GRID_CLASS = "grid grid-cols-3 gap-2";
  const SECTION_CLASS =
    "w-full rounded-lg px-3 py-2 bg-bg-100 border border-border-300";
  const SECTION_LABEL_CLASS = "text-xs text-text-300 font-base-bold";
  const SECTION_VALUE_CLASS = "mt-1 text-sm text-text-100";

  let root = null;
  let state = null;
  let refreshScheduled = false;
  let snoozedVersion = "";
  let lastLocaleTag = "";
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
        "请先配置自定义模型供应商",
        "配置你的模型供应商",
        "新建会话",
        "独立窗口",
        "会话管理",
        "提示词修改",
        "最近会话",
        "输入 / 查看命令",
        "无障碍可跳转执行",
      ],
      enPagePatterns: [
        /\bOpen your settings page\b/i,
        /\bNew session\b/i,
        /\bOpen in window\b/i,
        /\bChange language\b/i,
        /\bRecent sessions\b/i,
        /\bType \/ for commands\b/i,
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
    if (nextLocaleTag === lastLocaleTag && currentStrings) {
      return false;
    }
    if (typeof resolveCustomI18nSection === "function") {
      currentStrings = await resolveCustomI18nSection(
        "githubUpdateSidepanel",
        nextLocaleTag,
        DEFAULT_STRINGS,
      );
    } else {
      currentStrings = cloneStrings(DEFAULT_STRINGS);
    }
    lastLocaleTag = nextLocaleTag;
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

  function ensureRoot() {
    ensureStyles();
    if (root && root.isConnected) {
      return root;
    }
    root = document.getElementById(ROOT_ID);
    if (root) {
      return root;
    }
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.appendChild(root);
    return root;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .cp-gus-md {
        color: #0f172a;
        font-size: 14px;
        line-height: 1.7;
        word-break: break-word;
        white-space: normal;
      }
      #${ROOT_ID} .cp-gus-md > :first-child {
        margin-top: 0;
      }
      #${ROOT_ID} .cp-gus-md > :last-child {
        margin-bottom: 0;
      }
      #${ROOT_ID} .cp-gus-md h1,
      #${ROOT_ID} .cp-gus-md h2,
      #${ROOT_ID} .cp-gus-md h3,
      #${ROOT_ID} .cp-gus-md h4,
      #${ROOT_ID} .cp-gus-md h5,
      #${ROOT_ID} .cp-gus-md h6 {
        margin: 16px 0 8px;
        font-weight: 700;
        line-height: 1.35;
        color: #0f172a;
      }
      #${ROOT_ID} .cp-gus-md p,
      #${ROOT_ID} .cp-gus-md ul,
      #${ROOT_ID} .cp-gus-md ol,
      #${ROOT_ID} .cp-gus-md blockquote,
      #${ROOT_ID} .cp-gus-md pre {
        margin: 0 0 12px;
      }
      #${ROOT_ID} .cp-gus-md ul,
      #${ROOT_ID} .cp-gus-md ol {
        padding-left: 1.35rem;
      }
      #${ROOT_ID} .cp-gus-md a {
        color: #2563eb;
        text-decoration: underline;
      }
      #${ROOT_ID} .cp-gus-md code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
        font-size: 0.92em;
        padding: 0.12rem 0.32rem;
        border-radius: 6px;
        background: rgba(148, 163, 184, 0.16);
      }
      #${ROOT_ID} .cp-gus-md pre {
        overflow: auto;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(15, 23, 42, 0.04);
      }
      #${ROOT_ID} .cp-gus-md pre code {
        padding: 0;
        background: transparent;
      }
      #${ROOT_ID} .cp-gus-md blockquote {
        padding: 10px 14px;
        border-left: 3px solid rgba(37, 99, 235, 0.45);
        background: rgba(219, 234, 254, 0.35);
        border-radius: 10px;
      }
      #${ROOT_ID} .cp-gus-notes-scroll {
        max-height: min(42vh, 360px);
        overflow: auto;
        padding-right: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  function createNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  function createButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function formatVersion(value) {
    const normalized = normalizeVersion(value);
    return normalized ? `v${normalized}` : strings.unknown;
  }

  function formatDateTime(value) {
    if (!value) {
      return strings.unknown;
    }
    return formatTimestamp(value, getLocaleTag()) || String(value);
  }

  function createSection(label, value) {
    const shell = createNode("div", SECTION_CLASS);
    shell.appendChild(createNode("div", SECTION_LABEL_CLASS, label));
    const valueNode = createNode("div", SECTION_VALUE_CLASS);
    valueNode.textContent = value;
    shell.appendChild(valueNode);
    return shell;
  }

  function createNotesSection(label, markdown, fallbackText) {
    const shell = createNode("div", SECTION_CLASS);
    shell.appendChild(createNode("div", SECTION_LABEL_CLASS, label));
    const valueNode = createNode(
      "div",
      SECTION_VALUE_CLASS + " cp-gus-md cp-gus-notes-scroll",
    );
    const renderedHtml =
      typeof renderMarkdownToHtml === "function"
        ? String(renderMarkdownToHtml(markdown || "") || "").trim()
        : "";
    if (renderedHtml) {
      valueNode.innerHTML = renderedHtml;
    } else {
      valueNode.textContent = fallbackText;
    }
    shell.appendChild(valueNode);
    return shell;
  }

  function createStep(index, text) {
    const row = createNode(
      "div",
      "w-full flex items-start gap-3 rounded-lg px-3 py-2 bg-bg-200",
    );
    const badge = createNode("div", STEP_BADGE_CLASS, String(index));
    badge.style.minWidth = "24px";
    badge.style.height = "24px";
    row.appendChild(badge);
    row.appendChild(
      createNode("div", "min-w-0 flex-1 text-sm text-text-100", text),
    );
    return row;
  }

  function createModalChrome(options) {
    const settings = options && typeof options === "object" ? options : {};
    const mount = ensureRoot();
    const backdrop = createNode("div", BACKDROP_CLASS);
    if (
      typeof settings.onDismiss === "function" &&
      settings.allowDismiss !== false
    ) {
      backdrop.addEventListener("click", settings.onDismiss);
    }

    const wrapper = createNode("div", WRAPPER_CLASS);
    const card = createNode("section", CARD_CLASS);
    wrapper.appendChild(card);

    if (
      typeof settings.onDismiss === "function" &&
      settings.allowDismiss !== false
    ) {
      const closeButton = createButton(
        "×",
        CLOSE_BUTTON_CLASS,
        settings.onDismiss,
      );
      closeButton.setAttribute("aria-label", strings.close);
      closeButton.style.width = "36px";
      closeButton.style.height = "36px";
      closeButton.style.borderRadius = "999px";
      const icon = createNode("span", "text-text-300");
      icon.textContent = "×";
      closeButton.textContent = "";
      closeButton.appendChild(icon);
      card.appendChild(closeButton);
    }

    mount.appendChild(backdrop);
    mount.appendChild(wrapper);
    return {
      card,
    };
  }

  function remindLater(version) {
    snoozedVersion = normalizeVersion(version);
    render();
  }

  async function skipVersion(version) {
    const normalizedVersion = normalizeVersion(version);
    if (!normalizedVersion) {
      remindLater(version);
      return;
    }
    await chrome.storage.local.set({
      [STORAGE_KEYS.DISMISSED_VERSION]: normalizedVersion,
    });
    if (state) {
      state.dismissedVersion = normalizedVersion;
    }
    render();
  }

  function shouldShowUpdateModal(info) {
    const latestVersion = normalizeVersion(info?.latestVersion);
    if (!info?.hasUpdate || !latestVersion) {
      return false;
    }
    if (normalizeVersion(state?.dismissedVersion) === latestVersion) {
      return false;
    }
    if (snoozedVersion === latestVersion) {
      return false;
    }
    return true;
  }

  function appendHeader(card, title, badge, bodyText) {
    const header = createNode("div", "px-6 pt-5 pb-4 sm:px-7");
    const titleRow = createNode(
      "div",
      "flex flex-wrap items-center gap-2 pr-10",
    );
    titleRow.appendChild(
      createNode(
        "h2",
        "text-text-100 font-ui font-medium text-[20px] leading-[140%]",
        title,
      ),
    );
    if (badge) {
      titleRow.appendChild(createNode("span", BADGE_CLASS, badge));
    }
    header.appendChild(titleRow);
    if (bodyText) {
      header.appendChild(createNode("p", BODY_TEXT_CLASS, bodyText));
    }
    card.appendChild(header);
  }

  function createUpdateModal(info) {
    const dismissHandler = function () {
      remindLater(info.latestVersion);
    };
    const chrome = createModalChrome({
      onDismiss: dismissHandler,
      allowDismiss: true,
    });
    appendHeader(
      chrome.card,
      strings.updateTitle,
      formatVersion(info.latestVersion),
      "",
    );

    const body = createNode("div", "px-6 pb-6 pt-1 sm:px-7");
    const sectionList = createNode("div", "space-y-1");
    const metaGrid = createNode("div", META_GRID_CLASS);
    metaGrid.appendChild(
      createSection(strings.currentVersion, formatVersion(info.currentVersion)),
    );
    metaGrid.appendChild(
      createSection(strings.latestVersion, formatVersion(info.latestVersion)),
    );
    metaGrid.appendChild(
      createSection(
        strings.publishedAt,
        info.publishedAt ? formatDateTime(info.publishedAt) : strings.unknown,
      ),
    );
    sectionList.appendChild(metaGrid);
    sectionList.appendChild(
      createNotesSection(
        strings.releaseNotes,
        info.notes,
        strings.notesFallback,
      ),
    );
    body.appendChild(sectionList);

    const footer = createNode("div", "mt-6 flex flex-wrap items-center gap-3");
    footer.appendChild(
      createButton(strings.downloadZip, PRIMARY_BUTTON_CLASS, function () {
        openDownloadPage(info);
      }),
    );
    footer.appendChild(
      createButton(strings.viewRelease, SECONDARY_BUTTON_CLASS, function () {
        openReleasePage(info);
      }),
    );
    footer.appendChild(
      createButton(strings.skipVersion, OUTLINE_BUTTON_CLASS, function () {
        skipVersion(info.latestVersion).catch(function () {
          remindLater(info.latestVersion);
        });
      }),
    );
    footer.appendChild(
      createButton(strings.dismiss, OUTLINE_BUTTON_CLASS, dismissHandler),
    );
    body.appendChild(footer);
    chrome.card.appendChild(body);
  }

  function createBlockedModal(info) {
    const chrome = createModalChrome({
      allowDismiss: false,
    });
    appendHeader(
      chrome.card,
      strings.blockedTitle,
      strings.requiredBadge,
      interpolate(strings.blockedBody, {
        current: formatVersion(info.currentVersion),
        min: formatVersion(info.minSupportedVersion),
      }),
    );

    const body = createNode("div", "px-6 pb-6 pt-1 sm:px-7");
    const steps = createNode("div", "space-y-1");
    steps.appendChild(createStep(1, strings.blockedStep1));
    steps.appendChild(createStep(2, strings.blockedStep2));
    steps.appendChild(createStep(3, strings.blockedStep3));
    body.appendChild(steps);

    const actions = createNode(
      "div",
      "mt-6 flex flex-wrap items-center justify-end gap-3",
    );
    actions.appendChild(
      createButton(strings.viewRelease, SECONDARY_BUTTON_CLASS, function () {
        openReleasePage(info);
      }),
    );
    actions.appendChild(
      createButton(strings.downloadZip, PRIMARY_BUTTON_CLASS, function () {
        openDownloadPage(info);
      }),
    );
    body.appendChild(actions);
    chrome.card.appendChild(body);
  }

  function render() {
    const mount = ensureRoot();
    mount.textContent = "";
    if (!state) {
      return;
    }
    const info = state.info;
    if (isBlockedByMinVersion(info.currentVersion, info.minSupportedVersion)) {
      createBlockedModal(info);
      return;
    }
    if (shouldShowUpdateModal(info)) {
      createUpdateModal(info);
    }
  }

  async function refreshState() {
    state = await readStoredState();
    await ensureStrings(getLocaleTag());
    render();
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
    ensureRoot();
    scheduleRefresh();
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local") {
        return;
      }
      if (
        changes[STORAGE_KEYS.INFO] ||
        changes[STORAGE_KEYS.DISMISSED_VERSION]
      ) {
        scheduleRefresh();
      }
    });
    const observer = new MutationObserver(function (mutations) {
      const nextRoot = root;
      const isSelfMutation =
        !!nextRoot &&
        Array.isArray(mutations) &&
        mutations.length > 0 &&
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
      if (!root || !root.isConnected) {
        ensureRoot();
        Promise.resolve(ensureStrings(getLocaleTag()))
          .catch(function () {})
          .then(function () {
            render();
          });
        return;
      }
      const nextLocaleTag = getLocaleTag();
      if (nextLocaleTag !== lastLocaleTag) {
        Promise.resolve(ensureStrings(nextLocaleTag))
          .catch(function () {})
          .then(function () {
            render();
          });
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
