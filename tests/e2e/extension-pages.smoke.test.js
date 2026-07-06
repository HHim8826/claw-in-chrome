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



    const sidepanelPage = await contextInfo.context.newPage();
    const sidepanelResult = await capturePageErrors(sidepanelPage, async () => {
      await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
        waitUntil: "domcontentloaded"
      });
      await sidepanelPage.waitForFunction(() => {
        return Boolean(document.querySelector("#root")) &&
          Boolean(globalThis.__CP_GITHUB_UPDATE_SHARED__) &&
          Boolean(globalThis.CustomProviderModels);
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
