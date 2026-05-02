const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..", "..");
const sourcePath = path.join(rootDir, "src", "assets", "sidepanel-BoLm9pmH.js");

function readSource() {
  return fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
}

function indexOfOrFail(source, token, label) {
  const index = source.indexOf(token);
  assert.notEqual(index, -1, `${label} should include ${token}`);
  return index;
}

function assertIncludes(source, snippet, label) {
  assert.equal(source.includes(snippet), true, `${label} should include the expected snippet`);
}

function assertNotIncludes(source, snippet, label) {
  assert.equal(source.includes(snippet), false, `${label} should not include the removed snippet`);
}

function assertFollowedBy(source, anchor, snippet, label, maxDistance = 2500) {
  const anchorIndex = indexOfOrFail(source, anchor, label);
  const snippetIndex = source.indexOf(snippet, anchorIndex);
  assert.notEqual(snippetIndex, -1, `${label} should include the expected follow-up snippet`);
  assert.ok(snippetIndex - anchorIndex <= maxDistance, `${label} should keep the follow-up snippet close to the anchor`);
}

function testBootstrapRejectsStaleTabs(source) {
  assertFollowedBy(
    source,
    "const e = await chrome.tabs.get(o);",
    "i(o);",
    "sidepanel bootstrap should only store tabId after chrome.tabs.get succeeds",
    80
  );

  assertIncludes(
    source,
    "__cpPanelDebugLog(\"session.bootstrap_tab_invalid\", {\n            tabId: o,",
    "sidepanel bootstrap should log stale tab failures during session restore"
  );

  assertIncludes(
    source,
    "i(undefined);\n          l(undefined);\n          u(undefined);\n          h(undefined);\n          m(null);\n          T(__cpDefaultBlockedTabInfo);\n          b(false);",
    "sidepanel bootstrap should clear restored tab state after stale tab lookup failure"
  );
}

function testWindowBootstrapFallsBackToRestoreUrl(source) {
  assertIncludes(
    source,
    "const __cpSidepanelPageQueryKeyRestoreUrl = \"restoreUrl\";",
    "sidepanel window bootstrap should expose a dedicated restoreUrl query key"
  );

  assertIncludes(
    source,
    "// 语义锚点：detached window 启动时，旧 query tabId 失效后要回退到 restoreUrl/live targetTab，不能把历史 tabId 当持久身份。\n        const __cpResolveLiveTabByRestoreUrl = async () => {\n          if (!__cpWindowMode || !__cpWindowRestoreUrl) {\n            return null;\n          }\n          try {\n            const e = await chrome.tabs.query({});",
    "detached window bootstrap should search live tabs by restoreUrl when the historical tab id is stale"
  );

  assertIncludes(
    source,
    "if (__cpWindowMode) {\n            const e = __cpWindowRestoreUrl ? await __cpResolveLiveTabByRestoreUrl() : null;\n            const t = e && e !== o ? e : await __cpResolveLiveWindowTargetTabId();",
    "window bootstrap should keep trying restoreUrl/live targetTab candidates instead of trusting one stale tab id"
  );

  assertIncludes(
    source,
    "restoreUrl: __cpWindowRestoreUrl,",
    "bootstrap invalid-tab logs should capture the restoreUrl used for recovery"
  );
}

function testScopeNormalizationPreservesNull(source) {
  assertIncludes(
    source,
    "const t = e?.mainTabId;\n    const n = t === null || t === undefined || t === \"\" ? null : Number(t);\n    const s = Number.isFinite(n) && n > 0 ? n : null;\n    const r = e?.chromeGroupId;\n    const i = r === null || r === undefined || r === \"\" ? null : Number(r);\n    const o = Number.isFinite(i) ? i : null;",
    "scope normalization should preserve null group ids instead of coercing them to 0"
  );

  assertIncludes(
    source,
    "ready: e?.ready === true && s !== null && !!l",
    "scope readiness should still depend on a live main tab id"
  );
}

function testCurrentScopeResolutionRequiresLiveTab(source) {
  assertIncludes(
    source,
    "let e = null;\n    let t = false;\n    let s = null;\n    try {\n      await gt.initialize();\n      let n = await chrome.tabs.get(ce);\n      e = Number.isFinite(Number(ce)) ? Number(ce) : null;",
    "current scope resolution should not prefill a ready scope before chrome.tabs.get succeeds"
  );

  assertIncludes(
    source,
    "if (!e) {\n      __cpPanelDebugLog(\"session.scope_resolve_empty\", {\n        tabId: ce\n      }, \"warn\");\n      return __cpNormalizeScopeState({});\n    }",
    "current scope resolution should return an empty scope when the tab is stale"
  );
}

function testScopeIdentityUsesLiveGroupBoundaryButUrlRestore(source) {
  assertIncludes(
    source,
    "// 语义锚点：chromeGroupId/mainTabId 只用于当前浏览器运行期的 live scope 分桶；跨重启恢复仍靠 URL restore anchor。\nfunction __cpGetScopeIdByGroupContext(e, t) {\n  const n = Number(e);\n  if (Number.isFinite(n) && n !== chrome.tabGroups.TAB_GROUP_ID_NONE) {\n    return `chrome-group:${n}`;\n  }\n  const s = Number(t);\n  return Number.isFinite(s) && s > 0 ? `group:${s}` : \"\";\n}",
    "live scope partitioning may use the current chrome group, but durable restore must stay URL-based"
  );

  assertIncludes(
    source,
    "// 语义锚点：旧的 group/tab 历史恢复链已退役；跨重启只按 URL restore anchor 找回旧 scope。\n  static async findMatchingCurrentUrlScopes(e = {}) {",
    "repository should document that old group/tab history restoration paths are retired"
  );

  assertNotIncludes(
    source,
    "static async findMatchingLegacyScopes(",
    "repository should no longer expose legacy chromeGroup recovery helpers"
  );

  assertNotIncludes(
    source,
    "static async migrateExactScopes(",
    "repository should no longer expose exact group/tab migration helpers for restore"
  );

  assertNotIncludes(
    source,
    "static async findMatchingMainTabScopes(",
    "repository should no longer expose mainTabId history scans"
  );

  assertIncludes(
    source,
    "// 语义锚点：hydrate 恢复只把 URL anchor 当作跨重启的持久身份。\n        // chromeGroupId/mainTabId 仍只服务当前运行期 live scope，不再参与历史 scope 的恢复匹配。",
    "hydrate should document that only URL anchors participate in cross-restart restore"
  );

  assertIncludes(
    source,
    "const __cpCurrentUrlScopeCandidates = await LocalSessionRepository.findMatchingCurrentUrlScopes({\n            currentUrl: __cpCurrentTabContext.currentUrl,\n            tabTitle: __cpCurrentTabContext.tabTitle,\n            excludeScopeId: e.scopeId\n          });",
    "hydrate should resolve restore candidates using the current URL only"
  );

  assertIncludes(
    source,
    "// 语义锚点：live scope 占用判断必须同时命中当前 URL，避免浏览器重启后复用旧 groupId/tabId 导致误跳过正确候选。\n        if (await this.isScopeClaimedByLiveContext(e, c)) {\n          continue;\n        }",
    "url restore candidate filtering should only skip scopes when the live context also matches the same URL"
  );

  assertNotIncludes(
    source,
    "domain: __cpCurrentTabContext.currentDomain,\n            tabTitle: __cpCurrentTabContext.tabTitle,\n            excludeScopeId: e.scopeId",
    "hydrate should not use domain fallback when picking the session to restore"
  );

  assertNotIncludes(
    source,
    "session.hydrate_legacy_lookup",
    "hydrate should no longer restore history by legacy chromeGroup ids"
  );

  assertNotIncludes(
    source,
    "session.hydrate_exact_scope_lookup",
    "hydrate should no longer restore history by exact mainTab/group identity"
  );

  assertNotIncludes(
    source,
    "static async isScopeClaimedByLiveGroup(",
    "url restore candidate filtering should no longer trust bare tab/group ids without URL verification"
  );
}

function testAllExplicitTabsGetThenPathsHandleStaleTabs(source) {
  const matches = source.match(/chrome\.tabs\.get\([^)]+\)\.then\(/g) || [];
  assert.equal(
    matches.length,
    7,
    "stale-tab audit assumes every explicit chrome.tabs.get(...).then(...) path in the sidepanel bundle is covered"
  );

  assertFollowedBy(
    source,
    "chrome.tabs.get(e).then(h)",
    ".catch(e => {\n        i(\"\");\n      });",
    "tab metadata effect should already ignore stale tabs"
  );

  assertFollowedBy(
    source,
    "chrome.tabs.get(t).then(async t => {",
    "}).catch(() => {\n            r(e => ({\n              ...e,\n              steps: e.steps.map(e => e.timestamp === h.timestamp ? {\n                ...e,\n                isEnhancing: false\n              } : e)\n            }));\n          });",
    "step enhancement should clear isEnhancing when the tab turns stale"
  );

  assertFollowedBy(
    source,
    "chrome.tabs.get(i).then(e => {",
    "}).catch(() => {\n        m.current = -1;\n      });",
    "initial selector bootstrap should reset group tracking when the tab turns stale"
  );

  assertFollowedBy(
    source,
    "const t = e.tabId;\n      chrome.tabs.get(t).then(e => {",
    "}).catch(() => {\n        r(e => ({\n          ...e,\n          isPaused: true\n        }));\n        l.forEach(e => {",
    "tab activation watcher should pause and cancel selectors when the activated tab turns stale"
  );

  assertFollowedBy(
    source,
    "if (t.status === \"complete\" && g.current && !s.isPaused && n) {\n      chrome.tabs.get(n).then(e => {",
    "}).catch(() => {\n        x.current.delete(n);\n      });",
    "selector reinjection on load complete should drop stale tab bookkeeping"
  );

  assertFollowedBy(
    source,
    "setTimeout(() => {\n        if (g.current && !s.isPaused) {\n          chrome.tabs.get(n).then(e => {",
    "}).catch(() => {\n            x.current.delete(n);\n          });",
    "delayed selector reinjection should drop stale tab bookkeeping"
  );

  assertFollowedBy(
    source,
    "chrome.tabs.get(e).then(t => {",
    "}).catch(() => {});",
    "tab url cache warmup should ignore stale tabs"
  );
}

function main() {
  const source = readSource();

  testBootstrapRejectsStaleTabs(source);
  testWindowBootstrapFallsBackToRestoreUrl(source);
  testScopeNormalizationPreservesNull(source);
  testCurrentScopeResolutionRequiresLiveTab(source);
  testScopeIdentityUsesLiveGroupBoundaryButUrlRestore(source);
  testAllExplicitTabsGetThenPathsHandleStaleTabs(source);

  console.log("sidepanel stale tab session regression test passed");
}

main();
