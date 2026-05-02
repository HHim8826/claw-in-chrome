const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const srcDir = path.join(repoRoot, "src");
const packageListPath = path.join(
  repoRoot,
  ".github",
  "release-package-items.txt",
);
const optionalUnpackagedFiles = new Set([
  "options-update-preview.local.js",
  "options/options-update-preview.local.js",
]);
const jsStringLiteralPattern = [
  "(?:",
  "\"([^\"\\\\]*(?:\\\\.[^\"\\\\]*)*)\"",
  "|'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'",
  "|`((?:\\\\.|[^`])*)`",
  ")"
].join("");

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function readPackageItems() {
  return fs
    .readFileSync(packageListPath, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(toPosixPath);
}

function collectFilesUnder(relativePath, output) {
  const absolutePath = path.join(srcDir, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolutePath)) {
      collectFilesUnder(path.posix.join(relativePath, entry), output);
    }
    return;
  }
  output.push(relativePath);
}

function expandPackageFiles(packageItems) {
  const files = [];
  for (const item of packageItems) {
    collectFilesUnder(item, files);
  }
  return files.sort();
}

function isCoveredByPackageItems(relativePath, packageItems) {
  if (packageItems.has(relativePath)) {
    return true;
  }
  const parts = relativePath.split("/");
  while (parts.length > 1) {
    parts.pop();
    if (packageItems.has(parts.join("/"))) {
      return true;
    }
  }
  return false;
}

function shouldIgnoreRawTarget(rawTarget) {
  const value = String(rawTarget || "").trim();
  if (!value) {
    return true;
  }
  if (value.startsWith("#")) {
    return true;
  }
  const lower = value.toLowerCase();
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("//") ||
    lower.startsWith("data:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  );
}

function normalizeDependency(rawTarget, fromFile, options = {}) {
  if (shouldIgnoreRawTarget(rawTarget)) {
    return "";
  }
  const resolveFromRoot = options.resolveFromRoot === true;
  const fromDir = path.posix.dirname(fromFile);
  const cleanedTarget = toPosixPath(rawTarget).split("#")[0].split("?")[0].trim();
  if (!cleanedTarget) {
    return "";
  }
  if (cleanedTarget.startsWith("/")) {
    return cleanedTarget.replace(/^\/+/, "");
  }
  if (resolveFromRoot) {
    return cleanedTarget.replace(/^\/+/, "");
  }
  if (cleanedTarget.startsWith(".")) {
    return path.posix.normalize(path.posix.join(fromDir, cleanedTarget));
  }
  return path.posix.normalize(path.posix.join(fromDir, cleanedTarget));
}

function addDependency(dependencyMap, fromFile, rawTarget, options) {
  const normalized = normalizeDependency(rawTarget, fromFile, options);
  if (!normalized) {
    return;
  }
  const refs = dependencyMap.get(normalized) || new Set();
  refs.add(fromFile);
  dependencyMap.set(normalized, refs);
}

function getJavaScriptLiteralMatchValue(match, offset = 1) {
  for (let index = offset; index < match.length; index += 1) {
    if (typeof match[index] === "string") {
      return match[index];
    }
  }
  return "";
}

function getTemplateLiteralStaticPrefix(rawTemplateLiteral) {
  const templateSource = String(rawTemplateLiteral || "");
  let escaped = false;
  for (let index = 0; index < templateSource.length; index += 1) {
    const current = templateSource[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "$" && templateSource[index + 1] === "{") {
      return {
        hasExpressions: true,
        prefix: templateSource.slice(0, index)
      };
    }
  }
  return {
    hasExpressions: false,
    prefix: templateSource
  };
}

function getTemplateLiteralDependencyTarget(rawTemplateLiteral) {
  const templateInfo = getTemplateLiteralStaticPrefix(rawTemplateLiteral);
  if (!templateInfo.hasExpressions) {
    return templateInfo.prefix;
  }

  const cleanedPrefix = toPosixPath(templateInfo.prefix)
    .split("#")[0]
    .split("?")[0]
    .trim();

  if (!cleanedPrefix) {
    return "";
  }

  if (cleanedPrefix.endsWith("/")) {
    return cleanedPrefix.replace(/\/+$/, "");
  }

  const lastSlashIndex = cleanedPrefix.lastIndexOf("/");
  if (lastSlashIndex >= 0) {
    const basename = cleanedPrefix.slice(lastSlashIndex + 1);
    if (basename.includes(".")) {
      return cleanedPrefix;
    }

    const directoryPath = cleanedPrefix.slice(0, lastSlashIndex);
    if (!directoryPath || directoryPath === ".") {
      return "";
    }
    return directoryPath;
  }

  return cleanedPrefix.includes(".") ? cleanedPrefix : "";
}

function addJavaScriptLiteralDependency(dependencyMap, fromFile, rawTarget, options = {}) {
  const literalType = options.literalType || "string";
  const candidate = literalType === "template"
    ? getTemplateLiteralDependencyTarget(rawTarget)
    : rawTarget;
  const requireLocalSpecifier = options.requireLocalSpecifier === true;

  if (!candidate) {
    return;
  }
  if (requireLocalSpecifier && !candidate.startsWith(".") && !candidate.startsWith("/")) {
    return;
  }

  addDependency(dependencyMap, fromFile, candidate, options);
}

function scanJavaScriptDependenciesByPattern(source, fromFile, dependencyMap, pattern, options = {}) {
  let match = null;
  while ((match = pattern.exec(source))) {
    addJavaScriptLiteralDependency(
      dependencyMap,
      fromFile,
      getJavaScriptLiteralMatchValue(match, options.matchValueOffset || 1),
      {
        ...options,
        literalType: match[3] !== undefined ? "template" : "string"
      }
    );
  }
}

function scanHtmlDependencies(source, fromFile, dependencyMap) {
  const pattern = /\b(?:src|href)=["']([^"']+)["']/g;
  let match = null;
  while ((match = pattern.exec(source))) {
    addDependency(dependencyMap, fromFile, match[1]);
  }
}

function scanCssDependencies(source, fromFile, dependencyMap) {
  const pattern = /url\(([^)]+)\)/g;
  let match = null;
  while ((match = pattern.exec(source))) {
    const rawValue = String(match[1] || "").trim().replace(/^['"]|['"]$/g, "");
    addDependency(dependencyMap, fromFile, rawValue);
  }
}

function scanJavaScriptDependencies(source, fromFile, dependencyMap) {
  const importPattern =
    /import\s+(?:[^"'`]+from\s+)?["']([^"']+)["']/g;
  let match = null;
  while ((match = importPattern.exec(source))) {
    const specifier = String(match[1] || "").trim();
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      continue;
    }
    addDependency(dependencyMap, fromFile, specifier);
  }

  const dynamicImportPattern = new RegExp(
    String.raw`\bimport\s*\(\s*${jsStringLiteralPattern}\s*\)`,
    "g"
  );
  scanJavaScriptDependenciesByPattern(source, fromFile, dependencyMap, dynamicImportPattern, {
    requireLocalSpecifier: true
  });

  const runtimeUrlPattern = new RegExp(
    String.raw`chrome\.runtime\.getURL\(\s*${jsStringLiteralPattern}\s*\)`,
    "g"
  );
  scanJavaScriptDependenciesByPattern(source, fromFile, dependencyMap, runtimeUrlPattern, {
    resolveFromRoot: true
  });

  const workerScriptPattern = new RegExp(
    String.raw`workerScript\s*:\s*${jsStringLiteralPattern}`,
    "g"
  );
  scanJavaScriptDependenciesByPattern(source, fromFile, dependencyMap, workerScriptPattern, {
    resolveFromRoot: true
  });

  const directWorkerPattern = new RegExp(
    String.raw`new\s+(?:Worker|SharedWorker)\(\s*${jsStringLiteralPattern}\s*(?:,|\))`,
    "g"
  );
  scanJavaScriptDependenciesByPattern(source, fromFile, dependencyMap, directWorkerPattern, {
    requireLocalSpecifier: true
  });
}

function scanManifestDependencies(source, fromFile, dependencyMap) {
  const manifest = JSON.parse(source);
  const candidates = [];

  if (manifest.background?.service_worker) {
    candidates.push(manifest.background.service_worker);
  }
  if (manifest.options_page) {
    candidates.push(manifest.options_page);
  }
  if (manifest.devtools_page) {
    candidates.push(manifest.devtools_page);
  }
  if (manifest.action?.default_popup) {
    candidates.push(manifest.action.default_popup);
  }
  if (manifest.side_panel?.default_path) {
    candidates.push(manifest.side_panel.default_path);
  }
  if (manifest.sandbox?.pages) {
    candidates.push(...manifest.sandbox.pages);
  }
  if (manifest.content_scripts) {
    for (const entry of manifest.content_scripts) {
      candidates.push(...(entry.js || []), ...(entry.css || []));
    }
  }
  if (manifest.web_accessible_resources) {
    for (const entry of manifest.web_accessible_resources) {
      candidates.push(...(entry.resources || []));
    }
  }
  if (manifest.icons) {
    candidates.push(...Object.values(manifest.icons));
  }
  if (manifest.chrome_url_overrides) {
    candidates.push(...Object.values(manifest.chrome_url_overrides));
  }

  for (const candidate of candidates) {
    addDependency(dependencyMap, fromFile, candidate, {
      resolveFromRoot: true
    });
  }
}

function scanDependencies(packageFiles) {
  const dependencyMap = new Map();
  for (const file of packageFiles) {
    const absolutePath = path.join(srcDir, file);
    const extension = path.extname(file).toLowerCase();
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    if (extension !== ".html" && extension !== ".js" && extension !== ".css" && file !== "manifest.json") {
      continue;
    }
    const source = fs.readFileSync(absolutePath, "utf8");
    if (extension === ".html") {
      scanHtmlDependencies(source, file, dependencyMap);
      continue;
    }
    if (extension === ".js") {
      scanJavaScriptDependencies(source, file, dependencyMap);
      continue;
    }
    if (extension === ".css") {
      scanCssDependencies(source, file, dependencyMap);
      continue;
    }
    if (file === "manifest.json") {
      scanManifestDependencies(source, file, dependencyMap);
    }
  }
  return dependencyMap;
}

function formatReferenceList(referenceSet) {
  return [...referenceSet].sort().join(", ");
}

function main() {
  if (!fs.existsSync(packageListPath)) {
    throw new Error(`Missing package list: ${packageListPath}`);
  }

  const packageItems = readPackageItems();
  const packageItemSet = new Set(packageItems);
  const missingListedItems = packageItems.filter(item => {
    return !fs.existsSync(path.join(srcDir, item));
  });

  const packageFiles = expandPackageFiles(packageItems);
  const dependencyMap = scanDependencies(packageFiles);
  const missingCoverage = [];
  const brokenReferences = [];

  for (const [dependency, references] of dependencyMap.entries()) {
    if (optionalUnpackagedFiles.has(dependency)) {
      continue;
    }
    const absoluteDependencyPath = path.join(srcDir, dependency);
    if (!fs.existsSync(absoluteDependencyPath)) {
      brokenReferences.push({ dependency, references });
      continue;
    }
    if (!isCoveredByPackageItems(dependency, packageItemSet)) {
      missingCoverage.push({ dependency, references });
    }
  }

  if (
    missingListedItems.length > 0 ||
    missingCoverage.length > 0 ||
    brokenReferences.length > 0
  ) {
    console.error("Release package check failed.");
    if (missingListedItems.length > 0) {
      console.error("\nItems listed in release-package-items.txt but missing on disk:");
      for (const item of missingListedItems.sort()) {
        console.error(`- ${item}`);
      }
    }
    if (missingCoverage.length > 0) {
      console.error("\nRuntime dependencies missing from release-package-items.txt:");
      for (const entry of missingCoverage.sort((a, b) => {
        return a.dependency.localeCompare(b.dependency);
      })) {
        console.error(
          `- ${entry.dependency} <= ${formatReferenceList(entry.references)}`,
        );
      }
    }
    if (brokenReferences.length > 0) {
      console.error("\nBroken runtime references:");
      for (const entry of brokenReferences.sort((a, b) => {
        return a.dependency.localeCompare(b.dependency);
      })) {
        console.error(
          `- ${entry.dependency} <= ${formatReferenceList(entry.references)}`,
        );
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Release package check passed (${packageItems.length} package items, ${packageFiles.length} packaged files scanned).`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  addDependency,
  getTemplateLiteralDependencyTarget,
  main,
  normalizeDependency,
  scanDependencies,
  scanJavaScriptDependencies
};
