(function () {
  // 语义锚点：claude.ai onboarding 按钮 DOM 与 prompt 数据来源
  const __cpClaudeOnboardingButtonSelector = "#claude-onboarding-button";
  const __cpClaudeOnboardingPromptDataAttribute = "data-task-prompt";

  // 语义锚点：content-script -> service worker 的动作名（打开 sidepanel 并填充 prompt）
  const __cpContentScriptContractMessages =
    globalThis.__CP_CONTRACT__?.messages || {};
  const __cpContentScriptMessageTypeOpenSidePanel =
    __cpContentScriptContractMessages.open_side_panel || "open_side_panel";

  document.body.addEventListener("click", (t) => {
    const e = t.target.closest(__cpClaudeOnboardingButtonSelector);
    if (e) {
      (async function (t) {
        const e = t.getAttribute(__cpClaudeOnboardingPromptDataAttribute);
        if (e) {
          await chrome.runtime.sendMessage({
            type: __cpContentScriptMessageTypeOpenSidePanel,
            prompt: e,
          });
        }
      })(e);
    }
  });
})();
