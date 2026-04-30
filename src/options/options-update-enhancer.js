(function () {
  const shared = globalThis.__CP_GITHUB_UPDATE_SHARED__;
  const providerContract = globalThis.__CP_CONTRACT__?.customProvider || {};
  if (!shared || !globalThis.chrome?.runtime?.id) {
    return;
  }

  const {
    STORAGE_KEYS,
    detectUiLocaleKey,
    getUiLocaleTag,
    cloneLocaleValue,
    normalizeUiLocaleTag,
    resolveCustomI18nSection,
    readStoredState,
    openReleasePage,
  } = shared;

  const DEFAULT_STRINGS = {
    title: "Extension updates",
    subtitle:
      "Review the latest version, release notes, and automatic update checks.",
    notes: "Release notes",
    notesFallback: "This release does not include detailed notes.",
    autoCheckLabel: "Auto-check updates",
    autoCheckHelp:
      "When enabled, the extension checks GitHub Releases on startup and once every 24 hours.",
    autoCheckOn: "Enabled",
    autoCheckOff: "Disabled",
    enableAutoCheck: "Enable auto-check",
    disableAutoCheck: "Disable auto-check",
    viewFullNotes: "View full release notes",
    notesDialogTitle: "Full release notes",
    viewRelease: "Open release",
    close: "Close",
    unknown: "Unknown",
    httpCardTitle: "HTTP Protocol",
    httpCardSubtitle:
      "Allow custom providers to use unencrypted HTTP endpoints. Enabled by default, and best used only on trusted local networks or in development.",
    httpToggleLabel: "Allow HTTP Protocol",
    httpToggleHelp:
      "When disabled, saving profiles, fetching models, health checks, and runtime requests will all reject http:// addresses.",
    httpToggleOn: "Enabled",
    httpToggleOff: "Disabled",
  };
  function getOptionsLocaleOptions() {
    return {
      document,
      navigatorLanguage: navigator.language,
      ignoredSelectors: [
        "#" + MODAL_ROOT_ID,
        "#" + HTTP_PANEL_ID,
        "#" + HTTP_ANCHOR_ID,
      ],
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
        "optionsUpdateEnhancer",
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

  const STYLE_ID = "cp-options-update-enhancer-style";
  const MODAL_ROOT_ID = "cp-options-update-enhancer-modal-root";
  const HTTP_PANEL_ID = "cp-options-http-provider-panel";
  const HTTP_ANCHOR_ID = "cp-options-http-provider-anchor";
  const HTTP_PROVIDER_STORAGE_KEY =
    providerContract.HTTP_PROVIDER_STORAGE_KEY || "customProviderAllowHttp";
  const HTTP_PROVIDER_MIGRATED_KEY =
    providerContract.HTTP_PROVIDER_MIGRATED_KEY ||
    "customProviderAllowHttpMigrated";
  const SECONDARY_BUTTON_CLASS =
    "px-6 py-3 bg-bg-100 text-text-200 border border-border-300 rounded-xl hover:bg-bg-200 hover:text-text-100 transition-all font-large disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";

  let state = null;
  let refreshScheduled = false;
  let enhanceScheduled = false;
  let modalEscapeHandler = null;

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      if (char === "&") {
        return "&amp;";
      }
      if (char === "<") {
        return "&lt;";
      }
      if (char === ">") {
        return "&gt;";
      }
      if (char === '"') {
        return "&quot;";
      }
      return "&#39;";
    });
  }

  function sanitizeUrl(value) {
    const raw = String(value || "")
      .trim()
      .replace(/^<|>$/g, "");
    if (!raw) {
      return "";
    }
    try {
      const parsed = new URL(raw);
      const protocol = String(parsed.protocol || "").toLowerCase();
      if (
        protocol === "http:" ||
        protocol === "https:" ||
        protocol === "mailto:"
      ) {
        return parsed.href;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function renderInlineMarkdown(value) {
    const placeholders = [];
    const reserve = function (html) {
      const token = "\u0000" + placeholders.length + "\u0000";
      placeholders.push(html);
      return token;
    };

    let text = String(value || "");
    text = text.replace(/`([^`\n]+)`/g, function (_, code) {
      return reserve("<code>" + escapeHtml(code) + "</code>");
    });
    text = text.replace(
      /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
      function (_, label, href) {
        const safeHref = sanitizeUrl(String(href || "").split(/\s+/)[0]);
        return reserve(
          safeHref
            ? '<a href="' +
                escapeHtml(safeHref) +
                '" target="_blank" rel="noopener noreferrer">' +
                escapeHtml(label) +
                "</a>"
            : escapeHtml(label),
        );
      },
    );
    text = escapeHtml(text);
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    text = text.replace(/ {2}\n/g, "<br>");
    text = text.replace(/\n/g, "<br>");
    return text.replace(/\u0000(\d+)\u0000/g, function (_, index) {
      return placeholders[Number(index)] || "";
    });
  }

  function stripSingleParagraph(html) {
    const normalized = String(html || "").trim();
    const match = normalized.match(/^<p>([\s\S]*)<\/p>$/);
    return match ? match[1] : normalized;
  }

  function renderMarkdownToHtml(markdown) {
    const normalized = String(markdown || "")
      .replace(/\r\n/g, "\n")
      .trim();
    if (!normalized) {
      return "";
    }

    const lines = normalized.split("\n");
    const blocks = [];
    let index = 0;

    function isBlank(line) {
      return !String(line || "").trim();
    }

    function getListMeta(line) {
      const unordered = line.match(/^[-*+]\s+(.+)$/);
      if (unordered) {
        return {
          ordered: false,
          content: unordered[1],
        };
      }
      const ordered = line.match(/^\d+\.\s+(.+)$/);
      if (ordered) {
        return {
          ordered: true,
          content: ordered[1],
        };
      }
      return null;
    }

    while (index < lines.length) {
      const line = lines[index].trimEnd();
      if (isBlank(line)) {
        index += 1;
        continue;
      }

      const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
      if (fenceMatch) {
        const language = String(fenceMatch[1] || "").trim();
        index += 1;
        const codeLines = [];
        while (index < lines.length && !/^```/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        const languageClass = language
          ? ' class="language-' + escapeHtml(language) + '"'
          : "";
        blocks.push(
          "<pre><code" +
            languageClass +
            ">" +
            escapeHtml(codeLines.join("\n")) +
            "</code></pre>",
        );
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        blocks.push(
          "<h" +
            level +
            ">" +
            renderInlineMarkdown(headingMatch[2]) +
            "</h" +
            level +
            ">",
        );
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quotedLines = [];
        while (index < lines.length && /^>\s?/.test(lines[index].trimStart())) {
          quotedLines.push(lines[index].trimStart().replace(/^>\s?/, ""));
          index += 1;
        }
        blocks.push(
          "<blockquote>" +
            renderMarkdownToHtml(quotedLines.join("\n")) +
            "</blockquote>",
        );
        continue;
      }

      const listMeta = getListMeta(line.trim());
      if (listMeta) {
        const tagName = listMeta.ordered ? "ol" : "ul";
        const items = [];
        let currentItem = listMeta.content;
        index += 1;
        while (index < lines.length) {
          const next = lines[index];
          if (isBlank(next)) {
            items.push(currentItem);
            currentItem = "";
            index += 1;
            break;
          }
          const nextMeta = getListMeta(next.trim());
          if (nextMeta && nextMeta.ordered === listMeta.ordered) {
            items.push(currentItem);
            currentItem = nextMeta.content;
            index += 1;
            continue;
          }
          if (/^\s{2,}\S/.test(next)) {
            currentItem += "\n" + next.trim();
            index += 1;
            continue;
          }
          break;
        }
        if (currentItem) {
          items.push(currentItem);
        }
        blocks.push(
          "<" +
            tagName +
            ">" +
            items
              .map(function (item) {
                return (
                  "<li>" +
                  stripSingleParagraph(
                    renderMarkdownToHtml(item) || renderInlineMarkdown(item),
                  ) +
                  "</li>"
                );
              })
              .join("") +
            "</" +
            tagName +
            ">",
        );
        continue;
      }

      const paragraphLines = [line];
      index += 1;
      while (index < lines.length) {
        const nextLine = lines[index];
        if (
          isBlank(nextLine) ||
          /^```/.test(nextLine.trim()) ||
          /^(#{1,6})\s+/.test(nextLine.trim()) ||
          /^>\s?/.test(nextLine.trim()) ||
          getListMeta(nextLine.trim())
        ) {
          break;
        }
        paragraphLines.push(nextLine.trimEnd());
        index += 1;
      }
      blocks.push(
        "<p>" + renderInlineMarkdown(paragraphLines.join("\n")) + "</p>",
      );
    }

    return blocks.join("");
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cp-update-enhancer-notes {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 6px;
      }
      .cp-update-enhancer-preview {
        position: relative;
        max-height: 196px;
        overflow: hidden;
        padding-right: 4px;
      }
      .cp-update-enhancer-preview[data-overflow="true"]::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 72px;
        background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.96));
        pointer-events: none;
      }
      .cp-update-enhancer-actions {
        display: flex;
        justify-content: flex-start;
      }
      .cp-update-enhancer-row {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        flex: 0 0 auto;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .cp-update-enhancer-row-control {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
        flex: 0 0 auto;
        pointer-events: auto;
      }
      .cp-update-enhancer-toggle {
        position: relative;
        inline-size: 52px;
        block-size: 30px;
        flex: 0 0 auto;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.22);
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04);
        transition: background-color 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 260ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms ease;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        -webkit-tap-highlight-color: transparent;
        outline: none;
        overflow: hidden;
      }
      .cp-update-enhancer-toggle::after {
        content: "";
        position: absolute;
        top: 4px;
        left: 4px;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: #ffffff;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14), 0 1px 3px rgba(15, 23, 42, 0.08);
        will-change: transform;
        transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease;
      }
      .cp-update-enhancer-toggle[data-enabled="true"] {
        background: color-mix(in srgb, hsl(var(--brand-100, 20 67% 54%)) 74%, white 26%);
        box-shadow: inset 0 0 0 1px rgba(217, 119, 6, 0.08), 0 8px 18px rgba(217, 119, 6, 0.14);
      }
      .cp-update-enhancer-toggle[data-enabled="true"]::after {
        transform: translate3d(22px, 0, 0);
      }
      .cp-update-enhancer-toggle:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 1px rgba(217, 119, 6, 0.12), 0 10px 24px rgba(217, 119, 6, 0.16);
      }
      .cp-update-enhancer-toggle:hover::after {
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.16), 0 1px 3px rgba(15, 23, 42, 0.08);
      }
      .cp-update-enhancer-toggle:active::after {
        transform: translate3d(1px, 0, 0) scale(0.96);
      }
      .cp-update-enhancer-toggle[data-enabled="true"]:active::after {
        transform: translate3d(21px, 0, 0) scale(0.96);
      }
      .cp-update-enhancer-toggle:disabled {
        cursor: not-allowed;
        opacity: 0.58;
      }
      .cp-update-enhancer-md,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md {
        color: #0f172a;
        font-size: 14px;
        line-height: 1.7;
        word-break: break-word;
      }
      .cp-update-enhancer-md > :first-child,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md > :first-child {
        margin-top: 0;
      }
      .cp-update-enhancer-md > :last-child,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md > :last-child {
        margin-bottom: 0;
      }
      .cp-update-enhancer-md h1,
      .cp-update-enhancer-md h2,
      .cp-update-enhancer-md h3,
      .cp-update-enhancer-md h4,
      .cp-update-enhancer-md h5,
      .cp-update-enhancer-md h6,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md h1,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md h2,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md h3,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md h4,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md h5,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md h6 {
        margin: 16px 0 8px;
        font-weight: 700;
        line-height: 1.35;
        color: #0f172a;
      }
      .cp-update-enhancer-md p,
      .cp-update-enhancer-md ul,
      .cp-update-enhancer-md ol,
      .cp-update-enhancer-md blockquote,
      .cp-update-enhancer-md pre,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md p,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md ul,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md ol,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md blockquote,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md pre {
        margin: 0 0 12px;
      }
      .cp-update-enhancer-md ul,
      .cp-update-enhancer-md ol,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md ul,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md ol {
        padding-left: 1.35rem;
      }
      .cp-update-enhancer-md a,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md a {
        color: #2563eb;
        text-decoration: underline;
      }
      .cp-update-enhancer-md code,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
        font-size: 0.92em;
        padding: 0.12rem 0.32rem;
        border-radius: 6px;
        background: rgba(148, 163, 184, 0.16);
      }
      .cp-update-enhancer-md pre,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md pre {
        overflow: auto;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        background: rgba(15, 23, 42, 0.04);
      }
      .cp-update-enhancer-md pre code,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md pre code {
        padding: 0;
        background: transparent;
      }
      .cp-update-enhancer-md blockquote,
      #${MODAL_ROOT_ID} .cp-update-enhancer-md blockquote {
        padding: 10px 14px;
        border-left: 3px solid rgba(37, 99, 235, 0.45);
        background: rgba(219, 234, 254, 0.35);
        border-radius: 10px;
      }
      #${MODAL_ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 1200;
        pointer-events: none;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.52);
        pointer-events: auto;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-shell {
        position: relative;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100%;
        padding: 24px;
        pointer-events: none;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-card {
        width: min(880px, 100%);
        max-height: min(80vh, 900px);
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: #ffffff;
        box-shadow: 0 32px 80px rgba(15, 23, 42, 0.18);
        pointer-events: auto;
        overflow: hidden;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-header,
      #${MODAL_ROOT_ID} .cp-update-enhancer-footer {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        padding: 18px 22px;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-header {
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-footer {
        border-top: 1px solid rgba(148, 163, 184, 0.16);
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-title {
        margin: 0;
        color: #0f172a;
        font-size: 20px;
        line-height: 1.35;
        font-weight: 700;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-version {
        margin-top: 6px;
        color: #64748b;
        font-size: 13px;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-close {
        width: 36px;
        height: 36px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 999px;
        background: rgba(248, 250, 252, 0.9);
        color: #334155;
        font-size: 18px;
        cursor: pointer;
      }
      #${MODAL_ROOT_ID} .cp-update-enhancer-body {
        overflow: auto;
        padding: 18px 22px;
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

  function findUpdatePanel() {
    const strings = getStrings();
    return (
      Array.from(document.querySelectorAll("section")).find(function (section) {
        const heading = section.querySelector("h3");
        if (!heading) {
          return false;
        }
        const title = String(heading.textContent || "").trim();
        return (
          title === strings.title &&
          String(section.textContent || "").includes(strings.autoCheckLabel)
        );
      }) || null
    );
  }

  function findExactTextNode(container, selector, expectedText) {
    return (
      Array.from(container.querySelectorAll(selector)).find(function (node) {
        return String(node.textContent || "").trim() === expectedText;
      }) || null
    );
  }
  function getProviderHelpers() {
    const helpers = globalThis.CustomProviderModels;
    return helpers &&
      typeof helpers.readHttpProviderSupportEnabled === "function"
      ? helpers
      : null;
  }
  async function readHttpProviderSupportEnabled() {
    const helpers = getProviderHelpers();
    if (helpers) {
      return !!(await helpers.readHttpProviderSupportEnabled());
    }
    const stored = await chrome.storage.local.get(HTTP_PROVIDER_STORAGE_KEY);
    return stored[HTTP_PROVIDER_STORAGE_KEY] !== false;
  }
  async function setHttpProviderSupportEnabled(enabled) {
    const nextEnabled = !!enabled;
    if (state) {
      state.httpTogglePending = true;
      scheduleEnhance();
    }
    try {
      await chrome.storage.local.set({
        [HTTP_PROVIDER_STORAGE_KEY]: nextEnabled,
        [HTTP_PROVIDER_MIGRATED_KEY]: true,
      });
      if (state) {
        state.httpEnabled = nextEnabled;
      }
    } finally {
      if (state) {
        state.httpTogglePending = false;
      }
      scheduleRefresh();
    }
  }
  function ensureHttpPanelAnchor(panel) {
    let anchor = document.getElementById(HTTP_ANCHOR_ID);
    if (!anchor) {
      anchor = document.createElement("div");
      anchor.id = HTTP_ANCHOR_ID;
      anchor.hidden = true;
      anchor.setAttribute("aria-hidden", "true");
    }
    if (panel.nextElementSibling !== anchor) {
      panel.insertAdjacentElement("afterend", anchor);
    }
    return anchor;
  }
  function removeHttpPanel() {
    document.getElementById(HTTP_PANEL_ID)?.remove();
    document.getElementById(HTTP_ANCHOR_ID)?.remove();
  }
  function isEnhancerOwnedNode(node) {
    const element =
      node instanceof Element ? node : node?.parentElement || null;
    if (!element) {
      return false;
    }
    if (
      element.id === MODAL_ROOT_ID ||
      element.id === HTTP_PANEL_ID ||
      element.id === HTTP_ANCHOR_ID
    ) {
      return true;
    }
    return !!element.closest(
      "#" +
        MODAL_ROOT_ID +
        ", #" +
        HTTP_PANEL_ID +
        ", #" +
        HTTP_ANCHOR_ID +
        ", [data-cp-update-enhancer-notes], [data-cp-update-enhancer-toggle]",
    );
  }

  function ensureModalRoot() {
    let modalRoot = document.getElementById(MODAL_ROOT_ID);
    if (!modalRoot) {
      modalRoot = document.createElement("div");
      modalRoot.id = MODAL_ROOT_ID;
      document.body.appendChild(modalRoot);
    }
    return modalRoot;
  }

  function closeModal() {
    if (modalEscapeHandler) {
      document.removeEventListener("keydown", modalEscapeHandler);
      modalEscapeHandler = null;
    }
    const modalRoot = document.getElementById(MODAL_ROOT_ID);
    if (modalRoot) {
      modalRoot.replaceChildren();
    }
  }

  function openNotesModal() {
    const strings = getStrings();
    if (!state?.info?.notes) {
      return;
    }
    ensureStyles();
    const modalRoot = ensureModalRoot();
    modalRoot.replaceChildren();

    const backdrop = document.createElement("div");
    backdrop.className = "cp-update-enhancer-backdrop";
    backdrop.addEventListener("click", closeModal);

    const shell = document.createElement("div");
    shell.className = "cp-update-enhancer-shell";

    const card = document.createElement("section");
    card.className = "cp-update-enhancer-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", strings.notesDialogTitle);

    const header = document.createElement("div");
    header.className = "cp-update-enhancer-header";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "cp-update-enhancer-title";
    title.textContent = strings.notesDialogTitle;
    const version = document.createElement("div");
    version.className = "cp-update-enhancer-version";
    version.textContent = state.info.latestVersion
      ? "v" + state.info.latestVersion
      : strings.unknown;
    titleWrap.appendChild(title);
    titleWrap.appendChild(version);
    header.appendChild(titleWrap);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "cp-update-enhancer-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", strings.close);
    closeButton.addEventListener("click", closeModal);
    header.appendChild(closeButton);

    const body = document.createElement("div");
    body.className = "cp-update-enhancer-body";
    const content = document.createElement("div");
    content.className = "cp-update-enhancer-md";
    content.innerHTML =
      renderMarkdownToHtml(state.info.notes) ||
      "<p>" + escapeHtml(strings.notesFallback) + "</p>";
    body.appendChild(content);

    const footer = document.createElement("div");
    footer.className = "cp-update-enhancer-footer";
    const releaseButton = document.createElement("button");
    releaseButton.type = "button";
    releaseButton.className = SECONDARY_BUTTON_CLASS;
    releaseButton.textContent = strings.viewRelease;
    releaseButton.addEventListener("click", function () {
      openReleasePage(state.info);
    });
    const closeAction = document.createElement("button");
    closeAction.type = "button";
    closeAction.className = SECONDARY_BUTTON_CLASS;
    closeAction.textContent = strings.close;
    closeAction.addEventListener("click", closeModal);
    footer.appendChild(releaseButton);
    footer.appendChild(closeAction);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    shell.appendChild(card);
    modalRoot.appendChild(backdrop);
    modalRoot.appendChild(shell);

    modalEscapeHandler = function (event) {
      if (event.key === "Escape") {
        closeModal();
      }
    };
    document.addEventListener("keydown", modalEscapeHandler);
    closeButton.focus();
  }

  async function setAutoCheckEnabled(enabled) {
    if (state) {
      state.autoCheckPending = true;
      scheduleEnhance();
    }
    await chrome.storage.local.set({
      [STORAGE_KEYS.AUTO_CHECK_ENABLED]: enabled,
    });
    if (state) {
      state.autoCheckEnabled = enabled;
      state.autoCheckPending = false;
    }
    scheduleEnhance();
  }

  function enhanceNotes(panel) {
    const strings = getStrings();
    const label = findExactTextNode(panel, ".cp-page-label", strings.notes);
    const field = label ? label.closest(".cp-page-field") : null;
    if (!field) {
      return;
    }
    const signature =
      (state?.info?.notes || "") + "||" + (state?.info?.latestVersion || "");
    const current = field.querySelector("[data-cp-update-enhancer-notes]");
    if (current && current.dataset.cpUpdateEnhancerNotes === signature) {
      return;
    }
    const content = label.nextElementSibling;
    if (!content) {
      return;
    }
    const shell = document.createElement("div");
    shell.className = "cp-update-enhancer-notes";
    shell.dataset.cpUpdateEnhancerNotes = signature;

    const preview = document.createElement("div");
    preview.className = "cp-update-enhancer-md cp-update-enhancer-preview";
    preview.innerHTML = state?.info?.notes
      ? renderMarkdownToHtml(state.info.notes)
      : "<p>" + escapeHtml(strings.notesFallback) + "</p>";
    shell.appendChild(preview);

    if (state?.info?.notes) {
      const actions = document.createElement("div");
      actions.className = "cp-update-enhancer-actions";
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = SECONDARY_BUTTON_CLASS;
      detailButton.textContent = strings.viewFullNotes;
      detailButton.addEventListener("click", openNotesModal);
      actions.appendChild(detailButton);
      shell.appendChild(actions);
    }

    content.replaceWith(shell);
    requestAnimationFrame(function () {
      preview.dataset.overflow =
        preview.scrollHeight > preview.clientHeight + 4 ? "true" : "false";
    });
  }

  function enhanceAutoCheck(panel) {
    const strings = getStrings();
    const title = findExactTextNode(
      panel,
      ".cp-page-row-title",
      strings.autoCheckLabel,
    );
    const row = title ? title.closest(".cp-page-row") : null;
    if (!row) {
      return;
    }
    const control = Array.from(row.children).find(function (child) {
      return child !== title.parentElement;
    });
    if (!control) {
      return;
    }

    const signature =
      (state?.autoCheckEnabled ? "1" : "0") +
      ":" +
      (state?.autoCheckPending ? "1" : "0");
    const current = control.querySelector("[data-cp-update-enhancer-toggle]");
    if (current && current.dataset.cpUpdateEnhancerToggle === signature) {
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "cp-update-enhancer-row-control";
    wrap.dataset.cpUpdateEnhancerToggle = signature;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cp-page-toggle cp-update-enhancer-toggle";
    toggle.dataset.enabled = state?.autoCheckEnabled ? "true" : "false";
    toggle.style.pointerEvents = "auto";
    toggle.disabled = !!state?.autoCheckPending;
    toggle.setAttribute("role", "switch");
    toggle.setAttribute(
      "aria-checked",
      state?.autoCheckEnabled ? "true" : "false",
    );
    toggle.setAttribute("aria-label", strings.autoCheckLabel);
    toggle.title = strings.autoCheckLabel;
    toggle.addEventListener("click", function () {
      if (state?.autoCheckPending) {
        return;
      }
      setAutoCheckEnabled(!state?.autoCheckEnabled).catch(function () {
        if (state) {
          state.autoCheckPending = false;
          scheduleEnhance();
        }
      });
    });

    wrap.appendChild(toggle);
    control.replaceChildren(wrap);
  }
  function renderHttpPanel(panel) {
    const strings = getStrings();
    const anchor = ensureHttpPanelAnchor(panel);
    let httpPanel = document.getElementById(HTTP_PANEL_ID);
    const signature =
      (state?.httpEnabled ? "1" : "0") +
      ":" +
      (state?.httpTogglePending ? "1" : "0");
    if (!httpPanel) {
      httpPanel = document.createElement("section");
      httpPanel.id = HTTP_PANEL_ID;
      httpPanel.className =
        "cp-page-card cp-page-panel bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8";
    }
    httpPanel.style.marginTop = "24px";
    httpPanel.style.pointerEvents = "auto";
    httpPanel.style.position = "relative";
    httpPanel.style.zIndex = "1";
    if (
      httpPanel.dataset.cpHttpPanelSignature === signature &&
      anchor.nextElementSibling === httpPanel
    ) {
      return;
    }
    const shell = document.createElement("div");
    shell.style.display = "flex";
    shell.style.flexDirection = "column";
    shell.style.gap = "16px";

    const header = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "cp-page-heading text-text-100 font-xl-bold";
    title.textContent = strings.httpCardTitle;
    const subtitle = document.createElement("p");
    subtitle.className = "cp-page-subheading text-text-300 font-base";
    subtitle.textContent = strings.httpCardSubtitle;
    header.appendChild(title);
    header.appendChild(subtitle);

    const row = document.createElement("div");
    row.className = "cp-page-row";

    const copy = document.createElement("div");
    copy.className = "cp-page-row-copy";
    const rowTitle = document.createElement("div");
    rowTitle.className = "cp-page-row-title";
    rowTitle.textContent = strings.httpToggleLabel;
    const help = document.createElement("p");
    help.className = "cp-page-row-help";
    help.textContent = strings.httpToggleHelp;
    copy.appendChild(rowTitle);
    copy.appendChild(help);

    const control = document.createElement("div");
    control.className = "cp-update-enhancer-row-control";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cp-page-toggle cp-update-enhancer-toggle";
    toggle.dataset.enabled = state?.httpEnabled ? "true" : "false";
    toggle.style.pointerEvents = "auto";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", state?.httpEnabled ? "true" : "false");
    toggle.setAttribute("aria-label", strings.httpToggleLabel);
    toggle.title = strings.httpToggleLabel;
    toggle.disabled = !!state?.httpTogglePending;
    toggle.addEventListener("click", function () {
      if (state?.httpTogglePending) {
        return;
      }
      setHttpProviderSupportEnabled(!state?.httpEnabled).catch(function () {});
    });

    control.appendChild(toggle);
    row.appendChild(copy);
    row.appendChild(control);

    shell.appendChild(header);
    shell.appendChild(row);
    httpPanel.dataset.cpHttpPanelSignature = signature;
    httpPanel.replaceChildren(shell);

    if (anchor.nextElementSibling !== httpPanel) {
      anchor.insertAdjacentElement("afterend", httpPanel);
    }
  }

  function enhancePanel() {
    ensureStyles();
    if (!isOptionsRootView()) {
      closeModal();
      removeHttpPanel();
      return;
    }
    const panel = findUpdatePanel();
    if (!panel || !state) {
      removeHttpPanel();
      return;
    }
    enhanceNotes(panel);
    enhanceAutoCheck(panel);
    renderHttpPanel(panel);
  }

  async function refreshState() {
    const [updateState, httpEnabled] = await Promise.all([
      readStoredState(),
      readHttpProviderSupportEnabled(),
      ensureStrings(getOptionsLocaleTag()),
    ]);
    state = {
      ...(updateState && typeof updateState === "object" ? updateState : {}),
      httpEnabled,
      autoCheckPending: !!state?.autoCheckPending,
      httpTogglePending: !!state?.httpTogglePending,
    };
    scheduleEnhance();
  }

  function scheduleEnhance() {
    if (enhanceScheduled) {
      return;
    }
    enhanceScheduled = true;
    const scheduler =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : function (callback) {
            return setTimeout(callback, 16);
          };
    scheduler(function () {
      enhanceScheduled = false;
      Promise.resolve(ensureStrings(getOptionsLocaleTag()))
        .catch(function () {})
        .then(function () {
          enhancePanel();
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
        changes[STORAGE_KEYS.AUTO_CHECK_ENABLED] ||
        changes[HTTP_PROVIDER_STORAGE_KEY]
      ) {
        scheduleRefresh();
      }
    });
    window.addEventListener("hashchange", function () {
      closeModal();
      scheduleEnhance();
    });
    const observer = new MutationObserver(function (mutations) {
      const isSelfMutation =
        Array.isArray(mutations) &&
        mutations.length > 0 &&
        mutations.every(function (mutation) {
          if (!isEnhancerOwnedNode(mutation.target)) {
            return false;
          }
          return Array.from(mutation.addedNodes || []).every(function (node) {
            return isEnhancerOwnedNode(node);
          });
        });
      if (isSelfMutation) {
        return;
      }
      if (isOptionsRootView()) {
        scheduleEnhance();
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
