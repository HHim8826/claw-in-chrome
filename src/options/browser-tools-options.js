(function () {
  "use strict";

  const card = globalThis.__CP_OPTIONS_CARD__;
  if (!card || !globalThis.chrome?.storage?.local) {
    return;
  }
  const { localeKey, isDefaultOptionsRoute } = card;

  const ROOT_ID = "cp-browser-tools-root";
  const contract = globalThis.__CP_CONTRACT__?.browserTools || {};
  // Every setting here defaults to on; only an explicit `false` turns it off.
  const SETTINGS = [
    {
      id: "cp-browser-batch-enabled",
      key: contract.BROWSER_BATCH_ENABLED_STORAGE_KEY || "browserBatchEnabled",
      copy: "batch",
    },
    {
      id: "cp-browser-strip-interference",
      key: contract.STRIP_EXTENSION_INTERFERENCE_STORAGE_KEY || "cicStripExtensionInterference",
      copy: "interference",
    },
    {
      id: "cp-browser-minimized-window-guard",
      key: contract.MINIMIZED_WINDOW_GUARD_STORAGE_KEY || "cicMinimizedWindowGuard",
      copy: "minimized",
    },
  ];
  const stringsByLocale = {
    en: {
      title: "Browser tools",
      subtitle: "Control how the model operates pages in your browser.",
      batchLabel: "Batch browser actions",
      batchHelp: "Lets the model run several clicks, typing, and navigation steps in one request. Each step still checks site permissions, and the batch stops at the first error.",
      interferenceLabel: "Recover from other extensions' page frames",
      interferenceHelp: "When frames that another extension added to a page stop Claw from attaching its debugger, remove those frames and try again.",
      minimizedLabel: "Keep minimized windows in the background",
      minimizedHelp: "When Claw clicks in a minimized window, stop the page from bringing a new window to the front. Links open as tabs in the same tab group instead.",
    },
    "zh-CN": {
      title: "浏览器工具",
      subtitle: "控制模型如何在浏览器中操作网页。",
      batchLabel: "批量执行浏览器操作",
      batchHelp: "允许模型在一次请求中连续执行多个点击、输入和导航步骤。每一步仍会检查网站权限，遇到第一个错误就会停止。",
      interferenceLabel: "排除其他扩展程序的干扰",
      interferenceHelp: "其他扩展程序插入网页的框架导致 Claw 无法附加调试器时，移除这些框架后重试。",
      minimizedLabel: "最小化窗口保持在后台",
      minimizedHelp: "Claw 在最小化窗口中点击时，阻止网页把新窗口带到前台，链接改为在同一标签组中以新标签页打开。",
    },
    "zh-TW": {
      title: "瀏覽器工具",
      subtitle: "控制模型如何在瀏覽器中操作網頁。",
      batchLabel: "批次執行瀏覽器操作",
      batchHelp: "允許模型在一次請求中連續執行多個點擊、輸入和導覽步驟。每一步仍會檢查網站權限，遇到第一個錯誤就會停止。",
      interferenceLabel: "排除其他擴充功能的干擾",
      interferenceHelp: "其他擴充功能插入網頁的框架導致 Claw 無法附加偵錯器時，移除這些框架後重試。",
      minimizedLabel: "最小化視窗保持在背景",
      minimizedHelp: "Claw 在最小化的視窗中點擊時，阻止網頁把新視窗帶到前景，連結改在同一分頁群組中以新分頁開啟。",
    },
  };
  const values = Object.fromEntries(SETTINGS.map((setting) => [setting.key, true]));
  const pending = new Set();
  let mountObserver = null;

  function strings() {
    return stringsByLocale[localeKey()] || stringsByLocale.en;
  }

  async function setSetting(key, enabled) {
    values[key] = enabled !== false;
    pending.add(key);
    render();
    try {
      await chrome.storage.local.set({ [key]: values[key] });
    } finally {
      pending.delete(key);
      render();
    }
  }

  function render() {
    const existing = document.getElementById(ROOT_ID);
    const mountTarget = card.getMountTarget();
    if (!isDefaultOptionsRoute() || !mountTarget) {
      existing?.remove();
      return;
    }
    const copy = strings();
    const root = card.panel(ROOT_ID, copy.title, copy.subtitle);
    for (const setting of SETTINGS) {
      root.appendChild(card.switchRow({
        id: setting.id,
        title: copy[`${setting.copy}Label`],
        help: copy[`${setting.copy}Help`],
        enabled: values[setting.key],
        pending: pending.has(setting.key),
        onToggle(next) {
          setSetting(setting.key, next).catch(function () {});
        },
      }));
    }
    // Replace in place so toggling a switch doesn't reorder the cards.
    if (existing?.parentNode === mountTarget) {
      existing.replaceWith(root);
    } else {
      existing?.remove();
      mountTarget.appendChild(root);
    }
  }

  function observeMountTarget() {
    mountObserver ||= card.observeMountTarget(ROOT_ID, render);
  }

  async function refresh() {
    try {
      const stored = await chrome.storage.local.get(SETTINGS.map((setting) => setting.key));
      for (const setting of SETTINGS) {
        values[setting.key] = stored?.[setting.key] !== false;
      }
    } catch {
      for (const setting of SETTINGS) {
        values[setting.key] = true;
      }
    }
    render();
  }

  globalThis.__CP_BROWSER_TOOLS_OPTIONS__ = Object.freeze({
    STORAGE_KEY: SETTINGS[0].key,
    STORAGE_KEYS: Object.freeze(SETTINGS.map((setting) => setting.key)),
    refresh,
    setBrowserBatchEnabled(enabled) {
      return setSetting(SETTINGS[0].key, enabled);
    },
    setSetting,
  });
  observeMountTarget();
  window.addEventListener("hashchange", render);
  window.addEventListener("cp:ui-locale-changed", render);
  chrome.storage.onChanged?.addListener?.(function (changes, areaName) {
    if (areaName !== "local") {
      return;
    }
    let changed = false;
    for (const setting of SETTINGS) {
      if (changes[setting.key]) {
        values[setting.key] = changes[setting.key].newValue !== false;
        changed = true;
      }
    }
    if (changed) {
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
