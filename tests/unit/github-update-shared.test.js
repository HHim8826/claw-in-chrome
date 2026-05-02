const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createChromeMock,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const sharedPath = path.join(__dirname, "..", "..", "src", "shared", "github-update-shared.js");
const customZhPackSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "src", "i18n", "custom", "zh-CN.js"),
  "utf8"
);

function createFixedDate(isoString) {
  const RealDate = Date;
  const fixedTime = new RealDate(isoString).getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [fixedTime]));
    }

    static now() {
      return fixedTime;
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  }
  return FixedDate;
}

function createLocaleProbeDocument(options = {}) {
  const attributes = Array.isArray(options.attributes) ? options.attributes : [];
  const nodes = attributes.map(function (entry) {
    const values = entry && typeof entry === "object" ? entry : {};
    return {
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : "";
      },
      closest(selector) {
        const ignoredSelector = String(values.ignoredSelector || "").trim();
        if (!ignoredSelector || !selector) {
          return null;
        }
        return String(selector).split(",").map(function (item) {
          return item.trim();
        }).includes(ignoredSelector) ? {
          matches: ignoredSelector
        } : null;
      }
    };
  });
  return {
    documentElement: {
      lang: options.lang || ""
    },
    body: {
      innerText: options.bodyText || "",
      textContent: options.bodyText || "",
      querySelectorAll() {
        return nodes;
      }
    }
  };
}

function createSharedHarness(options = {}) {
  const chromeMock = createChromeMock({
    manifestVersion: options.manifestVersion || "1.0.0.0",
    storageState: options.storageState || {}
  });
  const tabCreateCalls = [];
  const windowOpenCalls = [];

  if (options.enableTabCreate !== false) {
    chromeMock.chrome.tabs.create = async payload => {
      tabCreateCalls.push(payload);
      return {
        id: 501
      };
    };
  } else {
    delete chromeMock.chrome.tabs.create;
  }

  const sandbox = {
    console,
    Date: options.DateImpl || Date,
    Function: options.FunctionImpl || Function,
    URL,
    chrome: chromeMock.chrome,
    fetch: options.fetch,
    window: {
      open(url, target, features) {
        windowOpenCalls.push({
          url,
          target,
          features
        });
        return options.windowOpenResult === undefined ? true : options.windowOpenResult;
      }
    }
  };
  sandbox.globalThis = sandbox;
  runScriptInSandbox(sharedPath, sandbox);

  return {
    chromeMock,
    shared: sandbox.__CP_GITHUB_UPDATE_SHARED__,
    tabCreateCalls,
    windowOpenCalls
  };
}

function testVersionHelpersAndSummaries() {
  const { shared } = createSharedHarness({});

  assert.equal(shared.normalizeVersion(" v1.2.3.4 "), "1.2.3.4");
  assert.equal(shared.isValidVersion("1.2.3.4"), true);
  assert.equal(shared.isValidVersion("1.2.3"), false);
  assert.equal(shared.compareVersions("1.2.3.4", "1.2.3.5"), -1);
  assert.equal(shared.compareVersions("1.2.3.5", "1.2.3.4"), 1);
  assert.equal(shared.compareVersions("1.2.3.4", "1.2.3.4"), 0);
  assert.equal(shared.computeHasUpdate("1.2.3.4", "1.2.3.5"), true);
  assert.equal(shared.computeHasUpdate("1.2.3.4", "1.2.3.4"), false);
  assert.equal(shared.computeHasUpdate("bad-version", "1.2.3.4"), false);
  assert.equal(shared.isBlockedByMinVersion("1.2.3.4", "1.2.4.0"), true);
  assert.equal(shared.isBlockedByMinVersion("1.2.4.0", "1.2.3.4"), false);
  assert.equal(shared.summarizeNotes("line1\r\nline2", 64), "line1\nline2");
  assert.equal(shared.summarizeNotes("abcdef", 4), "abcd...");
  assert.equal(shared.formatTimestamp("not-a-date"), "not-a-date");
}

function testMarkdownRendererProducesSafeStructuredHtml() {
  const { shared } = createSharedHarness({});

  const html = shared.renderMarkdownToHtml([
    "#### New Features",
    "",
    "**Alias** support with [release link](https://example.com/release)",
    "",
    "- First item",
    "- Second item",
    "",
    "<script>alert(1)</script>"
  ].join("\n"));

  assert.match(html, /<h4>New Features<\/h4>/);
  assert.match(html, /<strong>Alias<\/strong>/);
  assert.match(html, /<a href="https:\/\/example\.com\/release" target="_blank" rel="noopener noreferrer">release link<\/a>/);
  assert.match(html, /<ul><li>First item<\/li><li>Second item<\/li><\/ul>/);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
}

function testNormalizeStoredInfoUsesAliasesAndDefaults() {
  const { shared } = createSharedHarness({});

  const normalized = shared.normalizeStoredInfo({
    version: "v1.9.0.0",
    release_url: "https://example.com/release",
    notes: "  Bug fixes  ",
    published_at: "2026-03-01T00:00:00.000Z",
    min_supported_version: "v1.8.0.0",
    last_checked_at: "2026-03-02T00:00:00.000Z",
    source: "remote-feed"
  }, "1.8.5.0");

  assert.equal(normalized.currentVersion, "1.8.5.0");
  assert.equal(normalized.latestVersion, "1.9.0.0");
  assert.equal(normalized.hasUpdate, true);
  assert.equal(normalized.releaseUrl, "https://example.com/release");
  assert.equal(
    normalized.downloadUrl,
    "https://github.com/HHim8826/claw-in-chrome/releases/download/v1.9.0.0/claw-in-chrome-v1.9.0.0.zip"
  );
  assert.equal(normalized.notes, "Bug fixes");
  assert.equal(normalized.publishedAt, "2026-03-01T00:00:00.000Z");
  assert.equal(normalized.minSupportedVersion, "1.8.0.0");
  assert.equal(normalized.lastCheckedAt, "2026-03-02T00:00:00.000Z");
  assert.equal(normalized.source, "remote-feed");

  const fallbackInfo = shared.normalizeStoredInfo({
    latestVersion: "not-valid"
  }, "1.0.0.0");
  assert.equal(fallbackInfo.latestVersion, "");
  assert.equal(
    fallbackInfo.releaseUrl,
    "https://github.com/HHim8826/claw-in-chrome/releases/latest"
  );
  assert.equal(fallbackInfo.downloadUrl, "");
}

function testNormalizeLatestPayloadUsesFixedClockAndValidatesVersion() {
  const { shared } = createSharedHarness({
    DateImpl: createFixedDate("2026-04-19T02:30:00.000Z")
  });

  const normalized = shared.normalizeLatestPayload({
    version: "v2.0.0.0",
    notes: "  New major release  ",
    min_supported_version: "1.5.0.0"
  }, "1.9.9.0");

  assert.equal(normalized.currentVersion, "1.9.9.0");
  assert.equal(normalized.latestVersion, "2.0.0.0");
  assert.equal(normalized.hasUpdate, true);
  assert.equal(
    normalized.releaseUrl,
    "https://github.com/HHim8826/claw-in-chrome/releases/tag/v2.0.0.0"
  );
  assert.equal(
    normalized.downloadUrl,
    "https://github.com/HHim8826/claw-in-chrome/releases/download/v2.0.0.0/claw-in-chrome-v2.0.0.0.zip"
  );
  assert.equal(normalized.notes, "New major release");
  assert.equal(normalized.minSupportedVersion, "1.5.0.0");
  assert.equal(normalized.lastCheckedAt, "2026-04-19T02:30:00.000Z");
  assert.equal(normalized.source, "github_release_json");

  assert.throws(() => {
    shared.normalizeLatestPayload({
      version: "invalid"
    }, "1.0.0.0");
  }, /有效版本号/);
}

function testLocaleReadersIncludeAccessibleUiAttributes() {
  const { shared } = createSharedHarness({});
  const document = createLocaleProbeDocument({
    attributes: [{
      placeholder: "输入 / 查看命令"
    }, {
      title: "Recent sessions"
    }, {
      "aria-label": "应被忽略的中文",
      ignoredSelector: "#ignored-root"
    }]
  });

  assert.equal(
    shared.readDocumentText({
      document,
      ignoredSelectors: ["#ignored-root"]
    }),
    "输入 / 查看命令 Recent sessions"
  );

  assert.equal(shared.detectUiLocaleKey({
    document,
    navigatorLanguage: "en-US",
    ignoredSelectors: ["#ignored-root"],
    zhPageHints: ["输入 / 查看命令"],
    enPagePatterns: [/\bRecent sessions\b/i]
  }), "zh");
}

function testExplicitDocumentLocaleTagWinsOverBrowserLanguage() {
  const { shared } = createSharedHarness({});
  const document = createLocaleProbeDocument({
    lang: "en-US"
  });
  document.documentElement.dataset = {
    cpUiLocale: "zh-CN"
  };

  assert.equal(
    shared.getUiLocaleTag({
      document,
      navigatorLanguage: "en-US"
    }),
    "zh-CN"
  );
}

function testTraditionalChineseLocaleHelpers() {
  const { shared } = createSharedHarness({});

  assert.equal(shared.normalizeUiLocaleTag("zh-TW"), "zh-TW");
  assert.equal(shared.normalizeUiLocaleTag("zh-Hant-HK"), "zh-TW");
  assert.equal(
    JSON.stringify(shared.getCustomLocaleResolutionChain("zh-TW")),
    JSON.stringify(["zh-CN", "zh-TW"])
  );
}

async function testCustomI18nPackLoadsWithoutUnsafeEval() {
  const { shared } = createSharedHarness({
    fetch: async function () {
      return {
        ok: true,
        async text() {
          return customZhPackSource;
        }
      };
    },
    FunctionImpl() {
      throw new Error("unsafe-eval is blocked by CSP");
    }
  });

  const pack = await shared.loadCustomI18nPack("zh-CN");
  assert.equal(pack?.customProvider?.providerName, "模型供应商");

  const section = await shared.resolveCustomI18nSection("customProvider", "zh-CN", {
    providerName: "Model provider",
    newProfile: "New profile",
    healthCheck: "Health check",
    reasoningEffortLabel: "Reasoning effort",
    fastModelLabel: "Fast model"
  });
  assert.equal(section.providerName, "模型供应商");
  assert.equal(section.newProfile, "新增配置");
  assert.equal(section.healthCheck, "健康检测");
  assert.equal(section.reasoningEffortLabel, "思考深度");
  assert.equal(section.fastModelLabel, "快速模型");
}

async function testReadStoredStateAndOpenPagesUseChromeTabs() {
  const { shared, tabCreateCalls } = createSharedHarness({
    manifestVersion: "3.0.0.0",
    storageState: {
      githubUpdateInfo: {
        version: "3.1.0.0",
        release_url: "https://example.com/release-310",
        download_url: "https://example.com/download-310"
      },
      githubUpdateDismissedVersion: "3.0.5.0",
      githubUpdateAutoCheckEnabled: false,
      githubUpdateSeenVersion: "3.0.8.0",
      githubUpdatePreviousVersion: "2.9.9.0"
    }
  });

  const state = await shared.readStoredState();

  assert.equal(state.info.currentVersion, "3.0.0.0");
  assert.equal(state.info.latestVersion, "3.1.0.0");
  assert.equal(state.dismissedVersion, "3.0.5.0");
  assert.equal(state.autoCheckEnabled, false);
  assert.equal(state.seenVersion, "3.0.8.0");
  assert.equal(state.previousVersion, "2.9.9.0");

  await shared.openReleasePage();
  await shared.openDownloadPage({
    latestVersion: "3.1.0.0",
    releaseUrl: "https://example.com/release-custom",
    downloadUrl: "https://example.com/download-custom"
  });

  assert.deepEqual(JSON.parse(JSON.stringify(tabCreateCalls)), [{
    url: "https://example.com/release-310"
  }, {
    url: "https://example.com/download-custom"
  }]);
}

async function testOpenUrlFallsBackToWindowOpen() {
  const { shared, windowOpenCalls } = createSharedHarness({
    enableTabCreate: false,
    windowOpenResult: {
      closed: false
    }
  });

  const opened = await shared.openUrl("https://example.com/fallback");
  const blocked = await shared.openUrl("");

  assert.equal(opened, true);
  assert.equal(blocked, false);
  assert.deepEqual(windowOpenCalls, [{
    url: "https://example.com/fallback",
    target: "_blank",
    features: "noopener"
  }]);
}

async function main() {
  testVersionHelpersAndSummaries();
  testMarkdownRendererProducesSafeStructuredHtml();
  testNormalizeStoredInfoUsesAliasesAndDefaults();
  testNormalizeLatestPayloadUsesFixedClockAndValidatesVersion();
  testLocaleReadersIncludeAccessibleUiAttributes();
  testExplicitDocumentLocaleTagWinsOverBrowserLanguage();
  testTraditionalChineseLocaleHelpers();
  await testCustomI18nPackLoadsWithoutUnsafeEval();
  await testReadStoredStateAndOpenPagesUseChromeTabs();
  await testOpenUrlFallsBackToWindowOpen();
  console.log("github update shared tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
