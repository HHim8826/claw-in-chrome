const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "mcpPermissions-qqAoJjJ8.js");

function loadJavascriptTool({ url, evaluate }) {
  const source = fs.readFileSync(bundlePath, "utf8").replace(/\r\n/g, "\n");
  const start = source.indexOf("const we = {\n  name: \"javascript_tool\",");
  const end = source.indexOf("const ye = {\n  name: \"file_upload\",", start);
  assert.notEqual(start, -1, "javascript_tool definition should exist");
  assert.notEqual(end, -1, "javascript_tool definition should end before file_upload");
  const calls = [];
  const context = {
    URL,
    F: {
      getEffectiveTabId: async (tabId, fallback) => tabId ?? fallback,
      getValidTabsWithMetadata: async () => [{ id: 7 }],
    },
    chrome: { tabs: { get: async () => ({ id: 7, url }) } },
    c: { EXECUTE_JAVASCRIPT: "execute_javascript" },
    A: async () => null,
    K: {
      sendCommand: async (tabId, method, params) => {
        calls.push({ tabId, method, params });
        return evaluate(params, calls.length);
      },
    },
    l: 30000,
    d: 5000,
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.tool = we;`, context);
  return { tool: context.tool, calls };
}

const allowAll = { permissionManager: { checkPermission: async () => ({ allowed: true }) }, tabId: 7 };

async function testInternalPagesAreRejected() {
  for (const url of ["chrome://settings", "chrome-extension://abc/options.html"]) {
    const { tool, calls } = loadJavascriptTool({ url, evaluate: () => ({ result: { type: "undefined" } }) });
    const result = await tool.execute({ action: "javascript_exec", text: "1 + 1", tabId: 7 }, allowAll);
    const scheme = url.slice(0, url.indexOf(":") + 1);
    assert.equal(
      result.error,
      `JavaScript execution is not allowed on ${scheme}// pages. Navigate to a regular web page (http:// or https://) first, then retry.`,
    );
    assert.equal(calls.length, 0, "internal pages never reach Runtime.evaluate");
  }
}

async function testCodeRunsWithReplSemantics() {
  const { tool, calls } = loadJavascriptTool({
    url: "https://example.com/",
    evaluate: () => ({ result: { type: "number", value: 42 } }),
  });
  const result = await tool.execute({ action: "javascript_exec", text: "await Promise.resolve(42)", tabId: 7 }, allowAll);
  assert.equal(result.output, "42");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "Runtime.evaluate");
  assert.equal(calls[0].params.expression, "{await Promise.resolve(42)\n}");
  assert.equal(calls[0].params.replMode, true);
  assert.equal(calls[0].params.awaitPromise, true);
  assert.equal(calls[0].params.returnByValue, true);
}

async function testReturnStatementsFallBackToAsyncWrapper() {
  const { tool, calls } = loadJavascriptTool({
    url: "https://example.com/",
    evaluate: (params, callIndex) =>
      callIndex === 1
        ? {
            exceptionDetails: {
              exception: { className: "SyntaxError", description: "SyntaxError: Illegal return statement" },
            },
          }
        : { result: { type: "string", value: "done" } },
  });
  const result = await tool.execute({ action: "javascript_exec", text: "return document.title", tabId: 7 }, allowAll);
  assert.equal(result.output, "done");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params.expression, "(async()=>{\nreturn document.title\n})()");
  assert.equal(calls[1].params.replMode, false);
}

async function testRuntimeSyntaxErrorsWithStackAreReported() {
  const { tool, calls } = loadJavascriptTool({
    url: "https://example.com/",
    evaluate: () => ({
      exceptionDetails: {
        exception: { className: "SyntaxError", description: "SyntaxError: Illegal return statement" },
        stackTrace: { callFrames: [] },
      },
    }),
  });
  const result = await tool.execute({ action: "javascript_exec", text: "eval('return 1')", tabId: 7 }, allowAll);
  assert.equal(calls.length, 1, "errors thrown at runtime are not retried");
  assert.match(result.error, /^JavaScript execution error: SyntaxError: Illegal return statement/);
}

function testDescriptionsDocumentReplSemantics() {
  const source = fs.readFileSync(bundlePath, "utf8");
  const description =
    "The JavaScript code to execute. Evaluated in the page context with REPL semantics: top-level `await` works, and the result of the last expression is returned automatically — write the expression you want (e.g. `window.myData.value`, or `await fetch(url).then(r=>r.json())`) rather than `return ...`. You can access and modify the DOM, call page functions, and interact with page variables.";
  assert.equal(source.split(description).length - 1, 2, "both javascript_tool schemas should use the REPL description");
  assert.equal(source.includes("Do NOT use 'return' statements"), false);
}

async function main() {
  await testInternalPagesAreRejected();
  await testCodeRunsWithReplSemantics();
  await testReturnStatementsFallBackToAsyncWrapper();
  await testRuntimeSyntaxErrorsWithStackAreReported();
  testDescriptionsDocumentReplSemantics();
  console.log("javascript_tool REPL regression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
