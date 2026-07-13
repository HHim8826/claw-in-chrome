(function () {
  "use strict";

  const backupApi = globalThis.__CP_SETTINGS_BACKUP__;
  const observability = globalThis.__CP_PROVIDER_OBSERVABILITY__;
  if (!backupApi || !observability || !globalThis.chrome?.storage?.local) {
    return;
  }

  const ROOT_ID = "cp-data-insights-root";
  const stringsByLocale = {
    en: {
      title: "Data and insights",
      subtitle: "Move reviewed settings and inspect local provider performance.",
      backupTitle: "Settings backup",
      backupHelp: "Exports settings only. Chat history and diagnostics are never included.",
      includeSecrets: "Include provider credentials",
      secretWarning: "This JSON file will contain provider credentials in plain text. Continue?",
      exportButton: "Export settings",
      importButton: "Choose backup",
      applyButton: "Apply preview",
      previewReady: "Backup ready: {count} reviewed settings.",
      importApplied: "Backup applied.",
      importFailed: "This backup can't be imported.",
      applyFailed: "Failed to apply backup: {message}",
      insightsTitle: "Provider insights",
      insightsHelp: "Measurements stay on this device and never contain prompts or responses.",
      allProviders: "All providers",
      requests: "Requests",
      successRate: "Success rate",
      latency: "Average latency",
      inputTokens: "Input tokens",
      outputTokens: "Output tokens",
      cacheReadTokens: "Cache-read tokens",
      errors: "Errors",
      clear: "Clear measurements",
      empty: "No provider measurements yet.",
    },
    "zh-CN": {
      title: "数据与洞察",
      subtitle: "迁移经过审核的设置，并查看本地供应商表现。",
      backupTitle: "设置备份",
      backupHelp: "只导出设置，不会包含聊天记录或诊断日志。",
      includeSecrets: "包含供应商凭据",
      secretWarning: "这个 JSON 文件将以明文包含供应商凭据。是否继续？",
      exportButton: "导出设置",
      importButton: "选择备份",
      applyButton: "应用预览",
      previewReady: "备份可用：包含 {count} 项已审核设置。",
      importApplied: "备份已应用。",
      importFailed: "无法导入这个备份。",
      applyFailed: "应用备份失败：{message}",
      insightsTitle: "供应商洞察",
      insightsHelp: "指标只保存在本机，绝不包含提示词或回复内容。",
      allProviders: "所有供应商",
      requests: "请求数",
      successRate: "成功率",
      latency: "平均延迟",
      inputTokens: "输入 Tokens",
      outputTokens: "输出 Tokens",
      cacheReadTokens: "缓存读取 Tokens",
      errors: "错误",
      clear: "清除指标",
      empty: "还没有供应商指标。",
    },
    "zh-TW": {
      title: "資料與洞察",
      subtitle: "遷移經過審核的設定，並查看本機供應商表現。",
      backupTitle: "設定備份",
      backupHelp: "只匯出設定，不會包含聊天記錄或診斷日誌。",
      includeSecrets: "包含供應商憑證",
      secretWarning: "這個 JSON 檔案將以明文包含供應商憑證。是否繼續？",
      exportButton: "匯出設定",
      importButton: "選擇備份",
      applyButton: "套用預覽",
      previewReady: "備份可用：包含 {count} 項已審核設定。",
      importApplied: "備份已套用。",
      importFailed: "無法匯入這個備份。",
      applyFailed: "套用備份失敗：{message}",
      insightsTitle: "供應商洞察",
      insightsHelp: "指標只保存在本機，絕不包含提示詞或回覆內容。",
      allProviders: "所有供應商",
      requests: "請求數",
      successRate: "成功率",
      latency: "平均延遲",
      inputTokens: "輸入 Tokens",
      outputTokens: "輸出 Tokens",
      cacheReadTokens: "快取讀取 Tokens",
      errors: "錯誤",
      clear: "清除指標",
      empty: "還沒有供應商指標。",
    },
  };
  let pendingImport = null;
  let selectedProfileId = "";
  let profiles = [];
  let measurements = [];
  let statusMessage = "";
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

  function downloadBackup(documentValue) {
    const blob = new Blob([JSON.stringify(documentValue, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `claw-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  async function exportSettings(options) {
    const settings = options && typeof options === "object" ? options : {};
    const snapshot = await chrome.storage.local.get(null);
    const backup = backupApi.createBackup(snapshot, {
      includeSecrets: settings.includeSecrets === true,
    });
    if (settings.download !== false) {
      downloadBackup(backup);
    }
    return backup;
  }

  async function previewImport(documentValue) {
    const inspected = backupApi.inspectBackup(documentValue);
    pendingImport = inspected.ok ? inspected : null;
    const copy = strings();
    statusMessage = inspected.ok
      ? copy.previewReady.replace("{count}", String(inspected.keys.length))
      : copy.importFailed;
    updateImportUi();
    return inspected;
  }

  function updateImportUi() {
    const status = document.getElementById("cp-data-insights-import-status");
    const applyButton = document.getElementById("cp-data-insights-apply-import");
    if (status) {
      status.textContent = statusMessage;
      status.hidden = !statusMessage;
    }
    if (applyButton) {
      applyButton.disabled = !pendingImport;
    }
  }

  async function applyPreview() {
    if (!pendingImport?.ok) {
      return false;
    }
    try {
      const current = await chrome.storage.local.get(null);
      const changes = backupApi.buildRestoreChanges(pendingImport, current);
      await chrome.storage.local.set(changes);
      statusMessage = strings().importApplied;
      pendingImport = null;
      await refresh();
      return true;
    } catch (error) {
      const message = String(error?.message || "storage write failed").slice(0, 160);
      statusMessage = strings().applyFailed.replace("{message}", message);
      updateImportUi();
      return false;
    }
  }

  async function clearMeasurements() {
    await chrome.storage.local.set({ [observability.STORAGE_KEY]: [] });
    measurements = [];
    render();
    return true;
  }

  function buildMetric(label, value) {
    const card = node("div", "cp-data-insights-metric");
    card.appendChild(node("div", "cp-data-insights-metric-label", label));
    card.appendChild(node("strong", "cp-data-insights-metric-value", value));
    return card;
  }

  function isDefaultOptionsRoute() {
    const parts = String(window.location?.hash || "").split("?");
    return parts[0] === "#options" && !/(?:^|&)provider=/.test(parts[1] || "");
  }

  function render() {
    const existing = document.getElementById(ROOT_ID);
    if (!isDefaultOptionsRoute()) {
      existing?.remove();
      return;
    }
    const mountTarget = document.getElementById("cp-options-debug-anchor");
    if (!mountTarget) {
      existing?.remove();
      return;
    }
    existing?.remove();
    const copy = strings();
    const root = node("section", "cp-page-card cp-data-insights-root");
    root.id = ROOT_ID;
    root.appendChild(node("h2", "cp-page-heading", copy.title));
    root.appendChild(node("p", "cp-page-subtitle", copy.subtitle));

    const backupSection = node("div", "cp-data-insights-section");
    backupSection.appendChild(node("h3", "cp-page-heading", copy.backupTitle));
    backupSection.appendChild(node("p", "cp-page-subtitle", copy.backupHelp));
    const secretLabel = node("label", "cp-data-insights-check");
    const secretCheckbox = node("input");
    secretCheckbox.type = "checkbox";
    secretCheckbox.dataset.cpIncludeSecrets = "true";
    secretLabel.appendChild(secretCheckbox);
    secretLabel.appendChild(node("span", "", copy.includeSecrets));
    backupSection.appendChild(secretLabel);
    const actions = node("div", "cp-data-insights-actions");
    const exportButton = node("button", "cp-page-button", copy.exportButton);
    exportButton.type = "button";
    exportButton.onclick = async function () {
      if (secretCheckbox.checked && !window.confirm(copy.secretWarning)) {
        return;
      }
      await exportSettings({ includeSecrets: secretCheckbox.checked });
    };
    const importLabel = node("label", "cp-page-button", copy.importButton);
    const input = node("input");
    input.id = "cp-data-insights-import-file";
    input.type = "file";
    input.accept = "application/json,.json";
    input.hidden = true;
    input.onchange = async function () {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      try {
        await previewImport(JSON.parse(await file.text()));
      } catch (_error) {
        await previewImport(null);
      }
    };
    importLabel.appendChild(input);
    const applyButton = node("button", "cp-page-button", copy.applyButton);
    applyButton.id = "cp-data-insights-apply-import";
    applyButton.type = "button";
    applyButton.disabled = !pendingImport;
    applyButton.onclick = function () {
      applyPreview().catch(function () {});
    };
    actions.appendChild(exportButton);
    actions.appendChild(importLabel);
    actions.appendChild(applyButton);
    backupSection.appendChild(actions);
    const importStatus = node("p", "cp-page-status", statusMessage);
    importStatus.id = "cp-data-insights-import-status";
    importStatus.hidden = !statusMessage;
    backupSection.appendChild(importStatus);
    root.appendChild(backupSection);

    const insightsSection = node("div", "cp-data-insights-section");
    insightsSection.appendChild(node("h3", "cp-page-heading", copy.insightsTitle));
    insightsSection.appendChild(node("p", "cp-page-subtitle", copy.insightsHelp));
    const select = node("select", "cp-data-insights-filter");
    const allOption = node("option", "", copy.allProviders);
    allOption.value = "";
    select.appendChild(allOption);
    for (const profile of profiles) {
      const option = node("option", "", profile.name || profile.id || copy.allProviders);
      option.value = String(profile.id || "");
      option.selected = option.value === selectedProfileId;
      select.appendChild(option);
    }
    select.value = selectedProfileId;
    select.onchange = function () {
      selectedProfileId = String(select.value || "");
      render();
    };
    insightsSection.appendChild(select);
    const summary = observability.aggregateMeasurements(measurements, {
      profileId: selectedProfileId,
    });
    const metrics = node("div", "cp-data-insights-grid");
    metrics.appendChild(buildMetric(copy.requests, summary.requestCount));
    metrics.appendChild(buildMetric(copy.successRate, `${summary.successRate}%`));
    metrics.appendChild(buildMetric(copy.latency, `${summary.averageTotalDurationMs} ms`));
    metrics.appendChild(buildMetric(copy.inputTokens, summary.inputTokens));
    metrics.appendChild(buildMetric(copy.outputTokens, summary.outputTokens));
    metrics.appendChild(buildMetric(copy.cacheReadTokens, summary.cacheReadTokens));
    metrics.appendChild(buildMetric(copy.errors, summary.errorCount));
    insightsSection.appendChild(metrics);
    const errorEntries = Object.entries(summary.errors || {}).sort(function (left, right) {
      return right[1] - left[1] || left[0].localeCompare(right[0]);
    });
    if (errorEntries.length) {
      const errorList = node("ul", "cp-data-insights-errors");
      for (const [category, count] of errorEntries) {
        errorList.appendChild(node("li", "", `${category}: ${count}`));
      }
      insightsSection.appendChild(errorList);
    }
    if (!summary.requestCount) {
      insightsSection.appendChild(node("p", "cp-page-status", copy.empty));
    }
    const clearButton = node("button", "cp-page-button", copy.clear);
    clearButton.type = "button";
    clearButton.disabled = measurements.length === 0;
    clearButton.onclick = function () {
      clearMeasurements().catch(function () {});
    };
    insightsSection.appendChild(clearButton);
    root.appendChild(insightsSection);
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
    const stored = await chrome.storage.local.get([
      "customProviderProfiles",
      observability.STORAGE_KEY,
    ]);
    profiles = Array.isArray(stored.customProviderProfiles)
      ? stored.customProviderProfiles.slice()
      : [];
    measurements = observability.retainMeasurements(
      stored[observability.STORAGE_KEY],
    );
    render();
  }

  const api = Object.freeze({
    exportSettings,
    previewImport,
    applyPreview,
    clearMeasurements,
    refresh,
  });
  globalThis.__CP_DATA_INSIGHTS_OPTIONS__ = api;
  observeMountTarget();
  window.addEventListener("hashchange", render);
  window.addEventListener("cp:ui-locale-changed", render);
  chrome.storage.onChanged?.addListener?.(function (changes, areaName) {
    if (
      areaName === "local" &&
      (changes.customProviderProfiles || changes[observability.STORAGE_KEY])
    ) {
      refresh().catch(function () {});
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
