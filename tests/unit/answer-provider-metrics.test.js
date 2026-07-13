const assert = require("node:assert/strict");
const path = require("node:path");

const { createChromeMock, flushMicrotasks, runScriptInSandbox } = require("../helpers/chrome-test-utils");
const { FakeDocument, FakeElement, FakeMutationObserver } = require("../helpers/fake-dom");

const repoRoot = path.join(__dirname, "..", "..");
const contractPath = path.join(repoRoot, "src", "shared", "claw-contract.js");
const observabilityPath = path.join(repoRoot, "src", "shared", "provider-observability.js");
const metricsPath = path.join(repoRoot, "src", "sidepanel", "answer-provider-metrics.js");

function measurement(id, overrides = {}) {
  return {
    id,
    startedAt: 1_752_364_800_000,
    profileId: "provider-main",
    providerName: "Main provider",
    format: "openai_chat",
    model: "model-main",
    outcome: "success",
    status: 200,
    firstTokenLatencyMs: 842,
    totalDurationMs: 2700,
    usage: { inputTokens: 100, outputTokens: 40 },
    ...overrides,
  };
}

function createHarness(options = {}) {
  const chromeMock = createChromeMock({
    storageState: {
      providerObservabilityRecords: options.records || [],
      preferred_locale: options.preferredLocale,
    },
  });
  const document = new FakeDocument({ readyState: "complete" });
  document.documentElement.lang = options.locale || "en-US";
  const listeners = new Map();
  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    navigator: { language: options.locale || "en-US" },
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
  };
  sandbox.globalThis = sandbox;
  runScriptInSandbox(contractPath, sandbox);
  runScriptInSandbox(observabilityPath, sandbox);
  runScriptInSandbox(metricsPath, sandbox);

  function addAnswer(id) {
    const answer = document.createElement("section");
    if (id) {
      answer.setAttribute("data-cp-provider-request-id", id);
    }
    document.body.appendChild(answer);
    return answer;
  }

  function dispatchMetric(value, version = 1) {
    for (const listener of listeners.get("cp:provider-measurement-complete") || []) {
      listener({ detail: { version, measurement: value } });
    }
  }

  function rows(answer) {
    return answer.children.filter(child => child.dataset.cpProviderMetricsRow === "true");
  }

  return {
    api: sandbox.__CP_ANSWER_PROVIDER_METRICS__,
    chromeMock,
    document,
    addAnswer,
    dispatchMetric,
    rows,
  };
}

async function testBothArrivalOrdersAndDuplicatesUseExactId() {
  const metricFirst = createHarness();
  metricFirst.dispatchMetric(measurement("request-a"));
  const answerA = metricFirst.addAnswer("request-a");
  metricFirst.api.scan();
  assert.equal(metricFirst.rows(answerA).length, 1);

  metricFirst.dispatchMetric(measurement("request-a"));
  metricFirst.api.scan();
  assert.equal(metricFirst.rows(answerA).length, 1, "duplicate events must not duplicate rows");

  const domFirst = createHarness();
  const answerB = domFirst.addAnswer("request-b");
  domFirst.api.scan();
  assert.equal(domFirst.rows(answerB).length, 0);
  domFirst.dispatchMetric(measurement("request-b"));
  assert.equal(domFirst.rows(answerB).length, 1);
  assert.equal(answerB.lastChild, domFirst.rows(answerB)[0], "metrics must sit below the answer");
}

async function testConcurrencyVersionExpiryAndLegacyProtection() {
  const harness = createHarness();
  const answerA = harness.addAnswer("request-a");
  const answerB = harness.addAnswer("request-b");
  const duplicateAnswerB = harness.addAnswer("request-b");
  const legacyAnswer = harness.addAnswer();

  harness.dispatchMetric(measurement("request-b", { model: "model-b" }));
  harness.dispatchMetric(measurement("request-a", { model: "model-a" }));
  assert.match(harness.rows(answerA)[0].textContent, /model-a/);
  assert.match(harness.rows(answerB)[0].textContent, /model-b/);
  assert.equal(
    harness.rows(answerB).length + harness.rows(duplicateAnswerB).length,
    1,
    "one request ID must produce at most one row in the document",
  );
  assert.equal(harness.rows(legacyAnswer).length, 0);

  const wrongVersion = harness.addAnswer("request-version");
  harness.dispatchMetric(measurement("request-version"), 2);
  assert.equal(harness.rows(wrongVersion).length, 0, "unknown event versions must be rejected");

  harness.api.receiveMeasurement(measurement("request-expired"), 1, 1000);
  harness.api.receiveMeasurement(measurement("request-expired"), 1, 1000 + 4 * 60 * 1000);
  harness.api.prune(1000 + 5 * 60 * 1000 + 1);
  assert.equal(
    harness.api.receiveMeasurement(measurement("request-expired"), 1, 1000 + 6 * 60 * 1000),
    false,
    "later storage snapshots must not revive an expired pending ID",
  );
  const expiredAnswer = harness.addAnswer("request-expired");
  harness.api.scan();
  assert.equal(harness.rows(expiredAnswer).length, 0, "pending metrics must expire after five minutes");
}

async function testFormattingLocalizationAndUnavailableStreamingMetrics() {
  const english = createHarness();
  const answer = english.addAnswer("request-format");
  english.dispatchMetric(measurement("request-format"));
  const row = english.rows(answer)[0];
  assert.equal(
    row.textContent,
    "model-main · First token 842 ms · 21.5 Tokens/s · Total 140 Tokens · 2.7 s",
  );
  assert.equal(row.title, "model-main");
  assert.equal(row.children[0].dataset.cpProviderModel, "true");
  assert.equal(row.children[0].title, "model-main");

  const traditional = createHarness({ locale: "zh-TW" });
  const zhTwAnswer = traditional.addAnswer("request-zh-tw");
  traditional.dispatchMetric(measurement("request-zh-tw", {
    firstTokenLatencyMs: 0,
    usage: { inputTokens: 100, outputTokens: 40 },
  }));
  assert.equal(
    traditional.rows(zhTwAnswer)[0].textContent,
    "model-main · 首 Token — · Tokens/秒 — · 總計 140 Tokens · 2.7 秒",
  );

  const simplified = createHarness({ locale: "zh-CN" });
  const zhCnAnswer = simplified.addAnswer("request-zh-cn");
  simplified.dispatchMetric(measurement("request-zh-cn", { totalDurationMs: 900 }));
  assert.match(simplified.rows(zhCnAnswer)[0].textContent, /首 Token 842 毫秒/);
  assert.match(simplified.rows(zhCnAnswer)[0].textContent, /900 毫秒$/);
  assert.doesNotMatch(simplified.rows(zhCnAnswer)[0].textContent, /NaN|Infinity/);
}

async function testStoredMeasurementAttachesAcrossPageContexts() {
  const harness = createHarness({ records: [measurement("request-stored")] });
  const answer = harness.addAnswer("request-stored");
  await flushMicrotasks();
  harness.api.scan();
  assert.equal(harness.rows(answer).length, 1);
}

async function testMatchedMeasurementSurvivesLateReactRerender() {
  const harness = createHarness();
  const originalAnswer = harness.addAnswer("request-rerender");
  harness.api.receiveMeasurement(measurement("request-rerender"), 1, 1000);
  assert.equal(harness.rows(originalAnswer).length, 1);

  harness.api.prune(1000 + 5 * 60 * 1000 + 1);
  originalAnswer.remove();
  const replacementAnswer = harness.addAnswer("request-rerender");
  harness.api.scan();
  assert.equal(harness.rows(replacementAnswer).length, 1);
}

async function testStoredLocaleOverridesStaticHtmlLanguage() {
  const harness = createHarness({ locale: "en-US", preferredLocale: "zh-TW" });
  await flushMicrotasks();
  const answer = harness.addAnswer("request-preferred-locale");
  harness.dispatchMetric(measurement("request-preferred-locale"));
  assert.match(harness.rows(answer)[0].textContent, /首 Token/);
  assert.match(harness.rows(answer)[0].textContent, /總計/);
}

async function main() {
  await testBothArrivalOrdersAndDuplicatesUseExactId();
  await testConcurrencyVersionExpiryAndLegacyProtection();
  await testFormattingLocalizationAndUnavailableStreamingMetrics();
  await testStoredMeasurementAttachesAcrossPageContexts();
  await testMatchedMeasurementSurvivesLateReactRerender();
  await testStoredLocaleOverridesStaticHtmlLanguage();
  console.log("answer provider metrics tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
