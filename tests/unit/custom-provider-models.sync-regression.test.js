const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contractPath = path.join(__dirname, "..", "..", "src", "shared", "claw-contract.js");
const modelsPath = path.join(__dirname, "..", "..", "src", "shared", "custom-provider-models.js");
const contractSource = fs.readFileSync(contractPath, "utf8");
const modelsSource = fs.readFileSync(modelsPath, "utf8");

function createProfile(overrides = {}) {
  return {
    id: "provider_a",
    name: "Provider A",
    format: "openai_chat",
    baseUrl: "https://provider-a.example/v1",
    apiKey: "key-a",
    defaultModel: "gpt-5.4",
    fastModel: "gpt-5.4-mini",
    reasoningEffort: "medium",
    maxOutputTokens: 10000,
    contextWindow: 200000,
    fetchedModels: [],
    ...overrides
  };
}

function projectProfileToConfig(profile) {
  return {
    name: profile.name,
    format: profile.format,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    defaultModel: profile.defaultModel,
    fastModel: profile.fastModel,
    reasoningEffort: profile.reasoningEffort,
    maxOutputTokens: profile.maxOutputTokens,
    contextWindow: profile.contextWindow,
    fetchedModels: profile.fetchedModels
  };
}

function buildStandardSyncSignature(profile) {
  return JSON.stringify({
    provider: JSON.stringify({
      id: profile.id,
      format: profile.format,
      baseUrl: profile.baseUrl
    }),
    model: profile.defaultModel
  });
}

function buildQuickSyncSignature(profile) {
  return JSON.stringify({
    provider: JSON.stringify({
      id: profile.id,
      format: profile.format,
      baseUrl: profile.baseUrl
    }),
    model: profile.fastModel || profile.defaultModel
  });
}

function createStorageArea(initialState) {
  const state = {
    ...initialState
  };
  return {
    state,
    async get(keys) {
      if (keys == null) {
        return {
          ...state
        };
      }
      if (typeof keys === "string") {
        return {
          [keys]: state[keys]
        };
      }
      if (Array.isArray(keys)) {
        const output = {};
        for (const key of keys) {
          output[key] = state[key];
        }
        return output;
      }
      if (typeof keys === "object") {
        const output = {};
        for (const [key, fallbackValue] of Object.entries(keys)) {
          output[key] = Object.prototype.hasOwnProperty.call(state, key) ? state[key] : fallbackValue;
        }
        return output;
      }
      return {};
    },
    async set(next) {
      Object.assign(state, next);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete state[key];
      }
    }
  };
}

function loadModels(storageArea, overrides = {}) {
  const sandbox = {
    console,
    AbortController,
    clearTimeout,
    setTimeout,
    fetch: async () => {
      throw new Error("fetch should not be called in this test");
    },
    chrome: {
      storage: {
        local: storageArea
      }
    },
    ...overrides
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(contractSource, sandbox, {
    filename: "claw-contract.js"
  });
  vm.runInNewContext(modelsSource, sandbox, {
    filename: "custom-provider-models.js"
  });
  return sandbox.CustomProviderModels;
}

async function waitForMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function testSavingActiveProfileSyncsSelectedModels() {
  const activeProfile = createProfile();
  const storageArea = createStorageArea({
    customProviderProfiles: [activeProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: projectProfileToConfig(activeProfile),
    selectedModel: "gpt-old-sticky",
    selectedModelQuickMode: "gpt-old-quick"
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.saveProviderProfile({
    ...activeProfile,
    defaultModel: "gpt-5.5",
    fastModel: "gpt-5.5-mini"
  }, {
    profileId: activeProfile.id,
    storageArea
  });

  assert.equal(storageArea.state.selectedModel, "gpt-5.5");
  assert.equal(storageArea.state.selectedModelQuickMode, "gpt-5.5-mini");
  assert.equal(storageArea.state.customProviderConfig.defaultModel, "gpt-5.5");
  assert.equal(storageArea.state.customProviderConfig.fastModel, "gpt-5.5-mini");
  assert.ok(storageArea.state.customProviderSelectedModelSyncSignature, "standard sync signature should be stored");
  assert.ok(storageArea.state.customProviderSelectedModelQuickModeSyncSignature, "quick sync signature should be stored");
}

async function testSavingNonModelFieldsKeepsExistingStickySelection() {
  const activeProfile = createProfile();
  const storageArea = createStorageArea({
    customProviderProfiles: [activeProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: projectProfileToConfig(activeProfile),
    selectedModel: "manual-standard-choice",
    selectedModelQuickMode: "manual-quick-choice",
    customProviderSelectedModelSyncSignature: buildStandardSyncSignature(activeProfile),
    customProviderSelectedModelQuickModeSyncSignature: buildQuickSyncSignature(activeProfile)
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.saveProviderProfile({
    ...activeProfile,
    contextWindow: 240000,
    maxOutputTokens: 12000
  }, {
    profileId: activeProfile.id,
    storageArea
  });

  assert.equal(storageArea.state.selectedModel, "manual-standard-choice");
  assert.equal(storageArea.state.selectedModelQuickMode, "manual-quick-choice");
}

async function testEditingInactiveProfileDoesNotResyncActiveSelection() {
  const activeProfile = createProfile();
  const inactiveProfile = createProfile({
    id: "provider_b",
    name: "Provider B",
    baseUrl: "https://provider-b.example/v1",
    apiKey: "key-b",
    defaultModel: "gpt-4.1",
    fastModel: "gpt-4.1-mini"
  });
  const storageArea = createStorageArea({
    customProviderProfiles: [activeProfile, inactiveProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: projectProfileToConfig(activeProfile),
    selectedModel: "manual-standard-choice",
    selectedModelQuickMode: "manual-quick-choice",
    customProviderSelectedModelSyncSignature: buildStandardSyncSignature(activeProfile),
    customProviderSelectedModelQuickModeSyncSignature: buildQuickSyncSignature(activeProfile)
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.saveProviderProfile({
    ...inactiveProfile,
    defaultModel: "gpt-4.2"
  }, {
    profileId: inactiveProfile.id,
    storageArea,
    activateOnSave: false
  });

  assert.equal(storageArea.state.selectedModel, "manual-standard-choice");
  assert.equal(storageArea.state.selectedModelQuickMode, "manual-quick-choice");
  assert.equal(storageArea.state.customProviderActiveProfileId, activeProfile.id);
}

async function testActivatingAnotherProfileSyncsSelectedModels() {
  const activeProfile = createProfile();
  const inactiveProfile = createProfile({
    id: "provider_b",
    name: "Provider B",
    baseUrl: "https://provider-b.example/v1",
    apiKey: "key-b",
    defaultModel: "gpt-4.1",
    fastModel: "gpt-4.1-mini"
  });
  const storageArea = createStorageArea({
    customProviderProfiles: [activeProfile, inactiveProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: projectProfileToConfig(activeProfile),
    selectedModel: "manual-standard-choice",
    selectedModelQuickMode: "manual-quick-choice"
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.setActiveProviderProfile(inactiveProfile.id, {
    storageArea
  });

  assert.equal(storageArea.state.customProviderActiveProfileId, inactiveProfile.id);
  assert.equal(storageArea.state.selectedModel, inactiveProfile.defaultModel);
  assert.equal(storageArea.state.selectedModelQuickMode, inactiveProfile.fastModel);
}

async function testReconcileRepairsExistingStaleSelectionWithoutResave() {
  const activeProfile = createProfile({
    defaultModel: "gpt-5.4",
    fastModel: "gpt-5.4-mini"
  });
  const storageArea = createStorageArea({
    customProviderProfiles: [activeProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: projectProfileToConfig(activeProfile),
    selectedModel: "stale-sticky-model",
    selectedModelQuickMode: "stale-quick-model"
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  assert.equal(storageArea.state.selectedModel, activeProfile.defaultModel);
  assert.equal(storageArea.state.selectedModelQuickMode, activeProfile.fastModel);

  storageArea.state.selectedModel = "manual-standard-choice";
  storageArea.state.selectedModelQuickMode = "manual-quick-choice";

  const reconciled = await models.reconcileActiveProviderModelSelection({
    storageArea
  });

  assert.equal(reconciled, false, "matching sync signatures should not overwrite later manual model choices");
  assert.equal(storageArea.state.selectedModel, "manual-standard-choice");
  assert.equal(storageArea.state.selectedModelQuickMode, "manual-quick-choice");
}

async function testLoadingLegacyStorageCleansDeprecatedFields() {
  const activeProfile = createProfile();
  const legacyProfile = {
    ...activeProfile,
    enabled: true,
    notes: "legacy note"
  };
  const storageArea = createStorageArea({
    customProviderProfiles: [legacyProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: {
      ...projectProfileToConfig(activeProfile),
      enabled: true,
      notes: "legacy config note"
    }
  });

  loadModels(storageArea);
  await waitForMicrotasks();

  assert.equal(Object.prototype.hasOwnProperty.call(storageArea.state.customProviderConfig, "enabled"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storageArea.state.customProviderConfig, "notes"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storageArea.state.customProviderProfiles[0], "enabled"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(storageArea.state.customProviderProfiles[0], "notes"), false);
}

async function testManualAliasOnlyChangesDisplayName() {
  const activeProfile = createProfile({
    defaultModel: "MiniMax-M2.7",
    fastModel: "MiniMax-M2.7-fast",
    fetchedModels: [{
      value: "MiniMax-M2.7",
      label: "MiniMax M2.7 正式版",
      manual: true
    }, {
      value: "MiniMax-M2.7-fast",
      label: "MiniMax M2.7 快速版",
      manual: true
    }]
  });
  const storageArea = createStorageArea({
    customProviderProfiles: [activeProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: projectProfileToConfig(activeProfile),
    selectedModel: "stale-model-id",
    selectedModelQuickMode: "stale-fast-model-id"
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.saveProviderProfile(activeProfile, {
    profileId: activeProfile.id,
    storageArea
  });

  assert.equal(storageArea.state.selectedModel, "MiniMax-M2.7");
  assert.equal(storageArea.state.selectedModelQuickMode, "MiniMax-M2.7-fast");
  assert.equal(storageArea.state.customProviderConfig.defaultModel, "MiniMax-M2.7");
  assert.equal(storageArea.state.customProviderConfig.fetchedModels.find((item) => item.value === "MiniMax-M2.7")?.label, "MiniMax M2.7 正式版");
}

async function testSyncModelOptionsUsesAliasButKeepsModelIdValue() {
  const storageArea = createStorageArea({});
  const select = {
    children: [],
    disabled: false,
    value: ""
  };
  Object.defineProperty(select, "innerHTML", {
    get() {
      return "";
    },
    set() {
      this.children = [];
    }
  });
  select.appendChild = function (child) {
    this.children.push(child);
  };
  const models = loadModels(storageArea, {
    document: {
      createElement() {
        return {
          value: "",
          textContent: "",
          dataset: {}
        };
      }
    }
  });

  models.syncModelOptions(select, [{
    value: "MiniMax-M2.7",
    label: "MiniMax M2.7 正式版",
    manual: true
  }], "MiniMax-M2.7");

  assert.equal(select.children[1].textContent, "MiniMax M2.7 正式版");
  assert.equal(select.children[1].value, "MiniMax-M2.7");
  assert.equal(select.value, "MiniMax-M2.7");
}
async function testSavingHttpProfileDefaultsToEnabled() {
  const httpProfile = createProfile({
    baseUrl: "http://provider-a.example/v1"
  });
  const storageArea = createStorageArea({
    customProviderProfiles: [],
    customProviderConfig: {}
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.saveProviderProfile(httpProfile, {
    profileId: httpProfile.id,
    storageArea
  });

  assert.equal(storageArea.state.customProviderConfig.baseUrl, "http://provider-a.example/v1");
  assert.equal(storageArea.state.customProviderProfiles[0].baseUrl, "http://provider-a.example/v1");
  assert.equal(storageArea.state.customProviderAllowHttp, true);
  assert.equal(storageArea.state.customProviderAllowHttpMigrated, true);
}
async function testSavingHttpProfileSucceedsWhenToggleEnabled() {
  const httpProfile = createProfile({
    baseUrl: "http://provider-a.example/v1"
  });
  const storageArea = createStorageArea({
    customProviderAllowHttp: true,
    customProviderAllowHttpMigrated: true
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.saveProviderProfile(httpProfile, {
    profileId: httpProfile.id,
    storageArea
  });

  assert.equal(storageArea.state.customProviderConfig.baseUrl, "http://provider-a.example/v1");
  assert.equal(storageArea.state.customProviderProfiles[0].baseUrl, "http://provider-a.example/v1");
}
async function testActivatingHttpProfileDefaultsToEnabled() {
  const activeProfile = createProfile();
  const httpProfile = createProfile({
    id: "provider_http",
    name: "HTTP Provider",
    baseUrl: "http://provider-http.example/v1",
    apiKey: "key-http",
    defaultModel: "gpt-4.1",
    fastModel: "gpt-4.1-mini"
  });
  const storageArea = createStorageArea({
    customProviderProfiles: [activeProfile, httpProfile],
    customProviderActiveProfileId: activeProfile.id,
    customProviderConfig: projectProfileToConfig(activeProfile)
  });
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await models.setActiveProviderProfile(httpProfile.id, {
    storageArea
  });

  assert.equal(storageArea.state.customProviderActiveProfileId, httpProfile.id);
  assert.equal(storageArea.state.customProviderAllowHttp, true);
  assert.equal(storageArea.state.customProviderAllowHttpMigrated, true);
}
async function testFetchAndProbeAllowHttpByDefault() {
  const httpProfile = createProfile({
    baseUrl: "http://provider-a.example/v1"
  });
  const storageArea = createStorageArea({});
  let fetchCalls = 0;
  const fetchImpl = async (input) => {
    fetchCalls += 1;
    const url = String(input);
    if (url.endsWith("/models")) {
      return {
        ok: true,
        status: 200,
        headers: {
          get() {
            return "application/json";
          }
        },
        async text() {
          return JSON.stringify({
            data: [{
              id: "gpt-5.4"
            }]
          });
        }
      };
    }
    return {
      ok: true,
      status: 200,
      headers: {
        get() {
          return "application/json";
        }
      },
      async text() {
        return JSON.stringify({
          content: [{
            type: "text",
            text: "OK"
          }]
        });
      }
    };
  };
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  const fetched = await models.fetchProviderModels(httpProfile, {
    storageArea,
    fetchImpl
  });
  const probe = await models.probeProviderModel(httpProfile, {
    storageArea,
    fetchImpl
  });

  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].value, "gpt-5.4");
  assert.equal(fetched[0].label, "gpt-5.4");
  assert.equal(fetched[0].manual, false);
  assert.equal(probe.ok, true);
  assert.equal(fetchCalls, 2);
  assert.equal(storageArea.state.customProviderAllowHttp, true);
  assert.equal(storageArea.state.customProviderAllowHttpMigrated, true);
}
async function testFetchAndProbeRejectWhenHttpExplicitlyDisabled() {
  const httpProfile = createProfile({
    baseUrl: "http://provider-a.example/v1"
  });
  const storageArea = createStorageArea({
    customProviderAllowHttp: false,
    customProviderAllowHttpMigrated: true
  });
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called");
  };
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await assert.rejects(models.fetchProviderModels(httpProfile, {
    storageArea,
    fetchImpl
  }), /HTTP 协议未启用/);
  await assert.rejects(models.probeProviderModel(httpProfile, {
    storageArea,
    fetchImpl
  }), /HTTP 协议未启用/);

  assert.equal(fetchCalls, 0);
}
async function testLegacyActiveHttpProfileMigratesToggleToEnabled() {
  const httpProfile = createProfile({
    baseUrl: "http://provider-a.example/v1"
  });
  const storageArea = createStorageArea({
    customProviderProfiles: [httpProfile],
    customProviderActiveProfileId: httpProfile.id,
    customProviderConfig: projectProfileToConfig(httpProfile)
  });

  loadModels(storageArea);
  await waitForMicrotasks();

  assert.equal(storageArea.state.customProviderAllowHttp, true);
  assert.equal(storageArea.state.customProviderAllowHttpMigrated, true);
}

async function testGeminiResponsesProbeUsesChatCompletionsFirst() {
  const geminiProfile = createProfile({
    name: "Gemini",
    format: "openai_responses",
    baseUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/responses",
    defaultModel: "gemini-3-flash-preview",
    fastModel: ""
  });
  const storageArea = createStorageArea({});
  const fetchCalls = [];
  const fetchImpl = async (input, init) => {
    fetchCalls.push({
      url: String(input),
      body: init && typeof init.body === "string" ? JSON.parse(init.body) : null
    });
    return {
      ok: true,
      status: 200,
      headers: { get() { return "application/json"; } },
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: "OK" } }]
        });
      }
    };
  };
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  const probe = await models.probeProviderModel(geminiProfile, {
    storageArea,
    fetchImpl
  });

  assert.equal(probe.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
  );
  assert.equal(Array.isArray(fetchCalls[0].body.messages), true);
  assert.equal("input" in fetchCalls[0].body, false);
}

async function testResponsesProbeDoesNotFallbackOnProviderRateLimit() {
  const profile = createProfile({
    format: "openai_responses",
    baseUrl: "https://provider-a.example/v1",
    defaultModel: "gpt-5.4",
    fastModel: ""
  });
  const storageArea = createStorageArea({});
  const fetchCalls = [];
  const fetchImpl = async (input, init) => {
    fetchCalls.push({
      url: String(input),
      body: init && typeof init.body === "string" ? JSON.parse(init.body) : null
    });
    return {
      ok: false,
      status: 429,
      headers: { get() { return "application/json"; } },
      async text() {
        return JSON.stringify({
          error: { message: "quota exceeded: provider rate limit" }
        });
      }
    };
  };
  const models = loadModels(storageArea);
  await waitForMicrotasks();

  await assert.rejects(models.probeProviderModel(profile, {
    storageArea,
    fetchImpl
  }), /provider rate limit/);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://provider-a.example/v1/responses");
}

async function main() {
  await testSavingActiveProfileSyncsSelectedModels();
  await testSavingNonModelFieldsKeepsExistingStickySelection();
  await testEditingInactiveProfileDoesNotResyncActiveSelection();
  await testActivatingAnotherProfileSyncsSelectedModels();
  await testReconcileRepairsExistingStaleSelectionWithoutResave();
  await testLoadingLegacyStorageCleansDeprecatedFields();
  await testManualAliasOnlyChangesDisplayName();
  await testSyncModelOptionsUsesAliasButKeepsModelIdValue();
  await testSavingHttpProfileDefaultsToEnabled();
  await testSavingHttpProfileSucceedsWhenToggleEnabled();
  await testActivatingHttpProfileDefaultsToEnabled();
  await testFetchAndProbeAllowHttpByDefault();
  await testFetchAndProbeRejectWhenHttpExplicitlyDisabled();
  await testGeminiResponsesProbeUsesChatCompletionsFirst();
  await testResponsesProbeDoesNotFallbackOnProviderRateLimit();
  await testLegacyActiveHttpProfileMigratesToggleToEnabled();
  console.log("custom-provider-models sync regression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
