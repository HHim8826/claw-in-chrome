const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const bundlePath = path.join(__dirname, "..", "..", "src", "assets", "mcpPermissions-qqAoJjJ8.js");
const bundleSource = fs.readFileSync(bundlePath, "utf8");

function extractFunction(source, name) {
  const asyncSignature = `async function ${name}`;
  const signature = `function ${name}`;
  const start = source.indexOf(asyncSignature) >= 0 ? source.indexOf(asyncSignature) : source.indexOf(signature);
  assert.ok(start >= 0, `expected to find ${name} in MCP bundle`);
  const braceStart = source.indexOf("{", start);
  assert.ok(braceStart >= 0, `expected ${name} to have a body`);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === "'" && source[index - 1] !== "\\") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"' && source[index - 1] !== "\\") {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === "`" && source[index - 1] !== "\\") {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`failed to extract ${name}`);
}

function loadBackgroundProviderHelpers() {
  const normalizeSource = extractFunction(bundleSource, "__cpNormalizeBackgroundProviderConfig");
  const requireSource = extractFunction(bundleSource, "__cpRequireBackgroundProviderConfig");
  const sandbox = {
    module: {
      exports: {}
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${normalizeSource}\n${requireSource}\nmodule.exports = { __cpNormalizeBackgroundProviderConfig, __cpRequireBackgroundProviderConfig };`, sandbox, {
    filename: "mcpPermissions-provider-config-snippet.js"
  });
  return sandbox.module.exports;
}

function testBundleAcceptsCompleteConfigWithoutLegacyEnabledFlag() {
  const {
    __cpRequireBackgroundProviderConfig
  } = loadBackgroundProviderHelpers();

  const config = __cpRequireBackgroundProviderConfig({
    baseUrl: "https://provider.example/v1",
    apiKey: "provider-key",
    defaultModel: "gpt-5.4"
  });

  assert.equal(config.baseUrl, "https://provider.example/v1");
  assert.equal(config.apiKey, "provider-key");
  assert.equal(config.defaultModel, "gpt-5.4");
  assert.equal(config.enabled, true, "usable configs without the legacy enabled flag should still be treated as enabled");
}

function testBundleIgnoresLegacyEnabledFlagWhenRequiredFieldsArePresent() {
  const {
    __cpRequireBackgroundProviderConfig
  } = loadBackgroundProviderHelpers();

  const config = __cpRequireBackgroundProviderConfig({
    enabled: false,
    baseUrl: "https://provider.example/v1",
    apiKey: "provider-key",
    defaultModel: "gpt-5.4"
  });

  assert.equal(config.enabled, true, "legacy enabled=false should not disable a complete custom provider config");
}

function testBundleStillRejectsMissingRequiredProviderFields() {
  const {
    __cpRequireBackgroundProviderConfig
  } = loadBackgroundProviderHelpers();

  assert.throws(() => {
    __cpRequireBackgroundProviderConfig({
      apiKey: "provider-key",
      defaultModel: "gpt-5.4"
    });
  }, /configure your custom provider/i);

  assert.throws(() => {
    __cpRequireBackgroundProviderConfig({
      baseUrl: "https://provider.example/v1",
      defaultModel: "gpt-5.4"
    });
  }, /API key is required/);

  assert.throws(() => {
    __cpRequireBackgroundProviderConfig({
      baseUrl: "https://provider.example/v1",
      apiKey: "provider-key"
    });
  }, /default model is required/);
}

function main() {
  testBundleAcceptsCompleteConfigWithoutLegacyEnabledFlag();
  testBundleIgnoresLegacyEnabledFlagWhenRequiredFieldsArePresent();
  testBundleStillRejectsMissingRequiredProviderFields();
  assert.doesNotMatch(bundleSource, /Please enable it in Claw in Chrome\./, "MCP bundle should not tell users to enable a legacy custom provider toggle");
  console.log("mcp custom provider config regression test passed");
}

main();
