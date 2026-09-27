(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_BROWSER_BATCH__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TOOL_NAME = "browser_batch";
  const ENABLED_STORAGE_KEY = "browserBatchEnabled";
  const TAB_SETTLE_TIMEOUT_MS = 3000;
  const TAB_SETTLE_POLL_MS = 100;

  const DESCRIPTION =
    "Execute a sequence of browser tool calls in ONE round trip. Each item is {name, input} where input is exactly what you'd pass to that tool standalone. Actions execute SEQUENTIALLY (not in parallel) and stop on the first error. Use this tool extensively to quickly execute work whenever you can predict two or more steps ahead — e.g. navigate, click a field, type, press Return, screenshot. Each tool's own permission check runs per item — if an action navigates to a domain without permission, the next item's check fails and the batch stops. Screenshots and other images are returned interleaved with outputs; coordinates you write in THIS batch refer to the screenshot taken BEFORE this call. browser_batch cannot be nested.";
  const ACTION_ITEM_SCHEMA = Object.freeze({
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Tool name (e.g. computer, navigate, find, tabs_create). browser_batch cannot be nested.",
      },
      input: {
        type: "object",
        description: "That tool's input — same shape you'd pass when calling it directly.",
      },
    },
    required: ["name", "input"],
  });
  const ACTIONS_DESCRIPTION =
    'List of tool calls to execute sequentially. Example: [{"name":"computer","input":{"action":"left_click","coordinate":[100,200],"tabId":123}},{"name":"computer","input":{"action":"type","text":"hello","tabId":123}},{"name":"navigate","input":{"url":"https://example.com","tabId":123}}]';
  const SYSTEM_PROMPT_GUIDANCE =
    "Prefer the browser_batch tool over individual tool calls whenever you can predict two or more steps ahead. Batching is significantly faster — use it as your default for click→type→key sequences, form fills, and multi-step navigation.";
  const SINGLE_CALL_REMINDER =
    "You used a single tool call this turn. Prefer browser_batch to execute multiple actions in one call — it is significantly faster. Batch your next sequence of clicks, types, navigations, and screenshots together.";

  // Tool calls whose tabId selects a group context instead of a target tab.
  const TAB_ID_EXEMPT_TOOLS = new Set(["tabs_context_mcp", "tabs_create_mcp"]);
  // Items that never need a page permission; a prompt after only these items can
  // be surfaced for the whole batch instead of failing it.
  const TRIVIAL_TOOLS = new Set(["tabs_context", "tabs_context_mcp", "shortcuts_list"]);
  const TRIVIAL_COMPUTER_ACTIONS = new Set(["wait"]);
  const SINGLE_CALL_TOOLS = new Set([
    "navigate",
    "tabs_context",
    "tabs_context_mcp",
    "upload_image",
    "update_plan",
    "gif_creator",
    "resize_window",
    "file_upload",
    "tabs_create",
    "tabs_create_mcp",
  ]);
  const SINGLE_CALL_COMPUTER_ACTIONS = new Set([
    "key",
    "type",
    "wait",
    "left_click_drag",
    "left_click",
    "scroll_to",
    "hover",
    "right_click",
    "triple_click",
    "double_click",
    "scroll",
  ]);
  const NAVIGATION_BLOCK_CODES = new Set([
    "batch_domain_blocked",
    "batch_navigation_blocked",
    "navigation_blocked_mid_call",
  ]);

  function isEnabled(value) {
    return value !== false;
  }

  function toolSchema() {
    return {
      name: TOOL_NAME,
      description: DESCRIPTION,
      input_schema: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            minItems: 1,
            items: ACTION_ITEM_SCHEMA,
            description: ACTIONS_DESCRIPTION,
          },
        },
        required: ["actions"],
      },
    };
  }

  function toolParameters() {
    return {
      actions: {
        type: "array",
        minItems: 1,
        items: ACTION_ITEM_SCHEMA,
        description: ACTIONS_DESCRIPTION,
      },
    };
  }

  function validateInput(input) {
    if (!input || !Array.isArray(input.actions) || input.actions.length === 0) {
      return { ok: false, error: "actions must be a non-empty array" };
    }
    for (let index = 0; index < input.actions.length; index += 1) {
      const action = input.actions[index];
      if (!action || typeof action.name !== "string") {
        return { ok: false, error: `actions[${index}].name must be a string` };
      }
      if (action.name === TOOL_NAME) {
        return { ok: false, error: `actions[${index}]: ${TOOL_NAME} cannot be nested` };
      }
      if (!action.input || typeof action.input !== "object") {
        return { ok: false, error: `actions[${index}].input must be an object` };
      }
    }
    return { ok: true, actions: input.actions };
  }

  function actionLabel(action) {
    const subAction = action?.input?.action;
    return typeof subAction === "string" ? `${action.name}:${subAction}` : action.name;
  }

  function isTrivialAction(action) {
    if (TRIVIAL_TOOLS.has(action.name)) {
      return true;
    }
    return action.name === "computer" && TRIVIAL_COMPUTER_ACTIONS.has(action.input?.action);
  }

  function discardedNote(completedCount, notRunCount) {
    return `${completedCount} prior result${completedCount === 1 ? "" : "s"} discarded; ${notRunCount} not run`;
  }

  function summarizeItems(items) {
    return items.map(({ label, output, base64Image }) => ({
      label,
      output: base64Image ? `${output ?? "ok"} [Image omitted due to error]` : output,
    }));
  }

  function failure(items, index, total, label, message, errorCode) {
    const remaining = total - index - 1;
    const discard = NAVIGATION_BLOCK_CODES.has(errorCode);
    return {
      error: `actions[${index}] (${label}) failed: ${message} (${discard ? discardedNote(items.length, remaining) : `${items.length} completed, ${remaining} remaining`})`,
      errorCode: errorCode || "batch_subaction_failed",
      batchItems: discard ? [] : summarizeItems(items),
    };
  }

  function netlocOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  }

  // A one-time grant belongs to the whole batch call: PermissionManager revokes it on
  // first use, so later items on the same host reuse the approval instead of failing.
  function scopeOnceGrantsToBatch(permissionManager, toolUseId) {
    if (!permissionManager || typeof permissionManager.checkPermission !== "function" || !toolUseId) {
      return permissionManager;
    }
    const approvedHosts = new Set();
    return new Proxy(permissionManager, {
      get(target, property) {
        if (property === "checkPermission") {
          return async function (url, ...rest) {
            const host = netlocOf(url);
            if (host && approvedHosts.has(host)) {
              return { allowed: true, needsPrompt: false };
            }
            const result = await target.checkPermission(url, ...rest);
            if (host && result?.allowed && result.permission?.duration === "once" && result.permission.toolUseId === toolUseId) {
              approvedHosts.add(host);
            }
            return result;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  function targetTabIdFor(input, fallbackTabId) {
    return typeof input?.tabId === "number" ? input.tabId : fallbackTabId;
  }

  async function isSessionTab(tabId, context, deps) {
    if (tabId === undefined || context.tabId === undefined) {
      return tabId !== undefined && tabId === context.tabId;
    }
    if (tabId === context.tabId) {
      return true;
    }
    try {
      return await deps.isTabInSameGroup(context.tabId, tabId);
    } catch {
      return false;
    }
  }

  async function waitForTabSettle(tabId, context, deps) {
    const startedAt = deps.now();
    while (deps.now() - startedAt < TAB_SETTLE_TIMEOUT_MS) {
      if (context.isCancelled?.()) {
        return;
      }
      let tab;
      try {
        tab = await deps.getTab(tabId);
      } catch {
        return;
      }
      if (tab?.status !== "loading") {
        return;
      }
      await deps.sleep(TAB_SETTLE_POLL_MS);
    }
  }

  async function execute(input, context = {}, deps) {
    const items = [];
    const mintedImageIds = [];
    const forgetMintedImages = () => {
      for (const imageId of mintedImageIds) {
        deps.forgetImage?.(imageId);
      }
    };
    const progress = (update) => {
      try {
        context.onBatchProgress?.(update);
      } catch {}
    };
    const scope = deps.beginPendingScope?.();
    let committed = false;
    let lastTabContext;
    let running;
    try {
      if (!(await deps.isEnabled())) {
        return { error: `${TOOL_NAME} is currently disabled`, errorCode: "batch_disabled" };
      }
      const validation = validateInput(input);
      if (!validation.ok) {
        return { error: validation.error, errorCode: "batch_invalid_input" };
      }
      const actions = validation.actions;
      const tools = context.availableTools || deps.defaultTools || [];
      const total = actions.length;

      for (let index = 0; index < total; index += 1) {
        const action = actions[index];
        if (TAB_ID_EXEMPT_TOOLS.has(action.name)) {
          continue;
        }
        const tabId = deps.coerceInput(action.name, action.input, tools)?.tabId;
        if (tabId === undefined || tabId === null) {
          continue;
        }
        try {
          if (context.tabId === undefined) {
            throw new Error("No active tab found; tabId cannot be validated. Call tabs_context_mcp first.");
          }
          await deps.resolveTabId(tabId, context.tabId);
        } catch (error) {
          return failure(items, index, total, actionLabel(action), error instanceof Error ? error.message : String(error), "batch_tab_outside_group");
        }
      }

      let allPriorTrivial = true;
      const itemContext = {
        ...context,
        permissionManager: scopeOnceGrantsToBatch(context.permissionManager, context.toolUseId),
        inBatch: true,
        pendingContextScope: scope,
      };
      for (let index = 0; index < total; index += 1) {
        const action = actions[index];
        const label = actionLabel(action);
        const base = { index, total, name: action.name, input: action.input };
        if (context.isCancelled?.()) {
          const message = "Batch cancelled by user";
          progress({ ...base, status: "error", error: message });
          return failure(items, index, total, label, message, "batch_cancelled");
        }

        const coercedInput = deps.coerceInput(action.name, action.input, tools);
        const preTabId = targetTabIdFor(coercedInput, context.tabId);
        if (await isSessionTab(preTabId, context, deps)) {
          const blocked = await deps.detectBlockedNavigation(preTabId);
          if (blocked) {
            progress({ ...base, status: "error", error: blocked });
            return failure(items, index, total, label, blocked, "batch_domain_blocked");
          }
        }

        const tool = tools.find((candidate) => candidate.name === action.name);
        if (!tool) {
          const message = `unknown tool "${action.name}"`;
          progress({ ...base, status: "error", error: message });
          return failure(items, index, total, label, message, "batch_unknown_tool");
        }

        running = { ...base, status: "running" };
        progress(running);
        const result = await tool.execute(coercedInput, itemContext);

        if (result && typeof result === "object" && "type" in result) {
          const host = result.url ? hostnameOf(result.url) : "";
          const message = host ? `permission_required: ${host}` : "permission_required";
          progress({ ...base, status: "error", error: message });
          running = undefined;
          if (allPriorTrivial && result.url) {
            return result;
          }
          return failure(
            items,
            index,
            total,
            label,
            `${message} — call ${action.name} standalone (not in browser_batch) so the user is prompted`,
            "batch_permission_required",
          );
        }
        if (!result || result.error) {
          const message = result?.error || "Unknown error";
          progress({ ...base, status: "error", error: message });
          running = undefined;
          return failure(items, index, total, label, message, result?.errorCode);
        }

        running = undefined;
        if (result.imageId) {
          mintedImageIds.push(result.imageId);
        }
        // The batch owns blocked-site checks for its items (inner tools skip the
        // runtime guard while inBatch): one check before and one after each item.
        const executedTabId =
          (typeof coercedInput?.tabId === "number" ? coercedInput.tabId : undefined) ??
          result.tabContext?.executedOnTabId ??
          context.tabId;
        if (await isSessionTab(executedTabId, context, deps)) {
          const blocked = await deps.detectBlockedNavigation(executedTabId);
          if (blocked) {
            progress({ ...base, status: "error", error: blocked });
            return failure(items, index, total, label, blocked, "batch_domain_blocked");
          }
        }
        progress({
          ...base,
          status: "ok",
          output: result.output,
          base64Image: result.base64Image,
          imageFormat: result.imageFormat,
        });
        if (result.tabContext) {
          lastTabContext = result.tabContext;
        }
        items.push({
          label,
          output: result.output,
          base64Image: result.base64Image,
          imageFormat: result.imageFormat,
        });
        allPriorTrivial = allPriorTrivial && isTrivialAction(action);
        if (executedTabId !== undefined) {
          await deps.recordStep?.(action.name, coercedInput, executedTabId, result.base64Image);
          if (index < total - 1) {
            await waitForTabSettle(executedTabId, context, deps);
          }
        }
      }

      const tabContext =
        lastTabContext ?? (context.tabId !== undefined ? await deps.getTabContext(context.tabId) : undefined);
      deps.commitPendingContexts?.(scope);
      committed = true;
      return {
        batchItems: items,
        ...(mintedImageIds.length > 0 && { mintedImageIds }),
        tabContext,
      };
    } catch (error) {
      const message = `Failed to execute batch: ${error instanceof Error ? error.message : "Unknown error"} (${items.length} completed)`;
      if (running) {
        progress({ ...running, status: "error", error: message });
      }
      return { error: message, errorCode: "batch_exception", batchItems: summarizeItems(items) };
    } finally {
      // Any exit that doesn't commit drops the batch's screenshots, so a failed or
      // blocked batch can't leave image IDs that a later upload_image could reuse.
      if (!committed) {
        deps.clearPendingContexts?.(scope);
        forgetMintedImages();
      }
    }
  }

  function itemText(item) {
    return `[${item.label}] ${item.output ?? "ok"}`;
  }

  function imageBlock(data, format) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: format ? `image/${format}` : "image/png",
        data,
      },
    };
  }

  // Converts a batch result to tool_result content with text and images interleaved.
  function toToolResultContent(result, options = {}) {
    if (result.error) {
      return result.batchItems?.length
        ? `${result.batchItems.map(itemText).join("\n")}\n\n${result.error}`
        : result.error;
    }
    const blocks = [];
    for (const item of result.batchItems || []) {
      blocks.push({ type: "text", text: itemText(item) });
      if (item.base64Image) {
        blocks.push(imageBlock(item.base64Image, item.imageFormat));
      }
    }
    if (options.formatTabContext && result.tabContext) {
      blocks.push({ type: "text", text: options.formatTabContext(result.tabContext) });
    }
    return blocks.length > 0 ? blocks : "";
  }

  function isBatchResult(result) {
    return !!result && typeof result === "object" && Array.isArray(result.batchItems);
  }

  function shouldAppendSingleCallReminder(toolName, input, state) {
    if (!state?.enabled || !state.isSingleToolTurn || state.isError) {
      return false;
    }
    if (SINGLE_CALL_TOOLS.has(toolName)) {
      return true;
    }
    return toolName === "computer" && SINGLE_CALL_COMPUTER_ACTIONS.has(input?.action);
  }

  function singleCallReminderBlock() {
    return { type: "text", text: `<system-reminder>${SINGLE_CALL_REMINDER}</system-reminder>` };
  }

  function appendSingleCallReminder(content, toolName, input, state) {
    if (!shouldAppendSingleCallReminder(toolName, input, state)) {
      return content;
    }
    const reminder = singleCallReminderBlock();
    if (typeof content === "string") {
      return content ? [{ type: "text", text: content }, reminder] : [reminder];
    }
    return [...(Array.isArray(content) ? content : []), reminder];
  }

  function appendSystemPromptGuidance(prompt, enabled) {
    return enabled && prompt ? `${prompt}\n${SYSTEM_PROMPT_GUIDANCE}` : prompt;
  }

  // Summarizes progress events for the side-panel batch row.
  function summarizeProgress(events, input, toolResult) {
    const actions = Array.isArray(input?.actions) ? input.actions : [];
    const total = actions.length;
    const list = Array.isArray(events) ? events.filter(Boolean) : [];
    const steps = list.length > 0
      ? list
      : actions.map((action, index) => ({
          index,
          total,
          name: action?.name ?? "?",
          input: action?.input ?? {},
          status: toolResult ? (toolResult.is_error ? "error" : "ok") : "running",
        }));
    // Without live events (a reopened panel or a restored session) a failed batch
    // doesn't say how far it got, so its completed count is unknown (null).
    const unknownProgress = list.length === 0 && toolResult?.is_error === true;
    return {
      total,
      completed: unknownProgress ? null : steps.filter((step) => step.status !== "running").length,
      failed: steps.some((step) => step.status === "error") || !!toolResult?.is_error,
      steps,
    };
  }

  return Object.freeze({
    TOOL_NAME,
    ENABLED_STORAGE_KEY,
    DESCRIPTION,
    SYSTEM_PROMPT_GUIDANCE,
    SINGLE_CALL_REMINDER,
    isEnabled,
    toolSchema,
    toolParameters,
    validateInput,
    actionLabel,
    execute,
    toToolResultContent,
    isBatchResult,
    shouldAppendSingleCallReminder,
    appendSingleCallReminder,
    appendSystemPromptGuidance,
    summarizeProgress,
  });
});
