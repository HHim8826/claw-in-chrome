const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sharedDir = path.join(__dirname, "..", "..", "src", "shared");
const sources = ["claw-contract.js", "provider-observability.js", "provider-format-adapter.js"].map((name) => ({
  name,
  source: fs.readFileSync(path.join(sharedDir, name), "utf8"),
}));

const image = (data, mediaType = "image/png") => ({ type: "image", source: { type: "base64", media_type: mediaType, data } });
const marker = (toolUseId) => `Visual output returned by tool ${toolUseId}. Use the following image(s) as tool results.`;

// A browser_batch tool result interleaves step text with screenshots.
const BATCH_TOOL_RESULT_CONTENT = [
  { type: "text", text: "[navigate] Navigated" },
  { type: "text", text: "[computer:screenshot] Captured" },
  image("FIRSTIMAGE", "image/jpeg"),
  { type: "text", text: "[computer:screenshot] Captured" },
  image("SECONDIMAGE"),
];

function toolTurn(toolUses, toolResults, trailingUserBlocks = []) {
  return [
    { role: "user", content: "Open the page and take screenshots." },
    {
      role: "assistant",
      content: toolUses.map(({ id, name }) => ({ type: "tool_use", id, name, input: {} })),
    },
    {
      role: "user",
      content: [
        ...toolResults.map(({ id, content, isError }) => ({
          type: "tool_result",
          tool_use_id: id,
          content,
          ...(isError ? { is_error: true } : {}),
        })),
        ...trailingUserBlocks,
      ],
    },
  ];
}

function successPayload(format, model) {
  return format === "openai_responses"
    ? { id: "resp_1", model, status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }], usage: { input_tokens: 1, output_tokens: 1 } }
    : { id: "chat_1", model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "done" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
}

// Loads the adapter once; `respond(body)` may return { status, payload } to simulate provider errors.
function createAdapter(format, configOverrides = {}, respond = null) {
  const config = {
    format,
    baseUrl: "https://provider.example/v1",
    apiKey: "test-key",
    defaultModel: "model-main",
    fastModel: "",
    ...configOverrides,
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
      const body = JSON.parse(init.body);
      upstreamBodies.push(body);
      const custom = respond?.(body);
      const status = custom?.status ?? 200;
      const payload = custom?.payload ?? successPayload(format, config.defaultModel);
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
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
  async function send(messages) {
    const response = await sandbox.fetch(
      new Request(`${config.baseUrl}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": "k", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: config.defaultModel, max_tokens: 64, stream: false, messages }),
      }),
    );
    const json = await response.json();
    await sandbox.__CP_PROVIDER_OBSERVABILITY__.whenIdle();
    return { status: response.status, json };
  }
  return { send, upstreamBodies };
}

async function sendThroughAdapter(format, messages, configOverrides = {}) {
  const adapter = createAdapter(format, configOverrides);
  await adapter.send(messages);
  assert.equal(adapter.upstreamBodies.length, 1);
  return adapter.upstreamBodies[0];
}

function chatMessagesAfterAssistant(body) {
  const index = body.messages.findIndex((message) => message.role === "assistant" && Array.isArray(message.tool_calls));
  assert.notEqual(index, -1, "the assistant tool-call message is present");
  return body.messages.slice(index + 1);
}

async function testResponsesForwardsBatchImagesInOrder() {
  const body = JSON.stringify(
    await sendThroughAdapter("openai_responses", toolTurn([{ id: "toolu_batch", name: "browser_batch" }], [{ id: "toolu_batch", content: BATCH_TOOL_RESULT_CONTENT }])),
  );
  assert.equal(body.includes("data:image/jpeg;base64,FIRSTIMAGE"), true);
  assert.equal(body.includes("data:image/png;base64,SECONDIMAGE"), true);
  assert.ok(body.indexOf("FIRSTIMAGE") < body.indexOf("SECONDIMAGE"), "screenshot order is kept");
  assert.equal(body.includes("[navigate] Navigated"), true);
}

async function testChatForwardsBatchImagesAfterTheToolMessage() {
  const body = await sendThroughAdapter(
    "openai_chat",
    toolTurn([{ id: "toolu_batch", name: "browser_batch" }], [{ id: "toolu_batch", content: BATCH_TOOL_RESULT_CONTENT }]),
  );
  const [toolMessage, visualMessage, ...rest] = chatMessagesAfterAssistant(body);
  assert.equal(toolMessage.role, "tool", "the tool message immediately follows tool_calls");
  assert.equal(toolMessage.tool_call_id, "toolu_batch");
  assert.equal(toolMessage.content.includes("[navigate] Navigated"), true);
  assert.equal(toolMessage.content.includes("FIRSTIMAGE"), false, "image bytes stay out of the tool message");
  assert.deepEqual(visualMessage, {
    role: "user",
    content: [
      { type: "text", text: marker("toolu_batch") },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,FIRSTIMAGE" } },
      { type: "image_url", image_url: { url: "data:image/png;base64,SECONDIMAGE" } },
    ],
  });
  assert.deepEqual(rest, []);
}

async function testChatForwardsASingleScreenshot() {
  const body = await sendThroughAdapter(
    "openai_chat",
    toolTurn(
      [{ id: "toolu_shot", name: "computer" }],
      [{ id: "toolu_shot", content: [{ type: "text", text: "Successfully captured screenshot" }, image("SHOT", "image/jpeg")] }],
    ),
  );
  const [toolMessage, visualMessage] = chatMessagesAfterAssistant(body);
  assert.equal(toolMessage.role, "tool");
  assert.deepEqual(visualMessage.content, [
    { type: "text", text: marker("toolu_shot") },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,SHOT" } },
  ]);
}

async function testChatKeepsToolMessagesContiguousAcrossResults() {
  const body = await sendThroughAdapter(
    "openai_chat",
    toolTurn(
      [
        { id: "toolu_a", name: "computer" },
        { id: "toolu_text", name: "find" },
        { id: "toolu_b", name: "computer" },
      ],
      [
        { id: "toolu_a", content: [image("AAA")] },
        { id: "toolu_text", content: "Found 2 matches" },
        { id: "toolu_b", content: [{ type: "text", text: "zoomed" }, image("BBB")] },
      ],
      [{ type: "text", text: "<system-reminder>tabs changed</system-reminder>" }],
    ),
  );
  const after = chatMessagesAfterAssistant(body);
  assert.deepEqual(
    after.map((message) => message.role),
    ["tool", "tool", "tool", "user"],
    "all tool messages stay adjacent and one user message follows",
  );
  assert.deepEqual(after.slice(0, 3).map((message) => message.tool_call_id), ["toolu_a", "toolu_text", "toolu_b"]);
  assert.equal(after[1].content, "Found 2 matches");
  assert.deepEqual(after[3].content, [
    { type: "text", text: marker("toolu_a") },
    { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    { type: "text", text: marker("toolu_b") },
    { type: "image_url", image_url: { url: "data:image/png;base64,BBB" } },
    { type: "text", text: "<system-reminder>tabs changed</system-reminder>" },
  ]);
}

async function testChatWithoutImagesIsUnchanged() {
  const body = await sendThroughAdapter(
    "openai_chat",
    toolTurn([{ id: "toolu_nav", name: "navigate" }], [{ id: "toolu_nav", content: [{ type: "text", text: "Navigated" }] }]),
  );
  assert.deepEqual(chatMessagesAfterAssistant(body), [{ role: "tool", tool_call_id: "toolu_nav", content: "Navigated" }]);

  const errorBody = await sendThroughAdapter(
    "openai_chat",
    toolTurn([{ id: "toolu_err", name: "computer" }], [{ id: "toolu_err", content: "Click failed", isError: true }]),
  );
  const after = chatMessagesAfterAssistant(errorBody);
  assert.equal(after.length, 1);
  assert.equal(after[0].role, "tool");
}

async function testTextOnlyProvidersKeepMetadata() {
  const messages = toolTurn([{ id: "toolu_shot", name: "computer" }], [{ id: "toolu_shot", content: [image("SHOT")] }]);
  const deepseek = await sendThroughAdapter("openai_chat", messages, {
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  });
  const deepseekAfter = chatMessagesAfterAssistant(deepseek);
  assert.deepEqual(deepseekAfter.map((message) => message.role), ["tool"], "DeepSeek's text-only chat API gets no image message");
  assert.equal(JSON.stringify(deepseek).includes("data:image"), false);
  assert.equal(deepseekAfter[0].content.includes('"data_length":4'), true, "the tool message still describes the image");
}

async function testImageRejectionFallsBackToMetadata() {
  const messages = toolTurn([{ id: "toolu_shot", name: "computer" }], [{ id: "toolu_shot", content: [image("SHOT")] }]);
  const rejectsImages = (body) =>
    JSON.stringify(body).includes("image_url")
      ? { status: 400, payload: { error: { message: "Invalid content type. image_url is only supported by certain models." } } }
      : null;
  const adapter = createAdapter("openai_chat", {}, rejectsImages);

  const first = await adapter.send(messages);
  assert.equal(first.status, 200, "the turn still succeeds on a text-only provider");
  assert.equal(adapter.upstreamBodies.length, 2, "one retry without images");
  assert.equal(JSON.stringify(adapter.upstreamBodies[0]).includes("data:image/png;base64,SHOT"), true);
  assert.equal(JSON.stringify(adapter.upstreamBodies[1]).includes("image_url"), false);

  await adapter.send(messages);
  assert.equal(adapter.upstreamBodies.length, 3, "later turns skip the rejected attempt");
  assert.equal(JSON.stringify(adapter.upstreamBodies[2]).includes("image_url"), false);

  const unrelated = createAdapter("openai_chat", {}, () => ({ status: 401, payload: { error: { message: "bad key" } } }));
  const failed = await unrelated.send(messages);
  assert.equal(failed.status, 401);
  assert.equal(unrelated.upstreamBodies.length, 1, "non-content errors aren't retried without images");

  const noImages = createAdapter("openai_chat", {}, () => ({ status: 400, payload: { error: { message: "bad request" } } }));
  await noImages.send(toolTurn([{ id: "toolu_nav", name: "navigate" }], [{ id: "toolu_nav", content: "Navigated" }]));
  assert.equal(noImages.upstreamBodies.length, 1, "requests without forwarded images keep their single attempt");
}

async function main() {
  await testResponsesForwardsBatchImagesInOrder();
  await testChatForwardsBatchImagesAfterTheToolMessage();
  await testChatForwardsASingleScreenshot();
  await testChatKeepsToolMessagesContiguousAcrossResults();
  await testChatWithoutImagesIsUnchanged();
  await testTextOnlyProvidersKeepMetadata();
  await testImageRejectionFallsBackToMetadata();
  console.log("provider format adapter tool-result image tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
