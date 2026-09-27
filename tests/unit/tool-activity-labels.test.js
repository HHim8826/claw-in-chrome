const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const labels = require(path.join(rootDir, "src", "shared", "tool-activity-labels.js"));

// Minimal ICU formatter: {name} values and {count, plural, one {...} other {...}}.
const intl = {
  formatMessage(descriptor, values = {}) {
    assert.ok(descriptor && descriptor.id && descriptor.defaultMessage, "a message descriptor is required");
    return descriptor.defaultMessage
      .replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_match, key, one, other) =>
        (values[key] === 1 ? one : other).replace(/#/g, String(values[key])),
      )
      .replace(/\{(\w+)\}/g, (_match, key) => String(values[key]));
  },
};

const running = undefined;
const done = { content: [{ type: "text", text: "ok" }] };
const failed = { is_error: true, content: "boom" };
const label = (name, input, result) => labels.describe(name, input, result, intl);

function testComputerActionsHaveThreeStates() {
  assert.deepEqual(label("computer", { action: "left_click" }, running), { text: "Clicking", icon: "click" });
  assert.deepEqual(label("computer", { action: "left_click" }, done), { text: "Clicked", icon: "click" });
  assert.deepEqual(label("computer", { action: "left_click" }, failed), { text: "Click failed", icon: "click" });
  assert.equal(label("computer", { action: "screenshot" }, done).text, "Captured page");
  assert.equal(label("computer", { action: "type", text: "secret" }, running).text, "Typing");
  assert.equal(label("computer", { action: "key", text: "ctrl+a" }, done).text, "Pressed ctrl+a");
  assert.equal(label("computer", { action: "key" }, failed).text, "Couldn't press key");
  assert.equal(label("computer", { action: "wait", duration: 1 }, running).text, "Waiting 1 second");
  assert.equal(label("computer", { action: "wait", duration: 3 }, done).text, "Waited 3 seconds");
  assert.equal(label("computer", { action: "scroll", scroll_direction: "up" }, done).text, "Scrolled up");
  assert.equal(label("computer", { action: "zoom" }, failed).text, "Couldn't zoom in");
  assert.equal(label("computer", { action: "hold_key", text: "shift" }, running).text, "Holding shift");
  assert.equal(label("computer", { action: "magic_wand" }, done).text, "Computer action: Magic wand");
}

function testPageToolsDescribeTheirTargets() {
  assert.deepEqual(label("navigate", { url: "https://www.example.com/path" }, running), { text: "Opening example.com", icon: "navigate" });
  assert.equal(label("navigate", { url: "https://example.com" }, done).text, "Opened example.com");
  assert.equal(label("navigate", { url: "https://example.com" }, failed).text, "Couldn't open example.com");
  assert.equal(label("navigate", { url: "back" }, done).text, "Went back");
  assert.equal(label("navigate", { url: "chrome://settings" }, done).text, "Opened a web page");
  assert.equal(label("navigate", {}, running).text, "Opening a page");
  assert.equal(label("find", { query: "Sign in button" }, done).text, 'Found "Sign in button"');
  assert.equal(label("find", {}, running).text, "Finding on page");
  assert.equal(label("read_page", { filter: "interactive" }, running).text, "Reading page (interactive)");
  assert.equal(label("get_page_text", {}, done).text, "Read page text");
  assert.equal(label("form_input", { value: "hunter2" }, done).text, "Filled in a field", "field values stay out of labels");
  assert.equal(label("javascript_tool", {}, failed).text, "Page script failed");
  assert.equal(label("tabs_create_mcp", {}, done).text, "Opened tab");
  assert.equal(label("tabs_context_mcp", {}, running).text, "Checking tabs");
  assert.equal(label("gif_creator", {}, done).text, "Created GIF");
  assert.equal(label("browser_batch", { actions: [{}, {}] }, running).text, "Batch — 2 actions");
  assert.equal(label("update_plan", {}, { content: "User has approved your plan." }).text, "Created a plan");
  assert.equal(label("update_plan", {}, { is_error: true, content: "Plan rejected by user." }).text, "Plan rejected");
  assert.equal(label("update_plan", {}, running).text, "Following a plan");
  assert.equal(label("TodoWrite", {}, done), null, "unknown tools keep their existing label");
}

function testLongValuesAreTruncated() {
  const query = "a".repeat(40);
  assert.equal(label("find", { query }, done).text, `Found "${"a".repeat(30)}..."`);
  assert.equal(labels.hostFromUrl(`https://${"b".repeat(60)}.example.com`).startsWith("…"), true);
}

function testEveryMessageIsTranslated() {
  for (const locale of ["en-US", "zh-CN", "zh-TW"]) {
    const messages = JSON.parse(fs.readFileSync(path.join(rootDir, "src", "i18n", `${locale}.json`), "utf8"));
    for (const [key, descriptor] of Object.entries(labels.MESSAGES)) {
      assert.equal(typeof messages[descriptor.id], "string", `${locale} is missing ${key} (${descriptor.id})`);
    }
  }
}

function testSidePanelUsesTheLabels() {
  const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n/g, "\n");
  const sidepanel = read("src/assets/sidepanel-BoLm9pmH.js");
  assert.equal(
    sidepanel.includes("const __cpToolActivityLabel = globalThis.__CP_TOOL_ACTIVITY_LABELS__?.describe(i, o, s, n);"),
    true,
    "tool rows prefer the three-state labels",
  );
  assert.equal(read("src/sidepanel/sidepanel.html").includes('<script src="/shared/tool-activity-labels.js"></script>'), true);
  assert.equal(read(".github/release-package-items.txt").includes("shared/tool-activity-labels.js"), true);
}

function main() {
  testComputerActionsHaveThreeStates();
  testPageToolsDescribeTheirTargets();
  testLongValuesAreTruncated();
  testEveryMessageIsTranslated();
  testSidePanelUsesTheLabels();
  console.log("tool activity label tests passed");
}

main();
