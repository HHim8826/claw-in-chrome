const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sharedDir = path.join(__dirname, "..", "..", "src", "shared");
const sources = ["claw-contract.js", "provider-observability.js", "provider-format-adapter.js"].map((name) => ({
  name,
  source: fs.readFileSync(path.join(sharedDir, name), "utf8"),
}));

// A browser_batch tool result interleaves step text with screenshots.
const BATCH_TOOL_RESULT_CONTENT = [
  { type: "text", text: "[navigate] Navigated" },
  { type: "text", text: "[computer:screenshot] Captured" },
  { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "FIRSTIMAGE" } },
  { type: "text", text: "[computer:screenshot] Captured" },
  { type: "image", source: { type: "base64", media_type: "image/png", data: "SECONDIMAGE" } },
];

async function sendThroughAdapter(format) {
  const config = {
    format,
    baseUrl: "https://provider.example/v1",
    apiKey: "test-key",
    defaultModel: "model-main",
    fastModel: "",
  };
  const upstreamBodies = [];
  const storageState = { providerObservabilityRecords: [] };
  const sandbox = {
    console,
    Request,
    Response,
    Headers,
    URL,
    TextEncoder,
    TextDecoder,
    TransformStream,
    ReadableStream,
    WritableStream,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    dispatchEvent: () => true,
    fetch: async (_input, init) => {
      upstreamBodies.push(JSON.parse(init.body));
      const payload =
        format === "openai_responses"
          ? { id: "resp_1", model: "model-main", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }], usage: { input_tokens: 1, output_tokens: 1 } }
          : { id: "chat_1", model: "model-main", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "done" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    },
    chrome: {
      storage: {
        local: {
          async get(key) {
            if (key === "providerObservabilityRecords") {
              return { providerObservabilityRecords: storageState.providerObservabilityRecords };
            }
            return typeof key === "string" ? { [key]: config } : { customProviderConfig: config };
          },
          async set(changes) {
            Object.assign(storageState, changes);
          },
        },
        onChanged: { addListener() {} },
      },
    },
  };
  sandbox.globalThis = sandbox;
  for (const { name, source } of sources) {
    vm.runInNewContext(source, sandbox, { filename: name });
  }
  const response = await sandbox.fetch(
    new Request("https://provider.example/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "k", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "model-main",
        max_tokens: 64,
        stream: false,
        messages: [
          { role: "user", content: "Open the page and take two screenshots." },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "toolu_batch", name: "browser_batch", input: { actions: [] } }],
          },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_batch", content: BATCH_TOOL_RESULT_CONTENT }] },
        ],
      }),
    }),
  );
  await response.json();
  await sandbox.__CP_PROVIDER_OBSERVABILITY__.whenIdle();
  assert.equal(upstreamBodies.length, 1);
  return JSON.stringify(upstreamBodies[0]);
}

async function testBatchImagesFollowTheSingleScreenshotContract() {
  // Responses forwards tool-result images as a follow-up user message.
  const responses = await sendThroughAdapter("openai_responses");
  assert.equal(responses.includes("data:image/jpeg;base64,FIRSTIMAGE"), true);
  assert.equal(responses.includes("data:image/png;base64,SECONDIMAGE"), true);
  assert.ok(responses.indexOf("FIRSTIMAGE") < responses.indexOf("SECONDIMAGE"), "screenshot order is kept");
  assert.equal(responses.includes("[navigate] Navigated"), true);

  // Chat Completions keeps the existing tool-message contract: text plus image
  // metadata, in step order, because tool messages can't carry image parts.
  const chat = await sendThroughAdapter("openai_chat");
  assert.equal(chat.includes("[navigate] Navigated"), true);
  const first = chat.indexOf('\\"data_length\\":10');
  const second = chat.indexOf('\\"data_length\\":11');
  assert.ok(first !== -1 && second !== -1 && first < second, "both screenshots are described in order");
}

testBatchImagesFollowTheSingleScreenshotContract()
  .then(() => console.log("provider format adapter batch image tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
