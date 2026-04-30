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

const scriptPath = path.join(__dirname, "..", "..", "src", "sidepanel", "github-update-sidepanel.js");
const customZhPack = Function(
  `"use strict"; return (${fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "i18n", "custom", "zh-CN.js"),
    "utf8",
  )});`,
)();

function normalizeVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;
    if (leftPart < rightPart) {
      return -1;
    }
    if (leftPart > rightPart) {
      return 1;
    }
  }
  return 0;
}

function createSidepanelHarness(options = {}) {
  const chromeMock = createChromeMock({
    storageState: options.storageState || {}
  });
  const rafQueue = [];
  const releaseCalls = [];
  const downloadCalls = [];
  const readState = options.state || {
    info: {
      currentVersion: "1.0.0.0",
      latestVersion: "1.1.0.0",
      hasUpdate: true,
      notes: "Bug fixes",
      publishedAt: "2026-04-18T10:00:00.000Z",
      minSupportedVersion: null
    },
    dismissedVersion: ""
  };
  const shared = {
    STORAGE_KEYS: {
      INFO: "githubUpdateInfo",
      DISMISSED_VERSION: "githubUpdateDismissedVersion"
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
    renderMarkdownToHtml(value) {
      const text = String(value || "");
      if (!text.trim()) {
        return "";
      }
      return "<h4>converted</h4><p><strong>parsed</strong></p>";
    },
    async readStoredState() {
      return JSON.parse(JSON.stringify(readState));
    },
    async openReleasePage(info) {
      releaseCalls.push(JSON.parse(JSON.stringify(info)));
      return true;
    },
    async openDownloadPage(info) {
      downloadCalls.push(JSON.parse(JSON.stringify(info)));
      return true;
    },
    isBlockedByMinVersion(currentVersion, minSupportedVersion) {
      if (!minSupportedVersion) {
        return false;
      }
      return compareVersions(currentVersion, minSupportedVersion) < 0;
    },
    normalizeVersion
  };
  const document = new FakeDocument({
    readyState: "complete"
  });
  if (options.bodyText) {
    const localeProbe = document.createElement("div");
    localeProbe.textContent = options.bodyText;
    document.body.appendChild(localeProbe);
  }
  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    navigator: {
      language: options.language || "en-US"
    },
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    setTimeout(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    window: {
      addEventListener() {}
    },
    __CP_GITHUB_UPDATE_SHARED__: shared
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(scriptPath, sandbox);

  async function flushRenders() {
    let guard = 20;
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
    downloadCalls,
    releaseCalls,
    root() {
      return document.getElementById("cp-github-update-sidepanel-root");
    },
    async flushRenders() {
      await flushRenders();
    }
  };
}

function findNode(root, predicate) {
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current && predicate(current)) {
      return current;
    }
    for (const child of current?.children || []) {
      queue.push(child);
    }
  }
  return null;
}

async function testUpdateModalAllowsSkippingDismissedVersion() {
  const harness = createSidepanelHarness({});
  await harness.flushRenders();

  const root = harness.root();
  assert.ok(root, "sidepanel root should mount");
  assert.equal(String(root.textContent || "").includes("New version available"), true);

  const skipButton = findElementByText(root, "button", "Skip this version");
  assert.ok(skipButton, "skip button should exist");
  skipButton.click();
  await harness.flushRenders();

  assert.equal(harness.chromeMock.storageMock.state.githubUpdateDismissedVersion, "1.1.0.0");
  assert.equal(harness.root().childElementCount, 0);
}

async function testBlockedModalRendersRequiredUpgradeActions() {
  const harness = createSidepanelHarness({
    state: {
      info: {
        currentVersion: "1.0.0.0",
        latestVersion: "2.0.0.0",
        hasUpdate: true,
        notes: "",
        publishedAt: "",
        minSupportedVersion: "1.5.0.0"
      },
      dismissedVersion: ""
    }
  });
  await harness.flushRenders();

  const root = harness.root();
  assert.equal(String(root.textContent || "").includes("Manual update required"), true);
  assert.equal(String(root.textContent || "").includes("Download the latest ZIP"), true);

  const releaseButton = findElementByText(root, "button", "Open release");
  const downloadButton = findElementByText(root, "button", "Download ZIP");
  assert.ok(releaseButton);
  assert.ok(downloadButton);

  releaseButton.click();
  downloadButton.click();

  assert.equal(harness.releaseCalls.length, 1);
  assert.equal(harness.downloadCalls.length, 1);
  assert.equal(harness.releaseCalls[0].latestVersion, "2.0.0.0");
}

async function testSidepanelModalFollowsUiLocaleInsteadOfNavigatorLanguage() {
  const harness = createSidepanelHarness({
    language: "en-US",
    bodyText: "最近会话"
  });
  await harness.flushRenders();

  const root = harness.root();
  assert.equal(String(root.textContent || "").includes("发现新版本"), true);
  assert.ok(findElementByText(root, "button", "跳过此版本"));
  assert.ok(findElementByText(root, "button", "下载最新版本"));
}

async function testUpdateModalRendersMarkdownNotesInsteadOfPlainMarkdown() {
  const harness = createSidepanelHarness({
    state: {
      info: {
        currentVersion: "1.0.0.0",
        latestVersion: "1.1.0.0",
        hasUpdate: true,
        notes: "#### New Features\n\n**Alias** support",
        publishedAt: "2026-04-18T10:00:00.000Z",
        minSupportedVersion: null
      },
      dismissedVersion: ""
    }
  });
  await harness.flushRenders();

  const root = harness.root();
  const notesNode = findNode(root, function (node) {
    return typeof node?.innerHTML === "string" && node.innerHTML.includes("<h4>converted</h4>");
  });

  assert.ok(notesNode, "release notes should be rendered as HTML");
  assert.equal(String(notesNode.innerHTML || "").includes("<strong>parsed</strong>"), true);
}

async function main() {
  await testUpdateModalAllowsSkippingDismissedVersion();
  await testBlockedModalRendersRequiredUpgradeActions();
  await testSidepanelModalFollowsUiLocaleInsteadOfNavigatorLanguage();
  await testUpdateModalRendersMarkdownNotesInsteadOfPlainMarkdown();
  console.log("github update sidepanel tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
