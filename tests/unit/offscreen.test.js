const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createEventMock,
  flushMicrotasks,
  runScriptInSandbox
} = require("../helpers/chrome-test-utils");

const scriptPath = path.join(__dirname, "..", "..", "src", "offscreen", "offscreen.js");

function invokeMessageHandler(listener, message) {
  return new Promise((resolve, reject) => {
    try {
      let handled;
      let responseSent = false;
      let pendingResponse;
      const sendResponse = response => {
        responseSent = true;
        pendingResponse = response;
        if (handled !== undefined) {
          resolve({
            handled,
            response
          });
        }
      };
      handled = listener(message, {}, sendResponse);
      if (responseSent) {
        resolve({
          handled,
          response: pendingResponse
        });
        return;
      }
      if (handled !== true && handled !== undefined) {
        resolve({
          handled,
          response: undefined
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}

function createOffscreenHarness(options = {}) {
  const onMessage = createEventMock();
  const keepaliveIntervals = [];
  const runtimeMessages = [];
  const fetchCalls = [];
  const revokedBlobUrls = [];
  const gainValues = [];
  let resumeCalls = 0;
  let audioContextCreations = 0;

  class FakeAudioContext {
    constructor() {
      audioContextCreations += 1;
      this.state = options.audioState || "suspended";
      this.destination = {};
    }

    async decodeAudioData(buffer) {
      return {
        size: buffer.byteLength
      };
    }

    createBufferSource() {
      const source = {
        buffer: null,
        connect() {},
        start() {
          Promise.resolve().then(() => {
            source.onended?.();
          });
        }
      };
      return source;
    }

    createGain() {
      const node = {
        gain: {
          set value(nextValue) {
            gainValues.push(nextValue);
            this._value = nextValue;
          },
          get value() {
            return this._value;
          }
        },
        connect() {}
      };
      return node;
    }

    async resume() {
      resumeCalls += 1;
      this.state = "running";
    }
  }

  const sandbox = {
    console,
    chrome: {
      runtime: {
        sendMessage(message) {
          runtimeMessages.push(JSON.parse(JSON.stringify(message)));
          if (options.sendMessageReject) {
            return Promise.reject(new Error("service worker unavailable"));
          }
          return Promise.resolve({
            ok: true
          });
        },
        onMessage,
        getURL(targetPath) {
          return `chrome-extension://test-extension/${String(targetPath || "").replace(/^\/+/, "")}`;
        }
      }
    },
    fetch: async url => {
      fetchCalls.push(String(url));
      return {
        async arrayBuffer() {
          return new ArrayBuffer(8);
        }
      };
    },
    setInterval(callback, delay) {
      keepaliveIntervals.push({
        callback,
        delay
      });
      return keepaliveIntervals.length;
    },
    URL: {
      revokeObjectURL(blobUrl) {
        revokedBlobUrls.push(String(blobUrl));
      },
      createObjectURL() {
        return "blob:generated";
      }
    },
    window: {
      AudioContext: FakeAudioContext
    }
  };
  sandbox.globalThis = sandbox;

  runScriptInSandbox(scriptPath, sandbox);

  return {
    fetchCalls,
    gainValues,
    keepaliveIntervals,
    onMessage,
    revokedBlobUrls,
    runtimeMessages,
    get resumeCalls() {
      return resumeCalls;
    },
    get audioContextCreations() {
      return audioContextCreations;
    }
  };
}

async function testKeepaliveAndBlobRevocationMessagesWork() {
  const harness = createOffscreenHarness({});

  assert.equal(harness.keepaliveIntervals.length, 1);
  assert.equal(harness.keepaliveIntervals[0].delay, 20000);

  await harness.keepaliveIntervals[0].callback();
  await flushMicrotasks();
  assert.deepEqual(harness.runtimeMessages[0], {
    type: "SW_KEEPALIVE"
  });

  const listener = harness.onMessage.listeners[0];
  const revokeResult = await invokeMessageHandler(listener, {
    type: "REVOKE_BLOB_URL",
    blobUrl: "blob:abc"
  });

  assert.equal(revokeResult.handled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(revokeResult.response)), {
    success: true
  });
  assert.deepEqual(harness.revokedBlobUrls, ["blob:abc"]);
}

async function testPlaySoundMessageUsesDefaultAndCustomVolume() {
  const harness = createOffscreenHarness({});
  const listener = harness.onMessage.listeners[0];

  const defaultResult = await invokeMessageHandler(listener, {
    type: "OFFSCREEN_PLAY_SOUND",
    audioUrl: "https://example.com/notify.mp3"
  });
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(defaultResult.handled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(defaultResult.response)), {
    success: true
  });
  assert.deepEqual(harness.fetchCalls, ["https://example.com/notify.mp3"]);
  assert.equal(harness.gainValues[0], 0.5);
  assert.equal(harness.resumeCalls, 1);
  assert.equal(harness.audioContextCreations, 1);

  const customResult = await invokeMessageHandler(listener, {
    type: "OFFSCREEN_PLAY_SOUND",
    audioUrl: "https://example.com/loud.mp3",
    volume: 0.8
  });
  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(JSON.parse(JSON.stringify(customResult.response)), {
    success: true
  });
  assert.deepEqual(harness.fetchCalls, [
    "https://example.com/notify.mp3",
    "https://example.com/loud.mp3"
  ]);
  assert.equal(harness.gainValues.at(-1), 0.8);
  assert.equal(harness.audioContextCreations, 1);
}

async function testUnknownMessageIsIgnored() {
  const harness = createOffscreenHarness({});
  const listener = harness.onMessage.listeners[0];

  const handled = listener({
    type: "UNKNOWN_MESSAGE"
  }, {}, function () {});

  assert.equal(handled, undefined);
}

async function main() {
  await testKeepaliveAndBlobRevocationMessagesWork();
  await testPlaySoundMessageUsesDefaultAndCustomVolume();
  await testUnknownMessageIsIgnored();
  console.log("offscreen tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
