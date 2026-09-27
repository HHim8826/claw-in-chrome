(function () {
  "use strict";

  if (!globalThis.chrome?.storage?.local) {
    return;
  }

  const ROOT_ID = "cp-browser-tools-root";
  const STORAGE_KEY =
    globalThis.__CP_CONTRACT__?.browserTools?.BROWSER_BATCH_ENABLED_STORAGE_KEY ||
    "browserBatchEnabled";
  const stringsByLocale = {
    en: {
      title: "Browser tools",
      subtitle: "Control how the model operates pages in your browser.",
      batchLabel: "Batch browser actions",
      batchHelp: "Lets the model run several clicks, typing, and navigation steps in one request. Each step still checks site permissions, and the batch stops at the first error.",
    },
    "zh-CN": {
      title: "浏览器工具",
      subtitle: "控制模型如何在浏览器中操作网页。",
      batchLabel: "批量执行浏览器操作",
      batchHelp: "允许模型在一次请求中连续执行多个点击、输入和导航步骤。每一步仍会检查网站权限，遇到第一个错误就会停止。",
    },
    "zh-TW": {
      title: "瀏覽器工具",
      subtitle: "控制模型如何在瀏覽器中操作網頁。",
      batchLabel: "批次執行瀏覽器操作",
      batchHelp: "允許模型在一次請求中連續執行多個點擊、輸入和導覽步驟。每一步仍會檢查網站權限，遇到第一個錯誤就會停止。",
    },
  };
  let batchEnabled = true;
  let mountObserver = null;

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

  function strings() {
    return stringsByLocale[localeKey()] || stringsByLocale.en;
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

  async function setBrowserBatchEnabled(enabled) {
    batchEnabled = enabled !== false;
    await chrome.storage.local.set({ [STORAGE_KEY]: batchEnabled });
    render();
  }

  function render() {
    const existing = document.getElementById(ROOT_ID);
    const mountTarget = document.getElementById("cp-options-debug-anchor");
    if (!isDefaultOptionsRoute() || !mountTarget) {
      existing?.remove();
      return;
    }
    existing?.remove();
    const copy = strings();
    const root = node("section", "cp-page-card cp-browser-tools-root");
    root.id = ROOT_ID;
    root.appendChild(node("h2", "cp-page-heading", copy.title));
    root.appendChild(node("p", "cp-page-subtitle", copy.subtitle));
    const label = node("label", "cp-data-insights-check");
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.id = "cp-browser-batch-enabled";
    checkbox.checked = batchEnabled;
    checkbox.addEventListener("change", function (event) {
      setBrowserBatchEnabled(!!event?.target?.checked).catch(function () {});
    });
    label.appendChild(checkbox);
    label.appendChild(node("span", "", copy.batchLabel));
    root.appendChild(label);
    root.appendChild(node("p", "cp-page-subtitle", copy.batchHelp));
    mountTarget.appendChild(root);
  }

  function observeMountTarget() {
    if (mountObserver || typeof MutationObserver !== "function") {
      return;
    }
    mountObserver = new MutationObserver(function () {
      const mountTarget = document.getElementById("cp-options-debug-anchor");
      const root = document.getElementById(ROOT_ID);
      if (mountTarget && root?.parentNode !== mountTarget) {
        render();
      }
    });
    mountObserver.observe(document.body, { childList: true, subtree: true });
  }

  async function refresh() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      batchEnabled = stored?.[STORAGE_KEY] !== false;
    } catch {
      batchEnabled = true;
    }
    render();
  }

  globalThis.__CP_BROWSER_TOOLS_OPTIONS__ = Object.freeze({
    STORAGE_KEY,
    refresh,
    setBrowserBatchEnabled,
  });
  observeMountTarget();
  window.addEventListener("hashchange", render);
  window.addEventListener("cp:ui-locale-changed", render);
  chrome.storage.onChanged?.addListener?.(function (changes, areaName) {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      batchEnabled = changes[STORAGE_KEY].newValue !== false;
      render();
    }
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refresh().catch(function () {});
    }, { once: true });
  } else {
    refresh().catch(function () {});
  }
})();
