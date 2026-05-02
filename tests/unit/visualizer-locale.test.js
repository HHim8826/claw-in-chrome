const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createChromeMock,
  flushMicrotasks,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");
const {
  FakeDocument,
  FakeElement,
  FakeMutationObserver
} = require("../helpers/fake-dom");

const corePath = path.join(__dirname, "..", "..", "src", "visualizer", "visualizer-core.js");
const contractPath = path.join(__dirname, "..", "..", "src", "shared", "claw-contract.js");
const scriptPath = path.join(__dirname, "..", "..", "src", "visualizer", "visualizer.js");
const customZhPack = Function(
  `"use strict"; return (${fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "i18n", "custom", "zh-CN.js"),
    "utf8",
  )});`,
)();
const customZhTwPack = Function(
  `"use strict"; return (${fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "i18n", "custom", "zh-TW.js"),
    "utf8",
  )});`,
)();

function createI18nShared() {
  return {
    cloneLocaleValue(value) {
      return JSON.parse(JSON.stringify(value));
    },
    normalizeUiLocaleTag(value) {
      const locale = String(value || "").trim().toLowerCase();
      if (!locale) {
        return "";
      }
      if (
        locale === "zh-tw"
        || locale === "zh-hk"
        || locale === "zh-mo"
        || locale.includes("hant")
      ) {
        return "zh-TW";
      }
      return locale.startsWith("zh") ? "zh-CN" : "en-US";
    },
    async resolveCustomI18nSection(sectionName, localeTag, defaults) {
      const normalizedLocale = String(localeTag || "").toLowerCase();
      if (normalizedLocale === "zh-cn") {
        return {
          ...JSON.parse(JSON.stringify(defaults)),
          ...(customZhPack[sectionName] || {}),
        };
      }
      if (normalizedLocale === "zh-tw") {
        return {
          ...JSON.parse(JSON.stringify(defaults)),
          ...(customZhTwPack[sectionName] || {}),
        };
      }
      return JSON.parse(JSON.stringify(defaults));
    },
  };
}

function createVisualizerLocaleHarness(options = {}) {
  const chromeMock = createChromeMock({
    storageState: options.storageState || {}
  });
  const document = new FakeDocument({
    readyState: "complete",
    lang: options.lang || "en"
  });
  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);

  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    navigator: {
      language: options.language || "en-US"
    },
    location: {
      search: options.search || ""
    },
    URLSearchParams,
    __CP_I18N_SHARED__: createI18nShared(),
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(contractPath, sandbox);
  runScriptInSandbox(corePath, sandbox);
  runScriptInSandbox(scriptPath, sandbox);

  return {
    chromeMock,
    document,
    root,
    async flush() {
      await flushMicrotasks();
      await flushMicrotasks();
      await flushMicrotasks();
    }
  };
}

async function testVisualizerUsesStoredPreferredLocaleOnDirectOpen() {
  const harness = createVisualizerLocaleHarness({
    language: "en-US",
    storageState: {
      preferred_locale: "zh-CN"
    }
  });

  await harness.flush();

  assert.equal(harness.document.title, "Claw 执行可视化");
  assert.equal(harness.document.documentElement.lang, "zh-CN");
  assert.match(String(harness.root.innerHTML || ""), /请先发起一次会话后再来此界面/);
}

async function testVisualizerRerendersWhenPreferredLocaleChanges() {
  const harness = createVisualizerLocaleHarness({
    language: "en-US",
    storageState: {
      preferred_locale: "en-US"
    }
  });

  await harness.flush();
  assert.equal(harness.document.title, "Claw Visualizer");
  assert.equal(harness.document.documentElement.lang, "en-US");

  await harness.chromeMock.storageMock.area.set({
    preferred_locale: "zh-CN"
  });
  await harness.flush();

  assert.equal(harness.document.title, "Claw 执行可视化");
  assert.equal(harness.document.documentElement.lang, "zh-CN");
}

async function testVisualizerUsesTraditionalChinesePack() {
  const harness = createVisualizerLocaleHarness({
    language: "en-US",
    storageState: {
      preferred_locale: "zh-TW"
    }
  });

  await harness.flush();

  assert.equal(harness.document.title, "Claw 執行可視化");
  assert.equal(harness.document.documentElement.lang, "zh-TW");
  assert.match(String(harness.root.innerHTML || ""), /請先發起一次會話後再來此界面/);
}

async function main() {
  await testVisualizerUsesStoredPreferredLocaleOnDirectOpen();
  await testVisualizerRerendersWhenPreferredLocaleChanges();
  await testVisualizerUsesTraditionalChinesePack();
  console.log("visualizer locale tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
