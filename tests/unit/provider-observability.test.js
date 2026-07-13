const assert = require("node:assert/strict");

const observability = require("../../src/shared/provider-observability.js");

function testMeasurementKeepsMetricsAndDropsPrivateContent() {
  const record = observability.createMeasurement({
    profileId: "provider-main",
    providerName: "Main provider",
    format: "openai_chat",
    model: "model-main",
    status: 200,
    outcome: "success",
    retryCount: 1,
    headerLatencyMs: 120,
    totalDurationMs: 850,
    usage: {
      input_tokens: 100,
      output_tokens: 40,
      cache_read_input_tokens: 25,
      cache_creation_input_tokens: 5,
    },
    url: "https://private.example.test/v1/messages",
    apiKey: "sk-private",
    prompt: "private prompt",
    response: "private response",
  }, {
    id: "metric-1",
    now: 1_752_364_800_000,
  });

  assert.deepEqual(record, {
    id: "metric-1",
    startedAt: 1_752_364_800_000,
    profileId: "provider-main",
    providerName: "Main provider",
    format: "openai_chat",
    model: "model-main",
    status: 200,
    outcome: "success",
    errorCategory: "",
    retryCount: 1,
    headerLatencyMs: 120,
    totalDurationMs: 850,
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 25,
      cacheCreationTokens: 5,
    },
  });
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("private.example"), false);
  assert.equal(serialized.includes("sk-private"), false);
  assert.equal(serialized.includes("private prompt"), false);
  assert.equal(serialized.includes("private response"), false);
}

function testRetentionAndAggregationStayBoundedAndFilterByProvider() {
  const now = 1_752_364_800_000;
  const records = [
    observability.createMeasurement({
      profileId: "provider-main",
      outcome: "success",
      headerLatencyMs: 100,
      totalDurationMs: 500,
      usage: { input_tokens: 20, output_tokens: 10 },
      startedAt: now - 1_000,
    }, { id: "main-success", now }),
    observability.createMeasurement({
      profileId: "provider-main",
      outcome: "http_error",
      status: 429,
      errorCategory: "rate_limit",
      headerLatencyMs: 300,
      totalDurationMs: 300,
      startedAt: now - 2_000,
    }, { id: "main-error", now }),
    observability.createMeasurement({
      profileId: "provider-other",
      outcome: "success",
      headerLatencyMs: 50,
      totalDurationMs: 100,
      usage: { input_tokens: 900, output_tokens: 900 },
      startedAt: now - 3_000,
    }, { id: "other-success", now }),
    observability.createMeasurement({
      profileId: "provider-main",
      outcome: "success",
      startedAt: now - observability.MAX_AGE_MS - 1,
    }, { id: "expired", now }),
  ];

  const retained = observability.retainMeasurements(records, { now, maxRecords: 3 });
  assert.equal(retained.some(record => record.id === "expired"), false);

  const summary = observability.aggregateMeasurements(retained, {
    profileId: "provider-main",
  });
  assert.deepEqual(summary, {
    requestCount: 2,
    successCount: 1,
    errorCount: 1,
    successRate: 50,
    averageHeaderLatencyMs: 200,
    averageTotalDurationMs: 400,
    inputTokens: 20,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    errors: { rate_limit: 1 },
  });
}

async function testStorageRecordingIsBestEffortAndBounded() {
  const state = { providerObservabilityRecords: [] };
  const storage = {
    async get() {
      return { providerObservabilityRecords: state.providerObservabilityRecords };
    },
    async set(changes) {
      Object.assign(state, changes);
    },
  };
  const saved = await observability.recordMeasurement(storage, {
    id: "stored-record",
    startedAt: 1_752_364_800_000,
    outcome: "success",
  }, {
    now: 1_752_364_800_000,
  });
  assert.equal(saved, true);
  assert.equal(state.providerObservabilityRecords.length, 1);

  const failed = await observability.recordMeasurement({
    async get() {
      throw new Error("storage unavailable");
    },
  }, {
    outcome: "network_error",
  });
  assert.equal(failed, false);
}

async function testRequestTrackerRecordsHeaderAndTotalLatencyOnce() {
  const times = [1000, 1120, 1850, 2000];
  const state = { providerObservabilityRecords: [] };
  const storage = {
    async get() {
      return { providerObservabilityRecords: state.providerObservabilityRecords };
    },
    async set(changes) {
      Object.assign(state, changes);
    },
  };
  const tracker = observability.createRequestTracker(storage, {
    profileId: "provider-main",
    model: "model-main",
  }, {
    now() {
      return times.shift();
    },
  });
  tracker.markHeaders();
  const completion = tracker.complete({
    outcome: "success",
    status: 200,
    usage: { input_tokens: 7, output_tokens: 3 },
  });
  assert.equal(completion, true, "tracker completion must not await storage");
  assert.equal(tracker.complete({ outcome: "network_error" }), false);
  await observability.whenIdle();

  assert.equal(state.providerObservabilityRecords.length, 1);
  assert.equal(state.providerObservabilityRecords[0].headerLatencyMs, 120);
  assert.equal(state.providerObservabilityRecords[0].totalDurationMs, 850);
  assert.equal(state.providerObservabilityRecords[0].usage.inputTokens, 7);
}

async function testConcurrentStorageWritesRetainEveryMeasurement() {
  const state = { providerObservabilityRecords: [] };
  const storage = {
    async get() {
      await Promise.resolve();
      return {
        providerObservabilityRecords: state.providerObservabilityRecords.slice(),
      };
    },
    async set(changes) {
      await Promise.resolve();
      Object.assign(state, changes);
    },
  };

  await Promise.all([
    observability.recordMeasurement(storage, {
      id: "concurrent-1",
      startedAt: 1_752_364_800_000,
      outcome: "success",
    }, { now: 1_752_364_800_000 }),
    observability.recordMeasurement(storage, {
      id: "concurrent-2",
      startedAt: 1_752_364_800_001,
      outcome: "success",
    }, { now: 1_752_364_800_001 }),
  ]);

  assert.deepEqual(
    state.providerObservabilityRecords.map(record => record.id).sort(),
    ["concurrent-1", "concurrent-2"],
  );
}

async function main() {
  testMeasurementKeepsMetricsAndDropsPrivateContent();
  testRetentionAndAggregationStayBoundedAndFilterByProvider();
  await testStorageRecordingIsBestEffortAndBounded();
  await testRequestTrackerRecordsHeaderAndTotalLatencyOnce();
  await testConcurrentStorageWritesRetainEveryMeasurement();
  console.log("provider observability tests passed");
}

try {
  main().catch(function (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
