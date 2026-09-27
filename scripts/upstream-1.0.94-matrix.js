const UPSTREAM_1_0_94_SOURCE = Object.freeze({
  manifestVersion: "1.0.94",
  gitHash: "e884a41a3e844489d46a5eac649ad57d54a9c5bf",
});

const UPSTREAM_1_0_94_BEHAVIOR_MATRIX = Object.freeze([
  {
    id: "read-page-hardening",
    status: "equivalent",
    evidence: "Source accessibility tree redacts sensitive values, reuses refs through a reverse WeakMap, caps traversal, and truncates at a line boundary.",
    owners: ["src/assets/accessibility-tree.js-D8KNCIWO.js"],
    testTarget: "tests/unit/accessibility-tree-hardening.test.js",
  },
  {
    id: "javascript-tool-repl-semantics",
    status: "equivalent",
    evidence: "Source javascript_tool evaluates with Runtime.evaluate replMode and falls back to an async wrapper for return statements.",
    owners: ["src/assets/mcpPermissions-qqAoJjJ8.js"],
    testTarget: "tests/unit/javascript-tool-repl.regression.test.js",
  },
  {
    id: "computer-scale-and-input-guards",
    status: "equivalent",
    evidence: "Source computer tool accepts a screenshot scale, rejects page-zoom shortcuts, and validates type text.",
    owners: ["src/assets/mcpPermissions-qqAoJjJ8.js"],
    testTarget: "tests/unit/computer-tool-guards.regression.test.js",
  },
  {
    id: "mid-call-blocked-navigation",
    status: "equivalent",
    evidence: "Source discards results when a call navigates into a blocked site and uses dedicated managed-policy wording.",
    owners: ["src/assets/mcpPermissions-qqAoJjJ8.js", "src/shared/managed-policy.js"],
    testTarget: "tests/unit/blocked-navigation-guard.regression.test.js",
  },
  {
    id: "extension-interference-recovery",
    status: "equivalent",
    evidence: "Source strips foreign-extension frames and retries debugger attach behind cicStripExtensionInterference.",
    owners: ["src/assets/mcpPermissions-qqAoJjJ8.js"],
    testTarget: "tests/unit/extension-interference-recovery.test.js",
  },
  {
    id: "minimized-window-click-guard",
    status: "equivalent",
    evidence: "Source intercepts new-window link clicks in minimized windows and opens them as grouped tabs.",
    owners: ["src/assets/mcpPermissions-qqAoJjJ8.js"],
    testTarget: "tests/unit/minimized-window-click-guard.test.js",
  },
  {
    id: "phantom-cursor-and-stop-hardening",
    status: "equivalent",
    evidence: "Source indicator draws UPDATE_PHANTOM_CURSOR positions, requires trusted stop clicks, and reports STOP_AGENT_DROPPED.",
    owners: ["src/assets/agent-visual-indicator.js-Ct7LqXhp.js"],
    testTarget: "tests/unit/agent-indicator-phantom-cursor.test.js",
  },
  {
    id: "gif-mixed-frame-padding",
    status: "equivalent",
    evidence: "Source offscreen GIF export pads mixed-size frames after overlays.",
    owners: ["src/offscreen/offscreen.js"],
    testTarget: "tests/unit/offscreen.test.js",
  },
  {
    id: "browser-batch-tool",
    status: "missing",
    evidence: "Source browser_batch executes sequential tool calls in one round trip with per-item permission and blocked-site checks.",
    owners: ["src/assets/mcpPermissions-qqAoJjJ8.js"],
    testTarget: "tests/unit/browser-batch.test.js",
  },
  {
    id: "tool-activity-labels",
    status: "missing",
    evidence: "Source tool rows use running, done, and failed labels with host permission states.",
    owners: ["src/assets/sidepanel-BoLm9pmH.js"],
    testTarget: "tests/unit/tool-activity-labels.test.js",
  },
  {
    id: "external-link-safety",
    status: "missing",
    evidence: "Source external-link dialog warns about embedded credentials and delays activation.",
    owners: ["src/assets/sidepanel-BoLm9pmH.js"],
    testTarget: "tests/unit/link-safety.test.js",
  },
  {
    id: "markdown-local-time-hint",
    status: "missing",
    evidence: "Source Markdown shows the reader's local time for times with an explicit zone.",
    owners: ["src/assets/sidepanel-BoLm9pmH.js"],
    testTarget: "tests/unit/local-time-hint.test.js",
  },
  {
    id: "claude-account-surfaces",
    status: "excluded",
    evidence: "Source adds Cowork embedding, Claude Desktop pairing, claude.ai skill schedules, voice authentication, and server-side URL classification.",
    risk: "Each surface requires a Claude account, Claude.ai origin, or Anthropic service and conflicts with the provider-independent product.",
    owners: ["docs/product-specs/remove-claude-specific-slices.md"],
    testTarget: "tests/unit/provider-independence.regression.test.js",
  },
  {
    id: "renderer-engine-swaps",
    status: "equivalent",
    evidence: "Source replaces syntax highlighting with Shiki and bundles Mermaid; Claw already highlights code and renders Mermaid.",
    owners: ["src/shared/mermaid-renderer.js", "src/assets/sidepanel-BoLm9pmH.js"],
    testTarget: "tests/unit/mermaid-artifact-rendering.regression.test.js",
  },
  {
    id: "element-selection-mcp-notification",
    status: "excluded",
    evidence: "Source defines selectElementAndSend and captureAndSendScreenshot but never invokes them.",
    risk: "Porting dormant code adds an unreviewed page-to-MCP message path with no user-visible entry point.",
    owners: ["docs/product-specs/upstream-1.0.94-recovery.md"],
    testTarget: "tests/unit/upstream-1.0.94-matrix.test.js",
  },
]);

module.exports = {
  UPSTREAM_1_0_94_SOURCE,
  UPSTREAM_1_0_94_BEHAVIOR_MATRIX,
};
