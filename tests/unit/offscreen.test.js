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
  let imageCreations = 0;
  let gifCreations = 0;
  let gifFramesAdded = 0;

  class FakeImage {
    constructor() {
      imageCreations += 1;
      this.width = options.imageWidth || 100;
      this.height = options.imageHeight || 100;
    }

    set src(value) {
      this.source = value;
      Promise.resolve().then(() => this.onload?.());
    }
  }

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

  class FakeGif {
    constructor() {
      gifCreations += 1;
      this.handlers = new Map();
    }

    on(type, handler) {
      this.handlers.set(type, handler);
    }

    addFrame() {
      gifFramesAdded += 1;
    }

    render() {
      Promise.resolve().then(() => {
        this.handlers.get("finished")?.({ size: 4 });
      });
    }
  }

  class FakeFileReader {
    readAsDataURL() {
      this.result = "data:image/gif;base64,R0lG";
      Promise.resolve().then(() => this.onloadend?.());
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
    },
    Image: FakeImage,
    GIF: FakeGif,
    FileReader: FakeFileReader,
    document: {
      createElement(tagName) {
        assert.equal(tagName, "canvas");
        return {
          width: 0,
          height: 0,
          getContext() {
            return {
              drawImage() {}
            };
          }
        };
      }
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
    },
    get imageCreations() {
      return imageCreations;
    },
    get gifCreations() {
      return gifCreations;
    },
    get gifFramesAdded() {
      return gifFramesAdded;
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

async function testGenerateGifRejectsFrameCountBeforeLoadingImages() {
  const harness = createOffscreenHarness({});
  const listener = harness.onMessage.listeners[0];
  const frames = Array.from({ length: 51 }, () => ({
    format: "png",
    base64: "AA=="
  }));

  const result = await invokeMessageHandler(listener, {
    type: "GENERATE_GIF",
    frames,
    options: {}
  });

  assert.equal(result.response.success, false);
  assert.match(result.response.error, /GIF frame count exceeds 50/);
  assert.equal(harness.imageCreations, 0);
}

async function testGenerateGifRejectsDecodedPixelBudgetBeforeEncoding() {
  const harness = createOffscreenHarness({
    imageWidth: 5000,
    imageHeight: 5000
  });
  const listener = harness.onMessage.listeners[0];
  const frames = Array.from({ length: 3 }, () => ({
    format: "png",
    base64: "AA=="
  }));

  const result = await invokeMessageHandler(listener, {
    type: "GENERATE_GIF",
    frames,
    options: {}
  });

  assert.equal(result.response.success, false);
  assert.match(result.response.error, /GIF decoded pixel budget exceeds 50000000/);
  assert.equal(harness.imageCreations, 3);
}

async function testGenerateGifKeepsSuccessfulResponseContractWithinBudget() {
  const harness = createOffscreenHarness({
    imageWidth: 320,
    imageHeight: 180
  });
  const listener = harness.onMessage.listeners[0];

  const result = await invokeMessageHandler(listener, {
    type: "GENERATE_GIF",
    frames: [{
      format: "png",
      base64: "AA==",
      delay: 100
    }],
    options: {
      showClickIndicators: false,
      showDragPaths: false,
      showActionLabels: false,
      showProgressBar: false,
      showWatermark: false
    }
  });

  assert.equal(result.response.success, true);
  assert.equal(result.response.result.base64, "R0lG");
  assert.equal(result.response.result.width, 320);
  assert.equal(result.response.result.height, 180);
  assert.equal(harness.gifCreations, 1);
  assert.equal(harness.gifFramesAdded, 1);
}

async function main() {
  await testKeepaliveAndBlobRevocationMessagesWork();
  await testPlaySoundMessageUsesDefaultAndCustomVolume();
  await testUnknownMessageIsIgnored();
  await testGenerateGifRejectsFrameCountBeforeLoadingImages();
  await testGenerateGifRejectsDecodedPixelBudgetBeforeEncoding();
  await testGenerateGifKeepsSuccessfulResponseContractWithinBudget();
  console.log("offscreen tests passed");
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
