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
  FakeMutationObserver,
  findElementByText
} = require("../helpers/fake-dom");

const scriptPath = path.join(__dirname, "..", "..", "src", "options", "github-update-options.js");
const optionsEnhancerPath = path.join(
  __dirname,
  "..",
  "..",
  "src",
  "options",
  "options-update-enhancer.js"
);
const customZhPack = Function(
  `"use strict"; return (${fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "i18n", "custom", "zh-CN.js"),
    "utf8",
  )});`,
)();

function createOptionsHarness(options = {}) {
  const chromeMock = createChromeMock({
    storageState: options.storageState || {}
  });
  const rafQueue = [];
  const windowListeners = new Map();
  const runtimeMessages = [];
  const releaseCalls = [];
  const downloadCalls = [];
  const document = new FakeDocument({
    readyState: "complete"
  });
  if (options.bodyText) {
    const localeProbe = document.createElement("div");
    localeProbe.textContent = options.bodyText;
    document.body.appendChild(localeProbe);
  }
  const anchor = document.createElement("div");
  anchor.id = "cp-github-update-options-anchor";
  document.body.appendChild(anchor);

  const state = options.state || {
    info: {
      currentVersion: "1.0.0.0",
      latestVersion: "1.1.0.0",
      hasUpdate: true,
      lastCheckedAt: "2026-04-19T00:00:00.000Z",
      notes: "Release notes"
    },
    autoCheckEnabled: true
  };
  const shared = {
    STORAGE_KEYS: {
      INFO: "githubUpdateInfo",
      AUTO_CHECK_ENABLED: "githubUpdateAutoCheckEnabled"
    },
    MESSAGE_TYPES: {
      CHECK_NOW: "CP_GITHUB_UPDATE_CHECK_NOW"
    },
    detectUiLocaleKey(context = {}) {
      const pageText = String(context.document?.body?.innerText || context.document?.body?.textContent || "");
      if (Array.isArray(context.zhPageHints) && context.zhPageHints.some(hint => hint && pageText.includes(String(hint)))) {
        return "zh";
      }
      if (Array.isArray(context.enPagePatterns) && context.enPagePatterns.some(pattern => pattern instanceof RegExp && pattern.test(pageText))) {
        return "en";
      }
      const htmlLang = String(context.document?.documentElement?.lang || "").toLowerCase();
      if (htmlLang.startsWith("zh")) {
        return "zh";
      }
      if (htmlLang.startsWith("en")) {
        return "en";
      }
      return String(context.navigatorLanguage || "").toLowerCase().startsWith("zh") ? "zh" : "en";
    },
    getUiLocaleTag(context = {}) {
      const pageText = String(context.document?.body?.innerText || context.document?.body?.textContent || "");
      if (Array.isArray(context.zhPageHints) && context.zhPageHints.some(hint => hint && pageText.includes(String(hint)))) {
        return "zh-CN";
      }
      if (Array.isArray(context.enPagePatterns) && context.enPagePatterns.some(pattern => pattern instanceof RegExp && pattern.test(pageText))) {
        return "en-US";
      }
      const htmlLang = String(context.document?.documentElement?.lang || "").toLowerCase();
      if (htmlLang.startsWith("zh")) {
        return "zh-CN";
      }
      if (htmlLang.startsWith("en")) {
        return "en-US";
      }
      return String(context.navigatorLanguage || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
    },
    cloneLocaleValue(value) {
      return JSON.parse(JSON.stringify(value));
    },
    normalizeUiLocaleTag(value) {
      const locale = String(value || "").trim().toLowerCase();
      if (!locale) {
        return "";
      }
      return locale.startsWith("zh") ? "zh-CN" : "en-US";
    },
    async resolveCustomI18nSection(sectionName, localeTag, defaults) {
      if (String(localeTag || "").toLowerCase() === "zh-cn") {
        return {
          ...JSON.parse(JSON.stringify(defaults)),
          ...(customZhPack[sectionName] || {}),
        };
      }
      return JSON.parse(JSON.stringify(defaults));
    },
    formatTimestamp(value) {
      return `fmt:${value}`;
    },
    summarizeNotes(value) {
      return String(value || "");
    },
    async readStoredState() {
      return JSON.parse(JSON.stringify(state));
    },
    async openReleasePage(info) {
      releaseCalls.push(JSON.parse(JSON.stringify(info)));
      return true;
    },
    async openDownloadPage(info) {
      downloadCalls.push(JSON.parse(JSON.stringify(info)));
      return true;
    }
  };

  chromeMock.chrome.runtime.sendMessage = (message, callback) => {
    runtimeMessages.push(JSON.parse(JSON.stringify(message)));
    chromeMock.chrome.runtime.lastError = options.runtimeLastError ? {
      message: options.runtimeLastError
    } : undefined;
    if (typeof callback === "function") {
      callback(options.runtimeResponse || {
        ok: true
      });
    }
    chromeMock.chrome.runtime.lastError = undefined;
  };

  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    navigator: {
      language: options.language || "en-US"
    },
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    setTimeout(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    URLSearchParams,
    window: {
      location: {
        hash: options.hash || "#options"
      },
      addEventListener(type, listener) {
        const current = windowListeners.get(type) || [];
        current.push(listener);
        windowListeners.set(type, current);
      }
    },
    __CP_GITHUB_UPDATE_SHARED__: shared
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(scriptPath, sandbox);

  async function flushRenders() {
    await flushMicrotasks();
    await flushMicrotasks();
    let guard = 30;
    while (rafQueue.length > 0 && guard > 0) {
      guard -= 1;
      const batch = rafQueue.splice(0);
      for (const callback of batch) {
        callback();
        await flushMicrotasks();
        await flushMicrotasks();
      }
    }
  }

  return {
    chromeMock,
    document,
    runtimeMessages,
    downloadCalls,
    releaseCalls,
    root() {
      return document.getElementById("cp-github-update-options-root");
    },
    async dispatchHashChange(nextHash) {
      sandbox.window.location.hash = nextHash;
      for (const listener of windowListeners.get("hashchange") || []) {
        listener();
      }
      await flushRenders();
    },
    async flushRenders() {
      await flushRenders();
    }
  };
}

function createUpdateEnhancerHarness(options = {}) {
  const chromeMock = createChromeMock({
    storageState: {
      customProviderAllowHttp: true,
      incognitoMode: false,
      ...(options.storageState || {})
    }
  });
  const rafQueue = [];
  const windowListeners = new Map();
  const document = new FakeDocument({ readyState: "complete" });

  const updatePanel = document.createElement("section");
  updatePanel.className =
    "cp-page-card cp-page-panel bg-bg-100 border border-border-300 rounded-xl";
  const title = document.createElement("h3");
  title.className = "cp-page-heading text-text-100 font-xl-bold";
  title.textContent = "Extension updates";
  const autoRow = document.createElement("div");
  autoRow.className = "cp-page-row";
  const autoCopy = document.createElement("div");
  autoCopy.className = "cp-page-row-copy";
  const autoTitle = document.createElement("div");
  autoTitle.className = "cp-page-row-title";
  autoTitle.textContent = "Auto-check updates";
  autoCopy.appendChild(autoTitle);
  autoRow.appendChild(autoCopy);
  autoRow.appendChild(document.createElement("div"));
  updatePanel.appendChild(title);
  updatePanel.appendChild(autoRow);
  document.body.appendChild(updatePanel);

  const shared = {
    STORAGE_KEYS: {
      INFO: "githubUpdateInfo",
      AUTO_CHECK_ENABLED: "githubUpdateAutoCheckEnabled"
    },
    detectUiLocaleKey() {
      return "en";
    },
    getUiLocaleTag() {
      return "en-US";
    },
    cloneLocaleValue(value) {
      return JSON.parse(JSON.stringify(value));
    },
    normalizeUiLocaleTag(value) {
      return String(value || "").trim() || "en-US";
    },
    async resolveCustomI18nSection(_sectionName, _localeTag, defaults) {
      return JSON.parse(JSON.stringify(defaults));
    },
    async readStoredState() {
      return {
        info: {
          currentVersion: "1.0.0.0",
          latestVersion: "1.0.0.0",
          notes: ""
        },
        autoCheckEnabled: true
      };
    },
    async openReleasePage() {
      return true;
    }
  };

  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    navigator: { language: options.language || "en-US" },
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    setTimeout(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    URLSearchParams,
    window: {
      location: { hash: options.hash || "#options" },
      addEventListener(type, listener) {
        const current = windowListeners.get(type) || [];
        current.push(listener);
        windowListeners.set(type, current);
      }
    },
    __CP_GITHUB_UPDATE_SHARED__: shared,
    __CP_CONTRACT__: {
      ui: { INCOGNITO_MODE_STORAGE_KEY: "incognitoMode" },
      customProvider: {
        HTTP_PROVIDER_STORAGE_KEY: "customProviderAllowHttp",
        HTTP_PROVIDER_MIGRATED_KEY: "customProviderAllowHttpMigrated"
      }
    }
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(optionsEnhancerPath, sandbox);

  async function flushRenders() {
    await flushMicrotasks();
    await flushMicrotasks();
    let guard = 30;
    while (rafQueue.length > 0 && guard > 0) {
      guard -= 1;
      const batch = rafQueue.splice(0);
      for (const callback of batch) {
        callback();
        await flushMicrotasks();
        await flushMicrotasks();
      }
    }
  }

  return {
    chromeMock,
    document,
    updatePanel,
    async flushRenders() {
      await flushRenders();
    }
  };
}

async function testOptionsCardSupportsCheckNowAndAutoToggle() {
  const harness = createOptionsHarness({});
  await harness.flushRenders();

  const root = harness.root();
  assert.ok(root, "options update card should render");
  assert.equal(String(root.textContent || "").includes("Extension updates"), true);

  const checkNowButton = findElementByText(root, "button", "Check now");
  assert.ok(checkNowButton, "check now button should exist");
  checkNowButton.click();
  await harness.flushRenders();

  assert.deepEqual(harness.runtimeMessages, [{
    type: "CP_GITHUB_UPDATE_CHECK_NOW"
  }]);
  assert.equal(String(root.textContent || "").includes("Release metadata refreshed."), true);

  const toggleButton = root.querySelector("[aria-label='Auto-check updates']");
  assert.ok(toggleButton, "auto-check toggle should exist");
  toggleButton.click();
  await harness.flushRenders();

  assert.equal(harness.chromeMock.storageMock.state.githubUpdateAutoCheckEnabled, false);
  assert.equal(String(root.textContent || "").includes("Automatic update checks disabled."), true);
}

async function testOptionsCardSupportsReleaseDownloadAndHashRemoval() {
  const harness = createOptionsHarness({});
  await harness.flushRenders();

  const root = harness.root();
  findElementByText(root, "button", "Download ZIP").click();
  findElementByText(root, "button", "Open release").click();

  assert.equal(harness.downloadCalls.length, 1);
  assert.equal(harness.releaseCalls.length, 1);
  assert.equal(harness.downloadCalls[0].latestVersion, "1.1.0.0");

  await harness.dispatchHashChange("#permissions");
  assert.equal(harness.root(), null);
}

async function testOptionsCardFollowsOptionsUiLocaleInsteadOfNavigatorLanguage() {
  const harness = createOptionsHarness({
    language: "en-US",
    bodyText: "Claw in Chrome 设置 扩展更新 选项"
  });
  await harness.flushRenders();

  const root = harness.root();
  assert.ok(root, "options update card should render for Chinese UI");
  assert.equal(String(root.textContent || "").includes("扩展更新"), true);
  assert.ok(findElementByText(root, "button", "立即检查更新"));
  assert.ok(findElementByText(root, "button", "下载最新版本"));
}

async function testOptionsEnhancerPlacesIncognitoBetweenUpdateAndHttp() {
  const harness = createUpdateEnhancerHarness({});
  await harness.flushRenders();

  const incognitoPanel = harness.document.getElementById(
    "cp-options-incognito-mode-panel"
  );
  const httpPanel = harness.document.getElementById(
    "cp-options-http-provider-panel"
  );
  assert.ok(incognitoPanel, "incognito mode panel should render");
  assert.ok(httpPanel, "HTTP panel should still render");
  assert.equal(
    harness.updatePanel.nextElementSibling.id,
    "cp-options-incognito-mode-anchor"
  );
  assert.equal(
    harness.updatePanel.nextElementSibling.nextElementSibling,
    incognitoPanel,
    "incognito mode panel should sit directly below the update panel"
  );
  assert.equal(
    incognitoPanel.nextElementSibling.nextElementSibling,
    httpPanel,
    "HTTP panel should sit below the incognito mode panel"
  );

  const toggleButton = incognitoPanel.querySelector(
    "[aria-label='Incognito mode']"
  );
  assert.ok(toggleButton, "incognito mode toggle should exist");
  assert.equal(toggleButton.getAttribute("aria-checked"), "false");
  toggleButton.click();
  await harness.flushRenders();

  const updatedToggle = harness.document
    .getElementById("cp-options-incognito-mode-panel")
    .querySelector("[aria-label='Incognito mode']");
  assert.equal(harness.chromeMock.storageMock.state.incognitoMode, true);
  assert.equal(updatedToggle.getAttribute("aria-checked"), "true");
}

async function main() {
  await testOptionsCardSupportsCheckNowAndAutoToggle();
  await testOptionsCardSupportsReleaseDownloadAndHashRemoval();
  await testOptionsCardFollowsOptionsUiLocaleInsteadOfNavigatorLanguage();
  await testOptionsEnhancerPlacesIncognitoBetweenUpdateAndHttp();
  console.log("github update options tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
