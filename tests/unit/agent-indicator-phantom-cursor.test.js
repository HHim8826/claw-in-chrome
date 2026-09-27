const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const indicatorPath = path.join(rootDir, "src", "assets", "agent-visual-indicator.js-Ct7LqXhp.js");
const mcpPath = path.join(rootDir, "src", "assets", "mcpPermissions-qqAoJjJ8.js");
const serviceWorkerPath = path.join(rootDir, "src", "assets", "service-worker.ts-H0DVM1LS.js");
const contractPath = path.join(rootDir, "src", "shared", "claw-contract.js");

class FakeNode {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.id = "";
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.listeners = {};
    this.textContent = "";
    this.innerHTML = "";
    this.style = { display: "" };
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((node) => node !== child);
    child.parentNode = null;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }
  async fire(type, event = {}) {
    for (const listener of [...(this.listeners[type] || [])]) await listener(event);
  }
  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    if (this.shadow) return this.shadow.find(predicate);
    return null;
  }
  querySelector(selector) {
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      if (this.innerHTML.includes(`id="${id}"`)) {
        this.htmlChildren ||= {};
        return (this.htmlChildren[id] ||= Object.assign(new FakeNode("button"), { id }));
      }
      return this.find((node) => node.id === id);
    }
    return null;
  }
  attachShadow() {
    this.shadow = new FakeNode("#shadow-root");
    return this.shadow;
  }
}

function loadIndicator() {
  const document = {
    hidden: false,
    head: new FakeNode("head"),
    body: new FakeNode("body"),
    listeners: {},
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (_ns, tag) => new FakeNode(tag),
    getElementById(id) {
      return this.head.find((node) => node.id === id) || this.body.find((node) => node.id === id);
    },
    addEventListener(type, listener) {
      (this.listeners[type] ||= []).push(listener);
    },
  };
  const sent = [];
  let onMessage = null;
  const context = {
    document,
    innerWidth: 1000,
    innerHeight: 600,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback) => callback(),
    addEventListener() {},
    chrome: {
      runtime: {
        sendMessage: (message) => {
          sent.push(message);
          return Promise.resolve({ success: true });
        },
        onMessage: { addListener: (listener) => (onMessage = listener) },
      },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(indicatorPath, "utf8"), context);
  const send = (message) =>
    new Promise((resolve) => {
      const keepOpen = onMessage(message, {}, resolve);
      if (keepOpen !== true) {
        // Synchronous handlers already responded.
      }
    });
  return { document, sent, send };
}

const cursor = (document) => document.getElementById("claude-phantom-cursor");
const styled = (document) => document.getElementById("claude-phantom-cursor-styled");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testCursorFollowsAgentWhileActive() {
  const { document, send } = loadIndicator();
  assert.deepEqual({ ...(await send({ type: "UPDATE_PHANTOM_CURSOR", x: 10, y: 20 })) }, { success: true });
  assert.equal(cursor(document), null, "no cursor is drawn while the agent is idle");

  await send({ type: "SHOW_AGENT_INDICATORS" });
  const node = cursor(document);
  assert.ok(node, "showing indicators draws the cursor");
  assert.equal(node.attributes["aria-hidden"], "true");
  assert.match(node.style.cssText, /translate3d\(10px, 20px, 0\)/, "the last requested position is reused");

  const moved = send({ type: "UPDATE_PHANTOM_CURSOR", x: 300, y: 150 });
  assert.equal(node.style.transform, "translate3d(300px, 150px, 0)");
  await node.fire("transitionend");
  assert.deepEqual({ ...(await moved) }, { success: true });

  await send({ type: "HIDE_FOR_TOOL_USE" });
  assert.equal(styled(document).style.display, "none", "the highlighted cursor is hidden for screenshots");
  assert.ok(document.getElementById("claude-phantom-cursor-plain"), "the plain cursor stays visible in screenshots");
  await send({ type: "SHOW_AFTER_TOOL_USE" });
  assert.equal(styled(document).style.display, "");

  await send({ type: "HIDE_AGENT_INDICATORS" });
  await wait(350);
  assert.equal(cursor(document), null, "hiding indicators removes the cursor");
}

async function testCursorDefaultsToViewportCenter() {
  const { document, send } = loadIndicator();
  await send({ type: "SHOW_AGENT_INDICATORS" });
  assert.match(cursor(document).style.cssText, /translate3d\(500px, 300px, 0\)/);
}

async function testStopRequiresTrustedClickAndReportsDrops() {
  const { document, sent, send } = loadIndicator();
  await send({ type: "SHOW_AGENT_INDICATORS" });
  const button = document.getElementById("claude-agent-stop-button");
  await button.fire("click", { isTrusted: false });
  assert.equal(sent.filter((message) => message.type === "STOP_AGENT").length, 0, "synthetic clicks can't stop the agent");

  await button.fire("click", { isTrusted: true });
  assert.deepEqual(
    sent.filter((message) => message.type === "STOP_AGENT").map((message) => ({ ...message })),
    [{ type: "STOP_AGENT", fromTabId: "CURRENT_TAB" }],
  );
  await wait(1600);
  assert.equal(sent.some((message) => message.type === "STOP_AGENT_DROPPED"), true, "a stop that doesn't land is reported");
  const toast = document.body.find((node) => node.textContent === "Stop didn't reach Claw — close the side panel to stop.");
  assert.ok(toast, "the page explains how to stop");
}

async function testDeliveredStopDoesNotReportDrop() {
  const { document, sent, send } = loadIndicator();
  await send({ type: "SHOW_AGENT_INDICATORS" });
  await document.getElementById("claude-agent-stop-button").fire("click", { isTrusted: true });
  await send({ type: "HIDE_AGENT_INDICATORS" });
  await wait(1600);
  assert.equal(sent.some((message) => message.type === "STOP_AGENT_DROPPED"), false);
}

function testProducersShareTheContract() {
  const contractSource = fs.readFileSync(contractPath, "utf8");
  assert.equal(contractSource.includes('UPDATE_PHANTOM_CURSOR: "UPDATE_PHANTOM_CURSOR"'), true);
  assert.equal(contractSource.includes('STOP_AGENT_DROPPED: "STOP_AGENT_DROPPED"'), true);

  const mcp = fs.readFileSync(mcpPath, "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    mcp.includes("type: __cpAgentIndicatorRuntimeMessageUpdatePhantomCursor,"),
    true,
    "mouse events move the page cursor",
  );
  assert.equal(
    mcp.includes('if ((t.type === "mouseMoved" || t.type === "mouseWheel") && !t.skipCursorWait) {'),
    true,
    "moves wait briefly for the cursor animation",
  );
  const serviceWorker = fs.readFileSync(serviceWorkerPath, "utf8");
  assert.equal(serviceWorker.includes("e.type === __cpBackgroundMessageTypeStopAgentDropped"), true, "the worker acknowledges dropped stops");
}

async function main() {
  await testCursorFollowsAgentWhileActive();
  await testCursorDefaultsToViewportCenter();
  await testStopRequiresTrustedClickAndReportsDrops();
  await testDeliveredStopDoesNotReportDrop();
  testProducersShareTheContract();
  console.log("agent indicator phantom cursor tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
