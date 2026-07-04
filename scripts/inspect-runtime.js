const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function inspectRuntime() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "src", "manifest.json"), "utf8"));
  return {
    extensionRoot: path.join(repoRoot, "src"),
    version: manifest.version,
    background: manifest.background?.service_worker || null,
    optionsPage: manifest.options_page || null,
    permissions: manifest.permissions || [],
    hostPermissions: manifest.host_permissions || [],
    diagnostics: {
      sidepanel: "globalThis.__CP_SIDEPANEL_DEBUG__",
      options: "globalThis.__CP_OPTIONS_DEBUG__",
      e2eArtifactDirectory: process.env.CLAW_E2E_ARTIFACT_DIR || "OS temporary directory",
    },
  };
}

if (require.main === module) {
  console.log(JSON.stringify(inspectRuntime(), null, 2));
}

module.exports = { inspectRuntime };
