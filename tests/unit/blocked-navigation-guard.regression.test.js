const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const mcpPath = path.join(rootDir, "src", "assets", "mcpPermissions-qqAoJjJ8.js");
const sidepanelPath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");

const ADMIN_MESSAGE = "This site is blocked by a policy set by your browser's administrator.";
const USER_MESSAGE = "This site is on your blocked sites list in Claw in Chrome settings.";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function loadGuard({ tabs, managedBlocked = [], userBlocked = [], apiCategories = {} }) {
  const source = read(mcpPath);
  const startMarker = "// __cp-blocked-navigation-guard:start";
  const endMarker = "// __cp-blocked-navigation-guard:end";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notEqual(start, -1, "guard block start marker should exist");
  assert.notEqual(end, -1, "guard block end marker should exist");
  const isManagedBlocked = (url) => managedBlocked.some((pattern) => url.includes(pattern));
  const isUserBlocked = (url) => userBlocked.some((pattern) => url.includes(pattern));
  const blockSource = (url) => (isManagedBlocked(url) ? "managed" : isUserBlocked(url) ? "user" : null);
  const context = {
    chrome: {
      tabs: {
        get: async (tabId) => {
          if (!tabs[tabId]) throw new Error("No tab");
          return tabs[tabId];
        },
      },
    },
    $: { getUrlBlockSource: async (url) => blockSource(url) },
    O: {
      getCategory: async (url) => (blockSource(url) ? "category_org_blocked" : apiCategories[url]),
    },
    Ja: (category) => category === "category1" || category === "category2" || category === "category_org_blocked",
    Xa: ["tabs_context_mcp", "tabs_create_mcp", "tabs_close_mcp"],
    __cpMcpTablessToolNames: ["update_plan", "turn_answer_start", "shortcuts_list"],
    __cpMcpLocalImageRegistry: new Map([["ss_1", { base64: "abc" }]]),
  };
  vm.createContext(context);
  vm.runInContext(
    `${source.slice(start, end)}\nthis.install = __cpInstallBlockedNavigationGuard; this.messageFor = __cpBlockedSiteErrorMessage; this.reported = __cpBlockedNavigationReportedToolUses;`,
    context,
  );
  return context;
}

function tool(name, result) {
  return { name, execute: async () => result };
}

async function testManagedPolicyNavigationDiscardsResult() {
  const guard = loadGuard({ tabs: { 5: { url: "https://intranet.example/admin" } }, managedBlocked: ["intranet.example"] });
  const computer = tool("computer", { output: "Clicked", imageId: "ss_1", tabContext: { executedOnTabId: 5 } });
  guard.install([computer]);
  const result = await computer.execute({ action: "left_click" }, { tabId: 5, toolUseId: "tu_mcp", trackBlockedNavigation: true });
  assert.deepEqual({ ...result }, {
    error: `${ADMIN_MESSAGE} (this call's result was discarded)`,
    errorCode: "navigation_blocked_mid_call",
  });
  assert.equal(guard.__cpMcpLocalImageRegistry.has("ss_1"), false, "discarded screenshot is forgotten");
  assert.equal(guard.reported.has("tu_mcp"), true, "the MCP tool use is marked as already reported");
}

async function testSidePanelCallsAreNotRecorded() {
  const guard = loadGuard({ tabs: { 5: { url: "https://intranet.example/admin" } }, managedBlocked: ["intranet.example"] });
  const computer = tool("computer", { output: "Clicked" });
  guard.install([computer]);
  const result = await computer.execute({ action: "left_click" }, { tabId: 5, toolUseId: "tu_panel" });
  assert.equal(result.errorCode, "navigation_blocked_mid_call");
  assert.equal(guard.reported.size, 0, "only the MCP executor consumes reported entries, so the side panel never writes them");
}

async function testBatchItemsAreLeftToTheBatch() {
  const guard = loadGuard({ tabs: { 5: { url: "https://intranet.example/admin" } }, managedBlocked: ["intranet.example"] });
  const inner = tool("computer", { output: "Clicked" });
  const blockedBatch = tool("browser_batch", { error: "actions[0] failed: blocked", errorCode: "batch_domain_blocked", batchItems: [] });
  guard.install([inner, blockedBatch]);
  const innerResult = await inner.execute({}, { tabId: 5, inBatch: true, toolUseId: "tu_batch", trackBlockedNavigation: true });
  assert.equal(innerResult.output, "Clicked", "items inside a batch are checked by the batch itself");
  await blockedBatch.execute({}, { tabId: 5, toolUseId: "tu_batch", trackBlockedNavigation: true });
  assert.equal(guard.reported.has("tu_batch"), true, "a batch that reported a block is recorded for the MCP executor");

  const okGuard = loadGuard({ tabs: { 5: { url: "https://intranet.example/admin" } }, managedBlocked: ["intranet.example"] });
  const okBatch = tool("browser_batch", { batchItems: [{ label: "computer:left_click", output: "Clicked" }] });
  okGuard.install([okBatch]);
  const okResult = await okBatch.execute({}, { tabId: 5, toolUseId: "tu_ok", trackBlockedNavigation: true });
  assert.equal(okResult.batchItems.length, 1, "the guard doesn't re-check a finished batch");
  assert.equal(okGuard.reported.has("tu_ok"), false);
}

async function testPendingUrlIsChecked() {
  const guard = loadGuard({
    tabs: { 5: { url: "https://ok.example/", pendingUrl: "https://intranet.example/x" } },
    managedBlocked: ["intranet.example"],
  });
  const navigate = tool("navigate", { output: "Navigated" });
  guard.install([navigate]);
  const result = await navigate.execute({ url: "https://ok.example/" }, { tabId: 5 });
  assert.equal(result.errorCode, "navigation_blocked_mid_call");
}

async function testOtherBlockCategoriesUseGenericWording() {
  const guard = loadGuard({ tabs: { 5: { url: "https://bad.example/" } }, apiCategories: { "https://bad.example/": "category1" } });
  const find = tool("find", { output: "found" });
  guard.install([find]);
  const result = await find.execute({}, { tabId: 5 });
  assert.equal(result.error, "This site is blocked. (this call's result was discarded)");
}

async function testSafeResultsAndSentinelsPassThrough() {
  const guard = loadGuard({ tabs: { 5: { url: "https://intranet.example/" } }, managedBlocked: ["intranet.example"] });
  const permission = { type: "permission_required", tool: "click", url: "https://intranet.example/" };
  const failing = { error: "boom" };
  const a = tool("computer", permission);
  const b = tool("computer", failing);
  guard.install([a, b]);
  assert.equal(await a.execute({}, { tabId: 5 }), permission);
  assert.equal(await b.execute({}, { tabId: 5 }), failing);

  const safe = loadGuard({ tabs: { 5: { url: "https://ok.example/" } }, managedBlocked: ["intranet.example"] });
  const ok = { output: "fine" };
  const c = tool("computer", ok);
  safe.install([c]);
  assert.equal(await c.execute({}, { tabId: 5 }), ok);
}

async function testTabManagementToolsAreExemptAndInstallIsIdempotent() {
  const guard = loadGuard({ tabs: { 5: { url: "https://intranet.example/" } }, managedBlocked: ["intranet.example"] });
  const tabsContext = tool("tabs_context_mcp", { output: "tabs" });
  const plan = tool("update_plan", { output: "plan" });
  const computer = tool("computer", { output: "ok" });
  guard.install([tabsContext, plan, computer]);
  const wrapped = computer.execute;
  guard.install([computer]);
  assert.equal(computer.execute, wrapped, "installing twice doesn't double-wrap");
  assert.equal((await tabsContext.execute({}, { tabId: 5 })).output, "tabs");
  assert.equal((await plan.execute({}, { tabId: 5 })).output, "plan");
}

async function testUserBlocklistNavigationUsesUserWording() {
  const guard = loadGuard({ tabs: { 5: { url: "https://news.example/today" } }, userBlocked: ["news.example"] });
  const computer = tool("computer", { output: "Clicked" });
  guard.install([computer]);
  const result = await computer.execute({ action: "left_click" }, { tabId: 5 });
  assert.deepEqual({ ...result }, {
    error: `${USER_MESSAGE} (this call's result was discarded)`,
    errorCode: "navigation_blocked_mid_call",
  });
}

async function testBlockedSiteMessages() {
  const guard = loadGuard({ tabs: {}, managedBlocked: ["intranet.example"], userBlocked: ["news.example", "intranet.example"] });
  assert.equal(await guard.messageFor("category_org_blocked", "https://intranet.example/", "x"), ADMIN_MESSAGE);
  assert.equal(await guard.messageFor("category_org_blocked", "https://news.example/", "x"), USER_MESSAGE);
  assert.equal(
    await guard.messageFor("category_org_blocked", "https://other.example/", "x"),
    "This site is blocked by your organization's policy.",
  );
  assert.equal(await guard.messageFor("category1", "https://other.example/", "fallback"), "fallback");
}

function testRuntimeWiring() {
  const source = read(mcpPath);
  assert.equal(source.includes("__cpInstallBlockedNavigationGuard(za);"), true, "guard wraps the shared tool list");
  assert.equal(
    source.includes("if (__cpBlockedNavigationReportedToolUses.delete(t)) {\n      cn = undefined;\n      ln = undefined;\n    }"),
    true,
    "MCP executor doesn't report the same blocked navigation on the next call",
  );
  assert.equal(source.includes("availableTools: za,\n          trackBlockedNavigation: true,"), true, "only the MCP executor records reports");
  assert.equal(
    source.split("await __cpBlockedSiteErrorMessage(").length - 1 >= 3,
    true,
    "navigate, the MCP pre-check, and the guard use the shared wording",
  );
  assert.equal(
    source.includes('if (await $.isUrlBlockedBySitePolicy(e)) {\n      return "category_org_blocked";'),
    true,
    "domain categories block both administrator and user rules",
  );
  assert.equal(
    source.includes("return globalThis.__CP_MANAGED_POLICY__.getRuntime(chrome).getBlockSource(e);"),
    true,
    "block wording asks the readable runtime which list matched",
  );
  assert.equal(source.includes("isUrlBlockedByManagedPolicy"), false, "no caller treats user rules as administrator policy");
  const sidepanel = read(sidepanelPath);
  assert.equal(
    sidepanel.includes('defaultMessage: "This site is blocked by a policy set by your browser\'s administrator.",\n          id: "sSc7jfY6Q4"'),
    true,
    "blocked-site notice keeps the administrator wording",
  );
  assert.equal(
    sidepanel.includes('defaultMessage: "This site is on your blocked sites list in Claw settings.",\n          id: "cpUserBlockedSite"'),
    true,
    "blocked-site notice has user-list wording",
  );
  assert.equal(
    sidepanel.includes("const __cpBlockedNoticeSource = __cpUseSiteBlockSource(s, __cpBlockedNoticeUrl);"),
    true,
    "the notice resolves which list blocked the tab",
  );
  assert.equal(
    sidepanel.includes('blockedUrl: (ye.blockedTabs.find(e => e.tabId === ce) || ye.blockedTabs.find(e => e.category === xn))?.url || ""'),
    true,
    "the notice receives the blocked tab's URL",
  );
}

async function main() {
  await testManagedPolicyNavigationDiscardsResult();
  await testSidePanelCallsAreNotRecorded();
  await testBatchItemsAreLeftToTheBatch();
  await testPendingUrlIsChecked();
  await testOtherBlockCategoriesUseGenericWording();
  await testSafeResultsAndSentinelsPassThrough();
  await testTabManagementToolsAreExemptAndInstallIsIdempotent();
  await testUserBlocklistNavigationUsesUserWording();
  await testBlockedSiteMessages();
  testRuntimeWiring();
  console.log("blocked navigation guard regression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
