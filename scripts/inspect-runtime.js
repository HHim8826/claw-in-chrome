const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function inspectRuntime() {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "src", "manifest.json"), "utf8"));
  const managedSchemaPath = manifest.storage?.managed_schema || null;
  const managedSchema = managedSchemaPath
    ? JSON.parse(
        fs.readFileSync(path.join(repoRoot, "src", managedSchemaPath), "utf8"),
      )
    : null;
  const contentScriptMatches = (manifest.content_scripts || []).flatMap(
    (entry) => entry.matches || [],
  );
  const externallyConnectableOrigins =
    manifest.externally_connectable?.matches || [];
  const hasClaudeSiteIntegration = [
    ...contentScriptMatches,
    ...externallyConnectableOrigins,
  ].some((value) => /claude\.ai/i.test(value));
  return {
    extensionRoot: path.join(repoRoot, "src"),
    version: manifest.version,
    background: manifest.background?.service_worker || null,
    optionsPage: manifest.options_page || null,
    permissions: manifest.permissions || [],
    hostPermissions: manifest.host_permissions || [],
    contentScriptMatches,
    externallyConnectableOrigins,
    productBoundary: {
      providerIndependent:
        !(manifest.permissions || []).includes("identity") &&
        !hasClaudeSiteIntegration,
      mcpTransport: (manifest.permissions || []).includes("nativeMessaging")
        ? "nativeMessaging"
        : null,
    },
    managedPolicy: {
      schema: managedSchemaPath,
      keys: Object.keys(managedSchema?.properties || {}),
    },
    mermaidVendor: "assets/vendor/mermaid-11.15.0.min.js",
    diagnostics: {
      sidepanel: "globalThis.__CP_SIDEPANEL_DEBUG__",
      options: "globalThis.__CP_OPTIONS_DEBUG__",
      e2eArtifactDirectory: process.env.CLAW_E2E_ARTIFACT_DIR || "OS temporary directory",
    },
    settingsBackup: {
      kind: "claw-in-chrome-settings-backup",
      schemaVersion: 1,
      secretsIncludedByDefault: false,
    },
    providerObservability: {
      storageKey: "providerObservabilityRecords",
      maxRecords: 500,
      maxAgeDays: 30,
      localOnly: true,
    },
  };
}

if (require.main === module) {
  console.log(JSON.stringify(inspectRuntime(), null, 2));
}

module.exports = { inspectRuntime };
