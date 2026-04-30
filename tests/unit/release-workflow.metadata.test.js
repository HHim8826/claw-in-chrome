const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.join(__dirname, "..", "..", ".github", "workflows", "release-extension.yml");
const packageListPath = path.join(__dirname, "..", "..", ".github", "release-package-items.txt");
const packageJsonPath = path.join(__dirname, "..", "..", "package.json");
const buildReleaseImportScriptPath = path.join(__dirname, "..", "..", "scripts", "build-release-import.ps1");
const checkScriptPath = path.join(__dirname, "..", "..", "scripts", "check-release-package.js");
const optionsHtmlPath = path.join(__dirname, "..", "..", "src", "options", "options.html");
const sidepanelHtmlPath = path.join(__dirname, "..", "..", "src", "sidepanel", "sidepanel.html");
const pairingHtmlPath = path.join(__dirname, "..", "..", "src", "pages", "pairing.html");
const offscreenHtmlPath = path.join(__dirname, "..", "..", "src", "offscreen", "offscreen.html");
const gifViewerHtmlPath = path.join(__dirname, "..", "..", "src", "visualizer", "gif_viewer.html");
const serviceWorkerLoaderPath = path.join(__dirname, "..", "..", "src", "background", "service-worker-loader.js");
const workflowSource = fs.readFileSync(workflowPath, "utf8");
const packageListSource = fs.readFileSync(packageListPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const buildReleaseImportScriptSource = fs.readFileSync(buildReleaseImportScriptPath, "utf8");
const optionsHtml = fs.readFileSync(optionsHtmlPath, "utf8");
const sidepanelHtml = fs.readFileSync(sidepanelHtmlPath, "utf8");
const pairingHtml = fs.readFileSync(pairingHtmlPath, "utf8");
const offscreenHtml = fs.readFileSync(offscreenHtmlPath, "utf8");
const gifViewerHtml = fs.readFileSync(gifViewerHtmlPath, "utf8");
const serviceWorkerLoaderSource = fs.readFileSync(serviceWorkerLoaderPath, "utf8");

function getPackageItems() {
  return new Set(
    packageListSource
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
  );
}

function getLocalShellDependencies(htmlSource) {
  const dependencies = new Set();
  const pattern = /\b(?:src|href)="\/([^"]+)"/g;
  let match = null;
  while ((match = pattern.exec(htmlSource))) {
    const target = String(match[1] || "").trim();
    if (!target || target.startsWith("assets/")) {
      continue;
    }
    dependencies.add(target);
  }
  return dependencies;
}

function getLocalHtmlScriptDependencies(htmlSource) {
  const dependencies = new Set();
  const pattern = /\bscript\s+src="([^"]+)"/g;
  let match = null;
  while ((match = pattern.exec(htmlSource))) {
    const target = String(match[1] || "").trim().replace(/^\/+/, "");
    if (!target || target.startsWith("assets/")) {
      continue;
    }
    dependencies.add(target);
  }
  return dependencies;
}

function getLocalImportedModules(source, sourceFilePath) {
  const dependencies = new Set();
  const pattern = /import\s+["']((?:\.\/|\.\.\/)[^"']+)["'];/g;
  const srcRoot = path.join(__dirname, "..", "..", "src");
  const sourceDir = path.dirname(sourceFilePath);
  let match = null;
  while ((match = pattern.exec(source))) {
    const raw = String(match[1] || "").trim();
    if (!raw) {
      continue;
    }
    const resolved = path.relative(srcRoot, path.resolve(sourceDir, raw)).replace(/\\/g, "/");
    if (resolved.startsWith("assets/")) {
      continue;
    }
    dependencies.add(resolved);
  }
  return dependencies;
}

function testPackageListIncludesRuntimeDependencies() {
  const packageItems = getPackageItems();
  const requiredDependencies = new Set([
    ...getLocalShellDependencies(optionsHtml),
    ...getLocalShellDependencies(sidepanelHtml),
    ...getLocalShellDependencies(pairingHtml),
    ...getLocalHtmlScriptDependencies(offscreenHtml),
    ...getLocalHtmlScriptDependencies(gifViewerHtml),
    ...getLocalImportedModules(serviceWorkerLoaderSource, serviceWorkerLoaderPath),
    "background/github-update-worker-runtime.js",
    "background/service-worker-runtime.js",
    "options/options-update-enhancer.js"
  ]);

  for (const dependency of requiredDependencies) {
    assert.ok(packageItems.has(dependency), `release archive should include ${dependency}`);
  }
}

function testReleaseArchiveExcludesLocalPreviewAddon() {
  const packageItems = getPackageItems();
  assert.equal(
    packageItems.has("options-update-preview.local.js"),
    false,
    "release archive should exclude the local-only update preview addon"
  );
}

function testWorkflowUsesTrackedPackageList() {
  assert.match(workflowSource, /PACKAGE_LIST_FILE="\.github\/release-package-items\.txt"/, "workflow should read package items from the tracked package list");
  assert.match(workflowSource, /mapfile -t PACKAGE_ITEMS/, "workflow should load package items into an array");
}

function testReleasePackageCheckScriptPasses() {
  childProcess.execFileSync(process.execPath, [checkScriptPath], {
    cwd: path.join(__dirname, "..", ".."),
    stdio: "pipe"
  });
}

function testReleasePackageCheckIsWiredIntoScriptsAndWorkflow() {
  assert.equal(
    packageJson.scripts["check:release-package"],
    "node scripts/check-release-package.js",
    "package.json should expose the release package checker script"
  );
  assert.match(
    workflowSource,
    /Verify release package manifest[\s\S]*npm run check:release-package/m,
    "release workflow should verify the release package manifest before archiving"
  );
  assert.match(
    buildReleaseImportScriptSource,
    /& node \$releasePackageCheckScriptPath/,
    "local import build script should run the release package checker before copying files"
  );
}

function testMinSupportedVersionIsOptional() {
  assert.match(workflowSource, /workflow_dispatch:\s+inputs:\s+min_supported_version:/m, "workflow_dispatch should expose optional min_supported_version input");
  assert.doesNotMatch(workflowSource, /min_supported_version:\s*version/, "workflow should not force every release to block all older versions");
  assert.match(workflowSource, /if \(minSupportedVersion\)\s*\{\s*payload\.min_supported_version = minSupportedVersion;/m, "latest.json should only include min_supported_version when explicitly provided");
}

function testReleaseNotesUseTriggeringPushCommitMessages() {
  assert.match(workflowSource, /BEFORE_SHA="\$\{\{ github\.event\.before \}\}"/, "workflow should capture the push before sha");
  assert.match(workflowSource, /TRIGGER_SHA="\$\{\{ github\.sha \}\}"/, "workflow should capture the triggering commit sha");
  assert.match(workflowSource, /target_commitish:\s+\$\{\{ github\.sha \}\}/m, "release target should remain the triggering commit");
  assert.equal(workflowSource.includes('git(["rev-list", "--reverse", `${before}..${trigger}`])'), true, "workflow should collect every commit sha from the triggering push range");
  assert.equal(workflowSource.includes('git(["show", "-s", "--format=%B", sha])'), true, "workflow should read full commit messages including multi-line bodies");
  assert.equal(workflowSource.includes("if (shas.length === 0 && trigger) {"), true, "workflow should fall back to the triggering commit when the push range is unavailable");
  assert.equal(workflowSource.includes('sections.join("\\n\\n---\\n\\n")'), true, "workflow should preserve every commit message as its own markdown section");
  assert.doesNotMatch(workflowSource, /git log --reverse --format='- %s'/, "workflow should no longer truncate push notes to commit titles");
  assert.doesNotMatch(workflowSource, /git log -1 --format='- %s'/, "workflow should no longer truncate fallback notes to a single title line");
}

function main() {
  testPackageListIncludesRuntimeDependencies();
  testReleaseArchiveExcludesLocalPreviewAddon();
  testWorkflowUsesTrackedPackageList();
  testReleasePackageCheckScriptPasses();
  testReleasePackageCheckIsWiredIntoScriptsAndWorkflow();
  testMinSupportedVersionIsOptional();
  testReleaseNotesUseTriggeringPushCommitMessages();
  console.log("release workflow metadata tests passed");
}

main();
