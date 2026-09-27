const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const batch = require(path.join(rootDir, "src", "shared", "browser-batch.js"));
const permissionBundlePath = path.join(rootDir, "src", "assets", "PermissionManager-9s959502.js");

// Loads the real PermissionManager class from the bundle with in-memory storage.
function loadPermissionManager() {
  const source = fs.readFileSync(permissionBundlePath, "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("class xy {");
  const end = source.indexOf("const __cpPermissionStoragePersistenceKey");
  assert.notEqual(start, -1, "PermissionManager class should exist");
  assert.notEqual(end, -1, "PermissionManager class should end before its storage key");
  const storage = new Map();
  const context = {
    URL,
    crypto: { randomUUID: () => `perm-${storage.size}-${Math.random().toString(36).slice(2)}` },
    chrome: { storage: { onChanged: { addListener() {} } } },
    $: async (key) => storage.get(key),
    j: async (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    __cpPermissionActionAllow: "allow",
    __cpPermissionActionDeny: "deny",
    __cpPermissionDurationOnce: "once",
    __cpPermissionDurationAlways: "always",
    __cpPermissionScopeTypeNetloc: "netloc",
    __cpPermissionScopeTypeDomainTransition: "domain_transition",
    __cpPermissionStoragePayloadPermissionsField: "permissions",
    __cpPermissionCacheKeyNoTool: "no-tool",
    __cpPermissionStoragePersistenceKey: "permissionStorage",
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.PermissionManager = xy;`, context);
  return new context.PermissionManager(() => false, {});
}

// A page tool that checks the site permission exactly like the real browser tools.
function pageTool(name, calls) {
  return {
    name,
    execute: async (input, context) => {
      const url = "https://shop.example/checkout";
      const permission = await context.permissionManager.checkPermission(url, context.toolUseId);
      if (!permission.allowed) {
        return permission.needsPrompt
          ? { type: "permission_required", tool: name, url, toolUseId: context.toolUseId }
          : { error: "Permission denied for this action on this domain" };
      }
      calls.push(input.action);
      return { output: `${input.action} done` };
    },
  };
}

const deps = {
  isEnabled: async () => true,
  coerceInput: (_name, input) => input,
  resolveTabId: async (tabId) => tabId,
  isTabInSameGroup: async () => true,
  detectBlockedNavigation: async () => null,
  getTab: async () => ({ status: "complete" }),
  getTabContext: async (tabId) => ({ currentTabId: tabId, availableTabs: [], tabCount: 0 }),
  beginPendingScope: () => 1,
  commitPendingContexts() {},
  clearPendingContexts() {},
  forgetImage() {},
  now: () => 0,
  sleep: async () => {},
};

async function testAllowOnceCoversTheWholeBatch() {
  const permissionManager = loadPermissionManager();
  const calls = [];
  const tools = [pageTool("computer", calls)];
  const input = {
    actions: [
      { name: "computer", input: { action: "left_click" } },
      { name: "computer", input: { action: "type" } },
      { name: "computer", input: { action: "key" } },
    ],
  };
  const context = { tabId: 5, toolUseId: "toolu_batch", availableTools: tools, permissionManager };

  const prompt = await batch.execute(input, context, deps);
  assert.equal(prompt.type, "permission_required", "the first page action surfaces the prompt");
  assert.deepEqual(calls, []);

  // The executor records "Allow once" for this tool call, then re-runs the batch.
  await permissionManager.grantPermission({ type: "netloc", netloc: "shop.example" }, "once", "toolu_batch");
  const result = await batch.execute(input, context, deps);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(calls, ["left_click", "type", "key"], "every item on the approved host runs");

  const leftover = await permissionManager.checkPermission("https://shop.example/", "toolu_batch");
  assert.equal(leftover.allowed, false, "the one-time grant doesn't outlive the batch");
  assert.equal(leftover.needsPrompt, true);
}

async function testOtherHostsStillNeedTheirOwnApproval() {
  const permissionManager = loadPermissionManager();
  await permissionManager.grantPermission({ type: "netloc", netloc: "shop.example" }, "once", "toolu_batch");
  const calls = [];
  const other = {
    name: "navigate",
    execute: async (_input, context) => {
      const permission = await context.permissionManager.checkPermission("https://bank.example/", context.toolUseId);
      return permission.allowed
        ? { output: "navigated" }
        : { type: "permission_required", tool: "navigate", url: "https://bank.example/", toolUseId: context.toolUseId };
    },
  };
  const result = await batch.execute(
    { actions: [{ name: "computer", input: { action: "left_click" } }, { name: "navigate", input: {} }] },
    { tabId: 5, toolUseId: "toolu_batch", availableTools: [pageTool("computer", calls), other], permissionManager },
    deps,
  );
  assert.deepEqual(calls, ["left_click"]);
  assert.equal(result.errorCode, "batch_permission_required", "a different host isn't covered by the approval");
}

async function main() {
  await testAllowOnceCoversTheWholeBatch();
  await testOtherHostsStillNeedTheirOwnApproval();
  console.log("browser batch permission regression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
