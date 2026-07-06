const UPSTREAM_1_0_79_SOURCE = Object.freeze({
  manifestVersion: "1.0.79",
  gitHash: "84be9f3a200dd6d7aea5b06ceeb8faf753f0a443",
});

const UPSTREAM_1_0_79_BEHAVIOR_MATRIX = Object.freeze([
  {
    id: "managed-url-policy",
    status: "divergent",
    evidence: "Source reads blockedUrlPatterns; local bundle has disabled policy stubs.",
    owners: [
      "src/manifest.json",
      "src/managed_schema.json",
      "src/assets/mcpPermissions-qqAoJjJ8.js",
    ],
    testTarget: "tests/unit/managed-policy-integration.regression.test.js",
  },
  {
    id: "forced-organization-login",
    status: "divergent",
    evidence: "Source reads forceLoginOrgUUID; local storage runtime hard-codes no policy.",
    owners: [
      "src/managed_schema.json",
      "src/assets/useStorageState-hbwNMVUA.js",
    ],
    testTarget: "tests/unit/managed-organization-policy.regression.test.js",
  },
  {
    id: "mcp-oauth-identity",
    status: "equivalent",
    evidence: "Local PKCE OAuth guards are preserved and the manifest now grants identity.",
    owners: [
      "src/manifest.json",
      "src/assets/PermissionManager-9s959502.js",
      "src/assets/mcpPermissions-qqAoJjJ8.js",
    ],
    testTarget: "tests/unit/mcp-oauth-identity.regression.test.js",
  },
  {
    id: "claude-ai-onboarding-task-bridge",
    status: "equivalent",
    evidence: "The local bridge now resolves validated task ids through a readable prompt map.",
    owners: [
      "src/assets/content-script.ts-Bwa5rY9t.js",
      "src/assets/service-worker.ts-H0DVM1LS.js",
      "src/shared/claw-contract.js",
      "src/shared/onboarding-tasks.js",
    ],
    testTarget: "tests/integration/onboarding-task-bridge.integration.test.js",
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
      "docs/exec-plans/active/2026-07-06-upstream-1.0.79-recovery.md",
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
