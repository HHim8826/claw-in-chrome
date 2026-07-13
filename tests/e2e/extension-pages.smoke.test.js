const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const repoRoot = path.join(__dirname, "..", "..");
const extensionRoot = process.env.CLAW_EXTENSION_ROOT
  ? path.resolve(process.env.CLAW_EXTENSION_ROOT)
  : path.join(repoRoot, "src");
const artifactRoot = process.env.CLAW_E2E_ARTIFACT_DIR
  ? path.resolve(process.env.CLAW_E2E_ARTIFACT_DIR)
  : path.join(os.tmpdir(), "claw-extension-e2e-artifacts");
const manifestPath = path.join(extensionRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function writeFailureArtifact(name, content) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const artifactPath = path.join(artifactRoot, name);
  fs.writeFileSync(artifactPath, content);
  console.error(`Saved E2E failure artifact: ${artifactPath}`);
}

function findBrowserExecutable() {
  const envPath = process.env.CLAW_E2E_BROWSER_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  return null;
}

function computeExtensionIdFromKey(publicKeyBase64) {
  const publicKeyBytes = Buffer.from(String(publicKeyBase64 || "").trim(), "base64");
  const digest = crypto.createHash("sha256").update(publicKeyBytes).digest("hex").slice(0, 32);
  return digest.split("").map((char) => String.fromCharCode("a".charCodeAt(0) + Number.parseInt(char, 16))).join("");
}

async function launchExtensionContext() {
  const browserPath = findBrowserExecutable();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-extension-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ...(browserPath ? {
      executablePath: browserPath
    } : {}),
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
    ]
  });
  return {
    browserPath,
    userDataDir,
    context
  };
}

async function closeExtensionContext(contextInfo) {
  try {
    await contextInfo.context.close();
  } finally {
    fs.rmSync(contextInfo.userDataDir, {
      recursive: true,
      force: true
    });
  }
}

async function waitForExtensionServiceWorker(context, extensionId) {
  const existing = context.serviceWorkers().find((worker) => worker.url().startsWith(`chrome-extension://${extensionId}/`));
  if (existing) {
    return existing;
  }
  try {
    return await context.waitForEvent("serviceworker", {
      timeout: 5000,
      predicate: (worker) => worker.url().startsWith(`chrome-extension://${extensionId}/`)
    });
  } catch {
    return null;
  }
}

async function capturePageErrors(page, action) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error || ""));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", req => {
    consoleErrors.push(`Failed to load ${req.url()}: ${req.failure().errorText}`);
  });
  await action({
    pageErrors,
    consoleErrors
  });
  return {
    pageErrors,
    consoleErrors
  };
}

async function testExtensionPagesLoad() {
  const extensionId = computeExtensionIdFromKey(manifest.key);
  const contextInfo = await launchExtensionContext();
  try {
    const optionsPage = await contextInfo.context.newPage();
    const optionsResult = await capturePageErrors(optionsPage, async () => {
      await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`, {
        waitUntil: "domcontentloaded"
      });
      await optionsPage.waitForFunction(() => {
        return Boolean(document.querySelector("#root")) &&
          Boolean(globalThis.__CP_GITHUB_UPDATE_SHARED__) &&
          Boolean(globalThis.CustomProviderModels);
      }, null, {
        timeout: 15000
      });
    });

    console.log("OPTIONS CONSOLE ERRORS:", optionsResult.consoleErrors);
    console.log("OPTIONS PAGE ERRORS:", optionsResult.pageErrors);
    assert.equal(await optionsPage.title(), "Claw in Chrome Options");
    const optionsManifest = await optionsPage.evaluate(async () => {
      await chrome.storage.local.set({
        __claw_e2e_options: "ok"
      });
      const stored = await chrome.storage.local.get("__claw_e2e_options");
      return {
        runtimeId: chrome.runtime.id,
        name: chrome.runtime.getManifest().name,
        version: chrome.runtime.getManifest().version,
        stored: stored.__claw_e2e_options
      };
    });
    assert.equal(optionsManifest.runtimeId, extensionId);
    assert.equal(optionsManifest.name, manifest.name);
    assert.equal(optionsManifest.version, manifest.version);
    assert.equal(optionsManifest.stored, "ok");
    assert.deepEqual(optionsResult.pageErrors, []);
    assert.deepEqual(optionsResult.consoleErrors, []);

    const visualizerEmptyPage = await contextInfo.context.newPage();
    const emptyVisualizerResult = await capturePageErrors(visualizerEmptyPage, async () => {
      await visualizerEmptyPage.goto(`chrome-extension://${extensionId}/visualizer/visualizer.html`, {
        waitUntil: "domcontentloaded"
      });
      await visualizerEmptyPage.waitForSelector("[data-cpv-app='ready']", {
        timeout: 15000
      });
    });
    console.log("VISUALIZER TITLE:", await visualizerEmptyPage.title());
    console.log("VISUALIZER ERRORS:", emptyVisualizerResult);
    assert.equal(/Claw (Visualizer|执行可视化|執行可視化)/.test(await visualizerEmptyPage.title()), true);
    assert.deepEqual(emptyVisualizerResult.pageErrors, []);
    await visualizerEmptyPage.close();

    await optionsPage.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        githubUpdateInfo: {
          currentVersion: "1.0.66.7",
          latestVersion: "1.0.67.0",
          hasUpdate: true,
          releaseUrl: "https://example.com/releases/v1.0.67.0",
          downloadUrl: "https://example.com/downloads/claw-in-chrome-v1.0.67.0.zip",
          notes: "### ✨ 新增功能 (Features)\n\n* **状态显示**：新增上下文使用情况的可视化控件，方便实时监控当前会话的上下文占用。\n* **模型适配**：完成对 DeepSeek 模型的接入与适配。\n\n### 🐛 问题修复 (Bug Fixes)\n* **核心功能**：修复了在执行上下文压缩时的报错问题。",
          publishedAt: "2026-04-30T00:00:00.000Z",
          minSupportedVersion: null,
          lastCheckedAt: "2026-04-30T15:22:33.000Z",
          source: "e2e"
        },
        githubUpdateDismissedVersion: "",
        githubUpdateAutoCheckEnabled: true,
        "claw.chat.scopes.e2e-scope.activeSession": {
          meta: {
            id: "e2e-session",
            scopeId: "e2e-scope",
            title: "搜索执行流",
            updatedAt: Date.now(),
            createdAt: Date.now() - 1000,
            selectedModel: "gpt-5.4",
            currentUrl: "https://example.com/search"
          },
          messages: [{
            role: "user",
            content: [{
              type: "text",
              text: "帮我搜索蓝牙耳机"
            }]
          }, {
            role: "assistant",
            content: [{
              type: "text",
              text: "我先读取页面结构。"
            }, {
              type: "tool_use",
              id: "tool-read",
              name: "read_page",
              input: {
                depth: 2
              }
            }]
          }, {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: "tool-read",
              content: [{
                type: "text",
                text: "页面里有搜索框"
              }]
            }]
          }, {
            role: "assistant",
            content: [{
              type: "tool_use",
              id: "turn-1",
              name: "turn_answer_start",
              input: {}
            }, {
              type: "text",
              text: "我已经找到搜索入口。"
            }]
          }]
        },
        "claw.chat.scopes.e2e-scope.index": [{
          id: "e2e-session",
          scopeId: "e2e-scope",
          updatedAt: Date.now(),
          title: "搜索执行流"
        }],
        "claw.chat.scopes.e2e-scope.byId.e2e-session": {
          meta: {
            id: "e2e-session",
            scopeId: "e2e-scope",
            title: "搜索执行流",
            updatedAt: Date.now(),
            createdAt: Date.now() - 1000,
            selectedModel: "gpt-5.4",
            currentUrl: "https://example.com/search"
          },
          messages: [{
            role: "user",
            content: [{
              type: "text",
              text: "帮我搜索蓝牙耳机"
            }]
          }, {
            role: "assistant",
            content: [{
              type: "text",
              text: "我先读取页面结构。"
            }, {
              type: "tool_use",
              id: "tool-read",
              name: "read_page",
              input: {
                depth: 2
              }
            }]
          }, {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: "tool-read",
              content: [{
                type: "text",
                text: "页面里有搜索框"
              }]
            }]
          }, {
            role: "assistant",
            content: [{
              type: "tool_use",
              id: "turn-1",
              name: "turn_answer_start",
              input: {}
            }, {
              type: "text",
              text: "我已经找到搜索入口。"
            }]
          }]
        }
      });
    });

    // small delay for storage event to be processed by React if needed
    await optionsPage.waitForTimeout(500);

    await optionsPage.evaluate(() => {
      window.location.hash = "options";
    });
    await optionsPage.waitForSelector("#cp-data-insights-root", {
      timeout: 15000
    });
    await optionsPage.waitForFunction(() => {
      const panel = document.querySelector("#cp-data-insights-root");
      return Boolean(panel) &&
        /Data and insights|数据与洞察|資料與洞察/.test(panel.textContent || "");
    }, null, {
      timeout: 15000
    });
    const optionsInsightsDesktop = await optionsPage.evaluate(() => {
      const panel = document.querySelector("#cp-data-insights-root");
      const grid = panel.querySelector(".cp-data-insights-grid");
      const metric = panel.querySelector(".cp-data-insights-metric");
      const metricValue = panel.querySelector(".cp-data-insights-metric-value");
      const style = getComputedStyle(panel);
      const metricStyle = getComputedStyle(metric);
      const metricValueStyle = getComputedStyle(metricValue);
      return {
        parentId: panel.parentElement?.id || "",
        backgroundColor: style.backgroundColor,
        borderStyle: style.borderStyle,
        panelWidth: panel.getBoundingClientRect().width,
        viewportWidth: document.documentElement.clientWidth,
        gridDisplay: getComputedStyle(grid).display,
        metricBorderColor: metricStyle.borderColor,
        metricBorderRadius: Number.parseFloat(metricStyle.borderRadius),
        metricValueFontSize: metricValueStyle.fontSize,
        metricValueFontWeight: Number(metricValueStyle.fontWeight),
      };
    });
    assert.equal(optionsInsightsDesktop.parentId, "cp-options-debug-anchor");
    assert.notEqual(optionsInsightsDesktop.backgroundColor, "rgba(0, 0, 0, 0)");
    assert.notEqual(optionsInsightsDesktop.borderStyle, "none");
    assert.equal(optionsInsightsDesktop.gridDisplay, "grid");
    assert.equal(optionsInsightsDesktop.metricBorderRadius >= 14, true);
    assert.equal(optionsInsightsDesktop.metricValueFontSize, "14px");
    assert.equal(optionsInsightsDesktop.metricValueFontWeight <= 500, true);
    const metricBorderAlpha = Number.parseFloat(
      optionsInsightsDesktop.metricBorderColor.match(/,\s*([\d.]+)\)$/)?.[1] ?? "1",
    );
    assert.equal(metricBorderAlpha >= 0.1 && metricBorderAlpha < 0.4, true);
    assert.equal(
      optionsInsightsDesktop.panelWidth <= optionsInsightsDesktop.viewportWidth,
      true,
    );
    await optionsPage.setViewportSize({ width: 320, height: 800 });
    const optionsInsightsThemes = [];
    for (const mode of ["light", "dark"]) {
      optionsInsightsThemes.push(await optionsPage.evaluate((nextMode) => {
        document.documentElement.dataset.mode = nextMode;
        const panel = document.querySelector("#cp-data-insights-root");
        const actions = panel.querySelector(".cp-data-insights-actions");
        return {
          mode: nextMode,
          backgroundColor: getComputedStyle(panel).backgroundColor,
          viewportWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          panelRight: panel.getBoundingClientRect().right,
          actionsRight: actions.getBoundingClientRect().right,
        };
      }, mode));
    }
    for (const evidence of optionsInsightsThemes) {
      assert.notEqual(evidence.backgroundColor, "rgba(0, 0, 0, 0)");
      assert.equal(evidence.bodyScrollWidth <= evidence.viewportWidth, true);
      assert.equal(evidence.panelRight <= evidence.viewportWidth, true);
      assert.equal(evidence.actionsRight <= evidence.viewportWidth, true);
    }
    await optionsPage.setViewportSize({ width: 1280, height: 800 });
    try {
      await optionsPage.waitForSelector("[data-cp-visualizer-launch]", {
        timeout: 15000
      });
    } catch (err) {
      try {
        if (!optionsPage.isClosed()) {
          writeFailureArtifact("options-page.html", await optionsPage.content());
        }
      } catch (e) {
        console.error("Failed to dump scratch.html:", e.message);
      }
      throw err;
    }
    await optionsPage.waitForSelector("#cp-options-http-provider-panel", {
      timeout: 15000
    });
    await optionsPage.waitForFunction(() => {
      const panel = document.querySelector("#cp-options-http-provider-panel");
      return Boolean(panel) &&
        /HTTP Protocol|HTTP 协议|HTTP 協議/.test(panel.textContent || "");
    }, null, {
      timeout: 15000
    });
    assert.equal(await optionsPage.locator("#cp-options-http-provider-panel").count(), 1);
    assert.equal(await optionsPage.getByRole("switch", {
      name: /Allow HTTP Protocol|允许 HTTP 协议|允許 HTTP 協議/
    }).count(), 1);

    const launchedVisualizerPagePromise = contextInfo.context.waitForEvent("page", {
      timeout: 15000
    });
    await optionsPage.click("[data-cp-visualizer-launch]");
    const visualizerPage = await launchedVisualizerPagePromise;
    await visualizerPage.waitForLoadState("domcontentloaded");
    assert.equal(visualizerPage.url().includes("/visualizer/visualizer.html"), true);

    const visualizerResult = await capturePageErrors(visualizerPage, async () => {
      try {
        await visualizerPage.waitForSelector("[data-cpv-app='ready']", {
          timeout: 15000
        });
        await visualizerPage.waitForFunction(() => {
          return document.body.textContent.includes("工具执行") ||
            document.body.textContent.includes("工具執行") ||
            document.body.textContent.includes("最终答复") ||
            document.body.textContent.includes("最終答覆") ||
            document.body.textContent.includes("Tool execution") ||
            document.body.textContent.includes("Final answer");
        }, null, {
          timeout: 15000
        });
        
        const visualizerText = await visualizerPage.textContent("body");
        assert.equal(String(visualizerText || "").includes("帮我搜索蓝牙耳机"), true);
        
        await visualizerPage.waitForSelector(".cpv-seq-node[data-cpv-open-node='true']", { timeout: 5000 });
        await visualizerPage.waitForSelector(".cpv-seq-row[data-current='true']", { timeout: 5000 });
      } catch (err) {
        const content = await visualizerPage.content();
        writeFailureArtifact("visualizer-page.html", content);
        console.log("VISUALIZER BODY TEXT:", await visualizerPage.evaluate(() => document.body.textContent));
        throw err;
      }
    });



    const sidepanelTargetTabId = await visualizerPage.evaluate(async () => {
      return (await chrome.tabs.getCurrent())?.id ?? null;
    });
    assert.equal(Number.isFinite(sidepanelTargetTabId), true);
    const sidepanelPage = await contextInfo.context.newPage();
    const sidepanelResult = await capturePageErrors(sidepanelPage, async () => {
      await sidepanelPage.goto(
        `chrome-extension://${extensionId}/sidepanel/sidepanel.html?tabId=${sidepanelTargetTabId}`,
        {
        waitUntil: "domcontentloaded"
        },
      );
      await sidepanelPage.waitForFunction(() => {
        return Boolean(document.querySelector("#root")) &&
          Boolean(globalThis.__CP_GITHUB_UPDATE_SHARED__) &&
          Boolean(globalThis.CustomProviderModels) &&
          Boolean(globalThis.__CP_ANSWER_PROVIDER_METRICS__) &&
          Boolean(globalThis.__CP_SIDEPANEL_DEBUG__);
      }, null, {
        timeout: 15000
      });
    });

    assert.equal(await sidepanelPage.title(), "Claw in Chrome");
    const sidepanelManifest = await sidepanelPage.evaluate(() => ({
      runtimeId: chrome.runtime.id,
      name: chrome.runtime.getManifest().name,
      version: chrome.runtime.getManifest().version
    }));
    assert.equal(sidepanelManifest.runtimeId, extensionId);
    assert.equal(sidepanelManifest.name, manifest.name);
    assert.equal(sidepanelManifest.version, manifest.version);
    const sidepanelScope = await sidepanelPage.evaluate(async () => {
      const debug = globalThis.__CP_SIDEPANEL_DEBUG__;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const entries = await debug.read();
        const scopeEntry = [...entries].reverse().find(entry => (
          entry.sessionId === debug.sessionId &&
          entry.type === "session.scope_resolved" &&
          entry.payload?.scopeId
        ));
        if (scopeEntry) {
          return scopeEntry.payload;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return null;
    });
    assert.equal(Boolean(sidepanelScope?.scopeId), true);
    await sidepanelPage.goto("about:blank", { waitUntil: "domcontentloaded" });
    await optionsPage.evaluate(async ({ scope, targetTabId }) => {
      const now = Date.now();
      const sessionId = "e2e-provider-metrics-session";
      const messages = [{
        role: "user",
        content: [{ type: "text", text: "Render a tool-assisted answer" }],
      }, {
        id: "e2e-tool-progress",
        role: "assistant",
        content: [{
          type: "tool_use",
          id: "e2e-tool-use",
          name: "read_page",
          input: { depth: 1 },
        }],
      }, {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "e2e-tool-use",
          content: [{ type: "text", text: "Tool result" }],
        }],
      }, {
        id: "e2e-tool-provider-request",
        role: "assistant",
        content: [{
          type: "tool_use",
          id: "e2e-turn-answer-start",
          name: "turn_answer_start",
          input: {},
        }, {
          type: "text",
          text: "E2E tool provider answer",
        }],
      }];
      const meta = {
        id: sessionId,
        scopeId: scope.scopeId,
        title: "Provider metrics renderer fixture",
        updatedAt: now,
        createdAt: now - 1000,
        selectedModel: "provider-model",
        currentUrl: "https://example.com/provider-metrics",
        messageCount: messages.length,
      };
      const snapshot = { scopeId: scope.scopeId, meta, messages };
      const measurement = id => ({
        id,
        startedAt: now,
        model: "provider-model",
        outcome: "success",
        firstTokenLatencyMs: 842,
        totalDurationMs: 2700,
        usage: { inputTokens: 100, outputTokens: 40 },
      });
      const providerProfile = {
        id: "e2e-provider",
        name: "E2E provider",
        format: "openai_chat",
        baseUrl: "https://provider.example/v1",
        apiKey: "e2e-key",
        defaultModel: "provider-model",
        fastModel: "provider-model",
        reasoningEffort: "medium",
        maxOutputTokens: 4096,
        contextWindow: 128000,
        fetchedModels: [],
      };
      await chrome.storage.local.set({
        [`claw.chat.scopes.${scope.scopeId}.index`]: [meta],
        [`claw.chat.scopes.${scope.scopeId}.byId.${sessionId}`]: snapshot,
        [`claw.chat.scopes.${scope.scopeId}.activeSession`]: {
          scopeId: scope.scopeId,
          sessionId,
          viewedAt: now,
          mainTabId: Number(scope.mainTabId ?? targetTabId),
          chromeGroupId: Number.isFinite(Number(scope.chromeGroupId))
            ? Number(scope.chromeGroupId)
            : null,
        },
        providerObservabilityRecords: [measurement("e2e-tool-provider-request")],
        customProviderProfiles: [providerProfile],
        customProviderActiveProfileId: providerProfile.id,
        customProviderConfig: {
          name: providerProfile.name,
          format: providerProfile.format,
          baseUrl: providerProfile.baseUrl,
          apiKey: providerProfile.apiKey,
          defaultModel: providerProfile.defaultModel,
          fastModel: providerProfile.fastModel,
          reasoningEffort: providerProfile.reasoningEffort,
          maxOutputTokens: providerProfile.maxOutputTokens,
          contextWindow: providerProfile.contextWindow,
          fetchedModels: providerProfile.fetchedModels,
        },
        selectedModel: providerProfile.defaultModel,
        browserControlPermissionAccepted: true,
      });
    }, { scope: sidepanelScope, targetTabId: sidepanelTargetTabId });
    await sidepanelPage.goto(
      `chrome-extension://${extensionId}/sidepanel/sidepanel.html?tabId=${sidepanelTargetTabId}`,
      { waitUntil: "domcontentloaded" },
    );
    try {
      await sidepanelPage.waitForFunction(() => (
        document.body.textContent.includes("E2E tool provider answer")
      ), null, { timeout: 15000 });
    } catch (error) {
      console.log("SIDEPANEL HYDRATE DEBUG:", await sidepanelPage.evaluate(async () => ({
        body: document.body.textContent,
        logs: (await globalThis.__CP_SIDEPANEL_DEBUG__.read()).slice(-20),
        storageKeys: Object.keys(await chrome.storage.local.get()).filter(key => (
          key.startsWith("claw.chat.scopes.") || key === "providerObservabilityRecords"
        )),
      })));
      throw error;
    }
    try {
      await sidepanelPage.waitForSelector(
        '[data-cp-provider-request-id="e2e-tool-provider-request"] [data-cp-provider-metrics-row="true"]',
        { timeout: 15000 },
      );
    } catch (error) {
      console.log("TOOL METRICS DOM DEBUG:", await sidepanelPage.evaluate(() => ({
        anchors: Array.from(document.querySelectorAll("[data-cp-provider-metrics-anchor]"))
          .map(element => element.outerHTML),
        rows: Array.from(document.querySelectorAll("[data-cp-provider-metrics-row]"))
          .map(element => element.outerHTML),
      })));
      throw error;
    }
    const rendererAnchorEvidence = await sidepanelPage.evaluate(() => {
      function evidenceFor(answerText, requestId) {
        const textElement = Array.from(document.querySelectorAll("body *")).find(element => (
          element.children.length === 0 && element.textContent?.trim() === answerText
        ));
        const anchors = Array.from(document.querySelectorAll(
          `[data-cp-provider-request-id="${requestId}"]`,
        ));
        const anchor = anchors[0];
        return {
          anchorCount: anchors.length,
          rowCount: anchor?.querySelectorAll("[data-cp-provider-metrics-row='true']").length ?? 0,
          anchorFollowsText: Boolean(
            textElement &&
            anchor &&
            textElement.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
        };
      }
      return {
        tool: evidenceFor("E2E tool provider answer", "e2e-tool-provider-request"),
        intermediateAnchorCount: document.querySelectorAll(
          '[data-cp-provider-request-id="e2e-tool-progress"]',
        ).length,
      };
    });
    assert.deepEqual(rendererAnchorEvidence.tool, {
      anchorCount: 1,
      rowCount: 1,
      anchorFollowsText: true,
    });
    assert.equal(rendererAnchorEvidence.intermediateAnchorCount, 0);
    await sidepanelPage.goto("about:blank", { waitUntil: "domcontentloaded" });
    await optionsPage.evaluate(async ({ scope, targetTabId }) => {
      const now = Date.now();
      const sessionId = "e2e-provider-metrics-session";
      const messages = [{
        role: "user",
        content: [{ type: "text", text: "Render a direct answer" }],
      }, {
        id: "e2e-single-provider-request",
        role: "assistant",
        content: [{ type: "text", text: "E2E single provider answer" }],
      }];
      const stored = await chrome.storage.local.get([
        `claw.chat.scopes.${scope.scopeId}.index`,
        `claw.chat.scopes.${scope.scopeId}.byId.${sessionId}`,
      ]);
      const previousSnapshot = stored[`claw.chat.scopes.${scope.scopeId}.byId.${sessionId}`];
      const meta = {
        ...previousSnapshot.meta,
        updatedAt: now,
        messageCount: messages.length,
      };
      await chrome.storage.local.set({
        [`claw.chat.scopes.${scope.scopeId}.index`]: [meta],
        [`claw.chat.scopes.${scope.scopeId}.byId.${sessionId}`]: {
          ...previousSnapshot,
          meta,
          messages,
        },
        [`claw.chat.scopes.${scope.scopeId}.activeSession`]: {
          scopeId: scope.scopeId,
          sessionId,
          viewedAt: now,
          mainTabId: Number(scope.mainTabId ?? targetTabId),
          chromeGroupId: Number.isFinite(Number(scope.chromeGroupId))
            ? Number(scope.chromeGroupId)
            : null,
        },
        providerObservabilityRecords: [{
          id: "e2e-single-provider-request",
          startedAt: now,
          model: "provider-model",
          outcome: "success",
          firstTokenLatencyMs: 842,
          totalDurationMs: 2700,
          usage: { inputTokens: 100, outputTokens: 40 },
        }],
      });
    }, { scope: sidepanelScope, targetTabId: sidepanelTargetTabId });
    await sidepanelPage.goto(
      `chrome-extension://${extensionId}/sidepanel/sidepanel.html?tabId=${sidepanelTargetTabId}`,
      { waitUntil: "domcontentloaded" },
    );
    await sidepanelPage.waitForFunction(() => (
      document.body.textContent.includes("E2E single provider answer")
    ), null, { timeout: 15000 });
    await sidepanelPage.waitForSelector(
      '[data-cp-provider-request-id="e2e-single-provider-request"] [data-cp-provider-metrics-row="true"]',
      { timeout: 15000 },
    );
    const singleRendererEvidence = await sidepanelPage.evaluate(() => {
      const answerText = "E2E single provider answer";
      const textElement = Array.from(document.querySelectorAll("body *")).find(element => (
        element.children.length === 0 && element.textContent?.trim() === answerText
      ));
      const anchors = Array.from(document.querySelectorAll(
        '[data-cp-provider-request-id="e2e-single-provider-request"]',
      ));
      const anchor = anchors[0];
      return {
        anchorCount: anchors.length,
        rowCount: anchor?.querySelectorAll("[data-cp-provider-metrics-row='true']").length ?? 0,
        anchorFollowsText: Boolean(
          textElement &&
          anchor &&
          textElement.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
      };
    });
    assert.deepEqual(singleRendererEvidence, {
      anchorCount: 1,
      rowCount: 1,
      anchorFollowsText: true,
    });
    await sidepanelPage.setViewportSize({ width: 320, height: 800 });
    await sidepanelPage.evaluate(() => {
      const answer = document.createElement("section");
      answer.id = "cp-e2e-provider-answer";
      answer.style.width = "100%";
      const content = document.createElement("p");
      content.id = "cp-e2e-provider-answer-content";
      content.textContent = "Synthetic provider answer";
      answer.appendChild(content);
      const anchor = document.createElement("div");
      anchor.className = "cp-answer-provider-metrics-anchor";
      anchor.setAttribute("data-cp-provider-metrics-anchor", "true");
      anchor.setAttribute("data-cp-provider-request-id", "cp-e2e-request");
      answer.appendChild(anchor);
      document.body.appendChild(answer);
      dispatchEvent(new CustomEvent("cp:provider-measurement-complete", {
        detail: {
          version: 1,
          measurement: {
            id: "cp-e2e-request",
            startedAt: Date.now(),
            model: "provider-model-with-a-long-name-for-overflow-evidence",
            outcome: "success",
            firstTokenLatencyMs: 842,
            totalDurationMs: 2700,
            usage: { inputTokens: 100, outputTokens: 40 },
          },
        },
      }));
    });
    await sidepanelPage.waitForSelector(
      "#cp-e2e-provider-answer > [data-cp-provider-metrics-anchor='true'] > [data-cp-provider-metrics-row='true']",
      { timeout: 15000 },
    );
    for (const scenario of [
      { width: 320, mode: "light" },
      { width: 320, mode: "dark" },
      { width: 1280, mode: "light" },
    ]) {
      await sidepanelPage.setViewportSize({ width: scenario.width, height: 800 });
      const metricsEvidence = await sidepanelPage.evaluate((nextScenario) => {
        document.documentElement.dataset.mode = nextScenario.mode;
        const answer = document.querySelector("#cp-e2e-provider-answer");
        const content = document.querySelector("#cp-e2e-provider-answer-content");
        const anchor = answer.querySelector("[data-cp-provider-metrics-anchor='true']");
        const row = answer.querySelector("[data-cp-provider-metrics-row='true']");
        const rowRect = row.getBoundingClientRect();
        const rowStyle = getComputedStyle(row);
        const model = row.querySelector("[data-cp-provider-model='true']");
        const metricRects = Array.from(
          row.querySelectorAll(".cp-answer-provider-metrics-value"),
        ).map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        });
        const metricItems = Array.from(
          row.querySelectorAll(".cp-answer-provider-metrics-item"),
        ).map((element) => {
          const separatorRect = element.firstElementChild.getBoundingClientRect();
          const valueRect = element.lastElementChild.getBoundingClientRect();
          return {
            right: element.getBoundingClientRect().right,
            separatorTop: separatorRect.top,
            valueTop: valueRect.top,
          };
        });
        return {
          ...nextScenario,
          rowCount: answer.querySelectorAll("[data-cp-provider-metrics-row='true']").length,
          anchorIsLastChild: answer.lastElementChild === anchor,
          rowIsInsideAnchor: row.parentElement === anchor,
          isBelowAnswer: rowRect.top >= content.getBoundingClientRect().bottom,
          rowBottom: rowRect.bottom,
          rowRight: rowRect.right,
          viewportWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          overflow: rowStyle.overflow,
          fontMatchesUi: rowStyle.fontFamily === getComputedStyle(document.body).fontFamily,
          marginTop: Number.parseFloat(rowStyle.marginTop),
          paddingTop: Number.parseFloat(rowStyle.paddingTop),
          borderTopStyle: rowStyle.borderTopStyle,
          title: row.title,
          modelTitle: model.title,
          modelIsTruncated: model.scrollWidth > model.clientWidth,
          metricRects,
          metricItems,
        };
      }, scenario);
      assert.equal(metricsEvidence.rowCount, 1);
      assert.equal(metricsEvidence.anchorIsLastChild, true);
      assert.equal(metricsEvidence.rowIsInsideAnchor, true);
      assert.equal(metricsEvidence.isBelowAnswer, true);
      assert.equal(metricsEvidence.rowRight <= metricsEvidence.viewportWidth, true);
      assert.equal(metricsEvidence.bodyScrollWidth <= metricsEvidence.viewportWidth, true);
      assert.equal(metricsEvidence.overflow, "hidden");
      assert.equal(metricsEvidence.fontMatchesUi, true);
      assert.equal(metricsEvidence.marginTop >= 8, true);
      assert.equal(metricsEvidence.paddingTop >= 8, true);
      assert.notEqual(metricsEvidence.borderTopStyle, "none");
      assert.equal(metricsEvidence.metricRects.length, 4);
      assert.equal(metricsEvidence.metricItems.length, 4);
      assert.equal(metricsEvidence.metricItems.every(item => (
        item.right <= metricsEvidence.viewportWidth &&
        Math.abs(item.separatorTop - item.valueTop) < 1
      )), true);
      assert.equal(metricsEvidence.metricRects.every(rect => (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right <= metricsEvidence.viewportWidth &&
        rect.bottom <= metricsEvidence.rowBottom &&
        rect.scrollWidth <= rect.clientWidth
      )), true);
      assert.equal(
        metricsEvidence.title,
        "provider-model-with-a-long-name-for-overflow-evidence",
      );
      assert.equal(metricsEvidence.modelTitle, metricsEvidence.title);
      assert.equal(metricsEvidence.modelIsTruncated, true);
    }
    await sidepanelPage.setViewportSize({ width: 1280, height: 800 });
    await sidepanelPage.evaluate(() => {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.className = "language-mermaid";
      code.textContent = "graph TD\nStart --> Finish";
      pre.appendChild(code);
      document.body.appendChild(pre);
    });
    await sidepanelPage.waitForSelector(
      ".cp-mermaid-diagram[data-cp-mermaid-state='rendered'] svg",
      { timeout: 15000 },
    );
    const mermaidEvidence = await sidepanelPage.evaluate(() => ({
      vendorCount: document.querySelectorAll(
        "script[data-cp-mermaid-vendor='true']",
      ).length,
      forbiddenCount: document.querySelectorAll(
        ".cp-mermaid-diagram script, .cp-mermaid-diagram foreignObject, .cp-mermaid-diagram iframe, .cp-mermaid-diagram image",
      ).length,
      sanitizerEvidence: (() => {
        const sanitized = globalThis.__CP_MERMAID_RENDERER__.sanitizeMermaidSvg(
          '<svg xmlns="http://www.w3.org/2000/svg" onload="bad()"><script>bad()</script><foreignObject><div>bad</div></foreignObject><a href="https://example.com"><text>safe</text></a></svg>',
        );
        const parsed = new DOMParser().parseFromString(
          sanitized,
          "image/svg+xml",
        );
        return {
          forbiddenCount: parsed.querySelectorAll("script, foreignObject").length,
          eventAttributeCount: parsed.querySelectorAll("[onload]").length,
          externalHrefCount: parsed.querySelectorAll('[href^="http"]').length,
        };
      })(),
    }));
    assert.deepEqual(mermaidEvidence, {
      vendorCount: 1,
      forbiddenCount: 0,
      sanitizerEvidence: {
        forbiddenCount: 0,
        eventAttributeCount: 0,
        externalHrefCount: 0,
      },
    });
    await sidepanelPage.evaluate(() => {
      document.documentElement.dataset.mode = "dark";
      const pre = document.createElement("pre");
      pre.id = "cp-streamed-mermaid";
      const code = document.createElement("code");
      code.className = "language-mermaid";
      code.textContent = "not a diagram";
      pre.appendChild(code);
      document.body.appendChild(pre);
    });
    await sidepanelPage.waitForFunction(() => {
      const pre = document.querySelector("#cp-streamed-mermaid");
      return pre?.dataset.cpMermaidState === "render_failed";
    }, null, { timeout: 15000 });
    await sidepanelPage.evaluate(() => {
      document.querySelector("#cp-streamed-mermaid code").textContent =
        "graph TD\nStream --> Complete";
    });
    await sidepanelPage.waitForFunction(() => {
      return !document.querySelector("#cp-streamed-mermaid") &&
        document.querySelectorAll(
          ".cp-mermaid-diagram[data-cp-mermaid-state='rendered'] svg",
        ).length === 2;
    }, null, { timeout: 15000 });
    assert.equal(
      await sidepanelPage.evaluate(
        () => globalThis.__CP_MERMAID_MARKDOWN__.getTheme(),
      ),
      "dark",
    );
    assert.deepEqual(sidepanelResult.pageErrors, []);
    assert.deepEqual(sidepanelResult.consoleErrors, []);
    await sidepanelPage.waitForSelector("#cp-github-update-sidepanel-root", {
      state: "attached",
      timeout: 15000
    });
    await sidepanelPage.evaluate(async () => {
      await chrome.storage.local.set({
        githubUpdateInfo: {
          currentVersion: "",
          latestVersion: "9.9.9.10",
          hasUpdate: true,
          releaseUrl: "https://example.com/releases/v9.9.9.10",
          downloadUrl: "https://example.com/downloads/claw-in-chrome-v9.9.9.10.zip",
          notes: "Critical fix for sidepanel e2e refresh",
          publishedAt: "2026-04-19T00:10:00.000Z",
          minSupportedVersion: null,
          lastCheckedAt: "2026-04-19T00:10:00.000Z",
          source: "e2e-sidepanel-refresh"
        },
        githubUpdateDismissedVersion: ""
      });
    });
    await sidepanelPage.waitForFunction(() => {
      const root = document.querySelector("#cp-github-update-sidepanel-root");
      return Boolean(root) &&
        root.textContent.includes("9.9.9.10") &&
        root.textContent.includes("Critical fix for sidepanel e2e refresh");
    }, null, {
      timeout: 15000
    });
    assert.equal(await sidepanelPage.getByRole("button", {
      name: /Download ZIP|下载最新版本|下載最新版本/
    }).count() >= 1, true);
    await sidepanelPage.getByRole("button", {
      name: /Later|稍后提醒|稍後提醒/
    }).click();
    await sidepanelPage.waitForFunction(() => {
      const root = document.querySelector("#cp-github-update-sidepanel-root");
      return Boolean(root) && !root.textContent.includes("9.9.9.10");
    }, null, {
      timeout: 15000
    });

    const serviceWorker = await waitForExtensionServiceWorker(contextInfo.context, extensionId);
    if (serviceWorker) {
      assert.equal(serviceWorker.url().startsWith(`chrome-extension://${extensionId}/`), true);
    }
  } finally {
    await closeExtensionContext(contextInfo);
  }
}

async function main() {
  await testExtensionPagesLoad();
  console.log("extension pages e2e smoke tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
