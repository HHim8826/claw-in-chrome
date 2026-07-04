const assert = require("node:assert/strict");

const { runTestFiles } = require("../run-suite");

function testRunnerReportsFailuresAfterRunningEveryFile() {
  assert.equal(typeof runTestFiles, "function", "runTestFiles must be exported");
  const visited = [];
  assert.throws(
    () => runTestFiles(["first.test.js", "second.test.js", "third.test.js"], (filePath) => {
      visited.push(filePath);
      if (filePath === "second.test.js") throw new Error("expected failure");
    }),
    /second\.test\.js: expected failure/,
  );
  assert.deepEqual(visited, ["first.test.js", "second.test.js", "third.test.js"]);
}

function main() {
  testRunnerReportsFailuresAfterRunningEveryFile();
  console.log("test runner tests passed");
}

main();
