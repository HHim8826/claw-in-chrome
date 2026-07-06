const UPSTREAM_1_0_79_SOURCE = Object.freeze({
  manifestVersion: "1.0.79",
  gitHash: "84be9f3a200dd6d7aea5b06ceeb8faf753f0a443",
});

const UPSTREAM_1_0_79_BEHAVIOR_MATRIX = Object.freeze([
  {
    id: "managed-url-policy",
    status: "equivalent",
    evidence: "The generated permission runtime delegates blockedUrlPatterns to the tested readable policy module.",
    owners: [
      "src/manifest.json",
      "src/managed_schema.json",
      "src/assets/mcpPermissions-qqAoJjJ8.js",
    ],
    testTarget: "tests/unit/managed-policy-integration.regression.test.js",
  },
  {
    id: "forced-organization-login",
    status: "excluded",
    evidence: "The provider-independent product removes forceLoginOrgUUID and its Claude account gate.",
    risk: "Reintroduces a Claude organization dependency and policy-specific OAuth maintenance with no custom-provider benefit.",
    owners: [
      "docs/product-specs/remove-claude-specific-slices.md",
      "tests/unit/provider-independence.regression.test.js",
    ],
    testTarget: "tests/unit/provider-independence.regression.test.js",
  },
  {
    id: "mcp-oauth-identity",
    status: "excluded",
    evidence: "Generic MCP uses Native Messaging; the manifest no longer grants Chrome Identity for Claude OAuth.",
    risk: "Adds a privileged permission and Claude-specific OAuth endpoints that generic MCP doesn't require.",
    owners: [
      "docs/product-specs/remove-claude-specific-slices.md",
      "src/manifest.json",
    ],
    testTarget: "tests/unit/provider-independence.regression.test.js",
  },
  {
    id: "claude-ai-onboarding-task-bridge",
    status: "excluded",
    evidence: "The manifest and worker no longer expose a Claude.ai onboarding or external-message bridge.",
    risk: "Creates a Claude-only web origin boundary and prompt injection surface outside the provider-independent product.",
    owners: [
      "docs/product-specs/remove-claude-specific-slices.md",
      "src/assets/service-worker.ts-H0DVM1LS.js",
    ],
    testTarget: "tests/unit/provider-independence.regression.test.js",
  },
  {
    id: "mermaid-artifact-rendering",
    status: "equivalent",
    evidence: "Markdown Mermaid fences render through a strict, bounded, packaged 11.15.0 runtime.",
    owners: [
      "src/assets/sidepanel-BoLm9pmH.js",
      "src/shared/mermaid-renderer.js",
      "src/sidepanel/mermaid-markdown.js",
    ],
    testTarget: "tests/unit/mermaid-artifact-rendering.regression.test.js",
  },
  {
    id: "connected-apps-workflow-and-safety-surfaces",
    status: "equivalent",
    evidence: "Current Claw bundles retain connectors, workflow teaching, planning, safety, blocked-site, paid-plan, and version-gate surfaces.",
    owners: [
      "src/assets/sidepanel-BoLm9pmH.js",
      "src/assets/startRecording-BeCDKY84.js",
      "src/assets/options-Hyb_OzME.js",
    ],
    testTarget: "tests/unit/deobfuscation-anchors.regression.test.js",
  },
  {
    id: "conway-squares-runtime",
    status: "excluded",
    evidence: "Source provisions a remote container and connects browser tools to /sandbox/proxy/my behind squares_enabled.",
    risk: "Adds an external bearer-token and organization-bound remote browser-control trust boundary without a local product contract.",
    owners: [
      "docs/product-specs/upstream-1.0.79-recovery.md",
      "docs/exec-plans/completed/2026-07-06-upstream-1.0.79-recovery.md",
    ],
    testTarget: "tests/unit/upstream-1.0.79-matrix.test.js",
  },
  {
    id: "generated-runtime-reconciliation",
    status: "equivalent",
    evidence: "Accepted deltas use current loaders and narrow anchors; complete bundle replacement is unnecessary.",
    owners: [
      "src/background/service-worker-loader.js",
      "src/options/options.html",
      "src/sidepanel/sidepanel.html",
    ],
    testTarget: "tests/unit/deobfuscation-anchors.regression.test.js",
  },
]);

module.exports = {
  UPSTREAM_1_0_79_SOURCE,
  UPSTREAM_1_0_79_BEHAVIOR_MATRIX,
};
