const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contractPath = path.join(__dirname, "..", "..", "src", "shared", "claw-contract.js");
const adapterPath = path.join(__dirname, "..", "..", "src", "shared", "provider-format-adapter.js");
const contractSource = fs.readFileSync(contractPath, "utf8");
const adapterSource = fs.readFileSync(adapterPath, "utf8");

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
      callIndex: upstreamCalls.length - 1,
      upstreamCalls
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
              return { [key]: config };
            }
            return { customProviderConfig: config };
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
        content: "Hello"
      }
    ]
  };
  const request = new Request("https://provider.example/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "anthropic-test-key",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody)
  });
  const response = await sandbox.fetch(request);
  if (options.responseType === "text") {
    return {
      status: response.status,
      text: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      upstreamCalls
    };
  }
  return {
    status: response.status,
    json: await response.json(),
    upstreamCalls
  };
}

async function testRateLimit429IsRetriedAndSucceeds() {
  const successPayload = {
    id: "chatcmpl-success",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Hello from retry!"
        }
      }
    ]
  };

  const result = await runAdapterWithUpstreamHandler(async (ctx) => {
    if (ctx.callIndex === 0) {
      return new Response(
        JSON.stringify({
          error: { message: "Rate limit exceeded", type: "rate_limit_error", code: "rate_limit_exceeded" }
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "2"
          }
        }
      );
    }
    return new Response(JSON.stringify(successPayload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  });

  assert.equal(result.status, 200);
  assert.equal(result.upstreamCalls.length, 2);
  assert.equal(result.json.stop_reason, "end_turn");
}

async function testRateLimitRetryExhaustedMaxRetriesReturnsError() {
  const result = await runAdapterWithUpstreamHandler(async (ctx) => {
    return new Response(
      JSON.stringify({
        error: { message: "Rate limit exceeded", type: "rate_limit_error", code: "rate_limit_exceeded" }
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "1"
        }
      }
    );
  });

  assert.notEqual(result.status, 200);
  assert.equal(result.upstreamCalls.length, 4);
}

async function testNon429ErrorDoesNotTriggerRateLimitRetry() {
  const result = await runAdapterWithUpstreamHandler(async (ctx) => {
    return new Response(
      JSON.stringify({ error: { message: "Internal server error" } }),
      {
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  });

  assert.notEqual(result.status, 200);
  assert.equal(result.upstreamCalls.length, 1);
}

async function testRateLimitRetryWithXRatelimitResetHeader() {
  const successPayload = {
    id: "chatcmpl-success-2",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Success after x-ratelimit-reset retry!"
        }
      }
    ]
  };

  const resetTime = Math.ceil(Date.now() / 1000) + 1;

  const result = await runAdapterWithUpstreamHandler(async (ctx) => {
    if (ctx.callIndex === 0) {
      return new Response(
        JSON.stringify({
          error: { message: "Rate limited", type: "rate_limit_error", code: "quota_exceeded" }
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-reset": String(resetTime)
          }
        }
      );
    }
    return new Response(JSON.stringify(successPayload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  });

  assert.equal(result.status, 200);
  assert.equal(result.upstreamCalls.length, 2);
  assert.equal(result.json.stop_reason, "end_turn");
}

async function testRateLimitRetryWithRetryAfterAsHttpDate() {
  const successPayload = {
    id: "chatcmpl-success-3",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Success after HTTP-date retry-after!"
        }
      }
    ]
  };

  const retryDate = new Date(Date.now() + 2000).toUTCString();

  const result = await runAdapterWithUpstreamHandler(async (ctx) => {
    if (ctx.callIndex === 0) {
      return new Response(
        JSON.stringify({
          error: { message: "Rate limited" }
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": retryDate
          }
        }
      );
    }
    return new Response(JSON.stringify(successPayload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  });

  assert.equal(result.status, 200);
  assert.equal(result.upstreamCalls.length, 2);
}

async function testRateLimitRetryWithStreamingRequest() {
  const successPayload = {
    id: "chatcmpl-stream",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Hello!"
        }
      }
    ]
  };

  const result = await runAdapterWithUpstreamHandler(async (ctx) => {
    if (ctx.callIndex === 0) {
      return new Response(
        JSON.stringify({
          error: { message: "Rate limit exceeded" }
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "1"
          }
        }
      );
    }
    return new Response(JSON.stringify(successPayload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }, {
    requestBody: {
      model: "gpt-5.4",
      max_tokens: 128,
      stream: true,
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ]
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.upstreamCalls.length, 2);
}

async function testRateLimitRetryWithNoRetryHeadersUsesDefaultBackoff() {
  const successPayload = {
    id: "chatcmpl-default-backoff",
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Success with default backoff!"
        }
      }
    ]
  };

  const result = await runAdapterWithUpstreamHandler(async (ctx) => {
    if (ctx.callIndex === 0) {
      return new Response(
        JSON.stringify({
          error: { message: "Rate limited" }
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }
    return new Response(JSON.stringify(successPayload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  });

  assert.equal(result.status, 200);
  assert.equal(result.upstreamCalls.length, 2);
}

async function main() {
  await testRateLimit429IsRetriedAndSucceeds();
  await testRateLimitRetryExhaustedMaxRetriesReturnsError();
  await testNon429ErrorDoesNotTriggerRateLimitRetry();
  await testRateLimitRetryWithXRatelimitResetHeader();
  await testRateLimitRetryWithRetryAfterAsHttpDate();
  await testRateLimitRetryWithStreamingRequest();
  await testRateLimitRetryWithNoRetryHeadersUsesDefaultBackoff();
  console.log("provider format adapter rate limit retry tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
