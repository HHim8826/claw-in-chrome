const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const batch = require(path.join(rootDir, "src", "shared", "browser-batch.js"));

function tool(name, handler) {
  const calls = [];
  return {
    name,
    calls,
    execute: async (input, context) => {
      calls.push({ input, context });
      return handler(input, context, calls.length);
    },
  };
}

function createDeps(overrides = {}) {
  const log = { committed: [], cleared: [], forgotten: [], recorded: [], tabGets: 0 };
  let clock = 0;
  const deps = {
    isEnabled: async () => true,
    coerceInput: (_name, input) => input,
    resolveTabId: async (tabId) => {
      if (tabId === 99) throw new Error("Tab 99 is not in the current group");
      return tabId;
    },
    isTabInSameGroup: async (a, b) => a === b || b === 8,
    detectBlockedNavigation: async () => null,
    getTab: async () => {
      log.tabGets += 1;
      return { status: "complete" };
    },
    getTabContext: async (tabId) => ({ currentTabId: tabId, availableTabs: [], tabCount: 0 }),
    recordStep: async (name, input, tabId, image) => log.recorded.push({ name, tabId, image }),
    beginPendingScope: () => 7,
    commitPendingContexts: (scope) => log.committed.push(scope),
    clearPendingContexts: (scope) => log.cleared.push(scope),
    forgetImage: (id) => log.forgotten.push(id),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    ...overrides,
  };
  return { deps, log };
}

async function testValidation() {
  assert.deepEqual(batch.validateInput({}), { ok: false, error: "actions must be a non-empty array" });
  assert.deepEqual(batch.validateInput({ actions: [] }), { ok: false, error: "actions must be a non-empty array" });
  assert.deepEqual(batch.validateInput({ actions: [{ input: {} }] }), { ok: false, error: "actions[0].name must be a string" });
  assert.deepEqual(batch.validateInput({ actions: [{ name: "browser_batch", input: {} }] }), {
    ok: false,
    error: "actions[0]: browser_batch cannot be nested",
  });
  assert.deepEqual(batch.validateInput({ actions: [{ name: "find", input: "x" }] }), { ok: false, error: "actions[0].input must be an object" });
  const { deps } = createDeps();
  const result = await batch.execute({ actions: [] }, { tabId: 5 }, deps);
  assert.equal(result.errorCode, "batch_invalid_input");
}

async function testSuccessfulBatchRunsSequentially() {
  const order = [];
  const screenshot = tool("computer", (input) => {
    order.push(input.action);
    return input.action === "screenshot"
      ? { output: "Captured", base64Image: "IMG", imageFormat: "jpeg", imageId: "ss_1" }
      : { output: "Clicked" };
  });
  const navigate = tool("navigate", () => {
    order.push("navigate");
    return { output: "Navigated", tabContext: { currentTabId: 5, executedOnTabId: 5, availableTabs: [{ id: 5 }], tabCount: 1 } };
  });
  let tabGetCount = 0;
  const { deps, log } = createDeps({
    getTab: async () => {
      tabGetCount += 1;
      return { status: tabGetCount === 1 ? "loading" : "complete" };
    },
  });
  const progress = [];
  const result = await batch.execute(
    {
      actions: [
        { name: "computer", input: { action: "left_click", coordinate: [1, 2] } },
        { name: "navigate", input: { url: "https://example.com" } },
        { name: "computer", input: { action: "screenshot" } },
      ],
    },
    { tabId: 5, availableTools: [screenshot, navigate], onBatchProgress: (event) => progress.push(event) },
    deps,
  );
  assert.deepEqual(order, ["left_click", "navigate", "screenshot"]);
  assert.deepEqual(result.batchItems, [
    { label: "computer:left_click", output: "Clicked", base64Image: undefined, imageFormat: undefined },
    { label: "navigate", output: "Navigated", base64Image: undefined, imageFormat: undefined },
    { label: "computer:screenshot", output: "Captured", base64Image: "IMG", imageFormat: "jpeg" },
  ]);
  assert.deepEqual(result.mintedImageIds, ["ss_1"]);
  assert.equal(result.tabContext.executedOnTabId, 5, "the latest tab context is returned");
  assert.deepEqual(log.committed, [7], "deferred coordinate contexts are committed on success");
  assert.deepEqual(log.cleared, []);
  assert.deepEqual(
    progress.map((event) => `${event.index}:${event.status}`),
    ["0:running", "0:ok", "1:running", "1:ok", "2:running", "2:ok"],
  );
  assert.equal(screenshot.calls[0].context.inBatch, true);
  assert.equal(screenshot.calls[0].context.pendingContextScope, 7);
  assert.equal(log.recorded.length, 3, "each step is offered to GIF recording");
  assert.equal(tabGetCount >= 2, true, "a loading tab is awaited between steps");
}

async function testFirstErrorStopsTheBatch() {
  const computer = tool("computer", (input) =>
    input.action === "screenshot" ? { output: "Captured", base64Image: "IMG", imageId: "ss_failed" } : { error: "boom" },
  );
  const find = tool("find", () => ({ output: "found" }));
  const { deps, log } = createDeps();
  const result = await batch.execute(
    {
      actions: [
        { name: "computer", input: { action: "screenshot" } },
        { name: "computer", input: { action: "left_click" } },
        { name: "find", input: { query: "x" } },
      ],
    },
    { tabId: 5, availableTools: [computer, find] },
    deps,
  );
  assert.equal(result.error, "actions[1] (computer:left_click) failed: boom (1 completed, 1 remaining)");
  assert.equal(result.errorCode, "batch_subaction_failed");
  assert.deepEqual(result.batchItems, [{ label: "computer:screenshot", output: "Captured [Image omitted due to error]" }]);
  assert.equal(find.calls.length, 0);
  assert.deepEqual(log.cleared, [7], "deferred contexts are cleared on failure");
  assert.deepEqual(log.forgotten, ["ss_failed"], "screenshots from a failed batch can't be uploaded later");
}

async function testSuccessfulBatchKeepsItsScreenshots() {
  const computer = tool("computer", () => ({ output: "Captured", base64Image: "IMG", imageId: "ss_kept" }));
  const { deps, log } = createDeps();
  const result = await batch.execute({ actions: [{ name: "computer", input: { action: "screenshot" } }] }, { tabId: 5, availableTools: [computer] }, deps);
  assert.deepEqual(result.mintedImageIds, ["ss_kept"]);
  assert.deepEqual(log.forgotten, []);
}

async function testFailuresAfterScreenshotsForgetThem() {
  const shot = tool("computer", () => ({ output: "Captured", base64Image: "IMG", imageId: "ss_early" }));
  const throwing = tool("find", () => {
    throw new Error("kaboom");
  });
  const exception = createDeps();
  await batch.execute(
    { actions: [{ name: "computer", input: { action: "screenshot" } }, { name: "find", input: {} }] },
    { tabId: 5, availableTools: [shot, throwing] },
    exception.deps,
  );
  assert.deepEqual(exception.log.forgotten, ["ss_early"], "exceptions forget earlier screenshots");

  const unknown = createDeps();
  await batch.execute(
    { actions: [{ name: "computer", input: { action: "screenshot" } }, { name: "nope", input: {} }] },
    { tabId: 5, availableTools: [shot] },
    unknown.deps,
  );
  assert.deepEqual(unknown.log.forgotten, ["ss_early"], "unknown tools forget earlier screenshots");

  let cancelled = false;
  const cancelling = createDeps();
  await batch.execute(
    { actions: [{ name: "computer", input: { action: "screenshot" } }, { name: "computer", input: { action: "screenshot" } }] },
    {
      tabId: 5,
      availableTools: [tool("computer", () => {
        cancelled = true;
        return { output: "Captured", base64Image: "IMG", imageId: "ss_before_cancel" };
      })],
      isCancelled: () => cancelled,
    },
    cancelling.deps,
  );
  assert.deepEqual(cancelling.log.forgotten, ["ss_before_cancel"], "cancellation forgets earlier screenshots");
}

async function testPermissionPromptsSurfaceOnlyAfterTrivialItems() {
  const tabs = tool("tabs_context_mcp", () => ({ output: "tabs" }));
  const sentinel = { type: "permission_required", tool: "navigate", url: "https://secure.example/login", toolUseId: "tu_1" };
  const navigate = tool("navigate", () => sentinel);
  const { deps } = createDeps();
  const surfaced = await batch.execute(
    { actions: [{ name: "tabs_context_mcp", input: {} }, { name: "navigate", input: { url: "https://secure.example/login" } }] },
    { tabId: 5, availableTools: [tabs, navigate] },
    deps,
  );
  assert.equal(surfaced, sentinel, "the executor can prompt and re-run the batch");

  const computer = tool("computer", () => ({ output: "Clicked" }));
  const failed = await batch.execute(
    { actions: [{ name: "computer", input: { action: "left_click" } }, { name: "navigate", input: { url: "https://secure.example/login" } }] },
    { tabId: 5, availableTools: [computer, navigate] },
    deps,
  );
  assert.equal(
    failed.error,
    "actions[1] (navigate) failed: permission_required: secure.example — call navigate standalone (not in browser_batch) so the user is prompted (1 completed, 0 remaining)",
  );
  assert.equal(failed.errorCode, "batch_permission_required");
}

async function testBlockedNavigationDiscardsPriorResults() {
  const computer = tool("computer", () => ({ output: "Captured", base64Image: "IMG", imageId: "ss_2" }));
  let checks = 0;
  const { deps, log } = createDeps({
    detectBlockedNavigation: async () => {
      checks += 1;
      return checks === 2 ? "This site is blocked by a policy set by your browser's administrator." : null;
    },
  });
  const result = await batch.execute(
    { actions: [{ name: "computer", input: { action: "screenshot" } }, { name: "computer", input: { action: "screenshot" } }, { name: "computer", input: { action: "screenshot" } }] },
    { tabId: 5, availableTools: [computer] },
    deps,
  );
  assert.equal(
    result.error,
    "actions[0] (computer:screenshot) failed: This site is blocked by a policy set by your browser's administrator. (0 prior results discarded; 2 not run)",
  );
  assert.equal(result.errorCode, "batch_domain_blocked");
  assert.deepEqual(result.batchItems, []);
  assert.deepEqual(log.forgotten, ["ss_2"], "screenshots from a blocked batch are forgotten");
}

async function testMidCallGuardErrorsAlsoDiscard() {
  const computer = tool("computer", (_input, _context, count) =>
    count === 1 ? { output: "ok" } : { error: "blocked (1 prior result discarded; 0 not run)", errorCode: "navigation_blocked_mid_call" },
  );
  const { deps } = createDeps();
  const result = await batch.execute(
    { actions: [{ name: "computer", input: { action: "left_click" } }, { name: "computer", input: { action: "left_click" } }] },
    { tabId: 5, availableTools: [computer] },
    deps,
  );
  assert.equal(result.errorCode, "navigation_blocked_mid_call");
  assert.deepEqual(result.batchItems, []);
}

async function testTabsOutsideTheGroupFailBeforeExecution() {
  const computer = tool("computer", () => ({ output: "ok" }));
  const { deps } = createDeps();
  const result = await batch.execute(
    { actions: [{ name: "computer", input: { action: "left_click", tabId: 5 } }, { name: "computer", input: { action: "left_click", tabId: 99 } }] },
    { tabId: 5, availableTools: [computer] },
    deps,
  );
  assert.equal(result.errorCode, "batch_tab_outside_group");
  assert.match(result.error, /^actions\[1\] \(computer:left_click\) failed: Tab 99 is not in the current group/);
  assert.equal(computer.calls.length, 0);
}

async function testUnknownDisabledCancelledAndExceptions() {
  const { deps } = createDeps();
  const unknown = await batch.execute({ actions: [{ name: "nope", input: {} }] }, { tabId: 5, availableTools: [] }, deps);
  assert.equal(unknown.errorCode, "batch_unknown_tool");

  const disabled = await batch.execute({ actions: [{ name: "find", input: {} }] }, { tabId: 5 }, createDeps({ isEnabled: async () => false }).deps);
  assert.deepEqual(disabled, { error: "browser_batch is currently disabled", errorCode: "batch_disabled" });

  const cancelled = await batch.execute(
    { actions: [{ name: "find", input: {} }] },
    { tabId: 5, availableTools: [tool("find", () => ({ output: "x" }))], isCancelled: () => true },
    deps,
  );
  assert.equal(cancelled.errorCode, "batch_cancelled");

  const throwing = tool("find", () => {
    throw new Error("kaboom");
  });
  const exception = await batch.execute({ actions: [{ name: "find", input: {} }] }, { tabId: 5, availableTools: [throwing] }, deps);
  assert.equal(exception.error, "Failed to execute batch: kaboom (0 completed)");
  assert.equal(exception.errorCode, "batch_exception");
}

function testToolResultContent() {
  const success = batch.toToolResultContent(
    {
      batchItems: [
        { label: "navigate", output: "Navigated" },
        { label: "computer:screenshot", output: "Captured", base64Image: "IMG", imageFormat: "jpeg" },
      ],
      tabContext: { executedOnTabId: 5, availableTabs: [] },
    },
    { formatTabContext: (context) => `Tab ${context.executedOnTabId}` },
  );
  assert.deepEqual(success, [
    { type: "text", text: "[navigate] Navigated" },
    { type: "text", text: "[computer:screenshot] Captured" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "IMG" } },
    { type: "text", text: "Tab 5" },
  ]);
  assert.equal(
    batch.toToolResultContent({ error: "actions[1] failed", batchItems: [{ label: "find", output: "x" }] }),
    "[find] x\n\nactions[1] failed",
  );
  assert.equal(batch.toToolResultContent({ error: "only error", batchItems: [] }), "only error");
  assert.equal(batch.isBatchResult({ batchItems: [] }), true);
  assert.equal(batch.isBatchResult({ output: "x" }), false);
}

function testPromptHelpers() {
  const state = { enabled: true, isSingleToolTurn: true, isError: false };
  assert.equal(batch.shouldAppendSingleCallReminder("navigate", {}, state), true);
  assert.equal(batch.shouldAppendSingleCallReminder("computer", { action: "left_click" }, state), true);
  assert.equal(batch.shouldAppendSingleCallReminder("computer", { action: "screenshot" }, state), false);
  assert.equal(batch.shouldAppendSingleCallReminder("read_page", {}, state), false);
  assert.equal(batch.shouldAppendSingleCallReminder("navigate", {}, { ...state, enabled: false }), false);
  assert.equal(batch.shouldAppendSingleCallReminder("navigate", {}, { ...state, isSingleToolTurn: false }), false);
  assert.equal(batch.shouldAppendSingleCallReminder("navigate", {}, { ...state, isError: true }), false);
  const reminder = { type: "text", text: `<system-reminder>${batch.SINGLE_CALL_REMINDER}</system-reminder>` };
  assert.deepEqual(batch.appendSingleCallReminder("done", "navigate", {}, state), [{ type: "text", text: "done" }, reminder]);
  assert.deepEqual(batch.appendSingleCallReminder([{ type: "text", text: "a" }], "navigate", {}, state), [{ type: "text", text: "a" }, reminder]);
  assert.equal(batch.appendSingleCallReminder("done", "read_page", {}, state), "done");
  assert.equal(batch.appendSystemPromptGuidance("Base", true), `Base\n${batch.SYSTEM_PROMPT_GUIDANCE}`);
  assert.equal(batch.appendSystemPromptGuidance("Base", false), "Base");
  assert.equal(batch.isEnabled(undefined), true);
  assert.equal(batch.isEnabled(false), false);
}

function testProgressSummary() {
  const input = { actions: [{ name: "navigate", input: {} }, { name: "computer", input: { action: "screenshot" } }] };
  assert.deepEqual(
    { ...batch.summarizeProgress([], input, undefined), steps: undefined },
    { total: 2, completed: 0, failed: false, steps: undefined },
  );
  const live = batch.summarizeProgress([{ index: 0, status: "ok" }, { index: 1, status: "error" }], input, undefined);
  assert.equal(live.completed, 2);
  assert.equal(live.failed, true);
  const restored = batch.summarizeProgress([], input, { is_error: false });
  assert.equal(restored.completed, 2);
  const restoredFailure = batch.summarizeProgress([], input, { is_error: true });
  assert.equal(restoredFailure.completed, null, "a restored failed batch doesn't claim every step completed");
  assert.equal(restoredFailure.failed, true);
}

async function testBlockedAfterEarlierStepsCountsOnlyPriorResults() {
  const computer = tool("computer", () => ({ output: "ok" }));
  let checks = 0;
  const { deps } = createDeps({
    detectBlockedNavigation: async () => {
      checks += 1;
      return checks === 4 ? "blocked" : null;
    },
  });
  const result = await batch.execute(
    { actions: [{ name: "computer", input: { action: "left_click" } }, { name: "computer", input: { action: "left_click" } }, { name: "computer", input: { action: "left_click" } }] },
    { tabId: 5, availableTools: [computer] },
    deps,
  );
  assert.equal(result.error, "actions[1] (computer:left_click) failed: blocked (1 prior result discarded; 1 not run)");
}

function testRuntimeWiring() {
  const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n/g, "\n");
  const mcp = read("src/assets/mcpPermissions-qqAoJjJ8.js");
  assert.equal(mcp.includes("const __cpBrowserBatchTool = {"), true, "the tool runtime defines browser_batch");
  assert.equal(mcp.includes("za.push(__cpBrowserBatchTool);"), true, "MCP clients can call browser_batch");
  assert.equal(mcp.includes("__cpBrowserBatchTool as a6,"), true, "the side panel can import browser_batch");
  assert.equal(mcp.includes("availableTools: za,"), true, "the MCP executor passes its tool list");
  assert.equal(mcp.includes("if (__cpGetBrowserBatchApi()?.isBatchResult(e)) {"), true, "MCP results keep batch images");
  const sidepanel = read("src/assets/sidepanel-BoLm9pmH.js");
  assert.equal(sidepanel.includes("a6 as __cpBrowserBatchTool"), true);
  assert.equal(sidepanel.includes("availableTools: __cpActiveToolsForTurn(),"), true, "the side panel passes its enabled tools");
  assert.equal(sidepanel.includes("onBatchProgress: e => __cpBrowserBatchProgressStore.upsert(n, e),"), true);
  assert.equal(sidepanel.includes("if (globalThis.__CP_BROWSER_BATCH__?.isBatchResult(e)) {"), true, "side-panel results keep batch images");
  assert.equal(sidepanel.includes("const i = r.completed === null ? e.formatMessage({"), true, "restored failed batches show only the action count");
  const loader = read("src/background/service-worker-loader.js");
  assert.equal(loader.includes('import "../shared/browser-batch.js";'), true);
  const sidepanelHtml = read("src/sidepanel/sidepanel.html");
  assert.equal(sidepanelHtml.includes('<script src="/shared/browser-batch.js"></script>'), true);
  const release = read(".github/release-package-items.txt");
  assert.equal(release.includes("shared/browser-batch.js"), true);
}

async function main() {
  await testValidation();
  await testSuccessfulBatchRunsSequentially();
  await testFirstErrorStopsTheBatch();
  await testSuccessfulBatchKeepsItsScreenshots();
  await testFailuresAfterScreenshotsForgetThem();
  await testPermissionPromptsSurfaceOnlyAfterTrivialItems();
  await testBlockedNavigationDiscardsPriorResults();
  await testMidCallGuardErrorsAlsoDiscard();
  await testTabsOutsideTheGroupFailBeforeExecution();
  await testUnknownDisabledCancelledAndExceptions();
  testToolResultContent();
  testPromptHelpers();
  testProgressSummary();
  await testBlockedAfterEarlierStepsCountsOnlyPriorResults();
  testRuntimeWiring();
  console.log("browser batch tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
