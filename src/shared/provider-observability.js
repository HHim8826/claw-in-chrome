(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.__CP_PROVIDER_OBSERVABILITY__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const contract = globalThis.__CP_CONTRACT__?.providerObservability || {};
  const STORAGE_KEY = contract.STORAGE_KEY || "providerObservabilityRecords";
  const MAX_RECORDS = Number(contract.MAX_RECORDS) || 500;
  const MAX_AGE_MS = (Number(contract.MAX_AGE_DAYS) || 30) * 24 * 60 * 60 * 1000;
  const OUTCOMES = new Set([
    "success",
    "http_error",
    "network_error",
    "aborted",
    "invalid_response",
  ]);
  const WRITE_LOCK_NAME = "claw-provider-observability-v1";
  let writeQueue = Promise.resolve();
  const pendingWrites = new Set();

  function boundedText(value, limit) {
    return String(value || "").trim().slice(0, limit);
  }

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
  }

  function normalizeUsage(value) {
    const usage = value && typeof value === "object" ? value : {};
    return {
      inputTokens: nonNegativeNumber(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens),
      outputTokens: nonNegativeNumber(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens),
      cacheReadTokens: nonNegativeNumber(
        usage.cacheReadTokens ?? usage.cache_read_input_tokens ?? usage.cached_tokens,
      ),
      cacheCreationTokens: nonNegativeNumber(
        usage.cacheCreationTokens ?? usage.cache_creation_input_tokens,
      ),
    };
  }

  function createMeasurement(value, options) {
    const source = value && typeof value === "object" ? value : {};
    const settings = options && typeof options === "object" ? options : {};
    const now = Number.isFinite(Number(settings.now)) ? Number(settings.now) : Date.now();
    const outcome = OUTCOMES.has(source.outcome) ? source.outcome : "network_error";
    return {
      id: boundedText(settings.id || source.id || `provider-${now}`, 120),
      startedAt: Number.isFinite(Number(source.startedAt)) ? Number(source.startedAt) : now,
      profileId: boundedText(source.profileId, 120),
      providerName: boundedText(source.providerName, 120),
      format: boundedText(source.format, 40),
      model: boundedText(source.model, 160),
      status: nonNegativeNumber(source.status),
      outcome,
      errorCategory: boundedText(source.errorCategory, 80),
      retryCount: nonNegativeNumber(source.retryCount),
      headerLatencyMs: nonNegativeNumber(source.headerLatencyMs),
      firstTokenLatencyMs: nonNegativeNumber(source.firstTokenLatencyMs),
      totalDurationMs: nonNegativeNumber(source.totalDurationMs),
      usage: normalizeUsage(source.usage),
    };
  }

  function retainMeasurements(records, options) {
    const settings = options && typeof options === "object" ? options : {};
    const now = Number.isFinite(Number(settings.now)) ? Number(settings.now) : Date.now();
    const maxRecords = Math.max(
      1,
      Math.min(MAX_RECORDS, nonNegativeNumber(settings.maxRecords) || MAX_RECORDS),
    );
    return (Array.isArray(records) ? records : [])
      .filter(function (record) {
        const startedAt = Number(record?.startedAt);
        return Number.isFinite(startedAt) && startedAt >= now - MAX_AGE_MS;
      })
      .sort(function (left, right) {
        return Number(right.startedAt) - Number(left.startedAt);
      })
      .slice(0, maxRecords)
      .map(function (record) {
        return createMeasurement(record, {
          id: record.id,
          now: Number(record.startedAt),
        });
      });
  }

  function aggregateMeasurements(records, options) {
    const settings = options && typeof options === "object" ? options : {};
    const profileId = boundedText(settings.profileId, 120);
    const selected = (Array.isArray(records) ? records : []).filter(function (record) {
      return !profileId || String(record?.profileId || "") === profileId;
    });
    const totals = selected.reduce(function (result, record) {
      const usage = normalizeUsage(record?.usage);
      result.successCount += record?.outcome === "success" ? 1 : 0;
      result.headerLatencyMs += nonNegativeNumber(record?.headerLatencyMs);
      result.totalDurationMs += nonNegativeNumber(record?.totalDurationMs);
      result.inputTokens += usage.inputTokens;
      result.outputTokens += usage.outputTokens;
      result.cacheReadTokens += usage.cacheReadTokens;
      result.cacheCreationTokens += usage.cacheCreationTokens;
      if (record?.outcome !== "success") {
        const category = boundedText(record?.errorCategory || record?.outcome || "unknown", 80);
        result.errors[category] = (result.errors[category] || 0) + 1;
      }
      return result;
    }, {
      successCount: 0,
      headerLatencyMs: 0,
      totalDurationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      errors: {},
    });
    const requestCount = selected.length;
    return {
      requestCount,
      successCount: totals.successCount,
      errorCount: requestCount - totals.successCount,
      successRate: requestCount ? Math.round((totals.successCount / requestCount) * 100) : 0,
      averageHeaderLatencyMs: requestCount ? Math.round(totals.headerLatencyMs / requestCount) : 0,
      averageTotalDurationMs: requestCount ? Math.round(totals.totalDurationMs / requestCount) : 0,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheCreationTokens: totals.cacheCreationTokens,
      errors: totals.errors,
    };
  }

  function runSerializedWrite(operation) {
    const execute = function () {
      const locks = globalThis.navigator?.locks;
      if (locks && typeof locks.request === "function") {
        return locks.request(WRITE_LOCK_NAME, operation);
      }
      return operation();
    };
    const result = writeQueue.then(execute, execute);
    writeQueue = result.catch(function () {});
    return result;
  }

  async function recordMeasurement(storageArea, value, options) {
    if (!storageArea || typeof storageArea.get !== "function" || typeof storageArea.set !== "function") {
      return false;
    }
    return runSerializedWrite(async function () {
      try {
        const settings = options && typeof options === "object" ? options : {};
        const now = Number.isFinite(Number(settings.now)) ? Number(settings.now) : Date.now();
        const stored = await storageArea.get(STORAGE_KEY);
        const existing = Array.isArray(stored?.[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
        const measurement = createMeasurement(value, {
          id: value?.id,
          now,
        });
        await storageArea.set({
          [STORAGE_KEY]: retainMeasurements([measurement, ...existing], { now }),
        });
        return true;
      } catch (_error) {
        return false;
      }
    });
  }

  async function whenIdle() {
    while (pendingWrites.size > 0) {
      await Promise.allSettled(Array.from(pendingWrites));
    }
  }

  function createRequestTracker(storageArea, metadata, options) {
    const settings = options && typeof options === "object" ? options : {};
    const now = typeof settings.now === "function" ? settings.now : Date.now;
    const createId = typeof settings.createId === "function"
      ? settings.createId
      : function () {
        if (typeof globalThis.crypto?.randomUUID === "function") {
          return globalThis.crypto.randomUUID();
        }
        return `provider-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      };
    const id = boundedText(createId(), 120);
    const startedAt = Number(now());
    let headerAt = 0;
    let firstTokenAt = 0;
    let completed = false;
    return Object.freeze({
      id,
      markHeaders() {
        if (!headerAt) {
          headerAt = Number(now());
        }
      },
      markFirstToken() {
        if (completed || firstTokenAt) {
          return false;
        }
        firstTokenAt = Number(now());
        return true;
      },
      complete(result) {
        if (completed) {
          return false;
        }
        completed = true;
        const finishedAt = Number(now());
        const measurement = createMeasurement({
          ...(metadata && typeof metadata === "object" ? metadata : {}),
          ...(result && typeof result === "object" ? result : {}),
          id,
          startedAt,
          headerLatencyMs: headerAt ? Math.max(0, headerAt - startedAt) : 0,
          firstTokenLatencyMs: firstTokenAt
            ? Math.max(0, firstTokenAt - startedAt)
            : 0,
          totalDurationMs: Math.max(0, finishedAt - startedAt),
        }, { id, now: finishedAt });
        if (typeof settings.onComplete === "function") {
          try {
            settings.onComplete(measurement);
          } catch (_error) {}
        }
        const write = recordMeasurement(storageArea, measurement, { now: finishedAt });
        pendingWrites.add(write);
        write.finally(function () {
          pendingWrites.delete(write);
        });
        return true;
      },
    });
  }

  return Object.freeze({
    STORAGE_KEY,
    MAX_RECORDS,
    MAX_AGE_MS,
    createMeasurement,
    normalizeUsage,
    retainMeasurements,
    aggregateMeasurements,
    recordMeasurement,
    createRequestTracker,
    whenIdle,
  });
});
