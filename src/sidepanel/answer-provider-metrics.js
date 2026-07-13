(function () {
  "use strict";

  const contract = globalThis.__CP_CONTRACT__?.providerObservability || {};
  const observability = globalThis.__CP_PROVIDER_OBSERVABILITY__ || null;
  const STORAGE_KEY = contract.STORAGE_KEY || "providerObservabilityRecords";
  const PREFERRED_LOCALE_KEY = globalThis.__CP_CONTRACT__?.ui?.PREFERRED_LOCALE_STORAGE_KEY || "preferred_locale";
  const EVENT_NAME = contract.MEASUREMENT_COMPLETE_EVENT || "cp:provider-measurement-complete";
  const EVENT_VERSION = Number(contract.EVENT_VERSION) || 1;
  const REQUEST_ID_ATTRIBUTE = "data-cp-provider-request-id";
  const PENDING_MAX_AGE_MS = 5 * 60 * 1000;
  const pending = new Map();
  const expiredIds = new Set();
  let preferredLocale = "";

  const labels = Object.freeze({
    en: {
      firstToken: "First token",
      throughput: "Tokens/s",
      total: "Total",
      tokens: "Tokens",
      milliseconds: "ms",
      seconds: "s",
    },
    "zh-CN": {
      firstToken: "首 Token",
      throughput: "Tokens/秒",
      total: "总计",
      tokens: "Tokens",
      milliseconds: "毫秒",
      seconds: "秒",
    },
    "zh-TW": {
      firstToken: "首 Token",
      throughput: "Tokens/秒",
      total: "總計",
      tokens: "Tokens",
      milliseconds: "毫秒",
      seconds: "秒",
    },
  });

  function localeKey() {
    const raw = String(preferredLocale || document.documentElement?.lang || navigator.language || "en-US").toLowerCase();
    if (raw.startsWith("zh-tw") || raw.startsWith("zh-hant") || raw.startsWith("zh-hk")) {
      return "zh-TW";
    }
    if (raw.startsWith("zh")) {
      return "zh-CN";
    }
    return "en";
  }

  function formatDuration(value, locale, copy) {
    const milliseconds = Number(value);
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      return "—";
    }
    if (milliseconds < 1000) {
      return `${Math.round(milliseconds).toLocaleString(locale)} ${copy.milliseconds}`;
    }
    return `${(milliseconds / 1000).toFixed(1)} ${copy.seconds}`;
  }

  function formatMeasurement(measurement) {
    const locale = localeKey();
    const copy = labels[locale];
    const usage = observability?.normalizeUsage?.(measurement?.usage) || {
      inputTokens: 0,
      outputTokens: 0,
    };
    const firstTokenLatencyMs = Number(measurement?.firstTokenLatencyMs) || 0;
    const totalDurationMs = Number(measurement?.totalDurationMs) || 0;
    const generationDurationMs = totalDurationMs - firstTokenLatencyMs;
    const throughput = firstTokenLatencyMs > 0 && usage.outputTokens > 0 && generationDurationMs > 0
      ? (usage.outputTokens / (generationDurationMs / 1000)).toFixed(1)
      : "—";
    const totalTokens = Math.max(0, usage.inputTokens + usage.outputTokens);
    const model = String(measurement?.model || measurement?.providerName || "Provider").trim() || "Provider";
    const throughputText = locale === "en" && throughput !== "—"
      ? `${throughput} ${copy.throughput}`
      : `${copy.throughput} ${throughput}`;
    const parts = [
      model,
      `${copy.firstToken} ${formatDuration(firstTokenLatencyMs, locale, copy)}`,
      throughputText,
      `${copy.total} ${totalTokens.toLocaleString(locale)} ${copy.tokens}`,
      formatDuration(totalDurationMs, locale, copy),
    ];
    return { model, parts, text: parts.join(" · ") };
  }

  function normalizeMeasurement(value) {
    if (!value || typeof value !== "object" || !String(value.id || "").trim()) {
      return null;
    }
    if (typeof observability?.createMeasurement !== "function") {
      return null;
    }
    return observability.createMeasurement(value, {
      id: value.id,
      now: Number(value.startedAt) || Date.now(),
    });
  }

  function findAnswers(requestId) {
    return Array.from(document.querySelectorAll(`[${REQUEST_ID_ATTRIBUTE}]`)).filter(function (element) {
      return element.getAttribute(REQUEST_ID_ATTRIBUTE) === requestId;
    });
  }

  function hasMetricsRow(answer, requestId) {
    return Array.from(answer.children || []).some(function (child) {
      return child.dataset?.cpProviderMetricsRow === "true" &&
        child.dataset?.cpProviderMetricsRequestId === requestId;
    });
  }

  function hasDocumentMetricsRow(requestId) {
    return Array.from(document.querySelectorAll("[data-cp-provider-metrics-row]")).some(function (row) {
      return row.dataset?.cpProviderMetricsRequestId === requestId;
    });
  }

  function attach(answer, measurement) {
    if (!answer || hasMetricsRow(answer, measurement.id)) {
      return false;
    }
    const formatted = formatMeasurement(measurement);
    const row = document.createElement("div");
    row.className = "cp-answer-provider-metrics";
    row.setAttribute("data-cp-provider-metrics-row", "true");
    row.setAttribute("data-cp-provider-metrics-request-id", measurement.id);
    renderRow(row, formatted);
    answer.appendChild(row);
    return true;
  }

  function renderRow(row, formatted) {
    const children = [];
    formatted.parts.forEach(function (part, index) {
      if (index > 0) {
        const separator = document.createElement("span");
        separator.className = "cp-answer-provider-metrics-separator";
        separator.textContent = " · ";
        children.push(separator);
      }
      const item = document.createElement("span");
      item.className = index === 0
        ? "cp-answer-provider-metrics-model"
        : "cp-answer-provider-metrics-value";
      item.textContent = part;
      if (index === 0) {
        item.setAttribute("data-cp-provider-model", "true");
        item.title = formatted.model;
      }
      children.push(item);
    });
    row.title = formatted.model;
    row.replaceChildren(...children);
  }

  function refreshRows() {
    for (const row of Array.from(document.querySelectorAll("[data-cp-provider-metrics-row]"))) {
      const requestId = row.dataset?.cpProviderMetricsRequestId;
      const entry = requestId ? pending.get(requestId) : null;
      if (!entry) {
        continue;
      }
      const formatted = formatMeasurement(entry.measurement);
      renderRow(row, formatted);
    }
  }

  function prune(now) {
    const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    for (const [id, entry] of pending.entries()) {
      if (!entry.matched && currentTime - entry.receivedAt > PENDING_MAX_AGE_MS) {
        pending.delete(id);
        expiredIds.add(id);
      }
    }
  }

  function scan(now) {
    prune(Number.isFinite(Number(now)) ? Number(now) : Date.now());
    for (const [id, entry] of pending.entries()) {
      if (hasDocumentMetricsRow(id)) {
        continue;
      }
      const answers = findAnswers(id);
      if (answers.length > 0) {
        entry.matched = attach(answers[0], entry.measurement) || entry.matched;
      }
    }
  }

  function receiveMeasurement(value, version, receivedAt) {
    if (Number(version) !== EVENT_VERSION) {
      return false;
    }
    const measurement = normalizeMeasurement(value);
    if (!measurement || expiredIds.has(measurement.id)) {
      return false;
    }
    const existing = pending.get(measurement.id);
    const observedAt = Number.isFinite(Number(receivedAt)) ? Number(receivedAt) : Date.now();
    pending.set(measurement.id, {
      measurement,
      receivedAt: existing?.receivedAt ?? observedAt,
      matched: existing?.matched === true,
    });
    scan(observedAt);
    return true;
  }

  function handleMeasurementEvent(event) {
    receiveMeasurement(event?.detail?.measurement, event?.detail?.version);
  }

  function ingestStoredRecords(records) {
    for (const record of Array.isArray(records) ? records : []) {
      receiveMeasurement(record, EVENT_VERSION);
    }
  }

  const eventTarget = typeof globalThis.addEventListener === "function" ? globalThis : globalThis.window;
  eventTarget?.addEventListener?.(EVENT_NAME, handleMeasurementEvent);
  globalThis.chrome?.storage?.onChanged?.addListener?.(function (changes, areaName) {
    if (areaName !== "local") {
      return;
    }
    if (changes?.[PREFERRED_LOCALE_KEY]) {
      preferredLocale = String(changes[PREFERRED_LOCALE_KEY].newValue || "");
      refreshRows();
    }
    if (changes?.[STORAGE_KEY]) {
      ingestStoredRecords(changes[STORAGE_KEY].newValue);
    }
  });
  globalThis.chrome?.storage?.local?.get?.([STORAGE_KEY, PREFERRED_LOCALE_KEY]).then(function (stored) {
    preferredLocale = String(stored?.[PREFERRED_LOCALE_KEY] || "");
    ingestStoredRecords(stored?.[STORAGE_KEY]);
    refreshRows();
  }).catch(function () {});

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  globalThis.__CP_ANSWER_PROVIDER_METRICS__ = Object.freeze({
    EVENT_NAME,
    EVENT_VERSION,
    PENDING_MAX_AGE_MS,
    formatMeasurement,
    receiveMeasurement,
    prune,
    scan,
  });
})();
