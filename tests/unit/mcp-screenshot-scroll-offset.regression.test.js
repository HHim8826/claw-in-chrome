const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bundlePath = path.join(
  __dirname,
  "..",
  "..",
  "src",
  "assets",
  "mcpPermissions-qqAoJjJ8.js",
);

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function assertIncludes(source, snippet, label) {
  assert.equal(
    source.includes(snippet),
    true,
    `${label} should include the expected snippet`,
  );
}

function main() {
  const source = readSource(bundlePath);

  assertIncludes(
    source,
    "scrollX: window.scrollX,\n            scrollY: window.scrollY,",
    "screenshot viewport probe should capture page scroll offsets",
  );

  assertIncludes(
    source,
    'clip: {\n            x: scrollX,\n            y: scrollY,\n            width: viewportWidth,\n            height: viewportHeight,\n            scale: captureScale,\n          },',
    "viewport screenshot should offset CDP clip by the current scroll position",
  );

  assertIncludes(
    source,
    "const captureSourceWidth = Math.round(\n        viewportWidth * captureDeviceScaleFactor,\n      );",
    "viewport screenshot should base scaling on the device pixel ratio",
  );

  assertIncludes(
    source,
    "scrollX: viewportScrollX,\n                scrollY: viewportScrollY,",
    "zoom viewport probe should read the current scroll position",
  );

  assertIncludes(
    source,
    'clip: {\n                  x: viewportScrollX + o,\n                  y: viewportScrollY + n,\n                  width: u,\n                  height: h,\n                  scale: 1,\n                },',
    "zoom screenshot should offset CDP clip by the current scroll position",
  );

  console.log("mcp screenshot scroll offset regression test passed");
}

main();
