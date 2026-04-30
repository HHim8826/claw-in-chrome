(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.__CLAW_VISUALIZER_CORE__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_CHAT_SCOPE_PREFIX = "claw.chat.scopes.";
  const STAGE_ORDER = ["request", "planning", "execution", "final"];
  const MAX_TEXT_LENGTH = 6000;
  const MAX_JSON_PREVIEW_LENGTH = 1600;
  const TOOL_RESULT_EXTRACT_PREVIEW_LIMIT = 1200;
  const TOOL_RESULT_EXTRACT_FULL_LIMIT = 50000;
  const TOOL_RESULT_TEXT_PREVIEW_LIMIT = 1800;
  const TOOL_RESULT_TEXT_FULL_LIMIT = 50000;
  const TOOL_RESULT_JSON_PREVIEW_LIMIT = 800;
  const TOOL_RESULT_JSON_FULL_LIMIT = 50000;
  const MODAL_COLLAPSE_LINE_LIMIT = 8;
  const MODAL_COLLAPSE_CHAR_LIMIT = 1600;
  const TEXTUAL_BLOCK_TYPES = new Set([
    "text",
    "input_text",
    "output_text",
    "message_text",
    "markdown",
    "output_markdown"
  ]);

  function normalizeSessionScopeId(value) {
    return String(value || "").trim();
  }

  function normalizeNumber(value, fallbackValue) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : Number(fallbackValue || 0);
  }

  function trimText(value, limit) {
    const text = String(value == null ? "" : value);
    const maxLength = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : MAX_TEXT_LENGTH;
    return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
  }

  function stripDisplayArtifacts(value) {
    return String(value || "")
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, " ")
      .replace(/<system-reminder>[\s\S]*$/gi, " ")
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, " ")
      .replace(/<thinking>[\s\S]*$/gi, " ")
      .replace(/\r\n/g, "\n");
  }

  function collapseWhitespace(value) {
    return String(value || "")
      .split("\n")
      .map(function (line) {
        return line.replace(/\s+/g, " ").trim();
      })
      .filter(Boolean)
      .join("\n");
  }

  function cleanDisplayText(value, limit) {
    return trimText(collapseWhitespace(stripDisplayArtifacts(value)), limit);
  }

  function safeJsonValue(value, depth, keyName) {
    const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
    if (value == null) {
      return value;
    }
    if (nextDepth > 5) {
      return "[max-depth]";
    }
    if (typeof value === "string") {
      return trimText(value, 500);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 20).map(function (entry) {
        return safeJsonValue(entry, nextDepth + 1, keyName);
      });
    }
    if (typeof value === "object") {
      const output = {};
      Object.keys(value).slice(0, 24).forEach(function (entryKey) {
        output[entryKey] = safeJsonValue(value[entryKey], nextDepth + 1, entryKey);
      });
      return output;
    }
    return String(value);
  }

  function safeJsonPreview(value, limit) {
    if (value == null || value === "") {
      return "";
    }
    try {
      return trimText(JSON.stringify(safeJsonValue(value, 0, ""), null, 2), limit || MAX_JSON_PREVIEW_LENGTH);
    } catch {
      return trimText(String(value), limit || MAX_JSON_PREVIEW_LENGTH);
    }
  }

  function exactJsonString(value) {
    if (typeof value === "undefined") {
      return "";
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value == null ? "" : value);
    }
  }

  function countLogicalLines(value) {
    const text = String(value || "").trim();
    if (!text) {
      return 0;
    }
    return text.split(/\r?\n/).length;
  }

  function shouldCollapseText(value, context) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (context === "modal") {
      return countLogicalLines(text) > MODAL_COLLAPSE_LINE_LIMIT || text.length > MODAL_COLLAPSE_CHAR_LIMIT;
    }
    const threshold = context === "step" ? 84 : 112;
    return text.length > threshold || text.includes("\n");
  }

  function normalizeSessionMeta(value, fallbackScopeId) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const sessionId = String(value.id || value.sessionId || "").trim();
    if (!sessionId) {
      return null;
    }
    return {
      id: sessionId,
      title: cleanDisplayText(value.title || "", 120),
      preview: cleanDisplayText(value.preview || "", 220),
      createdAt: normalizeNumber(value.createdAt, Date.now()),
      updatedAt: normalizeNumber(value.updatedAt, Date.now()),
      messageCount: Math.max(0, Number(value.messageCount) || 0),
      mode: value.mode === "quick" ? "quick" : "standard",
      selectedModel: cleanDisplayText(value.selectedModel || "", 120),
      scopeId: normalizeSessionScopeId(value.scopeId || fallbackScopeId),
      domain: cleanDisplayText(value.domain || value.currentDomain || "", 120),
      currentUrl: cleanDisplayText(value.currentUrl || "", 360),
      tabTitle: cleanDisplayText(value.tabTitle || "", 120)
    };
  }

  function normalizeRestoreAnchor(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    return {
      scopeId: normalizeSessionScopeId(value.scopeId),
      currentUrl: cleanDisplayText(value.currentUrl || "", 360),
      domain: cleanDisplayText(value.domain || "", 120),
      tabTitle: cleanDisplayText(value.tabTitle || "", 120),
      createdAt: normalizeNumber(value.createdAt, Date.now()),
      sessionId: String(value.sessionId || "").trim()
    };
  }

  function extractPermissionRequired(value, depth) {
    const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
    if (!value || nextDepth > 6) {
      return null;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const match = extractPermissionRequired(entry, nextDepth + 1);
        if (match) {
          return match;
        }
      }
      return null;
    }
    if (typeof value !== "object") {
      return null;
    }
    if (value.type === "permission_required") {
      return {
        type: "permission_required",
        tool: cleanDisplayText(value.tool || "", 120),
        url: cleanDisplayText(value.url || "", 360),
        tool_use_id: String(value.tool_use_id || value.toolUseId || "").trim(),
        actionData: value.actionData || {}
      };
    }
    if ("content" in value) {
      return extractPermissionRequired(value.content, nextDepth + 1);
    }
    if ("error" in value) {
      return extractPermissionRequired(value.error, nextDepth + 1);
    }
    return null;
  }

  function extractImageUrl(value, depth) {
    const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
    if (!value || nextDepth > 6) {
      return "";
    }
    if (typeof value === "string") {
      return /^(https?:|data:)/i.test(value) ? value : "";
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const candidate = extractImageUrl(entry, nextDepth + 1);
        if (candidate) {
          return candidate;
        }
      }
      return "";
    }
    if (typeof value !== "object") {
      return "";
    }
    if (typeof value.image_url === "string") {
      return extractImageUrl(value.image_url, nextDepth + 1);
    }
    if (value.image_url && typeof value.image_url === "object") {
      return extractImageUrl(value.image_url.url, nextDepth + 1);
    }
    if (typeof value.url === "string" && /^(https?:|data:)/i.test(value.url)) {
      return value.url;
    }
    if (typeof value.screenshot === "string" && /^(https?:|data:)/i.test(value.screenshot)) {
      return value.screenshot;
    }
    if (value.source && typeof value.source === "object" && typeof value.source.data === "string") {
      const mediaType = String(value.source.media_type || "image/png").trim() || "image/png";
      return "data:" + mediaType + ";base64," + value.source.data;
    }
    if ("content" in value) {
      return extractImageUrl(value.content, nextDepth + 1);
    }
    return "";
  }

  function extractDisplayText(value, depth, options) {
    const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
    const config = options && typeof options === "object" ? options : {};
    const textLimit = Number.isFinite(Number(config.textLimit)) && Number(config.textLimit) > 0
      ? Number(config.textLimit)
      : TOOL_RESULT_EXTRACT_PREVIEW_LIMIT;
    const fallbackJsonLimit = Number.isFinite(Number(config.fallbackJsonLimit)) && Number(config.fallbackJsonLimit) > 0
      ? Number(config.fallbackJsonLimit)
      : 600;
    if (value == null || nextDepth > 6) {
      return "";
    }
    if (typeof value === "string") {
      return cleanDisplayText(value, textLimit);
    }
    if (Array.isArray(value)) {
      return value
        .map(function (entry) {
          return extractDisplayText(entry, nextDepth + 1, config);
        })
        .filter(Boolean)
        .join("\n\n")
        .trim();
    }
    if (typeof value !== "object") {
      return cleanDisplayText(String(value), textLimit);
    }
    if (typeof value.text === "string") {
      return extractDisplayText(value.text, nextDepth + 1, config);
    }
    if (TEXTUAL_BLOCK_TYPES.has(String(value.type || "")) && typeof value.text === "string") {
      return extractDisplayText(value.text, nextDepth + 1, config);
    }
    if (value.type === "tool_use") {
      const toolName = cleanDisplayText(value.name || "", 120);
      return toolName ? "[Tool] " + toolName : "[Tool]";
    }
    if (value.type === "tool_result") {
      return extractDisplayText(value.content, nextDepth + 1, config);
    }
    if ("content" in value) {
      return extractDisplayText(value.content, nextDepth + 1, config);
    }
    return safeJsonPreview(value, fallbackJsonLimit);
  }

  function normalizeContentBlocks(content) {
    if (typeof content === "string") {
      const text = cleanDisplayText(content, 4000);
      return text ? [{
        type: "text",
        text
      }] : [];
    }
    if (Array.isArray(content)) {
      const output = [];
      content.forEach(function (entry, index) {
        output.push.apply(output, normalizeSingleContentEntry(entry, index));
      });
      return output;
    }
    if (content && typeof content === "object") {
      return normalizeSingleContentEntry(content, 0);
    }
    return [];
  }

  function normalizeSingleContentEntry(entry, index) {
    if (entry == null) {
      return [];
    }
    if (typeof entry === "string") {
      const text = cleanDisplayText(entry, 4000);
      return text ? [{
        type: "text",
        text
      }] : [];
    }
    if (typeof entry !== "object") {
      return [];
    }
    const entryType = String(entry.type || "").trim();
    if (TEXTUAL_BLOCK_TYPES.has(entryType) && typeof entry.text === "string") {
      const text = cleanDisplayText(entry.text, 4000);
      return text ? [{
        type: "text",
        text
      }] : [];
    }
    if (entryType === "tool_use") {
      const toolName = cleanDisplayText(entry.name || "", 120);
      if (!toolName) {
        return [];
      }
      return [{
        type: "tool_use",
        id: String(entry.id || "tool_use_" + String(index)).trim(),
        name: toolName,
        input: entry.input || {},
        approvalPending: !!entry.approval_options || !!entry.approval_key || !!entry.mcp_auth_required || toolName === "AskUserQuestion"
      }];
    }
    if (entryType === "tool_result") {
      const permission = extractPermissionRequired(entry, 0);
      const text = extractDisplayText(entry.content, 0, {
        textLimit: TOOL_RESULT_EXTRACT_PREVIEW_LIMIT,
        fallbackJsonLimit: TOOL_RESULT_JSON_PREVIEW_LIMIT
      });
      const fullText = extractDisplayText(entry.content, 0, {
        textLimit: TOOL_RESULT_EXTRACT_FULL_LIMIT,
        fallbackJsonLimit: TOOL_RESULT_JSON_FULL_LIMIT
      });
      return [{
        type: "tool_result",
        tool_use_id: String(entry.tool_use_id || entry.toolUseId || "").trim(),
        text: cleanDisplayText(text, TOOL_RESULT_TEXT_PREVIEW_LIMIT),
        fullText: cleanDisplayText(fullText, TOOL_RESULT_TEXT_FULL_LIMIT),
        is_error: !!entry.is_error,
        imageUrl: extractImageUrl(entry, 0),
        contentRaw: entry.content,
        permissionRequired: permission,
        rawPreview: safeJsonPreview(entry.content, TOOL_RESULT_JSON_PREVIEW_LIMIT),
        rawFull: exactJsonString(entry.content)
      }];
    }
    if (entryType === "permission_required") {
      const permission = extractPermissionRequired(entry, 0);
      return permission ? [permission] : [];
    }
    if ("content" in entry) {
      return normalizeContentBlocks(entry.content);
    }
    if (typeof entry.text === "string") {
      const text = cleanDisplayText(entry.text, 4000);
      return text ? [{
        type: "text",
        text
      }] : [];
    }
    return [];
  }

  function messageHasUserPrompt(message) {
    if (
      !message ||
      message.role !== "user" ||
      message.isSynthetic === true ||
      message.isSyntheticResult === true ||
      message.isCompactSummary === true
    ) {
      return false;
    }
    return message.blocks.some(function (block) {
      return block.type === "text" && String(block.text || "").trim();
    });
  }

  function normalizeMessage(rawMessage, index) {
    if (!rawMessage || typeof rawMessage !== "object") {
      return null;
    }
    const role = String(rawMessage.role || "").trim().toLowerCase();
    if (!role) {
      return null;
    }
    const blocks = normalizeContentBlocks(rawMessage.content);
    if (blocks.length === 0) {
      return null;
    }
    return {
      id: String(rawMessage.id || "message_" + String(index)).trim(),
      role,
      blocks,
      timestamp: normalizeNumber(rawMessage.timestamp, 0),
      isSynthetic: rawMessage._synthetic === true,
      isSyntheticResult: rawMessage._syntheticResult === true,
      isCompactSummary: rawMessage.isCompactSummary === true,
      isCompactionMessage: rawMessage.isCompactionMessage === true
    };
  }

  function getMessageDisplayText(message) {
    if (!message) {
      return "";
    }
    return message.blocks
      .map(function (block) {
        if (block.type === "text") {
          return cleanDisplayText(block.text, 600);
        }
        if (block.type === "tool_result") {
          return cleanDisplayText(block.text || block.rawPreview || "", 600);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  function buildFallbackSessionTitle(messages) {
    const firstUserMessage = (Array.isArray(messages) ? messages : []).find(messageHasUserPrompt);
    const title = cleanDisplayText(getMessageDisplayText(firstUserMessage), 80);
    return title || "New chat";
  }

  function buildFallbackPreview(messages) {
    const reversed = Array.isArray(messages) ? messages.slice().reverse() : [];
    for (const message of reversed) {
      if (
        message?.isSynthetic === true ||
        message?.isSyntheticResult === true ||
        message?.isCompactSummary === true ||
        message?.isCompactionMessage === true
      ) {
        continue;
      }
      const text = cleanDisplayText(getMessageDisplayText(message), 160);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function normalizeSessionSnapshot(value, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    if (!value || typeof value !== "object") {
      return null;
    }
    const scopeId = normalizeSessionScopeId(value.scopeId || value.meta?.scopeId || normalizedOptions.scopeId);
    const messages = (Array.isArray(value.messages) ? value.messages : [])
      .map(normalizeMessage)
      .filter(Boolean);
    if (messages.length === 0) {
      return null;
    }
    const indexMeta = normalizeSessionMeta(normalizedOptions.indexMeta || null, scopeId);
    const builtMeta = {
      id: String(
        value.meta?.id ||
        value.sessionId ||
        value.id ||
        indexMeta?.id ||
        ""
      ).trim(),
      title: cleanDisplayText(value.meta?.title || indexMeta?.title || buildFallbackSessionTitle(messages), 120),
      preview: cleanDisplayText(value.meta?.preview || indexMeta?.preview || buildFallbackPreview(messages), 220),
      createdAt: normalizeNumber(value.meta?.createdAt || value.createdAt || indexMeta?.createdAt, Date.now()),
      updatedAt: normalizeNumber(value.meta?.updatedAt || value.updatedAt || indexMeta?.updatedAt, Date.now()),
      messageCount: messages.length,
      mode: value.quickMode === true || indexMeta?.mode === "quick" ? "quick" : "standard",
      selectedModel: cleanDisplayText(value.selectedModel || value.meta?.selectedModel || indexMeta?.selectedModel || "", 120),
      scopeId: scopeId || indexMeta?.scopeId || "",
      domain: cleanDisplayText(value.domain || value.meta?.domain || indexMeta?.domain || "", 120),
      currentUrl: cleanDisplayText(value.currentUrl || value.meta?.currentUrl || indexMeta?.currentUrl || "", 360),
      tabTitle: cleanDisplayText(value.tabTitle || value.meta?.tabTitle || indexMeta?.tabTitle || "", 120)
    };
    if (!builtMeta.id || !builtMeta.scopeId) {
      return null;
    }
    return {
      meta: builtMeta,
      messages,
      lastStopReason: value.lastStopReason && typeof value.lastStopReason === "object" ? {
        reason: cleanDisplayText(value.lastStopReason.reason || "", 80),
        messageId: String(value.lastStopReason.messageId || "").trim()
      } : null,
      selectedModel: builtMeta.selectedModel,
      quickMode: builtMeta.mode === "quick",
      scopeId: builtMeta.scopeId,
      domain: builtMeta.domain,
      currentUrl: builtMeta.currentUrl,
      tabTitle: builtMeta.tabTitle
    };
  }

  function extractSessionScopeIds(storageSnapshot, prefix) {
    const storage = storageSnapshot && typeof storageSnapshot === "object" ? storageSnapshot : {};
    const scopePrefix = String(prefix || DEFAULT_CHAT_SCOPE_PREFIX);
    const scopeIds = new Set();
    Object.keys(storage).forEach(function (key) {
      const text = String(key || "");
      if (!text.startsWith(scopePrefix)) {
        return;
      }
      const suffix = text.slice(scopePrefix.length);
      const scopeId = suffix.split(".")[0];
      if (scopeId) {
        scopeIds.add(scopeId);
      }
    });
    return Array.from(scopeIds.values()).sort();
  }

  function normalizeSessionIndexEntries(value, scopeId) {
    return (Array.isArray(value) ? value : [])
      .map(function (entry) {
        return normalizeSessionMeta(entry, scopeId);
      })
      .filter(Boolean)
      .sort(function (left, right) {
        return right.updatedAt - left.updatedAt;
      });
  }

  function splitMessagesIntoTurns(messages) {
    const list = Array.isArray(messages) ? messages : [];
    const turns = [];
    let currentTurn = [];
    let currentTurnHasPrompt = false;

    list.forEach(function (message) {
      const startsNextTurn = messageHasUserPrompt(message) && currentTurnHasPrompt;
      if (startsNextTurn) {
        turns.push(currentTurn);
        currentTurn = [];
        currentTurnHasPrompt = false;
      }
      currentTurn.push(message);
      if (messageHasUserPrompt(message)) {
        currentTurnHasPrompt = true;
      }
    });

    if (currentTurn.length) {
      turns.push(currentTurn);
    }
    return turns;
  }

  function buildTurnEvents(turnMessages, turnIndex) {
    const scopedMessages = Array.isArray(turnMessages) ? turnMessages : [];
    const hasToolUse = scopedMessages.some(function (message) {
      return message.role === "assistant" && message.blocks.some(function (block) {
        return block.type === "tool_use" && block.name !== "turn_answer_start";
      });
    });
    const events = [];
    const hiddenBoundaryToolUseIds = new Set();
    let reachedFinalAnswer = false;
    let sawExecution = false;
    scopedMessages.forEach(function (message, messageIndex) {
      const ignoreSpecialUserText = message.role === "user" && (
        message.isSynthetic === true ||
        message.isSyntheticResult === true ||
        message.isCompactSummary === true
      );
      const ignoreSpecialAssistantText = message.role === "assistant" && message.isCompactionMessage === true;
      message.blocks.forEach(function (block, blockIndex) {
        if (message.role === "assistant" && block.type === "tool_use" && block.name === "turn_answer_start") {
          const boundaryToolUseId = String(block.id || "").trim();
          if (boundaryToolUseId) {
            hiddenBoundaryToolUseIds.add(boundaryToolUseId);
          }
          reachedFinalAnswer = true;
          events.push({
            id: "turn_" + String(turnIndex) + "_answer_start_" + messageIndex + "_" + blockIndex,
            type: "turn_boundary",
            stage: "final",
            label: "turn_answer_start"
          });
          return;
        }

        if (block.type === "text") {
          if (ignoreSpecialUserText || ignoreSpecialAssistantText) {
            return;
          }
          const text = cleanDisplayText(block.text, 2000);
          if (!text) {
            return;
          }
          let stage = "planning";
          let type = "assistant_text";
          if (message.role === "user") {
            stage = "request";
            type = "user_text";
          } else if (!hasToolUse) {
            stage = "final";
            type = "final_answer";
          } else if (reachedFinalAnswer) {
            stage = "final";
            type = "final_answer";
          } else if (sawExecution) {
            stage = "execution";
          }
          events.push({
            id: message.id + "_text_" + blockIndex,
            type,
            stage,
            text,
            role: message.role
          });
          return;
        }

        if (block.type === "tool_use") {
          sawExecution = true;
          events.push({
            id: block.id || message.id + "_tool_" + blockIndex,
            type: "tool_use",
            stage: "execution",
            toolUseId: String(block.id || "").trim(),
            toolName: cleanDisplayText(block.name || "", 120),
            input: block.input || {},
            waitingForInput: block.approvalPending === true
          });
          return;
        }

        if (block.type === "tool_result") {
          const toolUseId = String(block.tool_use_id || "").trim();
          if (hiddenBoundaryToolUseIds.has(toolUseId)) {
            return;
          }
          sawExecution = true;
          if (block.permissionRequired) {
            events.push({
              id: (toolUseId || message.id + "_permission_" + blockIndex) + "_permission",
              type: "permission_required",
              stage: "execution",
              toolUseId: block.permissionRequired.tool_use_id || toolUseId,
              toolName: block.permissionRequired.tool || "Permission required",
              url: block.permissionRequired.url || "",
              actionData: block.permissionRequired.actionData || {},
              actionDataPreview: safeJsonPreview(block.permissionRequired.actionData, 600)
            });
            return;
          }
          events.push({
            id: (toolUseId || message.id + "_result_" + blockIndex) + "_result",
            type: "tool_result",
            stage: "execution",
            toolUseId,
            text: cleanDisplayText(block.text || block.rawPreview || "", TOOL_RESULT_TEXT_PREVIEW_LIMIT),
            fullText: cleanDisplayText(block.fullText || block.rawFull || block.text || block.rawPreview || "", TOOL_RESULT_TEXT_FULL_LIMIT),
            isError: block.is_error === true,
            imageUrl: block.imageUrl || "",
            contentRaw: typeof block.contentRaw === "undefined" ? null : block.contentRaw,
            rawPreview: block.rawPreview || "",
            rawFull: block.rawFull || ""
          });
          return;
        }

        if (block.type === "permission_required") {
          sawExecution = true;
          events.push({
            id: message.id + "_permission_" + blockIndex,
            type: "permission_required",
            stage: "execution",
            toolUseId: String(block.tool_use_id || "").trim(),
            toolName: cleanDisplayText(block.tool || "Permission required", 120),
            url: cleanDisplayText(block.url || "", 360),
            actionData: block.actionData || {},
            actionDataPreview: safeJsonPreview(block.actionData, 600)
          });
        }
      });
    });
    return events;
  }

  function buildSequentialEvents(messages) {
    const turns = splitMessagesIntoTurns(messages);
    const events = turns.reduce(function (output, turnMessages, turnIndex) {
      return output.concat(buildTurnEvents(turnMessages, turnIndex));
    }, []);
    return pairToolEvents(events);
  }

  function pairToolEvents(events) {
    const toolResultsById = new Map();
    (Array.isArray(events) ? events : []).forEach(function (event) {
      if ((event.type === "tool_result" || event.type === "permission_required") && event.toolUseId) {
        toolResultsById.set(event.toolUseId, event);
      }
    });
    return (Array.isArray(events) ? events : []).map(function (event, index) {
      const sequence = index + 1;
      if (event.type !== "tool_use") {
        return {
          ...event,
          sequence
        };
      }
      const matchedResult = event.toolUseId ? toolResultsById.get(event.toolUseId) : null;
      return {
        ...event,
        sequence,
        hasResult: !!matchedResult,
        resultType: matchedResult ? matchedResult.type : "",
        resultSummary: matchedResult
          ? matchedResult.type === "permission_required"
            ? "Permission required"
            : cleanDisplayText(matchedResult.text || "", 160)
          : "",
        resultSummaryFull: matchedResult
          ? matchedResult.type === "permission_required"
            ? "Permission required"
            : (matchedResult.fullText || matchedResult.rawFull || matchedResult.text || matchedResult.rawPreview || "")
          : "",
        pending: !matchedResult
      };
    });
  }

  function buildStagesFromEvents(events) {
    const stageDefinitions = {
      request: {
        id: "request",
        eventCount: 0,
        events: []
      },
      planning: {
        id: "planning",
        eventCount: 0,
        events: []
      },
      execution: {
        id: "execution",
        eventCount: 0,
        events: []
      },
      final: {
        id: "final",
        eventCount: 0,
        events: []
      }
    };
    (Array.isArray(events) ? events : []).forEach(function (event) {
      const stage = stageDefinitions[event.stage];
      if (!stage || event.type === "turn_boundary") {
        return;
      }
      stage.events.push(event);
      stage.eventCount += 1;
    });
    return STAGE_ORDER.map(function (stageId) {
      return stageDefinitions[stageId];
    });
  }

  function pickCurrentEvent(events, status) {
    const visibleEvents = (Array.isArray(events) ? events : []).filter(function (event) {
      return event && event.type !== "turn_boundary";
    });
    if (visibleEvents.length === 0) {
      return null;
    }

    function findLast(predicate) {
      for (let index = visibleEvents.length - 1; index >= 0; index -= 1) {
        if (predicate(visibleEvents[index])) {
          return visibleEvents[index];
        }
      }
      return null;
    }

    if (status === "running") {
      return (
        findLast(function (event) {
          return event.type === "permission_required";
        }) ||
        findLast(function (event) {
          return event.type === "tool_use" && event.pending === true;
        }) ||
        findLast(function (event) {
          return event.stage === "execution";
        }) ||
        visibleEvents[visibleEvents.length - 1]
      );
    }

    return (
      findLast(function (event) {
        return event.type === "final_answer";
      }) ||
      findLast(function (event) {
        return event.stage === "final";
      }) ||
      findLast(function (event) {
        return event.stage === "execution";
      }) ||
      visibleEvents[visibleEvents.length - 1]
    );
  }

  function resolveCurrentStageId(stages, currentEvent) {
    if (currentEvent?.stage) {
      return currentEvent.stage;
    }
    const activeStage = (Array.isArray(stages) ? stages : []).find(function (stage) {
      return Array.isArray(stage?.events) && stage.events.length > 0;
    });
    return activeStage?.id || STAGE_ORDER[0];
  }

  function deriveRunStatus(snapshot, events, isActiveSource) {
    const eventList = Array.isArray(events) ? events : [];
    const hasFinalAnswer = eventList.some(function (event) {
      return event.type === "final_answer" && String(event.text || "").trim();
    });
    const pendingTool = eventList.some(function (event) {
      return event.type === "tool_use" && event.pending === true;
    });
    const pendingPermission = eventList.some(function (event) {
      return event.type === "permission_required";
    });
    if (pendingTool || pendingPermission) {
      return "running";
    }
    if (isActiveSource && !hasFinalAnswer) {
      return "running";
    }
    if (snapshot?.lastStopReason?.reason === "cancelled") {
      return "completed";
    }
    return "completed";
  }

  function buildVisualizerRun(snapshot, context) {
    const normalizedContext = context && typeof context === "object" ? context : {};
    if (!snapshot || !snapshot.meta) {
      return null;
    }
    const events = buildSequentialEvents(snapshot.messages);
    const stages = buildStagesFromEvents(events);
    const restoreAnchor = normalizeRestoreAnchor(normalizedContext.restoreAnchor);
    const status = deriveRunStatus(snapshot, events, normalizedContext.active === true);
    const currentEvent = pickCurrentEvent(events, status);
    const currentStageId = resolveCurrentStageId(stages, currentEvent);
    return {
      meta: {
        scopeId: snapshot.meta.scopeId,
        sessionId: snapshot.meta.id,
        title: snapshot.meta.title || "Claw run",
        model: snapshot.meta.selectedModel || snapshot.selectedModel || "",
        mode: snapshot.meta.mode || (snapshot.quickMode ? "quick" : "standard"),
        url: snapshot.meta.currentUrl || snapshot.currentUrl || restoreAnchor?.currentUrl || "",
        domain: snapshot.meta.domain || snapshot.domain || restoreAnchor?.domain || "",
        tabTitle: snapshot.meta.tabTitle || snapshot.tabTitle || restoreAnchor?.tabTitle || "",
        updatedAt: snapshot.meta.updatedAt,
        createdAt: snapshot.meta.createdAt,
        status,
        currentStageId,
        currentEventId: currentEvent?.id || "",
        currentEventType: currentEvent?.type || "",
        source: normalizedContext.source || "recent",
        active: normalizedContext.active === true,
        lastStopReason: snapshot.lastStopReason || null
      },
      currentEvent: currentEvent || null,
      stages,
      events,
      snapshot
    };
  }

  function dedupeRunCandidates(candidates) {
    const output = [];
    const seen = new Set();
    (Array.isArray(candidates) ? candidates : []).forEach(function (entry) {
      if (!entry || !entry.run?.meta?.scopeId || !entry.run?.meta?.sessionId) {
        return;
      }
      const key = entry.run.meta.scopeId + "::" + entry.run.meta.sessionId;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      output.push(entry);
    });
    return output;
  }

  function collectRunCandidates(storageSnapshot, options) {
    const storage = storageSnapshot && typeof storageSnapshot === "object" ? storageSnapshot : {};
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const prefix = String(normalizedOptions.prefix || DEFAULT_CHAT_SCOPE_PREFIX);
    const scopeIds = extractSessionScopeIds(storage, prefix);
    const candidates = [];

    scopeIds.forEach(function (scopeId) {
      const storagePrefix = prefix + scopeId;
      const restoreAnchor = normalizeRestoreAnchor(storage[storagePrefix + ".restoreAnchor"]);
      const indexEntries = normalizeSessionIndexEntries(storage[storagePrefix + ".index"], scopeId);
      const activeSnapshot = normalizeSessionSnapshot(storage[storagePrefix + ".activeSession"], {
        scopeId,
        indexMeta: indexEntries[0] || null
      });
      if (activeSnapshot) {
        const activeRun = buildVisualizerRun(activeSnapshot, {
          restoreAnchor,
          source: "active",
          active: true
        });
        if (activeRun) {
          candidates.push({
            priority: 3,
            updatedAt: activeRun.meta.updatedAt,
            run: activeRun
          });
        }
      }

      indexEntries.forEach(function (entry) {
        const snapshot = normalizeSessionSnapshot(storage[storagePrefix + ".byId." + entry.id], {
          scopeId,
          indexMeta: entry
        }) || (activeSnapshot && activeSnapshot.meta.id === entry.id ? activeSnapshot : null);
        if (!snapshot) {
          return;
        }
        const recentRun = buildVisualizerRun(snapshot, {
          restoreAnchor,
          source: "recent",
          active: false
        });
        if (!recentRun) {
          return;
        }
        candidates.push({
          priority: 2,
          updatedAt: recentRun.meta.updatedAt,
          run: recentRun
        });
      });
    });

    return dedupeRunCandidates(candidates).sort(function (left, right) {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return right.updatedAt - left.updatedAt;
    });
  }

  function getRunDisplayUrl(run) {
    return cleanDisplayText(
      run?.meta?.url ||
      run?.meta?.domain ||
      run?.snapshot?.meta?.currentUrl ||
      run?.snapshot?.meta?.domain ||
      run?.meta?.scopeId ||
      "",
      240
    );
  }

  function getRunDisplayTitle(run) {
    return cleanDisplayText(
      run?.meta?.title ||
      run?.snapshot?.meta?.title ||
      run?.meta?.tabTitle ||
      getRunDisplayUrl(run) ||
      "Claw run",
      120
    );
  }

  function getRunDisplayPreview(run) {
    return cleanDisplayText(
      run?.snapshot?.meta?.preview ||
      run?.meta?.tabTitle ||
      run?.meta?.url ||
      run?.meta?.domain ||
      "",
      220
    );
  }

  function buildSessionListEntry(run) {
    return {
      scopeId: run.meta.scopeId,
      sessionId: run.meta.sessionId,
      title: getRunDisplayTitle(run),
      preview: getRunDisplayPreview(run),
      updatedAt: run.meta.updatedAt,
      createdAt: run.meta.createdAt,
      model: cleanDisplayText(run.meta.model || "", 120),
      source: run.meta.source,
      active: run.meta.active === true,
      status: run.meta.status,
      stageId: run.meta.currentStageId,
      url: getRunDisplayUrl(run),
      domain: cleanDisplayText(run.meta.domain || "", 120),
      tabTitle: cleanDisplayText(run.meta.tabTitle || "", 120),
      messageCount: Math.max(0, Number(run?.snapshot?.meta?.messageCount) || 0)
    };
  }

  function collectVisualizerSessionGroups(storageSnapshot, options) {
    const candidates = collectRunCandidates(storageSnapshot, options);
    const groups = new Map();

    candidates.forEach(function (candidate) {
      const run = candidate?.run;
      const scopeId = normalizeSessionScopeId(run?.meta?.scopeId);
      if (!run || !scopeId) {
        return;
      }
      const entry = buildSessionListEntry(run);
      if (!groups.has(scopeId)) {
        groups.set(scopeId, {
          scopeId,
          title: cleanDisplayText(getRunDisplayUrl(run) || getRunDisplayTitle(run), 240) || scopeId,
          subtitle: cleanDisplayText(
            run?.meta?.tabTitle ||
            run?.meta?.title ||
            run?.snapshot?.meta?.preview ||
            "",
            220
          ),
          updatedAt: run.meta.updatedAt,
          selectedModel: cleanDisplayText(run.meta.model || "", 120),
          activeSessionId: run.meta.active ? run.meta.sessionId : "",
          sessionCount: 0,
          entries: []
        });
      }
      const group = groups.get(scopeId);
      group.entries.push(entry);
      group.sessionCount = group.entries.length;
      if (entry.updatedAt > group.updatedAt) {
        group.updatedAt = entry.updatedAt;
      }
      if (entry.active) {
        group.activeSessionId = entry.sessionId;
      }
    });

    return Array.from(groups.values()).map(function (group) {
      group.entries.sort(function (left, right) {
        if (left.active !== right.active) {
          return left.active ? -1 : 1;
        }
        return right.updatedAt - left.updatedAt;
      });
      const latest = group.entries[0] || null;
      return {
        ...group,
        title: cleanDisplayText(group.title || latest?.url || latest?.title || group.scopeId, 240) || group.scopeId,
        subtitle: cleanDisplayText(group.subtitle || latest?.title || latest?.preview || "", 220),
        selectedModel: cleanDisplayText(group.selectedModel || latest?.model || "", 120),
        latestSessionId: latest?.sessionId || "",
        latestTitle: latest?.title || "",
        latestPreview: latest?.preview || "",
        entries: group.entries
      };
    }).sort(function (left, right) {
      return right.updatedAt - left.updatedAt;
    });
  }

  function selectVisualizerRun(storageSnapshot, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const requestedScopeId = normalizeSessionScopeId(normalizedOptions.scopeId);
    const requestedSessionId = String(normalizedOptions.sessionId || "").trim();
    const candidates = collectRunCandidates(storageSnapshot, normalizedOptions);
    if (requestedScopeId && requestedSessionId) {
      const exactMatch = candidates.find(function (candidate) {
        return candidate.run.meta.scopeId === requestedScopeId && candidate.run.meta.sessionId === requestedSessionId;
      })?.run || null;
      if (exactMatch) {
        return exactMatch;
      }
      const scopeFallback = candidates.find(function (candidate) {
        return candidate.run.meta.scopeId === requestedScopeId;
      })?.run || null;
      if (scopeFallback) {
        return scopeFallback;
      }
    }
    if (requestedScopeId) {
      return candidates.find(function (candidate) {
        return candidate.run.meta.scopeId === requestedScopeId;
      })?.run || null;
    }
    return candidates[0]?.run || null;
  }

  function applyStorageChanges(storageSnapshot, changes) {
    const current = storageSnapshot && typeof storageSnapshot === "object" ? {
      ...storageSnapshot
    } : {};
    Object.entries(changes || {}).forEach(function (_ref) {
      const key = _ref[0];
      const change = _ref[1];
      if (!change || typeof change !== "object") {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(change, "newValue")) {
        if (typeof change.newValue === "undefined") {
          delete current[key];
        } else {
          current[key] = change.newValue;
        }
      }
    });
    return current;
  }

  function getChangedScopeIds(changes, prefix) {
    const scopePrefix = String(prefix || DEFAULT_CHAT_SCOPE_PREFIX);
    const scopeIds = new Set();
    Object.keys(changes || {}).forEach(function (key) {
      const text = String(key || "");
      if (!text.startsWith(scopePrefix)) {
        return;
      }
      const scopeId = text.slice(scopePrefix.length).split(".")[0];
      if (scopeId) {
        scopeIds.add(scopeId);
      }
    });
    return Array.from(scopeIds.values()).sort();
  }

  function parseVisualizerQuery(search) {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return {
      scopeId: normalizeSessionScopeId(params.get("scopeId") || ""),
      sessionId: String(params.get("sessionId") || "").trim(),
      locale: String(params.get("locale") || "").trim()
    };
  }

  return {
    DEFAULT_CHAT_SCOPE_PREFIX,
    applyStorageChanges,
    buildSequentialEvents,
    buildStagesFromEvents,
    buildVisualizerRun,
    cleanDisplayText,
    collectVisualizerSessionGroups,
    collectRunCandidates,
    countLogicalLines,
    extractSessionScopeIds,
    getChangedScopeIds,
    normalizeSessionSnapshot,
    pickCurrentEvent,
    pairToolEvents,
    parseVisualizerQuery,
    exactJsonString,
    safeJsonPreview,
    shouldCollapseText,
    selectVisualizerRun
  };
});
