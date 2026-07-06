const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const packageRoot = path.join(repoRoot, "node_modules", "mermaid");
const packageJsonPath = path.join(packageRoot, "package.json");
const expectedVersion = "11.15.0";
const checkOnly = process.argv.includes("--check");

if (!fs.existsSync(packageJsonPath)) {
  throw new Error("Missing Mermaid dependency. Run npm ci before vendoring.");
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
if (packageJson.version !== expectedVersion) {
  throw new Error(
    `Expected Mermaid ${expectedVersion}, received ${packageJson.version}`,
  );
}

const outputRoot = path.join(repoRoot, "src", "assets", "vendor");
const copies = [
  [
    path.join(packageRoot, "dist", "mermaid.min.js"),
    path.join(outputRoot, `mermaid-${expectedVersion}.min.js`),
  ],
  [
    path.join(packageRoot, "LICENSE"),
    path.join(outputRoot, "mermaid-LICENSE.txt"),
  ],
];

if (checkOnly) {
  for (const [sourcePath, outputPath] of copies) {
    if (
      !fs.existsSync(outputPath) ||
      !fs.readFileSync(sourcePath).equals(fs.readFileSync(outputPath))
    ) {
      throw new Error(
        `Vendored Mermaid file is stale: ${path.relative(repoRoot, outputPath)}`,
      );
    }
  }
  console.log(`Vendored Mermaid ${expectedVersion} is current.`);
} else {
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [sourcePath, outputPath] of copies) {
    fs.copyFileSync(sourcePath, outputPath);
  }
  console.log(`Vendored Mermaid ${expectedVersion}.`);
}
