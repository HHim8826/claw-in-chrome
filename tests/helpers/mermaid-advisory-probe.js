const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const sandbox = { console, setTimeout, clearTimeout, structuredClone, TextEncoder, TextDecoder };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../src/assets/vendor/mermaid-11.17.2.min.js"), "utf8"), sandbox);
const mermaid = sandbox.mermaid.default || sandbox.mermaid;
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
(async () => {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText("xychart\n  x-axis 1 --> 1\n  line [1, 2]");
  assert.ok(diagram);
  const radar = await mermaid.mermaidAPI.getDiagramFromText("radar-beta\n  axis a, b\n  curve c {1, 1}\n  ticks 1000000000");
  assert.ok(radar.db.getOptions().ticks <= 100, "radar ticks must be clamped before rendering");
  console.log("XY and radar advisory inputs completed within the process deadline");
})().catch(error => { console.error(error); process.exitCode = 1; });
