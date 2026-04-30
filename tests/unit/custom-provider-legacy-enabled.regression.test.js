const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const permissionManagerPath = path.join(__dirname, "..", "..", "src", "assets", "PermissionManager-9s959502.js");
const optionsChunkPath = path.join(__dirname, "..", "..", "src", "assets", "useStorageState-hbwNMVUA.js");
const permissionManagerSource = fs.readFileSync(permissionManagerPath, "utf8");
const optionsChunkSource = fs.readFileSync(optionsChunkPath, "utf8");

function extractFunction(source, name) {
  const asyncSignature = `async function ${name}`;
  const signature = `function ${name}`;
  const start = source.indexOf(asyncSignature) >= 0 ? source.indexOf(asyncSignature) : source.indexOf(signature);
  assert.ok(start >= 0, `expected to find ${name}`);
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

async function testPermissionManagerBypassesAnthropicTrafficWithoutLegacyEnabledFlag() {
  const functionSource = extractFunction(permissionManagerSource, "__cpShouldBypassAnthropicTraffic");
  const sandbox = {
    chrome: {
      storage: {
        local: {
          async get() {
            return {
              customProviderConfig: {
                baseUrl: "https://provider.example/v1",
                apiKey: "provider-key",
                defaultModel: "gpt-5.4"
              }
            };
          }
        }
      }
    },
    module: {
      exports: {}
    }
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(`${functionSource}\nmodule.exports = { __cpShouldBypassAnthropicTraffic };`, sandbox, {
    filename: "permission-manager-provider-snippet.js"
  });

  const result = await sandbox.module.exports.__cpShouldBypassAnthropicTraffic();
  assert.equal(result, true);
}

function testOptionsAccountTreatsCompleteProviderConfigAsConfiguredWithoutLegacyEnabledFlag() {
  const functionSource = extractFunction(optionsChunkSource, "__cpIsOptionsCustomProviderPrivacyMode");
  const sandbox = {
    module: {
      exports: {}
    }
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(`${functionSource}\nmodule.exports = { __cpIsOptionsCustomProviderPrivacyMode };`, sandbox, {
    filename: "options-account-provider-snippet.js"
  });

  const result = sandbox.module.exports.__cpIsOptionsCustomProviderPrivacyMode({
    baseUrl: "https://provider.example/v1",
    apiKey: "provider-key",
    defaultModel: "gpt-5.4"
  });

  assert.equal(result, true);
}

function testBundlesNoLongerDependOnLegacyEnabledFlagForProviderAvailability() {
  assert.doesNotMatch(
    permissionManagerSource,
    /return !!t\?\.enabled && !!t\?\.baseUrl && !!t\?\.apiKey;/,
    "PermissionManager bundle should no longer require the legacy enabled flag"
  );

  assert.doesNotMatch(
    optionsChunkSource,
    /return !!e\?\.enabled && !!e\?\.baseUrl && !!e\?\.apiKey;/,
    "options account bundle should no longer require the legacy enabled flag"
  );

  assert.doesNotMatch(
    optionsChunkSource,
    /\!\!t \|\| !!e\?\.enabled && !!e\?\.baseUrl && !!e\?\.apiKey/,
    "options account availability callback should no longer require the legacy enabled flag"
  );
}

async function main() {
  await testPermissionManagerBypassesAnthropicTrafficWithoutLegacyEnabledFlag();
  testOptionsAccountTreatsCompleteProviderConfigAsConfiguredWithoutLegacyEnabledFlag();
  testBundlesNoLongerDependOnLegacyEnabledFlagForProviderAvailability();
  console.log("custom provider legacy enabled regression test passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
