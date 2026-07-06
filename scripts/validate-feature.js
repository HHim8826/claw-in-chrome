const childProcess = require("node:child_process");

const fastChecks = [
  "check:syntax",
  "check:docs",
  "check:architecture",
  "check:manifest",
  "check:mermaid-vendor",
  "check:release-package",
  "test:node",
];

function runValidation(options = {}) {
  const checks = options.full ? [...fastChecks, "test:e2e"] : fastChecks;
  for (const scriptName of checks) {
    console.log(`\n==> npm run ${scriptName}`);
    const result = childProcess.spawnSync("npm", ["run", scriptName], {
      cwd: process.cwd(),
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    if (result.error) {
      throw new Error(`Could not start npm run ${scriptName}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`Validation failed: npm run ${scriptName}`);
    }
  }
  return { checks };
}

if (require.main === module) {
  try {
    const result = runValidation({ full: process.argv.includes("--full") });
    console.log(`\nValidation passed (${result.checks.join(", ")}).`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = { fastChecks, runValidation };
