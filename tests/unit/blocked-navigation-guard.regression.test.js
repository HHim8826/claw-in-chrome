const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const mcpPath = path.join(rootDir, "src", "assets", "mcpPermissions-qqAoJjJ8.js");
const sidepanelPath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");

const ADMIN_MESSAGE = "This site is blocked by a policy set by your browser's administrator.";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function loadGuard({ tabs, managedBlocked = [], apiCategories = {} }) {
  const source = read(mcpPath);
  const startMarker = "// __cp-blocked-navigation-guard:start";
  const endMarker = "// __cp-blocked-navigation-guard:end";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notEqual(start, -1, "guard block start marker should exist");
  assert.notEqual(end, -1, "guard block end marker should exist");
  const isManagedBlocked = (url) => managedBlocked.some((pattern) => url.includes(pattern));
  const context = {
    chrome: {
      tabs: {
        get: async (tabId) => {
          if (!tabs[tabId]) throw new Error("No tab");
          return tabs[tabId];
        },
      },
    },
    $: { isUrlBlockedByManagedPolicy: async (url) => isManagedBlocked(url) },
    O: {
      getCategory: async (url) => (isManagedBlocked(url) ? "category_org_blocked" : apiCategories[url]),
    },
    Ja: (category) => category === "category1" || category === "category2" || category === "category_org_blocked",
    Xa: ["tabs_context_mcp", "tabs_create_mcp", "tabs_close_mcp"],
    __cpMcpTablessToolNames: ["update_plan", "turn_answer_start", "shortcuts_list"],
    __cpMcpLocalImageRegistry: new Map([["ss_1", { base64: "abc" }]]),
  };
  vm.createContext(context);
  vm.runInContext(
    `${source.slice(start, end)}\nthis.install = __cpInstallBlockedNavigationGuard; this.messageFor = __cpBlockedSiteErrorMessage; this.reported = __cpBlockedNavigationReportedTabs;`,
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
  const result = await computer.execute({ action: "left_click" }, { tabId: 5 });
  assert.deepEqual({ ...result }, {
    error: `${ADMIN_MESSAGE} (1 prior result discarded; 0 not run)`,
    errorCode: "navigation_blocked_mid_call",
  });
  assert.equal(guard.__cpMcpLocalImageRegistry.has("ss_1"), false, "discarded screenshot is forgotten");
  assert.equal(guard.reported.has(5), true, "the tab is marked as already reported");
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
  assert.equal(result.error, "This site is blocked. (1 prior result discarded; 0 not run)");
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

async function testBlockedSiteMessages() {
  const guard = loadGuard({ tabs: {}, managedBlocked: ["intranet.example"] });
  assert.equal(await guard.messageFor("category_org_blocked", "https://intranet.example/", "x"), ADMIN_MESSAGE);
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
    source.includes("if (l !== undefined && __cpBlockedNavigationReportedTabs.delete(l)) {\n      cn = undefined;\n      ln = undefined;\n    }"),
    true,
    "MCP executor doesn't report the same blocked navigation on the next call",
  );
  assert.equal(
    source.split("await __cpBlockedSiteErrorMessage(").length - 1 >= 3,
    true,
    "navigate, the MCP pre-check, and the guard use the shared wording",
  );
  const sidepanel = read(sidepanelPath);
  assert.equal(
    sidepanel.includes('defaultMessage: "This site is blocked by a policy set by your browser\'s administrator.",\n          id: "sSc7jfY6Q4"'),
    true,
    "blocked-site notice uses the administrator wording",
  );
}

async function main() {
  await testManagedPolicyNavigationDiscardsResult();
  await testPendingUrlIsChecked();
  await testOtherBlockCategoriesUseGenericWording();
  await testSafeResultsAndSentinelsPassThrough();
  await testTabManagementToolsAreExemptAndInstallIsIdempotent();
  await testBlockedSiteMessages();
  testRuntimeWiring();
  console.log("blocked navigation guard regression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
