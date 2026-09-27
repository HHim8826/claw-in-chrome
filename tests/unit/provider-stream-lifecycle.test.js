const assert = require("node:assert/strict");
const { runAdapterWithUpstreamHandler, runAdapterWithPayload } = require("./provider-format-adapter.find-regression.test.js");
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const sse = data => `data: ${JSON.stringify(data)}\n\n`;
const requestBody = { model: "test-model", stream: true, messages: [{ role: "user", content: "Test" }] };
const headers = { "content-type": "text/event-stream" };
const chatDelta = { choices: [{ delta: { content: "Partial" }, finish_reason: null }] };
const responseDelta = { type: "response.output_text.delta", delta: "Partial", output_index: 0, content_index: 0 };

async function testTerminalValidation() {
  const cases = [
    ["openai_chat", [chatDelta]],
    ["openai_chat", [chatDelta, { error: { message: "Failure" } }], true],
    ["openai_chat", [{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "search", arguments: '{"q":' } }] }, finish_reason: null }] }]],
    ["openai_responses", [responseDelta]],
    ["openai_responses", [{ type: "response.output_item.added", item: { type: "function_call", id: "f1", call_id: "call-1", name: "search" } }, { type: "response.function_call_arguments.delta", item_id: "f1", delta: '{"q":' }]],
  ];
  for (const [format, events, done] of cases) {
    const result = await runAdapterWithUpstreamHandler(() => new Response(events.map(sse).join("") + (done ? "data: [DONE]\n\n" : ""), { headers }), {
      config: { format }, requestBody, responseType: "text",
    });
    assert.match(result.text, /event: error/, `${format} must reject missing or failed terminal outcomes`);
    assert.doesNotMatch(result.text, /event: message_stop|"stop_reason":"tool_use"/);
    assert.equal(result.measurements.length, 1);
    assert.equal(result.measurements[0].outcome, "invalid_response");
  }
  const incompleteChat = await runAdapterWithPayload({ choices: [{ message: { role: "assistant", content: "Partial" }, finish_reason: null }] });
  assert.equal(incompleteChat.json.type, "error");
  assert.equal(incompleteChat.measurements[0].outcome, "invalid_response");
  for (const status of ["failed", "cancelled", "in_progress"]) {
    const result = await runAdapterWithPayload({ status, error: { message: "Failed" }, output: [] }, { config: { format: "openai_responses" } });
    assert.equal(result.json.type, "error");
    assert.equal(result.measurements[0].outcome, "invalid_response");
  }
  for (const direct of [true, false]) {
    const result = await runAdapterWithUpstreamHandler(({ callIndex }) => {
      if (!direct && !callIndex) return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }], usage: { completion_tokens: 1 } }), { headers });
      return new Response(sse(chatDelta), { headers });
    }, { requestBody: { ...requestBody, stream: direct }, ...(direct ? { responseType: "text" } : {}) });
    assert.equal(result.measurements[0].outcome, "invalid_response", "buffered fallback shares terminal validation");
  }
  const incomplete = await runAdapterWithPayload({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }, { config: { format: "openai_responses" } });
  assert.equal(incomplete.json.stop_reason, "max_tokens");
  const streamed = await runAdapterWithUpstreamHandler(() => new Response(sse(responseDelta) + sse({ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, usage: { output_tokens: 3 } } }), { headers }), { config: { format: "openai_responses" }, requestBody, responseType: "text" });
  assert.match(streamed.text, /"stop_reason":"max_tokens"/);
  assert.equal(streamed.measurements[0].outcome, "success");
}

async function testCancellationAndBackpressure() {
  for (const format of ["openai_chat", "openai_responses"]) {
    const delta = format === "openai_chat" ? chatDelta : responseDelta;
    let unreadCancelled = 0;
    const unread = new ReadableStream({ cancel() { unreadCancelled += 1; } });
    const unreadResult = await runAdapterWithUpstreamHandler(() => new Response(unread, { headers }), {
      config: { format }, requestBody, consumeResponse: response => response.body.cancel("unread"),
    });
    assert.equal(unreadCancelled, 1);
    assert.equal(unread.locked, false);
    assert.equal(unreadResult.measurements[0].outcome, "aborted");
    for (const stalled of [false, true]) {
      let pulls = 0;
      let cancelled = 0;
      let sourceController;
      const source = new ReadableStream({
        start(controller) { sourceController = controller; },
        pull(controller) {
          pulls += 1;
          if (!stalled || pulls === 1) controller.enqueue(new TextEncoder().encode(sse(delta)));
        },
        cancel() { cancelled += 1; },
      });
      const result = await runAdapterWithUpstreamHandler(() => new Response(source, { headers }), {
        config: { format }, requestBody,
        async consumeResponse(response) {
          await tick();
          assert.ok(pulls <= 2, `${format} drained ${pulls} chunks without demand`);
          const reader = response.body.getReader();
          await reader.read();
          await tick();
          assert.ok(pulls <= 3, "slow consumers must bound upstream pulls");
          // Drain the bounded output for the first source event, then stall a read.
          if (stalled) {
            await reader.read();
            await reader.read();
            const pending = reader.read();
            await tick();
            await reader.cancel("stop");
            await pending;
          } else {
            const pending = reader.read();
            sourceController.enqueue(new TextEncoder().encode(sse(delta)));
            await reader.cancel("race");
            await pending;
          }
          reader.releaseLock();
        },
      });
      assert.equal(cancelled, 1);
      assert.equal(source.locked, false, "upstream lock released after cancel");
      assert.equal(result.measurements.length, 1);
      assert.equal(result.measurements[0].outcome, "aborted");
      assert.equal(result.dispatchedEvents.length, 1);
    }
    for (const successful of [true, false]) {
      const terminal = format === "openai_chat" ? { choices: [{ delta: {}, finish_reason: "stop" }] } : { type: "response.completed", response: { status: "completed" } };
      const source = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(sse(delta) + (successful ? sse(terminal) : "")));
        controller.close();
      } });
      await runAdapterWithUpstreamHandler(() => new Response(source, { headers }), { config: { format }, requestBody, responseType: "text" });
      assert.equal(source.locked, false, "upstream lock released on success and failure");
    }
  }
}

const deadline = setTimeout(() => { console.error("Provider lifecycle tests timed out"); process.exit(1); }, 10000);
(async () => {
  await testTerminalValidation();
  await testCancellationAndBackpressure();
  console.log("provider terminal, cancellation, and backpressure regressions passed");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(deadline));
