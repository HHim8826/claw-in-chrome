const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const treeScriptPath = path.join(rootDir, "src", "assets", "accessibility-tree.js-D8KNCIWO.js");
const mcpPermissionsPath = path.join(rootDir, "src", "assets", "mcpPermissions-qqAoJjJ8.js");

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

class TextNode {
  constructor(text) {
    this.nodeType = TEXT_NODE;
    this.textContent = text;
  }
}

class ElementNode {
  constructor(document, tagName, attributes = {}) {
    this.ownerDocument = document;
    this.nodeType = ELEMENT_NODE;
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.childNodes = [];
    this.value = attributes.value || "";
    this.id = attributes.id || "";
    this.selectedIndex = 0;
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === ELEMENT_NODE);
  }

  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }

  get selected() {
    return this.attributes.selected !== undefined;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  get offsetWidth() {
    return 10;
  }

  get offsetHeight() {
    return 10;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? String(this.attributes[name]) : null;
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 10, left: 0, right: 10 };
  }

  querySelector(selector) {
    if (selector === "option[selected]") {
      return this.options.find((option) => option.selected) || null;
    }
    return null;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.childNodes.push(typeof node === "string" ? new TextNode(node) : node);
    }
    return this;
  }
}

function createDocument() {
  const document = {
    all: [],
    create(tagName, attributes, ...children) {
      const element = new ElementNode(document, tagName, attributes);
      element.append(...children);
      document.all.push(element);
      return element;
    },
    querySelector(selector) {
      const match = /^label\[for="([^"]+)"\]$/.exec(selector);
      if (!match) {
        return null;
      }
      return document.all.find((element) => element.tagName === "LABEL" && element.getAttribute("for") === match[1]) || null;
    },
  };
  document.body = document.create("body");
  return document;
}

function loadTree(document) {
  const context = {
    document,
    Node: { TEXT_NODE, ELEMENT_NODE },
    WeakRef,
    WeakMap,
    innerWidth: 1280,
    innerHeight: 800,
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(treeScriptPath, "utf8"), context);
  return context;
}

function buildFormPage() {
  const document = createDocument();
  const { create } = document;
  const pw = create("input", { id: "pw", type: "password", value: "hunter2-secret" });
  const card = create("input", { id: "card", type: "text", autocomplete: "cc-number", value: "4111111111111111" });
  const note = create("textarea", { autocomplete: "one-time-code", value: "998877" });
  note.value = "998877";
  const month = create(
    "select",
    { autocomplete: "cc-exp-month", "aria-label": "Expiry month" },
    create("option", { value: "01" }, "January"),
    create("option", { value: "02", selected: "" }, "February"),
  );
  const country = create(
    "select",
    { id: "country" },
    create("option", { value: "tw" }, "Taiwan"),
    create("option", { value: "jp", selected: "" }, "Japan"),
  );
  const plain = create("input", { type: "text", value: "hello" });
  document.body.append(
    create("h1", {}, "Checkout"),
    create("label", { for: "pw" }, "Password"),
    pw,
    card,
    note,
    month,
    country,
    plain,
    create("button", {}, "Pay now"),
  );
  return { document, pw };
}

function testSensitiveValuesAreRedacted() {
  const { document } = buildFormPage();
  const context = loadTree(document);
  const result = context.window.__generateAccessibilityTree("all", null, 50000, null);
  const output = result.pageContent;

  assert.equal(output.includes("hunter2-secret"), false, "password value must not appear");
  assert.equal(output.includes("4111111111111111"), false, "card number must not appear");
  assert.equal(output.includes("998877"), false, "one-time code must not appear");
  assert.match(output, /textbox "\[value redacted\]"/, "sensitive values are replaced with a redaction marker");
  assert.match(output, /combobox "Expiry month"/, "sensitive selects keep their accessible label");
  assert.equal(output.includes("January"), false, "sensitive select options must not be listed");
  assert.equal(output.includes("February"), false, "sensitive select selection must not be listed");
  assert.match(output, /option "Japan" \(selected\) value="jp"/, "ordinary select options stay visible");
  assert.match(output, /textbox "hello"/, "ordinary short values stay visible");
  assert.match(output, /button "Pay now"/);
}

function testRefsAreReusedThroughReverseMap() {
  const { document, pw } = buildFormPage();
  const context = loadTree(document);
  const first = context.window.__generateAccessibilityTree("all", null, 50000, null).pageContent;
  const second = context.window.__generateAccessibilityTree("all", null, 50000, null).pageContent;
  assert.equal(first, second, "repeated reads keep identical refs");
  assert.equal(context.window.__claudeElementReverseMap instanceof WeakMap, true);
  const ref = context.window.__claudeElementReverseMap.get(pw);
  assert.match(ref, /^ref_\d+$/);
  assert.equal(context.window.__claudeElementMap[ref].deref(), pw);
}

function testOversizedOutputIsTruncatedAtLineBoundary() {
  const { document } = buildFormPage();
  const context = loadTree(document);
  const full = context.window.__generateAccessibilityTree("all", null, 50000, null).pageContent;
  const limit = Math.floor(full.length / 2);
  const result = context.window.__generateAccessibilityTree("all", null, limit, null);

  assert.equal(result.error, undefined, "oversized output is no longer an error");
  const [body, note] = result.pageContent.split("\n[output truncated at ");
  assert.ok(note, "truncated output ends with a guidance note");
  assert.ok(body.length <= limit, "kept content respects the limit");
  assert.equal(full.startsWith(body + "\n"), true, "truncation happens at a line boundary");
  assert.match(note, new RegExp(`^${limit} of ${full.length} characters\\. Pass a larger max_chars`));
}

function testTraversalIsCappedAtTenThousandElements() {
  const document = createDocument();
  for (let index = 0; index < 10005; index += 1) {
    document.body.append(document.create("button", {}, `Item ${index}`));
  }
  const context = loadTree(document);
  const output = context.window.__generateAccessibilityTree("interactive", null, null, null).pageContent;
  const lines = output.split("\n");
  assert.equal(lines.filter((line) => line.includes("button")).length, 10000);
  assert.match(output, /\[truncated at 10000 elements — page is very large; use a refId or smaller depth to focus\]$/);
}

function testReadPageDescriptionDocumentsTruncation() {
  const source = fs.readFileSync(mcpPermissionsPath, "utf8");
  assert.equal(
    source.includes(
      "Output is limited to 50000 characters - if exceeded, the tree is truncated at a line boundary with a note giving the full size; pass a larger max_chars, or use depth/ref_id to focus.",
    ),
    true,
    "read_page tool description should describe truncation",
  );
}

function main() {
  testSensitiveValuesAreRedacted();
  testRefsAreReusedThroughReverseMap();
  testOversizedOutputIsTruncatedAtLineBoundary();
  testTraversalIsCappedAtTenThousandElements();
  testReadPageDescriptionDocumentsTruncation();
  console.log("accessibility tree hardening tests passed");
}

main();
