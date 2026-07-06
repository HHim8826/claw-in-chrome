const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  resolveOnboardingTaskPrompt,
} = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "shared",
  "onboarding-tasks.js",
));

function testOnlyKnownOnboardingTasksResolveToPrompts() {
  assert.match(resolveOnboardingTaskPrompt("challenge-email"), /archive only/i);
  assert.match(resolveOnboardingTaskPrompt("usecase-calendar"), /Google Calendar/i);
  assert.equal(resolveOnboardingTaskPrompt("unknown-task"), undefined);
  assert.equal(resolveOnboardingTaskPrompt(""), undefined);
}

function testRuntimeLoadsResolverBeforeOnboardingConsumers() {
  const root = path.join(__dirname, "..", "..");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "src", "manifest.json"), "utf8"),
  );
  assert.deepEqual(manifest.content_scripts[0].js, [
    "shared/onboarding-tasks.js",
    "assets/content-script.ts-Bwa5rY9t.js",
  ]);

  const workerLoader = fs.readFileSync(
    path.join(root, "src", "background", "service-worker-loader.js"),
    "utf8",
  );
  assert.ok(
    workerLoader.indexOf('../shared/onboarding-tasks.js') <
      workerLoader.indexOf('../assets/service-worker.ts-H0DVM1LS.js'),
  );

  const worker = fs.readFileSync(
    path.join(root, "src", "assets", "service-worker.ts-H0DVM1LS.js"),
    "utf8",
  );
  assert.ok(worker.includes("const __cpOpenSidePanelPrompt ="));
  assert.ok(
    worker.includes(
      "globalThis.__CP_ONBOARDING_TASKS__?.resolveOnboardingTaskPrompt",
    ),
  );
  assert.ok(worker.includes("if (s < 5)"));
}

async function testContentScriptSendsOnlyValidatedTaskIds() {
  let clickListener;
  const messages = [];
  const context = vm.createContext({
    chrome: {
      runtime: {
        sendMessage: async (message) => messages.push(message),
      },
    },
    document: {
      body: {
        addEventListener(type, listener) {
          if (type === "click") {
            clickListener = listener;
          }
        },
      },
    },
  });
  for (const relativePath of [
    "src/shared/onboarding-tasks.js",
    "src/assets/content-script.ts-Bwa5rY9t.js",
  ]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8"),
      context,
      { filename: relativePath },
    );
  }

  const clickTask = (taskId) =>
    clickListener({
      target: {
        closest() {
          return {
            getAttribute(name) {
              return name === "data-task-id" ? taskId : null;
            },
          };
        },
      },
    });

  clickTask("challenge-email");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    JSON.stringify(messages),
    JSON.stringify([
      { type: "open_side_panel", onboardingTaskId: "challenge-email" },
    ]),
  );

  clickTask("unknown-task");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messages.length, 1);
}

async function main() {
  testOnlyKnownOnboardingTasksResolveToPrompts();
  testRuntimeLoadsResolverBeforeOnboardingConsumers();
  await testContentScriptSendsOnlyValidatedTaskIds();
  console.log("onboarding task bridge integration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
