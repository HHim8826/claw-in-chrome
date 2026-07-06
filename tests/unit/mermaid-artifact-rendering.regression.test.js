const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  MAX_MERMAID_EDGE_COUNT,
  MAX_MERMAID_TEXT_BYTES,
  createMermaidRenderRuntime,
  validateMermaidSource,
} = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "shared",
  "mermaid-renderer.js",
));

function testMermaidSourceLimitsAreEnforcedBeforeRendering() {
  assert.deepEqual(validateMermaidSource("graph TD\nA --> B"), {
    ok: true,
    code: "graph TD\nA --> B",
  });
  assert.equal(
    validateMermaidSource("x".repeat(MAX_MERMAID_TEXT_BYTES + 1)).reason,
    "text_limit",
  );
  const tooManyEdges = ["graph TD"]
    .concat(
      Array.from(
        { length: MAX_MERMAID_EDGE_COUNT + 1 },
        (_, index) => `N${index} --> N${index + 1}`,
      ),
    )
    .join("\n");
  assert.equal(validateMermaidSource(tooManyEdges).reason, "edge_limit");
}

async function testRuntimeUsesStrictBoundedMermaidConfiguration() {
  let initializedWith;
  const runtime = createMermaidRenderRuntime({
    mermaid: {
      initialize(options) {
        initializedWith = options;
      },
      async render() {
        return { svg: '<svg viewBox="0 0 10 10"><text>ok</text></svg>' };
      },
    },
    sanitizeSvg(svg) {
      return svg;
    },
    timeoutMs: 100,
  });

  const result = await runtime.render("graph TD\nA --> B", {
    id: "safe-diagram",
    theme: "dark",
  });
  assert.equal(result.ok, true);
  assert.match(result.svg, /<text>ok<\/text>/);
  assert.equal(initializedWith.securityLevel, "strict");
  assert.equal(initializedWith.htmlLabels, false);
  assert.equal(initializedWith.maxTextSize, MAX_MERMAID_TEXT_BYTES);
  assert.equal(initializedWith.maxEdges, MAX_MERMAID_EDGE_COUNT);
}

async function testRuntimeBoundsHungRenders() {
  const runtime = createMermaidRenderRuntime({
    mermaid: {
      initialize() {},
      render() {
        return new Promise(() => {});
      },
    },
    sanitizeSvg(svg) {
      return svg;
    },
    timeoutMs: 5,
  });
  const result = await runtime.render("graph TD\nA --> B", {
    id: "hung-diagram",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "render_failed");
  assert.match(result.error, /exceeded 5ms/);
}

function testPackagedSidePanelOwnsALazyMermaidEnhancer() {
  const root = path.join(__dirname, "..", "..");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(packageJson.devDependencies.mermaid, "^11.15.0");
  assert.equal(
    fs.existsSync(
      path.join(root, "src", "assets", "vendor", "mermaid-11.15.0.min.js"),
    ),
    true,
  );

  const html = fs.readFileSync(
    path.join(root, "src", "sidepanel", "sidepanel.html"),
    "utf8",
  );
  assert.ok(html.includes('/shared/mermaid-renderer.js'));
  assert.ok(html.includes('/sidepanel/mermaid-markdown.js'));
  assert.equal(html.includes('/assets/vendor/mermaid-11.15.0.min.js'), false);

  const enhancer = fs.readFileSync(
    path.join(root, "src", "sidepanel", "mermaid-markdown.js"),
    "utf8",
  );
  assert.ok(enhancer.includes("pre > code.language-mermaid"));
  assert.ok(enhancer.includes("assets/vendor/mermaid-11.15.0.min.js"));
  assert.ok(enhancer.includes("MutationObserver"));
}

async function main() {
  testMermaidSourceLimitsAreEnforcedBeforeRendering();
  testPackagedSidePanelOwnsALazyMermaidEnhancer();
  await testRuntimeUsesStrictBoundedMermaidConfiguration();
  await testRuntimeBoundsHungRenders();
  console.log("Mermaid artifact rendering regression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
