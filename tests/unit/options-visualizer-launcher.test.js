const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createChromeMock,
  flushMicrotasks,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const scriptPath = path.join(__dirname, "..", "..", "src", "options", "options-visualizer-launcher.js");
const customZhPack = Function(
  `"use strict"; return (${fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "i18n", "custom", "zh-CN.js"),
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
      if (locale.startsWith("zh")) {
        return "zh-CN";
      }
      return "en-US";
    },
    getUiLocaleTag(options = {}) {
      const explicitLocale = String(
        options.document?.documentElement?.dataset?.cpUiLocale || "",
      ).toLowerCase();
      if (explicitLocale.startsWith("zh")) {
        return "zh-CN";
      }
      const pageText = String(
        options.document?.body?.innerText ||
          options.document?.body?.textContent ||
          "",
      );
      if (
        Array.isArray(options.zhPageHints) &&
        options.zhPageHints.some((hint) => hint && pageText.includes(String(hint)))
      ) {
        return "zh-CN";
      }
      const htmlLang = String(options.document?.documentElement?.lang || "").toLowerCase();
      if (htmlLang.startsWith("zh")) {
        return "zh-CN";
      }
      return "en-US";
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
  };
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || "").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.hidden = false;
    this.textContent = "";
    this._id = "";
    this._innerHTML = "";
    this._heading = null;
    this._button = null;

    Object.defineProperty(this, "id", {
      get: () => this._id,
      set: value => {
        this._id = String(value || "");
      }
    });
  }

  get nextElementSibling() {
    if (!this.parentNode) {
      return null;
    }
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] || null : null;
  }

  setAttribute(name, value) {
    const key = String(name || "");
    const nextValue = String(value || "");
    this.attributes[key] = nextValue;
    if (key === "id") {
      this.id = nextValue;
    }
    if (key.startsWith("data-")) {
      const dataKey = key
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[dataKey] = nextValue;
    }
  }

  insertAdjacentElement(position, element) {
    if (position !== "afterend" || !this.parentNode) {
      throw new Error(`unsupported insertAdjacentElement position: ${position}`);
    }
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (element.parentNode) {
      element.remove();
    }
    element.parentNode = this.parentNode;
    siblings.splice(index + 1, 0, element);
    return element;
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
    this.parentNode = null;
  }

  querySelector(selector) {
    if (selector === "h3") {
      return this._heading;
    }
    if (selector === "[data-cp-visualizer-launch]") {
      return this._button;
    }
    return null;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this._button = null;

    if (this.id === "cp-options-visualizer-panel") {
      const button = new FakeElement("button", this.ownerDocument);
      button.setAttribute("data-cp-visualizer-launch", "true");
      const labelMatch = this._innerHTML.match(/<button[\s\S]*?>([\s\S]*?)<\/button>/i);
      button.textContent = labelMatch ? labelMatch[1].trim() : "";
      button.parentNode = this;
      this._button = button;
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

class FakeDocument {
  constructor(options = {}) {
    this.readyState = options.readyState || "complete";
    this.body = new FakeElement("body", this);
    this.body.innerText = options.bodyText || "";
    this.body.textContent = options.bodyText || "";
    this.documentElement = {
      lang: options.htmlLang || "",
      dataset: {
        cpUiLocale: options.explicitLocale || ""
      }
    };
    this.listeners = new Map();

    if (options.includeUpdatePanel !== false) {
      const section = new FakeElement("section", this);
      const heading = new FakeElement("h3", this);
      heading.textContent = options.updateTitle || "Extension updates";
      section._heading = heading;
      section.parentNode = this.body;
      this.body.children.push(section);
    }
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  addEventListener(type, listener) {
    const current = this.listeners.get(type) || [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  getElementById(id) {
    const targetId = String(id || "");

    function walk(node) {
      if (!node) {
        return null;
      }
      if (node.id === targetId) {
        return node;
      }
      for (const child of node.children || []) {
        const match = walk(child);
        if (match) {
          return match;
        }
      }
      return null;
    }

    return walk(this.body);
  }

  querySelectorAll(selector) {
    if (selector !== "section") {
      return [];
    }
    const sections = [];

    function walk(node) {
      if (!node) {
        return;
      }
      if (node.tagName === "SECTION") {
        sections.push(node);
      }
      for (const child of node.children || []) {
        walk(child);
      }
    }

    walk(this.body);
    return sections;
  }
}

function createVisualizerHarness(options = {}) {
  const chromeMock = createChromeMock({
    runtimeId: "visualizer-test-extension",
    storageState: options.storageState || {}
  });
  const tabCreateCalls = [];
  const windowOpenCalls = [];
  const rafQueue = [];
  const windowListeners = new Map();
  const document = new FakeDocument({
    bodyText: options.bodyText || "",
    htmlLang: options.htmlLang || "",
    readyState: options.readyState || "complete",
    updateTitle: options.updateTitle || "Extension updates",
    includeUpdatePanel: options.includeUpdatePanel
  });
  const windowObject = {
    location: {
      hash: options.hash || "#options"
    },
    open(url, target, features) {
      windowOpenCalls.push({
        url,
        target,
        features
      });
      return options.windowOpenResult === undefined ? {
        closed: false
      } : options.windowOpenResult;
    },
    addEventListener(type, listener) {
      const current = windowListeners.get(type) || [];
      current.push(listener);
      windowListeners.set(type, current);
    },
    dispatchEvent(event) {
      const type = String(event?.type || "");
      for (const listener of windowListeners.get(type) || []) {
        listener(event);
      }
    }
  };
  document.ownerWindow = windowObject;

  chromeMock.chrome.tabs.create = (payload, callback) => {
    tabCreateCalls.push(payload);
    chromeMock.chrome.runtime.lastError = options.tabCreateError ? {
      message: options.tabCreateError
    } : undefined;
    if (typeof callback === "function") {
      callback();
    }
    chromeMock.chrome.runtime.lastError = undefined;
  };

  const sandbox = {
    console,
    chrome: chromeMock.chrome,
    document,
    navigator: {
      language: options.navigatorLanguage || "en-US"
    },
    URLSearchParams,
    __CP_I18N_SHARED__: createI18nShared(),
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    setTimeout(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    window: windowObject
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(scriptPath, sandbox);

  async function flushRenders() {
    await flushMicrotasks();
    let guard = 30;
    while (rafQueue.length > 0 && guard > 0) {
      guard -= 1;
      const batch = rafQueue.splice(0);
      for (const callback of batch) {
        callback();
        await flushMicrotasks();
      }
    }
    if (rafQueue.length > 0) {
      throw new Error("render queue did not settle");
    }
  }

  return {
    chromeMock,
    document,
    tabCreateCalls,
    windowOpenCalls,
    windowObject,
    async dispatchHashChange(nextHash) {
      windowObject.location.hash = nextHash;
      for (const listener of windowListeners.get("hashchange") || []) {
        listener();
      }
      await flushRenders();
    },
    flushRenders
  };
}

async function testLauncherRendersPanelAndOpensVisualizerTab() {
  const harness = createVisualizerHarness({});

  await harness.flushRenders();

  const panel = harness.document.getElementById("cp-options-visualizer-panel");
  assert.ok(panel, "visualizer panel should render");
  assert.match(panel.innerHTML, /Execution visualizer/);

  const button = panel.querySelector("[data-cp-visualizer-launch]");
  assert.ok(button, "visualizer button should exist");
  button.onclick();
  await flushMicrotasks();

  assert.deepEqual(JSON.parse(JSON.stringify(harness.tabCreateCalls)), [{
    url: "chrome-extension://visualizer-test-extension/visualizer/visualizer.html?locale=en-US"
  }]);
  assert.deepEqual(harness.windowOpenCalls, []);
}

async function testLauncherPassesChineseLocaleToVisualizer() {
  const harness = createVisualizerHarness({
    navigatorLanguage: "en-US",
    bodyText: "Claw in Chrome 设置 扩展更新 选项",
    updateTitle: "扩展更新"
  });

  await harness.flushRenders();

  const panel = harness.document.getElementById("cp-options-visualizer-panel");
  const button = panel.querySelector("[data-cp-visualizer-launch]");
  button.onclick();
  await flushMicrotasks();

  assert.deepEqual(JSON.parse(JSON.stringify(harness.tabCreateCalls)), [{
    url: "chrome-extension://visualizer-test-extension/visualizer/visualizer.html?locale=zh-CN"
  }]);
}

async function testLauncherUsesStoredPreferredLocaleForTargetUrl() {
  const harness = createVisualizerHarness({
    navigatorLanguage: "en-US",
    bodyText: "Claw in Chrome 设置 扩展更新 选项",
    updateTitle: "扩展更新",
    storageState: {
      preferred_locale: "zh-CN"
    }
  });

  await harness.flushRenders();

  const panel = harness.document.getElementById("cp-options-visualizer-panel");
  assert.match(panel.innerHTML, /执行可视化/);
  const button = panel.querySelector("[data-cp-visualizer-launch]");
  button.onclick();
  await flushMicrotasks();

  assert.deepEqual(JSON.parse(JSON.stringify(harness.tabCreateCalls)), [{
    url: "chrome-extension://visualizer-test-extension/visualizer/visualizer.html?locale=zh-CN"
  }]);
}

async function testLauncherShowsOpenErrorWhenTabAndWindowCreationFail() {
  const harness = createVisualizerHarness({
    tabCreateError: "open tab failed",
    windowOpenResult: null
  });

  await harness.flushRenders();

  const panel = harness.document.getElementById("cp-options-visualizer-panel");
  panel.querySelector("[data-cp-visualizer-launch]").onclick();
  await flushMicrotasks();
  await harness.flushRenders();

  assert.equal(harness.windowOpenCalls.length, 1);
  assert.match(panel.innerHTML, /Failed to open visualizer: open tab failed/);
}

async function testLauncherRemovesPanelOutsideRootOptionsView() {
  const harness = createVisualizerHarness({});

  await harness.flushRenders();
  assert.ok(harness.document.getElementById("cp-options-visualizer-panel"));

  await harness.dispatchHashChange("#permissions");

  assert.equal(harness.document.getElementById("cp-options-visualizer-panel"), null);
  assert.equal(harness.document.getElementById("cp-options-visualizer-anchor"), null);
}

async function testLauncherRerendersWhenExplicitUiLocaleArrivesLate() {
  const harness = createVisualizerHarness({
    navigatorLanguage: "en-US"
  });

  await harness.flushRenders();

  const panel = harness.document.getElementById("cp-options-visualizer-panel");
  assert.match(panel.innerHTML, /Execution visualizer/);

  harness.document.documentElement.dataset.cpUiLocale = "zh-CN";
  harness.document.documentElement.lang = "zh-CN";
  harness.document.body.innerText = "Claw in Chrome 设置 扩展更新 选项";
  harness.document.body.textContent = "Claw in Chrome 设置 扩展更新 选项";
  harness.document.body.children[0]._heading.textContent = "扩展更新";
  await harness.chromeMock.storageMock.area.set({
    preferred_locale: "zh-CN"
  });
  harness.windowObject.dispatchEvent({
    type: "cp:ui-locale-changed",
    detail: {
      locale: "zh-CN"
    }
  });
  await harness.flushRenders();

  assert.match(panel.innerHTML, /执行可视化/);
}

async function main() {
  await testLauncherRendersPanelAndOpensVisualizerTab();
  await testLauncherPassesChineseLocaleToVisualizer();
  await testLauncherUsesStoredPreferredLocaleForTargetUrl();
  await testLauncherShowsOpenErrorWhenTabAndWindowCreationFail();
  await testLauncherRemovesPanelOutsideRootOptionsView();
  await testLauncherRerendersWhenExplicitUiLocaleArrivesLate();
  console.log("options visualizer launcher tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
