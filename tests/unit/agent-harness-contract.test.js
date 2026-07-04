const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");

function testRepositoryExposesAgentEntryPoint() {
  const agentsPath = path.join(repoRoot, "AGENTS.md");
  assert.equal(fs.existsSync(agentsPath), true, "AGENTS.md must exist");

  const source = fs.readFileSync(agentsPath, "utf8");
  for (const requiredReference of [
    "ARCHITECTURE.md",
    "docs/recovery-model.md",
    "docs/SECURITY.md",
    "docs/RELIABILITY.md",
    "docs/QUALITY_SCORE.md",
    "npm run validate:fast",
    "npm run validate:full",
  ]) {
    assert.equal(
      source.includes(requiredReference),
      true,
      `AGENTS.md must reference ${requiredReference}`,
    );
  }
}

function testPackageExposesStableHarnessCommands() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const expectedScripts = [
    "check:architecture",
    "check:docs",
    "check:manifest",
    "check:syntax",
    "inspect:runtime",
    "validate:fast",
    "validate:full",
  ];

  for (const scriptName of expectedScripts) {
    assert.equal(
      typeof packageJson.scripts[scriptName],
      "string",
      `package.json must define ${scriptName}`,
    );
  }
}

function testE2eArtifactsArePortable() {
  const source = fs.readFileSync(
    path.join(repoRoot, "tests", "e2e", "extension-pages.smoke.test.js"),
    "utf8",
  );
  assert.equal(/d:\/code|d:\\code/i.test(source), false, "E2E test must not contain a machine-specific path");
  assert.equal(source.includes("CLAW_E2E_ARTIFACT_DIR"), true, "E2E test must support a configurable artifact directory");
  assert.equal(source.includes("CLAW_EXTENSION_ROOT"), true, "E2E test must support testing an extracted release package");
}

function testAutomationEnforcesHarnessGates() {
  const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  const ci = read(".github/workflows/ci.yml");
  assert.equal(ci.includes("npm run validate:fast"), true, "CI must run the fast validation gate");

  const e2e = read(".github/workflows/e2e.yml");
  for (const requiredText of ["src/**", "playwright install", "xvfb-run", "upload-artifact"]) {
    assert.equal(e2e.includes(requiredText), true, `E2E workflow must include ${requiredText}`);
  }

  const packageWorkflow = read(".github/workflows/release-package-check.yml");
  assert.equal(packageWorkflow.includes('"src/**"'), true, "release package check must watch src/**");

  const releaseWorkflow = read(".github/workflows/release-extension.yml");
  assert.equal(releaseWorkflow.includes("npm ci"), true, "release workflow must install locked dependencies");
  assert.equal(releaseWorkflow.includes("npm run validate:fast"), true, "release workflow must run fast validation");
  assert.equal(/branches:\s*[\s\S]*?- dev/m.test(releaseWorkflow), false, "release workflow must not publish dev pushes");

  assert.equal(fs.existsSync(path.join(repoRoot, ".github", "pull_request_template.md")), true, "pull request template must exist");
}

function main() {
  testRepositoryExposesAgentEntryPoint();
  testPackageExposesStableHarnessCommands();
  testE2eArtifactsArePortable();
  testAutomationEnforcesHarnessGates();
  console.log("agent harness contract tests passed");
}

main();
