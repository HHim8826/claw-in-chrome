(function () {
  if (globalThis.__CP_GITHUB_UPDATE_SHARED__) {
    return;
  }
  const REPO_OWNER = "S-Trespassing";
  const REPO_NAME = "claw-in-chrome";
  const RELEASES_BASE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;
  const LATEST_JSON_URL = `${RELEASES_BASE_URL}/latest/download/latest.json`;
  const LATEST_RELEASE_URL = `${RELEASES_BASE_URL}/latest`;
  const SOURCE = "github_release_json";
  const CUSTOM_I18N_BASE_PATH = "i18n/custom";
  const CONTRACT_GITHUB_UPDATE = globalThis.__CP_CONTRACT__?.githubUpdate;
  const CONTRACT_STORAGE_KEYS = CONTRACT_GITHUB_UPDATE?.STORAGE_KEYS || {};
  const CONTRACT_MESSAGE_TYPES = CONTRACT_GITHUB_UPDATE?.MESSAGE_TYPES || {};
  const STORAGE_KEYS = {
    INFO: CONTRACT_STORAGE_KEYS.INFO || "githubUpdateInfo",
    DISMISSED_VERSION:
      CONTRACT_STORAGE_KEYS.DISMISSED_VERSION || "githubUpdateDismissedVersion",
    AUTO_CHECK_ENABLED:
      CONTRACT_STORAGE_KEYS.AUTO_CHECK_ENABLED ||
      "githubUpdateAutoCheckEnabled",
    SEEN_VERSION:
      CONTRACT_STORAGE_KEYS.SEEN_VERSION || "githubUpdateSeenVersion",
    PREVIOUS_VERSION:
      CONTRACT_STORAGE_KEYS.PREVIOUS_VERSION || "githubUpdatePreviousVersion",
    UPDATE_AVAILABLE:
      CONTRACT_STORAGE_KEYS.UPDATE_AVAILABLE || "updateAvailable",
    VERSION_INFO:
      CONTRACT_STORAGE_KEYS.VERSION_INFO || "chrome_ext_version_info",
  };
  const MESSAGE_TYPES = {
    CHECK_NOW: CONTRACT_MESSAGE_TYPES.CHECK_NOW || "CP_GITHUB_UPDATE_CHECK_NOW",
    DISMISS: CONTRACT_MESSAGE_TYPES.DISMISS || "CP_GITHUB_UPDATE_DISMISS",
  };
  const ALARM_NAME =
    CONTRACT_GITHUB_UPDATE?.ALARM_NAME || "cp_github_update_check";
  const CHECK_INTERVAL_MINUTES = 24 * 60;
  function normalizeVersion(value) {
    return String(value || "")
      .trim()
      .replace(/^v/i, "");
  }
  function isValidVersion(value) {
    const normalized = normalizeVersion(value);
    return /^\d+\.\d+\.\d+\.\d+$/.test(normalized);
  }
  function compareVersions(left, right) {
    const leftValue = normalizeVersion(left);
    const rightValue = normalizeVersion(right);
    if (!isValidVersion(leftValue) || !isValidVersion(rightValue)) {
      return String(leftValue).localeCompare(String(rightValue));
    }
    const leftParts = leftValue.split(".").map(function (item) {
      return Number(item);
    });
    const rightParts = rightValue.split(".").map(function (item) {
      return Number(item);
    });
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = leftParts[index] || 0;
      const rightPart = rightParts[index] || 0;
      if (leftPart < rightPart) {
        return -1;
      }
      if (leftPart > rightPart) {
        return 1;
      }
    }
    return 0;
  }
  function computeHasUpdate(currentVersion, latestVersion) {
    const current = normalizeVersion(currentVersion);
    const latest = normalizeVersion(latestVersion);
    if (!isValidVersion(current) || !isValidVersion(latest)) {
      return false;
    }
    return compareVersions(current, latest) !== 0;
  }
  function isBlockedByMinVersion(currentVersion, minSupportedVersion) {
    const current = normalizeVersion(currentVersion);
    const minVersion = normalizeVersion(minSupportedVersion);
    if (!isValidVersion(current) || !isValidVersion(minVersion)) {
      return false;
    }
    return compareVersions(current, minVersion) < 0;
  }
  function getDefaultReleaseUrl(version) {
    const normalized = normalizeVersion(version);
    if (isValidVersion(normalized)) {
      return `${RELEASES_BASE_URL}/tag/v${normalized}`;
    }
    return LATEST_RELEASE_URL;
  }
  function getDefaultDownloadUrl(version) {
    const normalized = normalizeVersion(version);
    if (isValidVersion(normalized)) {
      return `${RELEASES_BASE_URL}/download/v${normalized}/claw-in-chrome-v${normalized}.zip`;
    }
    return "";
  }
  function createDefaultUpdateInfo(currentVersion) {
    return {
      currentVersion: normalizeVersion(currentVersion),
      latestVersion: "",
      hasUpdate: false,
      releaseUrl: LATEST_RELEASE_URL,
      downloadUrl: "",
      notes: "",
      publishedAt: "",
      minSupportedVersion: null,
      lastCheckedAt: "",
      source: SOURCE,
    };
  }
  function normalizeStoredInfo(raw, currentVersion) {
    const next = createDefaultUpdateInfo(currentVersion);
    if (!raw || typeof raw !== "object") {
      return next;
    }
    const latestVersion = normalizeVersion(raw.latestVersion || raw.version);
    const minSupportedVersion = isValidVersion(
      raw.minSupportedVersion || raw.min_supported_version,
    )
      ? normalizeVersion(raw.minSupportedVersion || raw.min_supported_version)
      : null;
    next.currentVersion = normalizeVersion(
      currentVersion || raw.currentVersion,
    );
    next.latestVersion = isValidVersion(latestVersion) ? latestVersion : "";
    next.hasUpdate = computeHasUpdate(next.currentVersion, next.latestVersion);
    next.releaseUrl =
      typeof raw.releaseUrl === "string" && raw.releaseUrl.trim()
        ? raw.releaseUrl.trim()
        : typeof raw.release_url === "string" && raw.release_url.trim()
          ? raw.release_url.trim()
          : getDefaultReleaseUrl(next.latestVersion);
    next.downloadUrl =
      typeof raw.downloadUrl === "string" && raw.downloadUrl.trim()
        ? raw.downloadUrl.trim()
        : typeof raw.download_url === "string" && raw.download_url.trim()
          ? raw.download_url.trim()
          : getDefaultDownloadUrl(next.latestVersion);
    next.notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
    next.publishedAt =
      typeof raw.publishedAt === "string" && raw.publishedAt.trim()
        ? raw.publishedAt.trim()
        : typeof raw.published_at === "string" && raw.published_at.trim()
          ? raw.published_at.trim()
          : "";
    next.minSupportedVersion = minSupportedVersion;
    next.lastCheckedAt =
      typeof raw.lastCheckedAt === "string" && raw.lastCheckedAt.trim()
        ? raw.lastCheckedAt.trim()
        : typeof raw.last_checked_at === "string" && raw.last_checked_at.trim()
          ? raw.last_checked_at.trim()
          : "";
    next.source =
      typeof raw.source === "string" && raw.source.trim()
        ? raw.source.trim()
        : SOURCE;
    return next;
  }
  function normalizeLatestPayload(raw, currentVersion) {
    if (!raw || typeof raw !== "object") {
      throw new Error("更新元数据格式无效。");
    }
    const latestVersion = normalizeVersion(raw.version);
    if (!isValidVersion(latestVersion)) {
      throw new Error("更新元数据缺少有效版本号。");
    }
    const next = createDefaultUpdateInfo(currentVersion);
    next.currentVersion = normalizeVersion(currentVersion);
    next.latestVersion = latestVersion;
    next.hasUpdate = computeHasUpdate(next.currentVersion, latestVersion);
    next.releaseUrl =
      typeof raw.release_url === "string" && raw.release_url.trim()
        ? raw.release_url.trim()
        : getDefaultReleaseUrl(latestVersion);
    next.downloadUrl =
      typeof raw.download_url === "string" && raw.download_url.trim()
        ? raw.download_url.trim()
        : getDefaultDownloadUrl(latestVersion);
    next.notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
    next.publishedAt =
      typeof raw.published_at === "string" ? raw.published_at.trim() : "";
    next.minSupportedVersion = isValidVersion(raw.min_supported_version)
      ? normalizeVersion(raw.min_supported_version)
      : null;
    next.lastCheckedAt = new Date().toISOString();
    next.source = SOURCE;
    return next;
  }
  function formatTimestamp(value, locale) {
    if (!value) {
      return "";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }
    return parsed.toLocaleString(locale || undefined, {
      hour12: false,
    });
  }
  function summarizeNotes(value, maxLength) {
    const normalized = String(value || "")
      .trim()
      .replace(/\r\n/g, "\n");
    if (!normalized) {
      return "";
    }
    const limit = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 280;
    if (normalized.length <= limit) {
      return normalized;
    }
    return normalized.slice(0, limit).trimEnd() + "...";
  }
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
  function sanitizeMarkdownUrl(value) {
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
        const safeHref = sanitizeMarkdownUrl(
          String(href || "").split(/\s+/)[0],
        );
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
  function normalizeIgnoredSelectors(options) {
    const settings = options && typeof options === "object" ? options : {};
    return Array.isArray(settings.ignoredSelectors)
      ? settings.ignoredSelectors
          .map(function (value) {
            return String(value || "").trim();
          })
          .filter(Boolean)
      : [];
  }
  function isIgnoredElement(element, ignoredSelector) {
    return !!(
      ignoredSelector &&
      element &&
      typeof element.closest === "function" &&
      element.closest(ignoredSelector)
    );
  }
  function readLocaleAttributeText(options) {
    const settings = options && typeof options === "object" ? options : {};
    const doc = settings.document || globalThis.document;
    const scope =
      doc?.body && typeof doc.body.querySelectorAll === "function"
        ? doc.body
        : typeof doc?.querySelectorAll === "function"
          ? doc
          : null;
    if (!scope) {
      return "";
    }
    const ignoredSelector = normalizeIgnoredSelectors(settings).join(", ");
    const attributeNames = ["placeholder", "aria-label", "title", "alt"];
    try {
      return Array.from(
        scope.querySelectorAll(
          attributeNames
            .map(function (name) {
              return "[" + name + "]";
            })
            .join(", "),
        ),
      )
        .map(function (element) {
          if (isIgnoredElement(element, ignoredSelector)) {
            return "";
          }
          return attributeNames
            .map(function (name) {
              if (typeof element.getAttribute === "function") {
                const value = String(element.getAttribute(name) || "").trim();
                if (value) {
                  return value;
                }
              }
              const directValue =
                typeof element?.[name] === "string"
                  ? String(element[name]).trim()
                  : "";
              return directValue;
            })
            .filter(Boolean)
            .join(" ");
        })
        .filter(Boolean)
        .join(" ")
        .trim();
    } catch {
      return "";
    }
  }
  function readDocumentText(options) {
    const settings = options && typeof options === "object" ? options : {};
    const doc = settings.document || globalThis.document;
    if (!doc?.body) {
      return "";
    }
    const fallbackText = String(
      doc.body.innerText || doc.body.textContent || "",
    ).trim();
    const ignoredSelectors = normalizeIgnoredSelectors(settings);
    const nodeFilterRef = globalThis.NodeFilter;
    const ignoredSelector = ignoredSelectors.join(", ");
    const attributeText = readLocaleAttributeText(settings);
    if (
      !ignoredSelectors.length ||
      typeof doc.createTreeWalker !== "function" ||
      !nodeFilterRef
    ) {
      return (
        [fallbackText, attributeText].filter(Boolean).join(" ").trim() ||
        fallbackText
      );
    }
    try {
      const walker = doc.createTreeWalker(doc.body, nodeFilterRef.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node?.parentElement;
          if (!parent) {
            return nodeFilterRef.FILTER_REJECT;
          }
          if (
            ignoredSelector &&
            typeof parent.closest === "function" &&
            parent.closest(ignoredSelector)
          ) {
            return nodeFilterRef.FILTER_REJECT;
          }
          return nodeFilterRef.FILTER_ACCEPT;
        },
      });
      let text = "";
      while (walker.nextNode()) {
        text += " " + String(walker.currentNode?.nodeValue || "");
      }
      return (
        [text.trim() || fallbackText, attributeText]
          .filter(Boolean)
          .join(" ")
          .trim() || fallbackText
      );
    } catch {
      return (
        [fallbackText, attributeText].filter(Boolean).join(" ").trim() ||
        fallbackText
      );
    }
  }
  function detectUiLocaleKey(options) {
    const settings = options && typeof options === "object" ? options : {};
    const pageText = readDocumentText(settings);
    const zhPageHints = Array.isArray(settings.zhPageHints)
      ? settings.zhPageHints
      : [];
    if (
      zhPageHints.some(function (hint) {
        return hint && pageText.includes(String(hint));
      })
    ) {
      return "zh";
    }
    const enPagePatterns = Array.isArray(settings.enPagePatterns)
      ? settings.enPagePatterns
      : [];
    if (
      enPagePatterns.some(function (pattern) {
        return pattern instanceof RegExp && pattern.test(pageText);
      })
    ) {
      return "en";
    }
    const doc = settings.document || globalThis.document;
    const htmlLang = String(doc?.documentElement?.lang || "").toLowerCase();
    if (htmlLang.startsWith("zh")) {
      return "zh";
    }
    if (htmlLang.startsWith("en")) {
      return "en";
    }
    const navigatorLanguage = String(
      settings.navigatorLanguage || globalThis.navigator?.language || "",
    ).toLowerCase();
    return navigatorLanguage.startsWith("zh") ? "zh" : "en";
  }
  function normalizeUiLocaleTag(value) {
    const raw = String(value || "")
      .trim()
      .replace(/_/g, "-");
    if (!raw) {
      return "";
    }
    const parts = raw.split("-").filter(Boolean);
    if (!parts.length) {
      return "";
    }
    const language = String(parts[0] || "").toLowerCase();
    if (!language) {
      return "";
    }
    const scriptPart =
      parts[1] && String(parts[1]).length === 4
        ? String(parts[1]).charAt(0).toUpperCase() +
          String(parts[1]).slice(1).toLowerCase()
        : "";
    const regionPartIndex = scriptPart ? 2 : 1;
    const regionPart = String(parts[regionPartIndex] || "").toUpperCase();
    if (language === "zh") {
      if (
        scriptPart === "Hant" ||
        regionPart === "TW" ||
        regionPart === "HK" ||
        regionPart === "MO"
      ) {
        return "zh-TW";
      }
      return "zh-CN";
    }
    if (language === "en") {
      return regionPart ? `en-${regionPart}` : "en-US";
    }
    return regionPart ? `${language}-${regionPart}` : language;
  }
  function getUiLocaleTag(options) {
    const settings = options && typeof options === "object" ? options : {};
    const doc = settings.document || globalThis.document;
    const explicitLocale = normalizeUiLocaleTag(
      doc?.documentElement?.dataset?.cpUiLocale ||
        (typeof doc?.documentElement?.getAttribute === "function"
          ? doc.documentElement.getAttribute("data-cp-ui-locale")
          : ""),
    );
    if (explicitLocale) {
      return explicitLocale;
    }
    const htmlLang = normalizeUiLocaleTag(doc?.documentElement?.lang);
    if (htmlLang) {
      return htmlLang;
    }
    const navigatorLanguage = normalizeUiLocaleTag(
      settings.navigatorLanguage || globalThis.navigator?.language || "",
    );
    if (detectUiLocaleKey(settings) === "zh") {
      return navigatorLanguage.startsWith("zh-")
        ? navigatorLanguage
        : "zh-CN";
    }
    return navigatorLanguage || "en-US";
  }
  function getCustomLocaleResolutionChain(localeTag) {
    const normalized = normalizeUiLocaleTag(localeTag);
    if (!normalized) {
      return ["en-US"];
    }
    if (normalized === "zh-TW") {
      return ["zh-CN", "zh-TW"];
    }
    if (normalized === "zh-CN") {
      return ["zh-CN"];
    }
    const parts = normalized.split("-");
    if (parts.length > 1 && normalized !== "en-US") {
      return [parts[0], normalized];
    }
    return [normalized];
  }
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function cloneLocaleValue(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return cloneLocaleValue(item);
      });
    }
    if (isPlainObject(value)) {
      const output = {};
      for (const key of Object.keys(value)) {
        output[key] = cloneLocaleValue(value[key]);
      }
      return output;
    }
    return value;
  }
  function mergeLocaleValue(baseValue, overrideValue) {
    if (overrideValue === undefined) {
      return cloneLocaleValue(baseValue);
    }
    if (Array.isArray(overrideValue)) {
      return cloneLocaleValue(overrideValue);
    }
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      const output = cloneLocaleValue(baseValue);
      for (const key of Object.keys(overrideValue)) {
        output[key] = mergeLocaleValue(output[key], overrideValue[key]);
      }
      return output;
    }
    return cloneLocaleValue(overrideValue);
  }
  function readNestedLocaleSection(pack, sectionPath) {
    const keys = Array.isArray(sectionPath)
      ? sectionPath
      : String(sectionPath || "")
          .split(".")
          .filter(Boolean);
    let current = pack;
    for (const key of keys) {
      if (!isPlainObject(current) || !(key in current)) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }
  const customI18nPackCache = new Map();
  function parseCustomI18nPackSource(source) {
    const text = String(source || "").trim();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  async function loadCustomI18nPack(localeTag) {
    const normalized = normalizeUiLocaleTag(localeTag);
    if (!normalized) {
      return null;
    }
    if (customI18nPackCache.has(normalized)) {
      return customI18nPackCache.get(normalized);
    }
    const pending = (async function () {
      try {
        if (
          !globalThis.fetch ||
          !globalThis.chrome?.runtime?.getURL
        ) {
          return null;
        }
        const response = await globalThis.fetch(
          chrome.runtime.getURL(
            `${CUSTOM_I18N_BASE_PATH}/${normalized}.js`,
          ),
        );
        if (!response?.ok) {
          return null;
        }
        const source = String((await response.text()) || "").trim();
        return parseCustomI18nPackSource(source);
      } catch {
        return null;
      }
    })();
    customI18nPackCache.set(normalized, pending);
    return pending;
  }
  async function resolveCustomI18nSection(sectionPath, localeTag, defaults) {
    let merged = cloneLocaleValue(defaults);
    for (const tag of getCustomLocaleResolutionChain(localeTag)) {
      const pack = await loadCustomI18nPack(tag);
      const section = readNestedLocaleSection(pack, sectionPath);
      if (section !== undefined) {
        merged = mergeLocaleValue(merged, section);
      }
    }
    return merged;
  }
  async function openUrl(url) {
    const nextUrl = String(url || "").trim();
    if (!nextUrl) {
      return false;
    }
    if (globalThis.chrome?.tabs?.create) {
      await chrome.tabs.create({
        url: nextUrl,
      });
      return true;
    }
    if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(nextUrl, "_blank", "noopener");
      return true;
    }
    return false;
  }
  async function readStoredState() {
    if (!globalThis.chrome?.storage?.local) {
      return {
        info: createDefaultUpdateInfo(""),
        dismissedVersion: "",
        autoCheckEnabled: true,
        seenVersion: "",
        previousVersion: "",
      };
    }
    const currentVersion =
      globalThis.chrome?.runtime?.getManifest?.().version || "";
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.INFO,
      STORAGE_KEYS.DISMISSED_VERSION,
      STORAGE_KEYS.AUTO_CHECK_ENABLED,
      STORAGE_KEYS.SEEN_VERSION,
      STORAGE_KEYS.PREVIOUS_VERSION,
    ]);
    return {
      info: normalizeStoredInfo(stored[STORAGE_KEYS.INFO], currentVersion),
      dismissedVersion: String(
        stored[STORAGE_KEYS.DISMISSED_VERSION] || "",
      ).trim(),
      autoCheckEnabled: stored[STORAGE_KEYS.AUTO_CHECK_ENABLED] !== false,
      seenVersion: String(stored[STORAGE_KEYS.SEEN_VERSION] || "").trim(),
      previousVersion: String(
        stored[STORAGE_KEYS.PREVIOUS_VERSION] || "",
      ).trim(),
    };
  }
  async function openReleasePage(info) {
    const state = info
      ? {
          info: normalizeStoredInfo(
            info,
            globalThis.chrome?.runtime?.getManifest?.().version || "",
          ),
        }
      : await readStoredState();
    return openUrl(state.info.releaseUrl || LATEST_RELEASE_URL);
  }
  async function openDownloadPage(info) {
    const state = info
      ? {
          info: normalizeStoredInfo(
            info,
            globalThis.chrome?.runtime?.getManifest?.().version || "",
          ),
        }
      : await readStoredState();
    const targetUrl =
      state.info.downloadUrl || state.info.releaseUrl || LATEST_RELEASE_URL;
    return openUrl(targetUrl);
  }
  globalThis.__CP_I18N_SHARED__ = {
    CUSTOM_I18N_BASE_PATH,
    normalizeUiLocaleTag,
    getUiLocaleTag,
    getCustomLocaleResolutionChain,
    cloneLocaleValue,
    mergeLocaleValue,
    loadCustomI18nPack,
    resolveCustomI18nSection,
  };
  globalThis.__CP_GITHUB_UPDATE_SHARED__ = {
    REPO_OWNER,
    REPO_NAME,
    RELEASES_BASE_URL,
    LATEST_JSON_URL,
    LATEST_RELEASE_URL,
    SOURCE,
    STORAGE_KEYS,
    MESSAGE_TYPES,
    ALARM_NAME,
    CHECK_INTERVAL_MINUTES,
    normalizeVersion,
    isValidVersion,
    compareVersions,
    computeHasUpdate,
    isBlockedByMinVersion,
    createDefaultUpdateInfo,
    normalizeStoredInfo,
    normalizeLatestPayload,
    formatTimestamp,
    summarizeNotes,
    renderMarkdownToHtml,
    readDocumentText,
    detectUiLocaleKey,
    normalizeUiLocaleTag,
    getUiLocaleTag,
    getCustomLocaleResolutionChain,
    cloneLocaleValue,
    mergeLocaleValue,
    loadCustomI18nPack,
    resolveCustomI18nSection,
    readStoredState,
    openUrl,
    openReleasePage,
    openDownloadPage,
  };
})();
