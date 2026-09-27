const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { createMermaidRenderRuntime } = require("../../src/shared/mermaid-renderer.js");

const scripts = require("../../package.json").scripts;
assert.match(scripts["check:dependency-advisories"], /npm audit --include=dev --audit-level=low/);
for (const workflow of ["ci.yml", "release-extension.yml"]) {
  assert.match(fs.readFileSync(path.join(__dirname, "../../.github/workflows", workflow), "utf8"), /npm run check:dependency-advisories/);
}

// A process deadline, unlike a page Promise timeout, can terminate synchronous
// parser loops. The heap cap bounds damage if a vulnerable vendor is restored.
const result = spawnSync(process.execPath, ["--max-old-space-size=192", path.join(__dirname, "../helpers/mermaid-advisory-probe.js")], {
  encoding: "utf8", timeout: 8000, maxBuffer: 4096,
});
assert.equal(result.error, undefined, result.error?.message);
assert.equal(result.status, 0, result.stderr || result.stdout);

(async () => {
  const runtime = createMermaidRenderRuntime({
    timeoutMs: 5, sanitizeSvg: svg => svg,
    mermaid: { initialize() {}, render() {
      const start = performance.now();
      while (performance.now() - start < 30) { /* finite synchronous work */ }
      return { svg: "<svg></svg>" };
    } },
  });
  const start = performance.now();
  const rendered = await runtime.render("graph TD\nA --> B", { id: "sync-deadline" });
  assert.equal(rendered.ok, true, "an async deadline cannot preempt synchronous renderer work");
  assert.ok(performance.now() - start >= 30);
  console.log("Mermaid advisory and async-deadline regressions passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
