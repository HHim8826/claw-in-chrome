const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..", "..");
const storageChunkPath = path.join(rootDir, "src", "assets", "useStorageState-hbwNMVUA.js");
const sidepanelBundlePath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");
const optionsBundlePath = path.join(rootDir, "src", "assets", "options-Hyb_OzME.js");

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
    'return __cpUseResolvedModelsConfig(t);',
    "models config reader should overlay custom provider models",
  );
  assertIncludesNormalized(
    source,
    'function __cpBuildCustomProviderModelsConfig(e, t) {',
    "models config reader should build selectable custom-provider options",
  );
  assertIncludesNormalized(
    source,
    '__cpReadCachedProviderModelOptionsForModels(t, n)',
    "models config reader should include cached fetched provider models",
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
  assertIncludesNormalized(
    source,
    'const le = Ge();',
    "sidepanel shortcut editor should read the resolved model config",
  );
  assertIncludesNormalized(
    source,
    'modelConfig: le',
    "sidepanel scheduler should receive the resolved model config",
  );
  assertIncludesNormalized(
    source,
    'const r = n && (!e.length || t(n)) ? n : s;',
    "sidepanel should reject a stale current model",
  );
}

function testCustomProviderModelsConfigMergesFetchedSources() {
  const source = read(storageChunkPath);
  const providerStart = source.indexOf("function __cpNormalizeProviderModelOptionEntry");
  const providerEnd = source.indexOf("function __cpUseResolvedModelsConfig", providerStart);
  const normalizerStart = source.indexOf("function __cpNormalizeModelsConfigOptionEntry");
  const normalizerEnd = source.indexOf("// 语义锚点：从模型配置", normalizerStart);
  assert.notEqual(providerStart, -1);
  assert.notEqual(providerEnd, -1);
  assert.notEqual(normalizerStart, -1);
  assert.notEqual(normalizerEnd, -1);

  const helpers = vm.runInNewContext(
    `${source.slice(normalizerStart, normalizerEnd)}
${source.slice(providerStart, providerEnd)}
({ __cpBuildFetchedModelsCacheEntryKeyForModels, __cpBuildCustomProviderModelsConfig });`,
    {},
  );
  const profile = {
    baseUrl: "https://provider.example/v1",
    apiKey: "test-key",
    format: "openai_chat",
    defaultModel: "model-default",
    fastModel: "model-fast",
    fetchedModels: [{ value: "model-fetched", label: "Fetched alias" }],
  };
  const cacheKey = helpers.__cpBuildFetchedModelsCacheEntryKeyForModels(profile);
  const config = helpers.__cpBuildCustomProviderModelsConfig(profile, {
    [cacheKey]: {
      models: [
        { model: "model-fetched", name: "Cached duplicate" },
        { model: "model-cached", name: "Cached model" },
      ],
    },
  });

  assert.equal(config.default, "model-default");
  assert.equal(config.small_fast_model, "model-fast");
  assert.deepEqual(
    Array.from(config.options, (entry) => `${entry.model}:${entry.name}`),
    [
      "model-default:model-default",
      "model-fast:model-fast",
      "model-fetched:Fetched alias",
      "model-cached:Cached model",
    ],
  );
}

function testShortcutModalTracksResolvedDefaultModel() {
  const source = read(optionsBundlePath);
  assertIncludesNormalized(
    source,
    'const __cpShortcutFallbackModelId = "claude-sonnet-4-5-20250929";',
    "shortcut modal should identify its temporary fallback",
  );
  assertIncludesNormalized(
    source,
    'if (!r || r === __cpShortcutFallbackModelId || (t.length && !i)) { return e; }',
    "shortcut modal should adopt the resolved provider default",
  );
}

function main() {
  testModelsConfigReaderSupportsValueLabelAliases();
  testCustomProviderModelsConfigMergesFetchedSources();
  testSidepanelNormalizesAliasOptionsBeforeBootstrap();
  testShortcutModalTracksResolvedDefaultModel();
  console.log("model alias display regression tests passed");
}

main();
