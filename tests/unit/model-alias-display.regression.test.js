const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const storageChunkPath = path.join(rootDir, "src", "assets", "useStorageState-hbwNMVUA.js");
const sidepanelBundlePath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeAnchorWhitespace(value) {
  return String(value)
    .replace(/\basync\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "async $1 =>")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, "$1 =>")
    .replace(/\s+/g, " ")
    .replace(/\(\s+(?=[`"'A-Za-z_$[{])/g, "(")
    .replace(/,\s+(?=[)\]}])/g, "")
    .trim();
}

function assertIncludesNormalized(source, snippet, label) {
  assert.equal(
    normalizeAnchorWhitespace(source).includes(
      normalizeAnchorWhitespace(snippet),
    ),
    true,
    label,
  );
}

function testModelsConfigReaderSupportsValueLabelAliases() {
  const source = read(storageChunkPath);
  assertIncludesNormalized(
    source,
    'function __cpNormalizeModelsConfigOptionEntry(e, t = {}) {',
    "models config reader should declare the shared option normalizer",
  );
  assertIncludesNormalized(
    source,
    'String(e?.model || e?.value || "").trim()',
    "models config reader should normalize value/model ids",
  );
  assertIncludesNormalized(
    source,
    'name: r || EU(n, t)',
    "models config reader should normalize label/name aliases",
  );
  assertIncludesNormalized(
    source,
    'const O = (R?.options || [])',
    "scheduler model selector should start from the resolved model config options",
  );
  assertIncludesNormalized(
    source,
    '.map(e => __cpNormalizeModelsConfigOptionEntry(e, R || {}))',
    "scheduler model selector should reuse normalized alias entries",
  );
  assertIncludesNormalized(
    source,
    '.filter(Boolean);',
    "scheduler model selector should discard invalid alias entries after normalization",
  );
}

function testSidepanelNormalizesAliasOptionsBeforeBootstrap() {
  const source = read(sidepanelBundlePath);
  assertIncludesNormalized(
    source,
    'function __cpNormalizeSelectableModelOption(e, t) {',
    "sidepanel should declare the selectable model normalizer",
  );
  assertIncludesNormalized(
    source,
    'String(e?.model || e?.value || "").trim()',
    "sidepanel should normalize value/model ids",
  );
  assertIncludesNormalized(
    source,
    'name: String(e?.name || e?.label || s).trim() || s',
    "sidepanel should normalize label/name aliases",
  );
  assertIncludesNormalized(
    source,
    'const __cpNormalizedAvailableModelOptions = a.useMemo(() => __cpNormalizeSelectableModelOptions(__cpResolvedModelConfig.options, __cpResolvedModelConfig), [__cpResolvedModelConfig]);',
    "sidepanel should normalize options before sticky model bootstrap",
  );
  assertIncludesNormalized(
    source,
    'modelConfig: { ...__cpResolvedModelConfig, options: __cpNormalizedAvailableModelOptions }',
    "sidepanel should expose normalized options to the dropdown",
  );
}

function main() {
  testModelsConfigReaderSupportsValueLabelAliases();
  testSidepanelNormalizesAliasOptionsBeforeBootstrap();
  console.log("model alias display regression tests passed");
}

main();
