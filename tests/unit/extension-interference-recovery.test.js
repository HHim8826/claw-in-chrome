const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "mcpPermissions-qqAoJjJ8.js");
const FOREIGN_ERROR = "Cannot access a chrome-extension:// URL of different extension";
const OWN_ORIGIN = "chrome-extension://own-extension-id";

function readBlock() {
  const source = fs.readFileSync(bundlePath, "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("// __cp-extension-interference:start");
  const end = source.indexOf("// __cp-extension-interference:end");
  assert.notEqual(start, -1, "extension interference block start should exist");
  assert.notEqual(end, -1, "extension interference block end should exist");
  return { source, block: source.slice(start, end) };
}

function loadRecovery({ storage = {}, frames = [], executeScript }) {
  const { block } = readBlock();
  const log = [];
  const context = {
    console: { info: (...args) => log.push(args.join(" ")) },
    setTimeout,
    URL,
    chrome: {
      runtime: { id: "own-extension-id" },
      storage: { local: { get: async (key) => ({ [key]: storage[key] }) } },
      webNavigation: { getAllFrames: async () => frames },
    },
    x: executeScript,
  };
  vm.createContext(context);
  vm.runInContext(
    `${block}\nthis.recover = __cpRecoverDebuggerAttachFromInterference; this.isForeign = __cpIsForeignExtensionAttachError; this.removeInPage = __cpRemoveInterferingIframesInPage; this.countInPage = __cpCountDomIframesInPage;`,
    context,
  );
  return { context, log };
}

async function testKillSwitchRethrowsOriginalError() {
  let scripts = 0;
  const { context } = loadRecovery({
    storage: { cicStripExtensionInterference: false },
    executeScript: async () => {
      scripts += 1;
      return [];
    },
  });
  const original = new Error(FOREIGN_ERROR);
  await assert.rejects(context.recover(7, async () => {}, original, { settleMs: 0 }), (error) => error === original);
  assert.equal(scripts, 0, "kill switch skips page inspection");
}

async function testForeignFramesAreRemovedAndAttachRetried() {
  const calls = [];
  const { context } = loadRecovery({
    frames: [
      { frameId: 0, parentFrameId: -1, url: "https://site.example/" },
      { frameId: 3, parentFrameId: 0, url: "https://ads.example/frame" },
    ],
    executeScript: async (details) => {
      calls.push(details);
      if (details.target.allFrames) {
        return [{ frameId: 0, result: ["https://ads.example/frame", "chrome-extension://foreign/panel.html", "https://widget.example/"] }];
      }
      assert.deepEqual([...details.target.frameIds], [0]);
      assert.deepEqual([...details.args[0]], ["https://ads.example"], "known child origins are preserved");
      assert.equal(details.args[1], OWN_ORIGIN);
      assert.equal(details.args[2], 2, "two DOM iframes have no matching navigation frame");
      return [{ result: ["chrome-extension://foreign/panel.html"] }];
    },
  });
  let attempts = 0;
  const summary = await context.recover(
    7,
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error(FOREIGN_ERROR);
    },
    new Error(FOREIGN_ERROR),
    { settleMs: 0 },
  );
  assert.equal(attempts, 2, "attach is retried until it succeeds");
  assert.deepEqual({ ...summary, containerFrameIds: [...summary.containerFrameIds], removedSrcHosts: [...summary.removedSrcHosts] }, {
    containerFrameIds: [0],
    removedSrcHosts: ["chrome-extension://foreign"],
    totalRemoved: 1,
  });
  assert.equal(calls.length, 2);
}

async function testNothingRemovableTriesOnceThenRethrows() {
  const { context } = loadRecovery({
    frames: [{ frameId: 0, parentFrameId: -1, url: "https://site.example/" }],
    executeScript: async () => [{ frameId: 0, result: [] }],
  });
  const original = new Error(FOREIGN_ERROR);
  let attempts = 0;
  await assert.rejects(
    context.recover(7, async () => {
      attempts += 1;
      throw new Error(FOREIGN_ERROR);
    }, original, { settleMs: 0 }),
    (error) => error === original,
  );
  assert.equal(attempts, 1, "without removable frames only one re-attach is attempted");
}

async function testUnrelatedRetryErrorsSurface() {
  const { context } = loadRecovery({
    frames: [{ frameId: 0, parentFrameId: -1, url: "https://site.example/" }],
    executeScript: async () => [{ frameId: 0, result: [] }],
  });
  await assert.rejects(
    context.recover(7, async () => {
      throw new Error("Another debugger is already attached");
    }, new Error(FOREIGN_ERROR), { settleMs: 0 }),
    /Another debugger is already attached/,
  );
}

function testPageRemovalSelectsForeignFramesOnly() {
  const { context } = loadRecovery({ executeScript: async () => [] });
  const removed = [];
  class HTMLElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.shadowRoot = null;
    }
  }
  class HTMLIFrameElement extends HTMLElement {
    constructor(src, extra = {}) {
      super("IFRAME");
      this.src = src;
      this.loading = extra.loading || "eager";
      this.top = extra.top || 0;
    }
    getBoundingClientRect() {
      return { top: this.top };
    }
    remove() {
      removed.push(this.src);
    }
  }
  const elements = [
    new HTMLElement("DIV"),
    new HTMLIFrameElement(`${OWN_ORIGIN}/indicator.html`),
    new HTMLIFrameElement("chrome-extension://foreign/panel.html"),
    new HTMLIFrameElement("https://ads.example/frame"),
    new HTMLIFrameElement("https://widget.example/"),
    new HTMLIFrameElement("https://lazy.example/", { loading: "lazy", top: 5000 }),
    new HTMLIFrameElement("about:blank"),
  ];
  const page = {
    document: { querySelectorAll: () => elements },
    HTMLElement,
    HTMLIFrameElement,
    innerHeight: 800,
    URL,
    chrome: {},
  };
  vm.createContext(page);
  vm.runInContext(`this.run = ${context.removeInPage.toString()};`, page);
  const result = page.run(["https://ads.example"], OWN_ORIGIN, 3);
  assert.deepEqual([...result], ["chrome-extension://foreign/panel.html", "https://widget.example/"]);
  assert.deepEqual(removed, ["chrome-extension://foreign/panel.html", "https://widget.example/"]);
}

function testForeignErrorDetection() {
  const { context } = loadRecovery({ executeScript: async () => [] });
  assert.equal(context.isForeign(new Error(`${FOREIGN_ERROR}.`)), true);
  assert.equal(context.isForeign("Cannot access a chrome-extension:// URL of different extension"), true);
  assert.equal(context.isForeign(new Error("Another debugger is already attached")), false);
}

function testAttachAndSendCommandWiring() {
  const { source } = readBlock();
  assert.equal(
    source.includes("if (!__cpIsForeignExtensionAttachError(u)) {\n        throw u;\n      }\n      await __cpRecoverDebuggerAttachFromInterference(e, i, u);"),
    true,
    "attachDebugger recovers only from foreign-extension attach errors",
  );
  assert.equal(
    source.includes("(__cpIsForeignExtensionAttachError(a) && !(await this.isDebuggerAttached(e)))"),
    true,
    "sendCommand re-attaches after a foreign-extension detach",
  );
}

async function main() {
  testForeignErrorDetection();
  await testKillSwitchRethrowsOriginalError();
  await testForeignFramesAreRemovedAndAttachRetried();
  await testNothingRemovableTriesOnceThenRethrows();
  await testUnrelatedRetryErrorsSurface();
  testPageRemovalSelectsForeignFramesOnly();
  testAttachAndSendCommandWiring();
  console.log("extension interference recovery tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
