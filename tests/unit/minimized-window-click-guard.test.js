const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "mcpPermissions-qqAoJjJ8.js");

function readBlock() {
  const source = fs.readFileSync(bundlePath, "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("// __cp-minimized-window-guard:start");
  const end = source.indexOf("// __cp-minimized-window-guard:end");
  assert.notEqual(start, -1, "minimized window guard block start should exist");
  assert.notEqual(end, -1, "minimized window guard block end should exist");
  return { source, block: source.slice(start, end) };
}

function loadGuard({ windows, tabs, storage = {}, pageHrefs = [] }) {
  const { block } = readBlock();
  const created = [];
  const grouped = [];
  const scripts = [];
  const context = {
    chrome: {
      storage: { local: { get: async (key) => ({ [key]: storage[key] }) } },
      tabs: {
        get: async (tabId) => tabs[tabId],
        create: async (options) => {
          const tab = { id: 100 + created.length, windowId: options.windowId ?? 1 };
          created.push(options);
          return tab;
        },
        group: async (options) => {
          grouped.push(options);
        },
      },
      windows: { get: async (windowId) => windows[windowId] },
      tabGroups: { TAB_GROUP_ID_NONE: -1 },
    },
    x: async (details) => {
      scripts.push(details);
      return details.func.name === "__cpDrainBackgroundClickGuardInPage" ? [{ result: pageHrefs }] : [{ result: undefined }];
    },
  };
  vm.createContext(context);
  vm.runInContext(`${block}\nthis.guard = __cpMinimizedWindowClickGuard; this.installInPage = __cpInstallBackgroundClickGuardInPage;`, context);
  return { guard: context.guard, installInPage: context.installInPage, created, grouped, scripts };
}

async function testVisibleWindowsAreNotIntercepted() {
  const { guard, scripts } = loadGuard({
    windows: { 1: { state: "normal" } },
    tabs: { 5: { id: 5, windowId: 1, index: 2, groupId: 9 } },
  });
  assert.equal(await guard.beginClickInterception(5), null);
  assert.equal(scripts.length, 0);
}

async function testKillSwitchDisablesGuard() {
  const { guard, scripts } = loadGuard({
    storage: { cicMinimizedWindowGuard: false },
    windows: { 1: { state: "minimized" } },
    tabs: { 5: { id: 5, windowId: 1, index: 2, groupId: 9 } },
  });
  assert.equal(await guard.beginClickInterception(5), null);
  assert.equal(scripts.length, 0);
}

async function testInterceptedLinksOpenAsGroupedBackgroundTabs() {
  const hrefs = ["https://a.example/", "https://a.example/", "https://b.example/", "javascript:alert(1)", "https://c.example/", "https://d.example/"];
  const { guard, created, grouped, scripts } = loadGuard({
    windows: { 1: { state: "minimized" } },
    tabs: { 5: { id: 5, windowId: 1, index: 2, groupId: 9 } },
    pageHrefs: hrefs,
  });
  const interception = await guard.beginClickInterception(5);
  assert.deepEqual({ ...interception }, { tabId: 5, windowId: 1, tabIndex: 2, groupId: 9 });
  assert.equal(scripts[0].func.name, "__cpInstallBackgroundClickGuardInPage");
  const opened = await guard.finishClickInterception(interception);
  assert.deepEqual([...opened], [100, 101, 102]);
  assert.deepEqual(
    created.map((options) => ({ ...options })),
    [
      { url: "https://a.example/", active: false, windowId: 1, openerTabId: 5, index: 3 },
      { url: "https://b.example/", active: false, windowId: 1, openerTabId: 5, index: 4 },
      { url: "https://c.example/", active: false, windowId: 1, openerTabId: 5, index: 5 },
    ],
    "at most three unique http(s) links open next to the source tab without activating",
  );
  assert.deepEqual(grouped.map((options) => options.groupId), [9, 9, 9]);
}

async function testRestoredWindowActivatesFirstTab() {
  const windows = { 1: { state: "minimized" } };
  const { guard, created } = loadGuard({
    windows,
    tabs: { 5: { id: 5, windowId: 1, index: 0, groupId: -1 } },
    pageHrefs: ["https://a.example/"],
  });
  const interception = await guard.beginClickInterception(5);
  windows[1] = { state: "normal" };
  await guard.finishClickInterception(interception);
  assert.equal(created[0].active, true);
}

async function testAbortDiscardsInterceptedLinks() {
  const { guard, created } = loadGuard({
    windows: { 1: { state: "minimized" } },
    tabs: { 5: { id: 5, windowId: 1, index: 0, groupId: -1 } },
    pageHrefs: ["https://a.example/"],
  });
  const interception = await guard.beginClickInterception(5);
  await guard.abortClickInterception(interception);
  assert.equal(created.length, 0);
  assert.deepEqual([...(await guard.finishClickInterception(null))], []);
}

function createPage() {
  class Element {
    constructor(tagName, attributes = {}) {
      this.tagName = tagName;
      this.attributes = attributes;
      this.isContentEditable = false;
    }
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }
    getAttribute(name) {
      return this.hasAttribute(name) ? this.attributes[name] : null;
    }
  }
  class HTMLElement extends Element {}
  class HTMLAnchorElement extends HTMLElement {
    constructor(href, attributes = {}) {
      super("A", { href, ...attributes });
      this.href = href;
      this.origin = new URL(href).origin;
    }
  }
  const listeners = [];
  const page = {
    Element,
    HTMLElement,
    HTMLAnchorElement,
    CSS: { escape: (value) => value },
    location: { origin: "https://site.example" },
    document: {
      baseTarget: null,
      namedFrames: [],
      querySelector(selector) {
        if (selector === "base[target]") return this.baseTarget ? new Element("BASE", { target: this.baseTarget }) : null;
        return this.namedFrames.some((name) => selector.includes(`"${name}"`)) ? {} : null;
      },
    },
    Date,
  };
  page.window = page;
  page.window.origin = "https://site.example";
  page.window.name = "";
  page.window.addEventListener = (type, listener) => listeners.push(listener);
  vm.createContext(page);
  const click = (path, options = {}) => {
    let prevented = false;
    const event = {
      isTrusted: options.isTrusted ?? true,
      defaultPrevented: false,
      composedPath: () => path,
      preventDefault: () => {
        prevented = true;
      },
    };
    for (const listener of listeners) listener(event);
    return prevented;
  };
  return { page, click, Element, HTMLAnchorElement };
}

function testPageGuardCapturesNewWindowLinksOnly() {
  const { installInPage } = loadGuard({ windows: {}, tabs: {} });
  const { page, click, Element, HTMLAnchorElement } = createPage();
  vm.runInContext(`this.install = ${installInPage.toString()};`, page);
  page.install();
  const guardState = page.__cicBgClickGuard;

  assert.equal(click([new HTMLAnchorElement("https://x.example/", { target: "_blank" })]), true);
  assert.equal(click([new HTMLAnchorElement("https://self.example/", { target: "_self" })]), false);
  assert.equal(click([new HTMLAnchorElement("https://plain.example/")]), false, "links without a target stay in the tab");
  assert.equal(click([new HTMLAnchorElement("https://untrusted.example/", { target: "_blank" })], { isTrusted: false }), false);
  assert.equal(
    click([new Element("BUTTON"), new HTMLAnchorElement("https://button.example/", { target: "_blank" })]),
    false,
    "controls inside links keep their own behavior",
  );
  page.document.namedFrames.push("preview");
  assert.equal(click([new HTMLAnchorElement("https://frame.example/", { target: "preview" })]), false, "named frames stay in page");
  page.document.baseTarget = "_blank";
  assert.equal(click([new HTMLAnchorElement("https://base.example/")]), true, "base target applies");
  assert.equal(click([new HTMLAnchorElement("mailto:someone@example.com", { target: "_blank" })]), false);
  assert.deepEqual([...guardState.hrefs], ["https://x.example/", "https://base.example/"]);

  page.install();
  assert.deepEqual([...guardState.hrefs], [], "re-arming clears previous links");
  assert.equal(guardState.installed, true);
}

function testClickActionWiring() {
  const { source } = readBlock();
  assert.equal(
    source.includes(
      'const u =\n      i === "left" && c === 0\n        ? await __cpMinimizedWindowClickGuard.beginClickInterception(e)\n        : null;',
    ),
    true,
    "plain left clicks arm the guard",
  );
  assert.equal(
    source.includes("[note: the link opened in a new tab (tab ID ${h.join(\", \")}); pass that tab ID to interact with it]"),
    true,
    "opened tab IDs are reported to the model",
  );
}

async function main() {
  await testVisibleWindowsAreNotIntercepted();
  await testKillSwitchDisablesGuard();
  await testInterceptedLinksOpenAsGroupedBackgroundTabs();
  await testRestoredWindowActivatesFirstTab();
  await testAbortDiscardsInterceptedLinks();
  testPageGuardCapturesNewWindowLinksOnly();
  testClickActionWiring();
  console.log("minimized window click guard tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
