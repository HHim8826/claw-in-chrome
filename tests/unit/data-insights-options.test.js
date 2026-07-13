const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createChromeMock, flushMicrotasks, runScriptInSandbox } = require("../helpers/chrome-test-utils");
const { FakeDocument, FakeElement, FakeMutationObserver } = require("../helpers/fake-dom");

const repoRoot = path.join(__dirname, "..", "..");
const backupPath = path.join(repoRoot, "src", "shared", "settings-backup.js");
const observabilityPath = path.join(repoRoot, "src", "shared", "provider-observability.js");
const optionsPath = path.join(repoRoot, "src", "options", "data-insights-options.js");

function createHarness(options = {}) {
  const chromeMock = createChromeMock({ storageState: options.storageState || {} });
  if (options.storageSetError) {
    chromeMock.chrome.storage.local.set = async function () {
      throw new Error(options.storageSetError);
    };
  }
  const document = new FakeDocument({ readyState: "complete" });
  document.documentElement.lang = options.locale || "en-US";
  const rafQueue = [];
  const urlEvents = [];
  const listeners = new Map();
  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    Blob,
    URL: {
      createObjectURL() {
        urlEvents.push("create");
        return "blob:test";
      },
      revokeObjectURL() {
        urlEvents.push("revoke");
      },
    },
    navigator: { language: options.locale || "en-US" },
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    setTimeout(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    clearTimeout() {},
    window: {
      location: { hash: "#options" },
      confirm() { return true; },
      addEventListener(type, listener) {
        const current = listeners.get(type) || [];
        current.push(listener);
        listeners.set(type, current);
      },
      removeEventListener() {},
    },
  };
  sandbox.globalThis = sandbox;
  runScriptInSandbox(backupPath, sandbox);
  runScriptInSandbox(observabilityPath, sandbox);
  runScriptInSandbox(optionsPath, sandbox);

  async function flush() {
    await flushMicrotasks();
    let guard = 30;
    while (rafQueue.length && guard > 0) {
      guard -= 1;
      const batch = rafQueue.splice(0);
      for (const callback of batch) {
        callback();
        await flushMicrotasks();
      }
    }
  }

  return { chromeMock, document, sandbox, flush, urlEvents };
}

async function testDownloadDefersBlobUrlRevocationUntilLaterTask() {
  const harness = createHarness({ storageState: { preferred_locale: "en-US" } });
  await harness.flush();

  await harness.sandbox.__CP_DATA_INSIGHTS_OPTIONS__.exportSettings({ download: true });
  assert.deepEqual(harness.urlEvents, ["create"], "download URL must remain valid after click");

  await harness.flush();
  assert.deepEqual(harness.urlEvents, ["create", "revoke"]);
}

async function testOptionsPanelExportsImportsAndSummarizesMeasurements() {
  const harness = createHarness({
    storageState: {
      customProviderProfiles: [{
        id: "provider-main",
        name: "Main provider",
        apiKey: "sk-installed",
        defaultModel: "model-main",
      }],
      preferred_locale: "en-US",
      providerObservabilityRecords: [
        {
          id: "metric-1",
          startedAt: Date.now(),
          profileId: "provider-main",
          outcome: "success",
          headerLatencyMs: 100,
          totalDurationMs: 300,
          usage: { inputTokens: 8, outputTokens: 3 },
        },
        {
          id: "metric-2",
          startedAt: Date.now(),
          profileId: "provider-main",
          outcome: "http_error",
          errorCategory: "rate_limit",
          status: 429,
          headerLatencyMs: 200,
          totalDurationMs: 200,
          usage: {},
        },
      ],
    },
  });
  await harness.flush();

  const root = harness.document.getElementById("cp-data-insights-root");
  assert.ok(root, "data and insights panel should render");
  assert.match(String(root.textContent || ""), /Data and insights/);
  assert.match(String(root.textContent || ""), /Requests/);
  assert.match(String(root.textContent || ""), /Input tokens8/);
  assert.match(String(root.textContent || ""), /Output tokens3/);
  assert.match(String(root.textContent || ""), /Cache-read tokens0/);
  assert.match(String(root.textContent || ""), /rate_limit: 1/);

  const api = harness.sandbox.__CP_DATA_INSIGHTS_OPTIONS__;
  const exported = await api.exportSettings({ includeSecrets: false, download: false });
  assert.equal(exported.includesSecrets, false);
  assert.equal(JSON.stringify(exported).includes("sk-installed"), false);

  const preview = await api.previewImport({
    ...exported,
    settings: {
      ...exported.settings,
      preferred_locale: "zh-TW",
    },
  });
  assert.equal(preview.ok, true);
  await api.applyPreview();
  assert.equal(harness.chromeMock.storageMock.state.preferred_locale, "zh-TW");
  assert.equal(
    harness.chromeMock.storageMock.state.customProviderProfiles[0].apiKey,
    "sk-installed",
  );

  await api.clearMeasurements();
  assert.deepEqual(harness.chromeMock.storageMock.state.providerObservabilityRecords, []);
}

async function testOptionsPanelUsesChineseLocaleVariants() {
  const traditional = createHarness({ locale: "zh-TW" });
  await traditional.flush();
  assert.match(
    String(traditional.document.getElementById("cp-data-insights-root").textContent || ""),
    /資料與洞察/,
  );

  const simplified = createHarness({ locale: "zh-CN" });
  await simplified.flush();
  assert.match(
    String(simplified.document.getElementById("cp-data-insights-root").textContent || ""),
    /数据与洞察/,
  );
}

async function testImportFailureKeepsPreviewAndVisibleRetryState() {
  const harness = createHarness({ storageSetError: "disk unavailable" });
  await harness.flush();
  const api = harness.sandbox.__CP_DATA_INSIGHTS_OPTIONS__;
  const root = harness.document.getElementById("cp-data-insights-root");
  const fileInput = harness.document.getElementById("cp-data-insights-import-file");

  const invalid = await api.previewImport({ kind: "wrong" });
  assert.equal(invalid.ok, false);
  assert.equal(harness.document.getElementById("cp-data-insights-root"), root);
  assert.equal(harness.document.getElementById("cp-data-insights-import-file"), fileInput);

  const preview = await api.previewImport({
    kind: "claw-in-chrome-settings-backup",
    schemaVersion: 1,
    includesSecrets: false,
    settings: { preferred_locale: "zh-TW" },
  });
  assert.equal(preview.ok, true);
  assert.equal(await api.applyPreview(), false);
  assert.match(
    String(harness.document.getElementById("cp-data-insights-import-status").textContent || ""),
    /Failed to apply backup: disk unavailable/,
  );
  assert.equal(
    harness.document.getElementById("cp-data-insights-apply-import").disabled,
    false,
    "valid preview should remain available for retry",
  );
}

async function main() {
  await testOptionsPanelExportsImportsAndSummarizesMeasurements();
  await testDownloadDefersBlobUrlRevocationUntilLaterTask();
  await testOptionsPanelUsesChineseLocaleVariants();
  await testImportFailureKeepsPreviewAndVisibleRetryState();
  console.log("data insights options tests passed");
}

main().catch(function (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
