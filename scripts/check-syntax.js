const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const roots = ["scripts", "tests", "src/background", "src/offscreen", "src/options", "src/shared", "src/sidepanel", "src/visualizer"];

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectJavaScriptFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
  return files;
}

function checkSyntax() {
  const files = roots.flatMap((root) => collectJavaScriptFiles(path.join(repoRoot, root))).sort();
  const failures = [];
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "claw-syntax-"));
  try {
    for (const [index, filePath] of files.entries()) {
      const source = fs.readFileSync(filePath, "utf8");
      const isModule = /^\s*(?:import|export)\s/m.test(source);
      const syntaxPath = isModule ? path.join(temporaryDirectory, `${index}.mjs`) : filePath;
      if (isModule) fs.writeFileSync(syntaxPath, source);
      const result = childProcess.spawnSync(process.execPath, ["--check", syntaxPath], { encoding: "utf8" });
      if (result.status !== 0) failures.push(`${path.relative(repoRoot, filePath)}: ${(result.stderr || result.stdout).trim()}`);
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  if (failures.length) throw new Error(`Syntax check failed:\n- ${failures.join("\n- ")}`);
  return { fileCount: files.length };
}

if (require.main === module) {
  try {
    const result = checkSyntax();
    console.log(`Syntax check passed (${result.fileCount} JavaScript files).`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { checkSyntax };
