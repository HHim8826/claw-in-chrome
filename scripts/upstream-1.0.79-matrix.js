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
    testTarget: "tests/unit/domain-policy-disabled.regression.test.js",
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
    status: "divergent",
    evidence: "Local OAuth code calls chrome.identity, but the manifest omits identity.",
    owners: [
      "src/manifest.json",
      "src/assets/PermissionManager-9s959502.js",
      "src/assets/mcpPermissions-qqAoJjJ8.js",
    ],
    testTarget: "tests/unit/mcp-oauth-identity.regression.test.js",
  },
  {
    id: "claude-ai-onboarding-task-bridge",
    status: "divergent",
    evidence: "Local bridge accepts raw prompt text; source resolves a validated task id.",
    owners: [
      "src/assets/content-script.ts-Bwa5rY9t.js",
      "src/background/service-worker-runtime.js",
      "src/shared/claw-contract.js",
    ],
    testTarget: "tests/integration/onboarding-task-bridge.integration.test.js",
  },
  {
    id: "mermaid-artifact-rendering",
    status: "divergent",
    evidence: "Local side panel recognizes the Mermaid MIME type but lacks the source renderer.",
    owners: [
      "src/assets/sidepanel-BoLm9pmH.js",
      "src/visualizer/visualizer-core.js",
    ],
    testTarget: "tests/unit/mermaid-artifact-rendering.regression.test.js",
  },
  {
    id: "conway-squares-runtime",
    status: "excluded",
    evidence: "Source exposes opaque remote-host settings without a stable local user contract.",
    owners: [
      "docs/product-specs/upstream-1.0.79-recovery.md",
      "docs/exec-plans/active/2026-07-06-upstream-1.0.79-recovery.md",
    ],
    testTarget: "tests/unit/upstream-1.0.79-matrix.test.js",
  },
  {
    id: "generated-runtime-reconciliation",
    status: "divergent",
    evidence: "Source entry bundles changed; local readable recovery and bundle anchors must remain.",
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
