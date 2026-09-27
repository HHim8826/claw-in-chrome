const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const linkSafety = require(path.join(rootDir, "src", "shared", "link-safety.js"));

function testEmbeddedCredentialsAreDetected() {
  assert.deepEqual(linkSafety.inspectUserinfo("https://bank.example@evil.example/login"), {
    hasUserinfo: true,
    host: "evil.example",
  });
  assert.deepEqual(linkSafety.inspectUserinfo("https://user:secret@evil.example:8443/x"), {
    hasUserinfo: true,
    host: "evil.example:8443",
  });
  assert.deepEqual(linkSafety.inspectUserinfo("https://example.com/path?next=a@b"), { hasUserinfo: false, host: null });
  assert.deepEqual(linkSafety.inspectUserinfo("mailto:someone@example.com"), { hasUserinfo: false, host: null });
  assert.deepEqual(linkSafety.inspectUserinfo("not a url"), { hasUserinfo: false, host: null });
  assert.deepEqual(linkSafety.inspectUserinfo(undefined), { hasUserinfo: false, host: null });
}

function testActivationDelayMatchesUpstream() {
  assert.equal(linkSafety.OPEN_LINK_ACTIVATION_DELAY_MS, 400);
}

function testDialogWiring() {
  const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n/g, "\n");
  const sidepanel = read("src/assets/sidepanel-BoLm9pmH.js");
  assert.equal(
    sidepanel.includes("globalThis.__CP_LINK_SAFETY__?.inspectUserinfo(t)"),
    true,
    "the external-link dialog inspects embedded credentials",
  );
  assert.equal(
    sidepanel.includes(
      'defaultMessage: "This link contains embedded credentials, which may be an attempt to disguise its destination. You will actually be sent to:",\n    id: "DrFn3Jpzg4"',
    ),
    true,
    "the dialog explains the real destination",
  );
  assert.equal(sidepanel.includes("disabled: !__cpOpenLinkReady,"), true, "the open button waits for the activation delay");
  assert.equal(sidepanel.includes('document.addEventListener("visibilitychange", r);'), true, "hidden panels re-arm the delay");
  assert.equal(read("src/sidepanel/sidepanel.html").includes('<script src="/shared/link-safety.js"></script>'), true);
  assert.equal(read(".github/release-package-items.txt").includes("shared/link-safety.js"), true);
  for (const locale of ["en-US", "zh-CN", "zh-TW"]) {
    const messages = JSON.parse(read(`src/i18n/${locale}.json`));
    assert.equal(typeof messages.DrFn3Jpzg4, "string", `${locale} translates the credentials warning`);
  }
}

function main() {
  testEmbeddedCredentialsAreDetected();
  testActivationDelayMatchesUpstream();
  testDialogWiring();
  console.log("link safety tests passed");
}

main();
