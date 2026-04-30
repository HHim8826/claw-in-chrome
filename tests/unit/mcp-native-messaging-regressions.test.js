const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const mcpPermissionsBundlePath = path.join(
  rootDir, "src", "assets",
  "mcpPermissions-qqAoJjJ8.js",
);
const permissionManagerBundlePath = path.join(
  rootDir, "src", "assets",
  "PermissionManager-9s959502.js",
);
const sidepanelBundlePath = path.join(
  rootDir, "src", "assets",
  "sidepanel-BoLm9pmH.js",
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
  const source = readSource(mcpPermissionsBundlePath);
  const permissionManagerSource = readSource(permissionManagerBundlePath);
  const sidepanelSource = readSource(sidepanelBundlePath);

  assertIncludes(
    source,
    "if (!/^[a-z][a-z\\d+.-]*:/i.test(l)) {\n        l = `https://${l}`;\n      }",
    "navigate should preserve explicit non-http schemes such as file://",
  );

  assertIncludes(
    source,
    'const r = await K.sendCommand(e, "Page.getNavigationHistory");',
    "navigate history traversal should consult CDP navigation history instead of relying on chrome.tabs.goBack",
  );

  assertIncludes(
    source,
    'await K.sendCommand(e, "Page.navigateToHistoryEntry", {\n    entryId: i,\n  });',
    "navigate history traversal should jump to the resolved CDP history entry",
  );

  assertIncludes(
    source,
    "const __cpMcpLocalImageRegistry = new Map();",
    "native-messaging image uploads should have a local image registry",
  );

  assert.equal(
    source.includes("() => chrome.tabs.goBack("),
    false,
    "navigate back should no longer depend on chrome.tabs.goBack, which misreports missing history in MCP tabs",
  );

  assertIncludes(
    source,
    "__cpMcpRememberImage(o, {\n      base64: r.base64,\n      mediaType: `image/${r.format}`,\n      width: r.width,\n      height: r.height,\n    });",
    "computer screenshots should be cached locally for later upload_image calls",
  );

  assertIncludes(
    source,
    "const d =\n        __cpMcpResolveImageFromLocalRegistry(r.imageId) ||\n        (t.messages ? oe(t.messages, r.imageId) : undefined);",
    "upload_image should fall back to the local registry when message history is unavailable",
  );

  assertIncludes(
    permissionManagerSource,
    'const i = this.resolvePermissionNetlocFromUrl(t);',
    "permission manager should normalize file:// and other originless schemes into a stable permission scope key",
  );

  assertIncludes(
    permissionManagerSource,
    'return e.protocol === "file:" ? "file://" : e.protocol;',
    "permission manager should preserve explicit originless schemes instead of collapsing them to an empty netloc",
  );

  assertIncludes(
    source,
    'const e = __cpMcpResolvePermissionNetlocFromUrl(d.url);',
    "permission retry should derive the same permission scope key that checkPermission uses",
  );

  assertIncludes(
    sidepanelSource,
    't = n.protocol === "file:" ? "file://" : n.protocol;',
    "sidepanel permission prompt scope resolution should keep file:// and data: style URLs routable after approval",
  );

  assertIncludes(
    sidepanelSource,
    'netloc: __cpResolvePermissionScopeFromPrompt(i.permissionPrompt).netloc',
    "sidepanel auto-approve paths should reuse the normalized permission scope for originless URLs",
  );

  console.log("mcp native-messaging regressions test passed");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}
