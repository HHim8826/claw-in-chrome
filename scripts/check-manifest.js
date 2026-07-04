const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const extensionRoot = path.join(repoRoot, "src");

function sorted(values) {
  return [...values].sort();
}

function collectManifestPaths(manifest) {
  const paths = new Set();
  if (manifest.background?.service_worker) paths.add(manifest.background.service_worker);
  if (manifest.options_page) paths.add(manifest.options_page);
  for (const value of Object.values(manifest.icons || {})) paths.add(value);
  for (const script of manifest.content_scripts || []) {
    for (const value of script.js || []) paths.add(value);
    for (const value of script.css || []) paths.add(value);
  }
  for (const resourceGroup of manifest.web_accessible_resources || []) {
    for (const value of resourceGroup.resources || []) paths.add(value);
  }
  return sorted(paths);
}

function checkManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
  const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, ".github", "manifest-permissions.json"), "utf8"));

  assert.match(manifest.version, /^\d+\.\d+\.\d+\.\d+$/, "manifest version must contain four numeric segments");
  assert.deepEqual(sorted(manifest.permissions || []), sorted(baseline.permissions), "manifest permissions differ from the reviewed baseline");
  assert.deepEqual(sorted(manifest.host_permissions || []), sorted(baseline.host_permissions), "manifest host permissions differ from the reviewed baseline");
  assert.deepEqual(
    sorted(manifest.externally_connectable?.matches || []),
    sorted(baseline.externally_connectable_matches),
    "externally connectable origins differ from the reviewed baseline",
  );

  const missing = collectManifestPaths(manifest).filter((relativePath) => !fs.existsSync(path.join(extensionRoot, relativePath)));
  assert.deepEqual(missing, [], `manifest references missing files: ${missing.join(", ")}`);
  return { version: manifest.version, referencedFileCount: collectManifestPaths(manifest).length };
}

if (require.main === module) {
  try {
    const result = checkManifest();
    console.log(`Manifest check passed (${result.version}, ${result.referencedFileCount} referenced files).`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { checkManifest, collectManifestPaths };
