const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "mcpPermissions-qqAoJjJ8.js");

function readBundle() {
  return fs.readFileSync(bundlePath, "utf8").replace(/\r\n/g, "\n");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should be defined`);
  let depth = 0;
  let index = source.indexOf("{", start);
  for (; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(start, index + 1);
}

function loadHelpers() {
  const source = readBundle();
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    [
      extractFunction(source, "__cpMcpDetectPageZoomShortcut"),
      extractFunction(source, "__cpMcpNormalizeScreenshotScale"),
      extractFunction(source, "__cpMcpScaleScreenshotTarget"),
      "this.detect = __cpMcpDetectPageZoomShortcut;",
      "this.normalize = __cpMcpNormalizeScreenshotScale;",
      "this.scaleTarget = __cpMcpScaleScreenshotTarget;",
    ].join("\n"),
    context,
  );
  return context;
}

function testPageZoomShortcutsAreDetected() {
  const { detect } = loadHelpers();
  for (const key of ["ctrl+=", "cmd+=", "ctrl++", "ctrl+shift+=", "cmd+plus", "ctrl+numpadadd", "meta+add"]) {
    assert.equal(detect(key), "in", `${key} zooms in`);
  }
  for (const key of ["ctrl+-", "cmd+minus", "ctrl+numpadsubtract"]) {
    assert.equal(detect(key), "out", `${key} zooms out`);
  }
  for (const key of ["ctrl+0", "cmd+numpad0"]) {
    assert.equal(detect(key), "reset", `${key} resets zoom`);
  }
  for (const key of ["ctrl+a", "shift+=", "=", "-", "0", "ctrl+shift+-", "alt+=", "Enter", "ctrl+shift+0"]) {
    assert.equal(detect(key), null, `${key} is not a zoom shortcut`);
  }
}

function testScreenshotScaleIsNormalized() {
  const { normalize, scaleTarget } = loadHelpers();
  assert.equal(normalize(undefined), 1);
  assert.equal(normalize(0.5), 0.5);
  assert.equal(normalize(0.1), 0.1);
  assert.equal(normalize(1), 1);
  assert.equal(normalize(0.05), 1, "out-of-range scales fall back to full size");
  assert.equal(normalize(2), 1);
  assert.equal(normalize("0.5"), 1, "non-numeric scales fall back to full size");
  assert.equal(normalize(Number.NaN), 1);

  assert.deepEqual({ ...scaleTarget(1280, 800, 1) }, { width: 1280, height: 800 });
  assert.deepEqual({ ...scaleTarget(1280, 800, 0.5) }, { width: 640, height: 400, frameWidth: 1280, frameHeight: 800 });
  assert.deepEqual({ ...scaleTarget(3, 3, 0.1) }, { width: 1, height: 1, frameWidth: 3, frameHeight: 3 });
}

function testCoordinateContextUsesFullResolutionFrame() {
  const source = readBundle();
  const start = source.indexOf("const M = new (class {");
  const end = source.indexOf("const __cpMcpScreenshotViewportContextLedger = M;", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.M = M;`, context);
  context.M.setContext(1, { viewportWidth: 1280, viewportHeight: 800, width: 640, height: 400, frameWidth: 1280, frameHeight: 800 });
  assert.deepEqual({ ...context.M.getContext(1) }, {
    viewportWidth: 1280,
    viewportHeight: 800,
    screenshotWidth: 1280,
    screenshotHeight: 800,
  });
  context.M.setContext(2, { viewportWidth: 1280, viewportHeight: 800, width: 1024, height: 640 });
  assert.equal(context.M.getContext(2).screenshotWidth, 1024, "unscaled screenshots keep their own frame");
}

function testComputerSchemasAndActionsExposeGuards() {
  const source = readBundle();
  const scaleDescription =
    "For `screenshot` and `zoom` only. Scale factor in [0.1, 1] for the returned image; 1 (default) uses the full image token budget, 0.5 returns an image at half the width and height (~quarter of the tokens). Coordinates are ALWAYS in the full-resolution coordinate frame (reported with every scaled screenshot), never in the scaled image's own pixels.";
  assert.equal(source.split(scaleDescription).length - 1, 2, "both computer schemas expose scale");
  const textDescription =
    'Page zoom shortcuts (e.g. "cmd+=", "ctrl+-", "cmd+0") are not supported and will return an error - use the `zoom` action to magnify a region of the page instead.';
  assert.equal(source.split(textDescription).length - 1, 2, "both computer schemas document zoom shortcuts");
  assert.equal(
    source.includes('if (typeof t.text != "string" || !t.text) {\n              throw new Error(\n                "Text parameter must be a non-empty string for type action",'),
    true,
    "type validates non-empty string text",
  );
  assert.equal(
    source.includes("if (__cpMcpDetectPageZoomShortcut(e)) {\n                  return __cpMcpPageZoomShortcutError(e);"),
    true,
    "key action rejects page zoom shortcuts before dispatching keys",
  );
  assert.equal(source.includes("d = await ge(n, { ...u, scale: o.scale });"), true, "screenshot action forwards scale");
  assert.equal(source.includes("-scale view; coordinate frame: "), true, "scaled screenshots report the coordinate frame");
  assert.equal(
    source.includes("const zoomCaptureScale = __cpMcpNormalizeScreenshotScale(t.scale);\n            try {"),
    true,
    "zoom reads scale before the context shadows its input",
  );
  assert.equal(source.includes("scale: zoomCaptureScale,"), true, "zoom capture applies scale");
  assert.equal(
    source.includes("async processScreenshotInContentScript(e, t, r, o, a, n, s, i, d, f) {"),
    true,
    "the compression fallback accepts the full-resolution frame",
  );
  assert.equal(
    source.includes("if (f?.frameWidth && f?.frameHeight) {\n      l.frameWidth = f.frameWidth;\n      l.frameHeight = f.frameHeight;\n    }"),
    true,
    "fallback screenshots keep the coordinate frame and scale note",
  );
  assert.equal(
    source.includes("r?.pendingContextScope,\n        scaledCaptureTarget.frameWidth"),
    true,
    "the scaled capture passes its frame to the fallback",
  );
}

function main() {
  testPageZoomShortcutsAreDetected();
  testScreenshotScaleIsNormalized();
  testCoordinateContextUsesFullResolutionFrame();
  testComputerSchemasAndActionsExposeGuards();
  console.log("computer tool guard regression tests passed");
}

main();
