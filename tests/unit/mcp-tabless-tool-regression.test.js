const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const mcpPermissionsBundlePath = path.join(
  rootDir, "src", "assets",
  "mcpPermissions-qqAoJjJ8.js",
);

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source, snippet, label) {
  assert.equal(
    source.includes(snippet),
    true,
    `${label} should include the expected snippet`,
  );
}

function main() {
  const source = readSource(mcpPermissionsBundlePath);

  assertIncludes(
    source,
    "const __cpMcpTablessToolNames = [\n  \"update_plan\",\n  \"turn_answer_start\",\n  \"shortcuts_list\",\n];",
    "tab-less tool whitelist should include update_plan, turn_answer_start, and shortcuts_list",
  );

  assertIncludes(
    source,
    "if (\n          !this.context.tabId &&\n          !Xa.includes(e) &&\n          !__cpMcpTablessToolNames.includes(e)\n        ) {",
    "no-tab guard should exempt tab-less tools from the hard tab requirement",
  );

  assertIncludes(
    source,
    "const __cpPermissionPromptCanRunWithoutTab = s.name === \"update_plan\";\n          if (!c || (!__cpPermissionPromptCanRunWithoutTab && !this.context.tabId)) {",
    "update_plan permission approval should remain callable without a concrete tab",
  );

  assertIncludes(
    source,
    "const __cpPermissionTargetTabId =\n        Number.isFinite(Number(t)) && Number(t) > 0\n          ? Math.trunc(Number(t))\n          : null;",
    "permission popup handler should normalize missing tab ids to null",
  );

  assertIncludes(
    source,
    "if (__cpPermissionTargetTabId !== null) {\n        await F.addPermissionPrefix(__cpPermissionTargetTabId);\n        _n.set(__cpPermissionTargetTabId, null);\n      }",
    "permission prefix writes should be skipped when plan approval has no concrete tab",
  );

  assertIncludes(
    source,
    "tabId: __cpPermissionTargetTabId,\n            requestId: r,",
    "permission popup window should be allowed to open with requestId-only context",
  );

  assertIncludes(
    source,
    "if (s.name === \"update_plan\") {\n            // 语义锚点：update_plan 在 permission approve 后直接返回“plan approved”文本，\n            // 它的 permission_required 只作为计划审批闸门，不会像普通工具那样重跑 provider execute。\n            r.push(\n              a(s.id, {\n                output:\n                  \"User has approved your plan. You can now start executing the plan. Start with updating your todo list if applicable.\",\n              }),\n            );\n            continue;\n          }",
    "approved update_plan should synthesize a tool_result instead of retrying tool execution",
  );

  console.log("mcp tab-less tool regression test passed");
}

main();
