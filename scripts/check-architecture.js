const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const loaderPath = path.join(repoRoot, "src", "background", "service-worker-loader.js");
const expectedLoaderImports = [
  "../shared/claw-contract.js",
  "../shared/managed-policy.js",
  "../shared/onboarding-tasks.js",
  "../shared/native-host-binding.js",
  "../shared/mcp-permission-popup-protocol.js",
  "../shared/custom-provider-models.js",
  "../shared/provider-format-adapter.js",
  "../shared/telemetry-disable.js",
  "../assets/service-worker.ts-H0DVM1LS.js",
  "../shared/github-update-shared.js",
  "./github-update-worker.js",
  "./service-worker-detached-window-runtime.js",
  "./service-worker-shortcut-workflow-sync.js",
  "./service-worker-runtime.js",
];

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "assets") {
        files.push(...collectJavaScriptFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkArchitecture() {
  const errors = [];
  const loaderSource = fs.readFileSync(loaderPath, "utf8");
  const actualImports = [...loaderSource.matchAll(/^import\s+["']([^"']+)["'];/gm)].map((match) => match[1]);
  if (JSON.stringify(actualImports) !== JSON.stringify(expectedLoaderImports)) {
    errors.push("service-worker-loader.js import order differs from the architecture contract");
  }

  for (const filePath of collectJavaScriptFiles(path.join(repoRoot, "src"))) {
    if (filePath === loaderPath) {
      continue;
    }
    const source = fs.readFileSync(filePath, "utf8");
    if (/\b(?:import|require\s*\()[^\n]*["'][^"']*\/assets\//.test(source)) {
      errors.push(`${path.relative(repoRoot, filePath)} imports a bundle directly; use a documented shell or loader seam`);
    }
  }

  if (!fs.existsSync(path.join(repoRoot, "docs", "recovery-model.md"))) {
    errors.push("docs/recovery-model.md is required");
  }
  if (errors.length > 0) {
    throw new Error(`Architecture check failed:\n- ${errors.join("\n- ")}`);
  }
  return { authoredFileCount: collectJavaScriptFiles(path.join(repoRoot, "src")).length };
}

if (require.main === module) {
  try {
    const result = checkArchitecture();
    console.log(`Architecture check passed (${result.authoredFileCount} readable JavaScript files).`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { checkArchitecture, expectedLoaderImports };
