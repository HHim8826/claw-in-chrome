const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contractPath = path.join(__dirname, "..", "..", "src", "shared", "claw-contract.js");
const adapterPath = path.join(__dirname, "..", "..", "src", "shared", "provider-format-adapter.js");
const observabilityPath = path.join(__dirname, "..", "..", "src", "shared", "provider-observability.js");
const contractSource = fs.readFileSync(contractPath, "utf8");
const adapterSource = fs.readFileSync(adapterPath, "utf8");
const observabilitySource = fs.readFileSync(observabilityPath, "utf8");

async function runAdapterWithUpstreamHandler(upstreamHandler, options = {}) {
  const config = {
    format: "openai_chat",
    baseUrl: "https://provider.example/v1",
    apiKey: "test-key",
    defaultModel: "gpt-5.4",
    fastModel: "",
    ...(options.config || {})
  };
  const upstreamCalls = [];
  const storageState = {
    providerObservabilityRecords: []
  };
  const nativeFetch = async (input, init) => {
    upstreamCalls.push({
      url: String(input),
      body: init && typeof init.body === "string" ? JSON.parse(init.body) : null,
      headers: init ? Object.fromEntries(new Headers(init.headers).entries()) : {}
    });
    return upstreamHandler({
      input,
      init,
      call: upstreamCalls[upstreamCalls.length - 1],
      callIndex: upstreamCalls.length - 1
    });
  };
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
    fetch: nativeFetch,
    chrome: {
      storage: {
        local: {
          async get(key) {
            if (typeof key === "string") {
              if (key === "providerObservabilityRecords") {
                if (typeof options.observabilityGet === "function") {
                  return options.observabilityGet();
                }
                return {
                  providerObservabilityRecords: storageState.providerObservabilityRecords
                };
              }
              return {
                [key]: config
              };
            }
            return {
              customProviderConfig: config
            };
          },
          async set(changes) {
            Object.assign(storageState, changes);
          }
        },
        onChanged: {
          addListener() {}
        }
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(contractSource, sandbox, {
    filename: "claw-contract.js"
  });
  vm.runInNewContext(observabilitySource, sandbox, {
    filename: "provider-observability.js"
  });
  vm.runInNewContext(adapterSource, sandbox, {
    filename: "provider-format-adapter.js"
  });
  const requestBody = options.requestBody || {
    model: "gpt-5.4",
    max_tokens: 128,
    stream: false,
    messages: [
      {
        role: "user",
        content: "Find the search box."
      }
    ]
  };
  const request = new Request(
    options.requestUrl || "https://provider.example/v1/messages",
    {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "anthropic-test-key",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody)
    }
  );
  let response;
  try {
    response = await sandbox.fetch(request);
  } catch (error) {
    if (options.captureError) {
      return {
        error,
        upstreamCalls,
        measurements: storageState.providerObservabilityRecords
      };
    }
    throw error;
  }
  if (options.responseType === "text") {
    const text = await response.text();
    if (!options.skipObservabilityIdle) {
      await sandbox.__CP_PROVIDER_OBSERVABILITY__.whenIdle();
    }
    return {
      status: response.status,
      text,
      headers: Object.fromEntries(response.headers.entries()),
      upstreamCalls,
      measurements: storageState.providerObservabilityRecords
    };
  }
  const json = await response.json();
  if (!options.skipObservabilityIdle) {
    await sandbox.__CP_PROVIDER_OBSERVABILITY__.whenIdle();
  }
  return {
    status: response.status,
    json,
    upstreamCalls,
    measurements: storageState.providerObservabilityRecords
  };
}

async function runAdapterWithPayload(providerPayload, options = {}) {
  return runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify(providerPayload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), options);
}

async function testOutputTextPartsSurviveOpenAIChatTransform() {
  const payload = {
    id: "chatcmpl-output-text",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: [
            {
              type: "output_text",
              output_text: "FOUND: 1\nSHOWING: 1\n---\nref_1 | textbox | Search | textbox | text match"
            }
          ]
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.equal(result.upstreamCalls.length, 1, "should call upstream once");
  assert.equal(result.upstreamCalls[0].url, "https://provider.example/v1/chat/completions");
  assert.equal(result.json.type, "message");
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "FOUND: 1\nSHOWING: 1\n---\nref_1 | textbox | Search | textbox | text match"
    }
  ]);
}

async function testSuccessfulProviderRequestRecordsSanitizedMeasurement() {
  const result = await runAdapterWithPayload({
    id: "chatcmpl-observability",
    model: "gpt-5.4",
    choices: [{
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: "Measured response" }
    }],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 4
    }
  }, {
    config: {
      id: "provider-main",
      name: "Main provider",
      apiKey: "sk-private"
    }
  });

  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].profileId, "provider-main");
  assert.equal(result.measurements[0].outcome, "success");
  assert.equal(result.measurements[0].usage.inputTokens, 12);
  assert.equal(result.measurements[0].usage.outputTokens, 4);
  assert.equal(JSON.stringify(result.measurements).includes("sk-private"), false);
  assert.equal(JSON.stringify(result.measurements).includes("Measured response"), false);
}

async function testProviderHttpErrorRecordsCategoryWithoutResponseBody() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(
    JSON.stringify({ error: { message: "private rate-limit response" } }),
    {
      status: 429,
      headers: { "content-type": "application/json" }
    }
  ));

  assert.equal(result.status, 429);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].outcome, "http_error");
  assert.equal(result.measurements[0].errorCategory, "rate_limit");
  assert.equal(JSON.stringify(result.measurements).includes("private rate-limit response"), false);
}

async function testProviderNetworkErrorRecordsWithoutChangingErrorResponse() {
  const networkError = new Error("private gateway address failed");
  const result = await runAdapterWithUpstreamHandler(async () => {
    throw networkError;
  });

  assert.equal(result.status, 500);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].outcome, "network_error");
  assert.equal(result.measurements[0].errorCategory, "network");
  assert.equal(JSON.stringify(result.measurements).includes("private gateway address"), false);
}

async function testStreamingProviderUsageCompletesMeasurement() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"id":"chatcmpl-stream-metric","model":"gpt-5.4","choices":[{"index":0,"delta":{"role":"assistant","content":"Measured"},"finish_reason":null}]}\n\n'
      ));
      controller.enqueue(encoder.encode(
        'data: {"id":"chatcmpl-stream-metric","model":"gpt-5.4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\n'
      ));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  const result = await runAdapterWithUpstreamHandler(async () => new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  }), {
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: true,
      messages: [{ role: "user", content: "Measure stream" }]
    },
    responseType: "text"
  });

  assert.match(result.text, /Measured/);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].usage.inputTokens, 9);
  assert.equal(result.measurements[0].usage.outputTokens, 2);
}

async function testInvalidProviderResponseRecordsInvalidResponseOutcome() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(
    "not-json-private-response",
    {
      status: 200,
      headers: { "content-type": "text/plain" }
    }
  ));

  assert.equal(result.status, 502);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].outcome, "invalid_response");
  assert.equal(result.measurements[0].errorCategory, "invalid_json");
  assert.equal(JSON.stringify(result.measurements).includes("not-json-private-response"), false);
}

async function testStreamingAbortRecordsAbortedOutcome() {
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new DOMException("The operation was aborted.", "AbortError"));
    }
  });
  const result = await runAdapterWithUpstreamHandler(async () => new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  }), {
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: true,
      messages: [{ role: "user", content: "Abort stream" }]
    },
    responseType: "text"
  });

  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].outcome, "aborted");
  assert.equal(result.measurements[0].errorCategory, "aborted");
}

async function testSlowTelemetryStorageDoesNotDelayProviderResponse() {
  const providerResult = runAdapterWithPayload({
    id: "chatcmpl-fast-response",
    model: "gpt-5.4",
    choices: [{
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: "Immediate response" }
    }]
  }, {
    observabilityGet() {
      return new Promise(function () {});
    },
    skipObservabilityIdle: true
  });
  const result = await Promise.race([
    providerResult,
    new Promise(function (_resolve, reject) {
      setTimeout(function () {
        reject(new Error("provider response waited for telemetry storage"));
      }, 100);
    })
  ]);

  assert.equal(result.status, 200);
  assert.equal(result.json.content[0].text, "Immediate response");
}

async function testStringContentStillWorks() {
  const payload = {
    id: "chatcmpl-string",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "FOUND: 0\nERROR: no matches"
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "FOUND: 0\nERROR: no matches"
    }
  ]);
}

async function testMessageLevelResponseTextFallbackWorks() {
  const payload = {
    id: "chatcmpl-response-text",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: [],
          response_text: "FOUND: 1\nSHOWING: 1\n---\nref_2 | button | Search | button | response_text fallback"
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "FOUND: 1\nSHOWING: 1\n---\nref_2 | button | Search | button | response_text fallback"
    }
  ]);
}

async function testEmptyNonStreamContentRetriesAsStream() {
  const result = await runAdapterWithUpstreamHandler(async ({ callIndex, call }) => {
    if (callIndex === 0) {
      return new Response(JSON.stringify({
        id: "chatcmpl-empty-content",
        model: "gpt-5.4",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant"
            }
          }
        ],
        usage: {
          prompt_tokens: 42,
          completion_tokens: 7,
          total_tokens: 49
        }
      }), {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "content-length": "280"
        }
      });
    }
    assert.equal(call.body.stream, true, "stream fallback should request streaming");
    assert.equal(call.headers.accept, "text/event-stream", "stream fallback should request SSE");
    return new Response([
      "data: {\"id\":\"chatcmpl-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"FOUND: 1\\nSHOWING: 1\\n---\\nref_9 | textbox | Search | textbox | streamed fallback\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":42,\"completion_tokens\":7,\"total_tokens\":49}}",
      "",
      "data: [DONE]",
      ""
    ].join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    });
  });
  assert.equal(result.upstreamCalls.length, 2, "should retry once with streaming fallback");
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "FOUND: 1\nSHOWING: 1\n---\nref_9 | textbox | Search | textbox | streamed fallback"
    }
  ]);
  assert.equal(result.measurements.length, 1, "successful stream fallback should be measured");
  assert.equal(result.measurements[0].outcome, "success");
  assert.equal(result.measurements[0].status, 200);
  assert.equal(result.measurements[0].retryCount, 1);
  assert.equal(result.measurements[0].usage.inputTokens, 42);
  assert.equal(result.measurements[0].usage.outputTokens, 7);
  const serializedMeasurement = JSON.stringify(result.measurements[0]);
  assert.equal(serializedMeasurement.includes("Find the search box."), false);
  assert.equal(serializedMeasurement.includes("test-key"), false);
  assert.equal(serializedMeasurement.includes("streamed fallback"), false);
}

async function testJsonContentToolCallIsConvertedToToolUse() {
  const payload = {
    id: "chatcmpl-json-tool",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "{\"name\":\"search\",\"arguments\":\"{\\\"query\\\":\\\"cats\\\"}\"}"
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "content_tool_call_0",
      name: "search",
      input: {
        query: "cats"
      }
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testNestedFunctionWrapperContentIsConvertedToToolUse() {
  const payload = {
    id: "chatcmpl-json-nested-tool",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "{\"type\":\"function\",\"function\":{\"name\":\"search\",\"arguments\":\"{\\\"query\\\":\\\"cats\\\"}\"}}"
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "content_tool_call_0",
      name: "search",
      input: {
        query: "cats"
      }
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testResponsesTextWrappedToolCallIsConvertedToToolUse() {
  const payload = {
    id: "resp-json-tool",
    model: "gpt-5.4",
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "{\"name\":\"search\",\"arguments\":\"{\\\"query\\\":\\\"cats\\\"}\"}"
          }
        ]
      }
    ],
    usage: {
      input_tokens: 12,
      output_tokens: 4,
      total_tokens: 16
    }
  };
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), {
    config: {
      format: "openai_responses"
    },
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: false,
      tools: [
        {
          name: "search",
          description: "Search",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string"
              }
            },
            required: ["query"]
          }
        }
      ],
      messages: [
        {
          role: "user",
          content: "Find cats"
        }
      ]
    }
  });
  assert.equal(result.upstreamCalls[0].url, "https://provider.example/v1/responses");
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "responses_text_tool_call_0",
      name: "search",
      input: {
        query: "cats"
      }
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testResponsesRuntimeFallsBackToChatWhenConfiguredEndpointFails() {
  const result = await runAdapterWithUpstreamHandler(async ({ callIndex, call }) => {
    if (callIndex === 0) {
      assert.equal(call.url, "https://provider.example/v1/responses");
      return new Response(JSON.stringify({
        error: {
          message: "Responses endpoint unsupported"
        }
      }), {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      });
    }
    assert.equal(call.url, "https://provider.example/v1/chat/completions");
    return new Response(JSON.stringify({
      id: "chatcmpl-fallback",
      model: "gpt-5.4",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "FOUND: 1\nSHOWING: 1\n---\nref_fallback | textbox | Search | textbox | runtime fallback"
          }
        }
      ]
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
  }, {
    config: {
      format: "openai_responses",
      defaultModel: "gpt-5.4"
    },
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: false,
      messages: [
        {
          role: "user",
          content: "Find cats"
        }
      ]
    }
  });
  assert.equal(result.upstreamCalls.length, 2, "should retry with chat completions after responses failure");
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "FOUND: 1\nSHOWING: 1\n---\nref_fallback | textbox | Search | textbox | runtime fallback"
    }
  ]);
}

async function testResponsesFunctionCallUsesCallIdForToolResultReplay() {
  const first = await runAdapterWithUpstreamHandler(async () =>
    new Response(JSON.stringify({
      id: "resp-call-id",
      model: "gpt-5.4",
      status: "completed",
      output: [{
        type: "function_call",
        id: "fc_item_123",
        call_id: "call_search_123",
        name: "search",
        arguments: "{\"query\":\"cats\"}"
      }],
      usage: { input_tokens: 12, output_tokens: 4 }
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    }), {
      config: { format: "openai_responses" },
      requestBody: {
        model: "gpt-5.4",
        max_tokens: 128,
        stream: false,
        tools: [{
          name: "search",
          description: "Search",
          input_schema: { type: "object", properties: {} }
        }],
        messages: [{ role: "user", content: "Find cats" }]
      }
    }
  );

  const toolUse = first.json.content[0];
  assert.equal(toolUse.id, "call_search_123");
  assert.equal(toolUse.openai_responses_item.id, "fc_item_123");

  const second = await runAdapterWithUpstreamHandler(async ({ call }) => {
    const replayedCall = call.body.input.find(
      item => item.type === "function_call"
    );
    const replayedOutput = call.body.input.find(
      item => item.type === "function_call_output"
    );
    assert.equal(replayedCall.id, "fc_item_123");
    assert.equal(replayedCall.call_id, "call_search_123");
    assert.equal(replayedOutput.call_id, "call_search_123");
    return new Response(JSON.stringify({
      id: "resp-tool-result",
      model: "gpt-5.4",
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "Found cats." }]
      }]
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }, {
    config: { format: "openai_responses" },
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: false,
      messages: [
        { role: "user", content: "Find cats" },
        { role: "assistant", content: [toolUse] },
        {
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "cats found"
          }]
        }
      ]
    }
  });
  assert.equal(second.json.content[0].text, "Found cats.");
}

async function testResponsesRuntimeDoesNotFallbackOnProviderRateLimit() {
  const result = await runAdapterWithUpstreamHandler(async ({ call }) => {
    assert.equal(call.url, "https://provider.example/v1/responses");
    return new Response(JSON.stringify({
      error: { message: "quota exceeded: provider rate limit" }
    }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }, {
    config: {
      format: "openai_responses",
      defaultModel: "gpt-5.4"
    },
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: false,
      messages: [{ role: "user", content: "Find cats" }]
    }
  });
  assert.equal(result.status, 429);
  assert.equal(result.upstreamCalls.length, 1);
  assert.equal(result.json.error.message, "quota exceeded: provider rate limit");
}

async function testGeminiChatOmitsPromptCacheKey() {
  const result = await runAdapterWithUpstreamHandler(async ({ call }) => {
    assert.equal(
      call.url,
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    );
    return new Response(JSON.stringify({
      id: "chatcmpl-gemini",
      model: "gemini-2.5-flash-lite",
      choices: [{
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: "Gemini response" }
      }]
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }, {
    config: {
      name: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-flash-lite",
      promptCacheKey: "gemini-profile"
    },
    requestUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/messages",
    requestBody: {
      model: "gemini-2.5-flash-lite",
      max_tokens: 128,
      stream: false,
      messages: [{ role: "user", content: "Find cats" }]
    }
  });
  assert.equal(result.upstreamCalls.length, 1);
  assert.equal("prompt_cache_key" in result.upstreamCalls[0].body, false);
}

async function testGeminiResponsesConfiguredUsesChatCompletionsFirst() {
  const result = await runAdapterWithUpstreamHandler(async ({ call }) => {
    assert.equal(
      call.url,
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    );
    return new Response(JSON.stringify({
      id: "chatcmpl-gemini-responses-config",
      model: "gemini-3-flash-preview",
      choices: [{
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: "Gemini response" }
      }]
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }, {
    config: {
      name: "Gemini",
      format: "openai_responses",
      baseUrl:
        "https://generativelanguage.googleapis.com/v1beta/openai/responses",
      defaultModel: "gemini-3-flash-preview",
      promptCacheKey: "gemini-profile"
    },
    requestUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/responses/messages",
    requestBody: {
      model: "gemini-3-flash-preview",
      max_tokens: 128,
      stream: false,
      messages: [{ role: "user", content: "Find cats" }]
    }
  });
  assert.equal(result.upstreamCalls.length, 1);
  assert.equal("prompt_cache_key" in result.upstreamCalls[0].body, false);
}

async function testDeepSeekCompactionRequestFlattensToolHistory() {
  const result = await runAdapterWithUpstreamHandler(async ({ call }) => {
    const messages = call.body.messages;
    assert.equal(
      messages.some(message => Array.isArray(message.tool_calls)),
      false
    );
    assert.equal(messages.some(message => message.role === "tool"), false);
    assert.equal(
      messages.some(message => "reasoning_content" in message),
      false
    );
    assert.equal(
      messages.some(message =>
        typeof message.content === "string" &&
        message.content.includes("[Tool use]") &&
        message.content.includes("read_page")
      ),
      true
    );
    assert.equal(
      messages.some(message =>
        typeof message.content === "string" &&
        message.content.includes("[Tool result]") &&
        message.content.includes("Example page text")
      ),
      true
    );
    return new Response(JSON.stringify({
      id: "chatcmpl-deepseek-compaction",
      model: "deepseek-chat",
      choices: [{
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: "<summary>body</summary>" }
      }]
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }, {
    config: { name: "DeepSeek", defaultModel: "deepseek-chat" },
    requestBody: {
      model: "deepseek-chat",
      max_tokens: 10000,
      stream: false,
      system: [{
        type: "text",
        text: "You are summarizing browser automation conversations."
      }],
      messages: [
        { role: "user", content: "Open the page." },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Inspect the page." },
            {
              type: "tool_use",
              id: "toolu_read_page_1",
              name: "read_page",
              input: { tabId: 1 }
            }
          ]
        },
        {
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: "toolu_read_page_1",
            content: [{ type: "text", text: "Example page text" }]
          }]
        },
        {
          role: "user",
          content: "Create a detailed summary of the conversation so far."
        }
      ]
    }
  });
  assert.equal(result.status, 200);
}

async function testGpt54ChatToolCallsDropReasoningEffort() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify({
    id: "chatcmpl-gpt54-tool",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "browser.find",
                arguments: "{\"query\":\"Search\"}"
              }
            }
          ]
        }
      }
    ]
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), {
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: false,
      thinking: {
        type: "enabled",
        budget_tokens: 8000
      },
      tools: [
        {
          name: "browser.find",
          description: "Find element",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string"
              }
            },
            required: ["query"]
          }
        }
      ],
      messages: [
        {
          role: "user",
          content: "Find the search box."
        }
      ]
    }
  });
  assert.equal("reasoning_effort" in result.upstreamCalls[0].body, false, "gpt-5.4 chat tool calls should omit reasoning_effort");
}

async function testConfiguredProviderDefaultsFillMissingAnthropicFields() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify({
    id: "chatcmpl-config-defaults",
    model: "gpt-5.1",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "FOUND: 1\nSHOWING: 1\n---\nref_cfg | textbox | Search | textbox | config defaults"
        }
      }
    ]
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), {
    config: {
      format: "openai_chat",
      defaultModel: "gpt-5.1",
      reasoningEffort: "high",
      maxOutputTokens: 4321,
      contextWindow: 240000
    },
    requestBody: {
      model: "gpt-5.1",
      stream: false,
      messages: [
        {
          role: "user",
          content: "Find the search box."
        }
      ]
    }
  });
  assert.equal(result.upstreamCalls[0].body.max_tokens, 4321, "missing max_tokens should use provider default");
  assert.equal(result.upstreamCalls[0].body.reasoning_effort, "high", "missing output_config should use provider reasoning default");
}

async function testStreamFallbackJsonToolCallContentIsConvertedToToolUse() {
  const result = await runAdapterWithUpstreamHandler(async ({ callIndex, call }) => {
    if (callIndex === 0) {
      return new Response(JSON.stringify({
        id: "chatcmpl-empty-json-tool",
        model: "gpt-5.4",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant"
            }
          }
        ],
        usage: {
          prompt_tokens: 42,
          completion_tokens: 7,
          total_tokens: 49
        }
      }), {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "content-length": "280"
        }
      });
    }
    assert.equal(call.body.stream, true, "stream fallback should request streaming");
    return new Response([
      "data: {\"id\":\"chatcmpl-stream-tool\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-stream-tool\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"{\\\"type\\\":\\\"function\\\",\\\"function\\\":{\\\"name\\\":\\\"search\\\",\\\"arguments\\\":\\\"{\\\\\\\"query\\\\\\\":\\\\\\\"cats\\\\\\\"}\\\"}}\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-stream-tool\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":42,\"completion_tokens\":7,\"total_tokens\":49}}",
      "",
      "data: [DONE]",
      ""
    ].join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    });
  });
  assert.equal(result.upstreamCalls.length, 2, "should retry once with streaming fallback");
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "stream_text_tool_call_0",
      name: "search",
      input: {
        query: "cats"
      }
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testRefusalPartsRemainVisibleText() {
  const payload = {
    id: "chatcmpl-refusal",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: [
            {
              type: "refusal",
              refusal: "I cannot do that."
            }
          ]
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "I cannot do that."
    }
  ]);
}

async function testToolCallsDoNotTriggerStreamFallbackRetry() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify({
    id: "chatcmpl-tool-call",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "browser.find",
                arguments: "{\"query\":\"Search\"}"
              }
            }
          ]
        }
      }
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 3,
      total_tokens: 13
    }
  }), {
    status: 200,
    headers: {
      "content-type": "text/event-stream"
    }
  }));

  assert.equal(result.upstreamCalls.length, 1, "tool call responses should not retry as stream fallback");
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "call_1",
      name: "browser.find",
      input: {
        query: "Search"
      }
    }
  ]);
}

async function testLegacyFunctionCallIsConvertedToToolUse() {
  const payload = {
    id: "chatcmpl-function-call",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "function_call",
        message: {
          role: "assistant",
          function_call: {
            name: "browser.open_tab",
            arguments: "{\"url\":\"https://example.com\"}"
          }
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "function_call_0",
      name: "browser.open_tab",
      input: {
        url: "https://example.com"
      }
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testMalformedToolCallArgumentsReturnErrorResponse() {
  const payload = {
    id: "chatcmpl-bad-tool-args",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          tool_calls: [
            {
              id: "call_bad_args",
              type: "function",
              function: {
                name: "browser.find",
                arguments: "{\"query\":"
              }
            }
          ]
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.equal(result.status, 500);
  assert.equal(result.json.type, "error");
  assert.match(result.json.error.message, /tool call arguments are not valid json/i);
}

async function testMessageContentObjectStillExtractsVisibleText() {
  const payload = {
    id: "chatcmpl-content-object",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: {
            type: "text",
            text: "FOUND: 2\nSHOWING: 2\n---\nref_3 | link | Search docs | link | object content"
          }
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "FOUND: 2\nSHOWING: 2\n---\nref_3 | link | Search docs | link | object content"
    }
  ]);
}

async function testMessageOutputTextFallbackCanPromoteInlineToolCall() {
  const payload = {
    id: "chatcmpl-output-text-tool",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: [],
          output_text: "{\"name\":\"browser.find\",\"arguments\":\"{\\\"query\\\":\\\"Search docs\\\"}\"}"
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "message_text_tool_call_0",
      name: "browser.find",
      input: {
        query: "Search docs"
      }
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testStreamingDeltaToolCallsAreReassembledAcrossChunks() {
  const result = await runAdapterWithUpstreamHandler(async ({ callIndex, call }) => {
    if (callIndex === 0) {
      return new Response(JSON.stringify({
        id: "chatcmpl-empty-stream-tool-call",
        model: "gpt-5.4",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant"
            }
          }
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 5,
          total_tokens: 16
        }
      }), {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "content-length": "280"
        }
      });
    }
    assert.equal(call.body.stream, true, "stream fallback should request streaming");
    return new Response([
      "data: {\"id\":\"chatcmpl-stream-delta-tool\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-stream-delta-tool\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_stream_1\",\"function\":{\"name\":\"browser.find\",\"arguments\":\"{\\\"query\\\":\"}}]},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-stream-delta-tool\",\"object\":\"chat.completion.chunk\",\"model\":\"gpt-5.4\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"Search docs\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":5,\"total_tokens\":16}}",
      "",
      "data: [DONE]",
      ""
    ].join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    });
  });
  assert.equal(result.upstreamCalls.length, 2, "should retry once and reassemble tool-call deltas");
  assert.deepEqual(result.json.content, [
    {
      type: "tool_use",
      id: "call_stream_1",
      name: "browser.find",
      input: {
        query: "Search docs"
      }
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testContentFilterMapsToEndTurnWithoutToolUse() {
  const payload = {
    id: "chatcmpl-content-filter",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "content_filter",
        message: {
          role: "assistant",
          content: "Filtered response"
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload);
  assert.equal(result.json.stop_reason, "end_turn");
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "Filtered response"
    }
  ]);
}

async function testDeepSeekReasoningContentIsConvertedToThinking() {
  const payload = {
    id: "chatcmpl-deepseek-reasoning",
    model: "deepseek-chat",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          reasoning_content: "Need to call get_weather before answering.",
          content: "我先查一下天气。",
          tool_calls: [
            {
              id: "call_weather_1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{\"location\":\"杭州\",\"date\":\"2026-04-28\"}"
              }
            }
          ]
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload, {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-chat"
    }
  });
  assert.deepEqual(result.json.content, [
    {
      type: "text",
      text: "我先查一下天气。"
    },
    {
      type: "tool_use",
      id: "call_weather_1",
      name: "get_weather",
      input: {
        location: "杭州",
        date: "2026-04-28"
      }
    },
    {
      type: "thinking",
      thinking: "Need to call get_weather before answering."
    }
  ]);
  assert.equal(result.json.stop_reason, "tool_use");
}

async function testDeepSeekReasoningContentDoesNotPrecedeToolUseBlocks() {
  const payload = {
    id: "chatcmpl-deepseek-tool-order",
    model: "deepseek-chat",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          reasoning_content: "Need to call get_weather before answering.",
          content: "我先查一下天气。",
          tool_calls: [
            {
              id: "call_weather_1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{\"location\":\"杭州\"}"
              }
            }
          ]
        }
      }
    ]
  };
  const result = await runAdapterWithPayload(payload, {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-chat"
    }
  });
  const toolUseIndex = result.json.content.findIndex((block) => block.type === "tool_use");
  const thinkingIndex = result.json.content.findIndex((block) => block.type === "thinking");
  assert.ok(toolUseIndex >= 0, "DeepSeek tool_calls should become Anthropic tool_use blocks");
  assert.ok(thinkingIndex > toolUseIndex, "DeepSeek reasoning_content must not be emitted before tool_use blocks");
}

async function testDeepSeekThinkingIsRoundTrippedAsReasoningContent() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify({
    id: "chatcmpl-deepseek-roundtrip",
    model: "deepseek-chat",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "杭州明天天气多云。"
        }
      }
    ]
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-chat"
    },
    requestBody: {
      model: "deepseek-chat",
      max_tokens: 256,
      stream: false,
      tools: [
        {
          name: "get_weather",
          description: "查询天气",
          input_schema: {
            type: "object",
            properties: {
              location: {
                type: "string"
              },
              date: {
                type: "string"
              }
            },
            required: ["location", "date"]
          }
        }
      ],
      messages: [
        {
          role: "user",
          content: "帮我看下杭州明天天气"
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Need to call get_weather before answering."
            },
            {
              type: "text",
              text: "我先查一下天气。"
            },
            {
              type: "tool_use",
              id: "call_weather_1",
              name: "get_weather",
              input: {
                location: "杭州",
                date: "2026-04-28"
              }
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_weather_1",
              content: "Cloudy 7~13°C"
            }
          ]
        }
      ]
    }
  });
  const assistantMessage = result.upstreamCalls[0].body.messages[1];
  assert.equal(assistantMessage.reasoning_content, "Need to call get_weather before answering.");
  assert.equal(assistantMessage.content, "我先查一下天气。");
  assert.deepEqual(assistantMessage.tool_calls, [
    {
      id: "call_weather_1",
      type: "function",
      function: {
        name: "get_weather",
        arguments: "{\"location\":\"杭州\",\"date\":\"2026-04-28\"}"
      }
    }
  ]);
  assert.equal(JSON.stringify(assistantMessage).includes("<think>"), false, "DeepSeek round-trip should use reasoning_content instead of think tags");
}

async function testDeepSeekPlainThinkingIsOmittedWithoutToolContext() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify({
    id: "chatcmpl-deepseek-plain",
    model: "deepseek-reasoner",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "ok"
        }
      }
    ]
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-reasoner"
    },
    requestBody: {
      model: "deepseek-reasoner",
      max_tokens: 256,
      stream: false,
      messages: [
        {
          role: "user",
          content: "直接回答"
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "No tool is needed."
            },
            {
              type: "text",
              text: "可以直接回答。"
            }
          ]
        },
        {
          role: "user",
          content: "继续"
        }
      ]
    }
  });
  const assistantMessage = result.upstreamCalls[0].body.messages[1];
  assert.equal("reasoning_content" in assistantMessage, false);
  assert.equal(assistantMessage.content, "可以直接回答。");
  assert.equal(JSON.stringify(assistantMessage).includes("<think>"), false, "DeepSeek plain no-tool turns should not fall back to think tags");
}

async function testDeepSeekToolTurnFinalThinkingIsStillReplayed() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify({
    id: "chatcmpl-deepseek-tool-final",
    model: "deepseek-chat",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "ok"
        }
      }
    ]
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-chat"
    },
    requestBody: {
      model: "deepseek-chat",
      max_tokens: 256,
      stream: false,
      messages: [
        {
          role: "user",
          content: "帮我看下杭州天气"
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Need to call get_weather before answering."
            },
            {
              type: "text",
              text: "我先查一下天气。"
            },
            {
              type: "tool_use",
              id: "call_weather_1",
              name: "get_weather",
              input: {
                location: "杭州"
              }
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_weather_1",
              content: "Cloudy 7~13°C"
            }
          ]
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Use the weather result to answer."
            },
            {
              type: "text",
              text: "杭州天气多云。"
            }
          ]
        },
        {
          role: "user",
          content: "那适合出门吗？"
        }
      ]
    }
  });
  const messages = result.upstreamCalls[0].body.messages;
  const toolAssistant = messages.find((message) => {
    return message.role === "assistant" && Array.isArray(message.tool_calls);
  });
  const finalAssistant = messages.find((message) => {
    return message.role === "assistant" && message.content === "杭州天气多云。";
  });
  assert.equal(toolAssistant.reasoning_content, "Need to call get_weather before answering.");
  assert.equal(finalAssistant.reasoning_content, "Use the weather result to answer.");
  assert.equal(JSON.stringify(messages).includes("<think>"), false, "DeepSeek tool turns must replay reasoning_content instead of think tags");
}

async function testDeepSeekReasoningStaysAttachedBeforeToolResult() {
  const result = await runAdapterWithUpstreamHandler(async () => new Response(JSON.stringify({
    id: "chatcmpl-deepseek-tool-result-order",
    model: "deepseek-chat",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "ok"
        }
      }
    ]
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  }), {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-chat"
    },
    requestBody: {
      model: "deepseek-chat",
      max_tokens: 256,
      stream: false,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_weather_1",
              name: "get_weather",
              input: {
                location: "杭州"
              }
            },
            {
              type: "tool_result",
              tool_use_id: "call_weather_1",
              content: "Cloudy 7~13°C"
            },
            {
              type: "thinking",
              thinking: "Now answer with the weather result."
            },
            {
              type: "tool_result",
              tool_use_id: "call_weather_1",
              content: "Still cloudy"
            }
          ]
        }
      ]
    }
  });
  const messages = result.upstreamCalls[0].body.messages;
  assert.equal(messages[0].role, "assistant");
  assert.deepEqual(messages[0].tool_calls, [
    {
      id: "call_weather_1",
      type: "function",
      function: {
        name: "get_weather",
        arguments: "{\"location\":\"杭州\"}"
      }
    }
  ]);
  assert.equal(messages[0].reasoning_content, "Now answer with the weather result.");
  assert.equal(messages[1].role, "tool");
  assert.equal(messages[2].role, "tool");
  assert.equal(
    messages.some((message, index) => index > 0 && message.role === "assistant" && message.reasoning_content),
    false,
    "reasoning-only assistant messages must not be inserted between tool results",
  );
}

async function testDeepSeekStreamReasoningContentIsConvertedToThinking() {
  const result = await runAdapterWithUpstreamHandler(async ({ callIndex, call }) => {
    if (callIndex === 0) {
      return new Response(JSON.stringify({
        id: "chatcmpl-deepseek-empty",
        model: "deepseek-chat",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant"
            }
          }
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 5,
          total_tokens: 17
        }
      }), {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "content-length": "240"
        }
      });
    }
    assert.equal(call.body.stream, true, "stream fallback should request streaming");
    return new Response([
      "data: {\"id\":\"chatcmpl-deepseek-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"deepseek-chat\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-deepseek-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"deepseek-chat\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"Need to verify weather.\",\"content\":\"我先查一下。\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":5,\"total_tokens\":17}}",
      "",
      "data: [DONE]",
      ""
    ].join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    });
  }, {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-chat"
    },
    requestBody: {
      model: "deepseek-chat",
      max_tokens: 128,
      stream: false,
      messages: [
        {
          role: "user",
          content: "帮我查天气"
        }
      ]
    }
  });
  assert.equal(result.upstreamCalls.length, 2, "should retry once with streaming fallback");
  assert.deepEqual(result.json.content, [
    {
      type: "thinking",
      thinking: "Need to verify weather."
    },
    {
      type: "text",
      text: "我先查一下。"
    }
  ]);
}

async function testDeepSeekDirectStreamReasoningContentIsConvertedToThinkingDelta() {
  const result = await runAdapterWithUpstreamHandler(async ({ call }) => {
    assert.equal(call.body.stream, true, "direct stream request should be forwarded as streaming");
    return new Response([
      "data: {\"id\":\"chatcmpl-deepseek-direct-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"deepseek-chat\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-deepseek-direct-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"deepseek-chat\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"Need direct stream reasoning.\",\"content\":\"直接流式回复。\"},\"finish_reason\":null}]}",
      "",
      "data: {\"id\":\"chatcmpl-deepseek-direct-stream\",\"object\":\"chat.completion.chunk\",\"model\":\"deepseek-chat\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":5,\"total_tokens\":17}}",
      "",
      "data: [DONE]",
      ""
    ].join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    });
  }, {
    config: {
      name: "DeepSeek",
      defaultModel: "deepseek-chat"
    },
    responseType: "text",
    requestBody: {
      model: "deepseek-chat",
      max_tokens: 128,
      stream: true,
      messages: [
        {
          role: "user",
          content: "直接流式测试"
        }
      ]
    }
  });
  assert.equal(result.headers["content-type"], "text/event-stream; charset=utf-8");
  assert.equal(result.text.includes("\"type\":\"thinking_delta\",\"thinking\":\"Need direct stream reasoning.\""), true);
  assert.equal(result.text.includes("\"type\":\"text_delta\",\"text\":\"直接流式回复。\""), true);
}

async function main() {
  await testSuccessfulProviderRequestRecordsSanitizedMeasurement();
  await testProviderHttpErrorRecordsCategoryWithoutResponseBody();
  await testProviderNetworkErrorRecordsWithoutChangingErrorResponse();
  await testStreamingProviderUsageCompletesMeasurement();
  await testInvalidProviderResponseRecordsInvalidResponseOutcome();
  await testStreamingAbortRecordsAbortedOutcome();
  await testOutputTextPartsSurviveOpenAIChatTransform();
  await testStringContentStillWorks();
  await testMessageLevelResponseTextFallbackWorks();
  await testEmptyNonStreamContentRetriesAsStream();
  await testJsonContentToolCallIsConvertedToToolUse();
  await testNestedFunctionWrapperContentIsConvertedToToolUse();
  await testResponsesTextWrappedToolCallIsConvertedToToolUse();
  await testResponsesFunctionCallUsesCallIdForToolResultReplay();
  await testResponsesRuntimeFallsBackToChatWhenConfiguredEndpointFails();
  await testResponsesRuntimeDoesNotFallbackOnProviderRateLimit();
  await testGeminiChatOmitsPromptCacheKey();
  await testGeminiResponsesConfiguredUsesChatCompletionsFirst();
  await testGpt54ChatToolCallsDropReasoningEffort();
  await testConfiguredProviderDefaultsFillMissingAnthropicFields();
  await testStreamFallbackJsonToolCallContentIsConvertedToToolUse();
  await testRefusalPartsRemainVisibleText();
  await testToolCallsDoNotTriggerStreamFallbackRetry();
  await testLegacyFunctionCallIsConvertedToToolUse();
  await testMalformedToolCallArgumentsReturnErrorResponse();
  await testMessageContentObjectStillExtractsVisibleText();
  await testMessageOutputTextFallbackCanPromoteInlineToolCall();
  await testStreamingDeltaToolCallsAreReassembledAcrossChunks();
  await testContentFilterMapsToEndTurnWithoutToolUse();
  await testDeepSeekCompactionRequestFlattensToolHistory();
  await testDeepSeekReasoningContentIsConvertedToThinking();
  await testDeepSeekReasoningContentDoesNotPrecedeToolUseBlocks();
  await testDeepSeekThinkingIsRoundTrippedAsReasoningContent();
  await testDeepSeekPlainThinkingIsOmittedWithoutToolContext();
  await testDeepSeekToolTurnFinalThinkingIsStillReplayed();
  await testDeepSeekReasoningStaysAttachedBeforeToolResult();
  await testDeepSeekStreamReasoningContentIsConvertedToThinking();
  await testDeepSeekDirectStreamReasoningContentIsConvertedToThinkingDelta();
  await testSlowTelemetryStorageDoesNotDelayProviderResponse();
  console.log("provider-format-adapter find regression tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
