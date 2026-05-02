(function () {
  const core = globalThis.__CLAW_VISUALIZER_CORE__;
  const root = document.getElementById("app");
  if (!core || !root || !globalThis.chrome?.storage?.local) {
    return;
  }
  const i18nShared =
    globalThis.__CP_I18N_SHARED__ ||
    globalThis.__CP_GITHUB_UPDATE_SHARED__ ||
    {};
  const DEFAULT_STRINGS = {
    htmlLang: "en-US",
    pageTitle: "Claw Visualizer",
    pageEyebrow: "Real session visualizer",
    pageHeading: "Real execution flow",
    pageSubtitle:
      "Map the current local session into the real flow between the model, the Claw runtime, and browser tools.",
    liveRunning: "Live monitoring",
    liveCompleted: "Most recent local session",
    liveEmpty: "No visualized run yet",
    lanes: {
      assistant: "Model / Assistant",
      runtime: "Claw in Chrome",
      tools: "Browser Tools / Tools",
    },
    stageTitle: {
      request: "Request",
      planning: "Planning / Preparation",
      execution: "Tool execution",
      final: "Final answer",
    },
    source: {
      active: "Current activeSession",
      recent: "Most recent local session",
    },
    status: {
      running: "Running",
      completed: "Completed",
    },
    layout: {
      sequenceTitle: "Execution stage",
      sequenceSubtitle: "Click any node to inspect real details.",
      runtimeTitle: "Runtime panel",
      runtimeSubtitle:
        "The right side keeps a terminal-like summary and step list instead of expanding every detail inline.",
      stepsTitle: "Step rail",
      stepsHint: "Click any node to inspect details.",
      nodeListTitle: "Step nodes",
      nodeListHint: "Move the node rail into the sidebar for vertical browsing.",
      loadedTitle: "Loaded conversation",
      loadedHint: "The local conversation currently visualized here.",
      detailButton: "View details",
      prev: "Previous",
      next: "Next",
      current: "Current step",
      terminalSource: "Real session",
      emptyNodes:
        "There are not enough events in this session to render the sequence yet.",
    },
    sessions: {
      groupsTitle: "Sessions",
      groupsHint:
        "Show local sessions in reverse chronological order and switch the current visualization directly.",
      groupsEmpty: "No local sessions yet",
      historyTitle: "Group history",
      historyHint:
        "Click a saved session to switch the current visualization.",
      historyEmpty: "There are no loadable sessions in this group yet.",
      backToGroups: "Back to list",
      browserTitle: "Load sessions",
      browserHint:
        "Browse local sessions in reverse chronological order and switch the current flow immediately.",
      browserOpen: "Load sessions",
      browserClose: "Close",
      browserCurrent: "Current run",
      groupSessions: "{count} sessions",
      messageCount: "{count} messages",
      active: "Live",
      recent: "Updated",
      selected: "Current",
      open: "Open",
    },
    badge: {
      input: "INPUT",
      request: "REQUEST",
      assistant: "ASSISTANT",
      toolCall: "TOOL_CALL",
      toolResult: "TOOL_RESULT",
      permission: "PERMISSION",
      final: "FINAL",
    },
    node: {
      userInput: "User input",
      requestToModel: "Request model",
      assistantResponse: "Assistant response",
      toolCall: "Assistant requests tool",
      toolResult: "Tool result",
      permission: "Permission required",
      final: "Final answer",
    },
    derivedRequestSummary: {
      user_text: "Send the first model request with the user prompt attached.",
      tool_result:
        "Send the next model request with the latest tool result attached.",
      permission_required:
        "Model execution continues only after approval is resolved.",
      default: "Bundle the current context and request the model again.",
    },
    meta: {
      source: "Source",
      status: "Status",
      model: "Model",
      site: "Site",
      updatedAt: "Updated",
      selectedStep: "Selected step",
      stage: "Stage",
    },
    modal: {
      close: "Close",
      content: "Content",
      summary: "Summary",
      payload: "Arguments / JSON",
      result: "Result",
      resultJson: "Result / JSON",
      screenshot: "Screenshot",
      note: "Notes",
      source: "Source",
      tool: "Tool",
      stage: "Stage",
      derived:
        "This request boundary is inferred from the real session timeline to show when Claw sends the accumulated context back to the model. It is not a separately stored raw message.",
    },
    summaryToggle: {
      expand: "Expand",
      collapse: "Collapse",
    },
    emptyTitle: "No visualizable run yet",
    emptyBody: "",
    footerNote: "Please start a session before returning to this page.",
    stepCounter: "{current}/{total}",
    noSummary: "Waiting for more real session data…",
  };

  const LANE_POSITIONS = {
    assistant: 16.666,
    runtime: 50,
    tools: 83.333
  };
  const uiContract = globalThis.__CP_CONTRACT__?.ui || {};
  const PREFERRED_LOCALE_STORAGE_KEY = uiContract.PREFERRED_LOCALE_STORAGE_KEY || "preferred_locale";

  const initialQuery = core.parseVisualizerQuery(globalThis.location?.search || "");

  const state = {
    localeKey: "",
    loadedLocaleKey: "",
    strings: cloneStrings(DEFAULT_STRINGS),
    storageSnapshot: {},
    run: null,
    sessionGroups: [],
    presentation: null,
    selectedNodeId: "",
    modalNodeId: "",
    sessionBrowserOpen: false,
    expandedModalPayloadId: "",
    expandedModalResultId: "",
    currentRunKey: "",
    query: initialQuery
  };

  function normalizeLocaleTag(value) {
    if (typeof i18nShared.normalizeUiLocaleTag === "function") {
      return i18nShared.normalizeUiLocaleTag(value);
    }
    const locale = String(value || "").trim().toLowerCase();
    if (!locale) {
      return "";
    }
    return locale.startsWith("zh") ? "zh-CN" : "en-US";
  }

  function cloneStrings(value) {
    if (typeof i18nShared.cloneLocaleValue === "function") {
      return i18nShared.cloneLocaleValue(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function getLocaleKey(options) {
    const settings = options && typeof options === "object" ? options : {};
    const preferredLocale = normalizeLocaleTag(settings.preferredLocale);
    if (preferredLocale) {
      return preferredLocale;
    }
    const hintLocale = normalizeLocaleTag(settings.hintLocale);
    if (hintLocale) {
      return hintLocale;
    }
    return normalizeLocaleTag(navigator.language) || "en-US";
  }

  async function ensureStrings(localeTag) {
    const nextLocaleTag = getLocaleKey({
      preferredLocale: localeTag,
      hintLocale: state.query?.locale
    });
    if (nextLocaleTag === state.loadedLocaleKey && state.strings) {
      return false;
    }
    if (typeof i18nShared.resolveCustomI18nSection === "function") {
      state.strings = await i18nShared.resolveCustomI18nSection(
        "visualizer",
        nextLocaleTag,
        DEFAULT_STRINGS,
      );
    } else {
      state.strings = cloneStrings(DEFAULT_STRINGS);
    }
    state.localeKey = nextLocaleTag;
    state.loadedLocaleKey = nextLocaleTag;
    return true;
  }

  function refreshLocaleStrings(localeTag) {
    Promise.resolve(ensureStrings(localeTag))
      .catch(function () {})
      .then(function () {
        if (state.storageSnapshot && Object.keys(state.storageSnapshot).length) {
          recomputeRun();
          return;
        }
        renderEmptyState();
      });
  }

  function applyLocalePreference(preferredLocale) {
    const nextLocaleKey = getLocaleKey({
      preferredLocale,
      hintLocale: state.query?.locale
    });
    if (nextLocaleKey === state.localeKey && state.strings) {
      return false;
    }
    state.localeKey = nextLocaleKey;
    refreshLocaleStrings(nextLocaleKey);
    return true;
  }

  async function readPreferredLocaleTag() {
    try {
      const stored = await chrome.storage.local.get(PREFERRED_LOCALE_STORAGE_KEY);
      return normalizeLocaleTag(stored[PREFERRED_LOCALE_STORAGE_KEY]);
    } catch {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeImageUrl(value) {
    const text = String(value || "").trim();
    return /^(https?:|data:)/i.test(text) ? text : "";
  }

  function clampText(value, limit) {
    const text = String(value || "").trim();
    const max = Number.isFinite(Number(limit)) ? Number(limit) : 140;
    if (!text) {
      return "";
    }
    return text.length > max ? text.slice(0, Math.max(0, max - 1)).trimEnd() + "…" : text;
  }

  function interpolate(template, values) {
    return String(template || "").replace(/\{(\w+)\}/g, function (_, key) {
      return values && values[key] != null ? String(values[key]) : "";
    });
  }

  function formatDateTime(value) {
    const timeValue = Number(value);
    if (!Number.isFinite(timeValue) || timeValue <= 0) {
      return "—";
    }
    try {
      return new Intl.DateTimeFormat(state.strings.htmlLang, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date(timeValue));
    } catch {
      return new Date(timeValue).toLocaleString();
    }
  }

  function getChatScopePrefix() {
    return globalThis.__CP_CONTRACT__?.session?.CHAT_SCOPE_PREFIX || core.DEFAULT_CHAT_SCOPE_PREFIX;
  }

  function getRunSite(run) {
    return run?.meta?.url || run?.meta?.domain || run?.meta?.tabTitle || "—";
  }

  function getStageLabel(stageId) {
    return state.strings.stageTitle[stageId] || stageId || "—";
  }

  function buildQueryHref(scopeId, sessionId, locale) {
    const params = new URLSearchParams();
    const normalizedScopeId = String(scopeId || "").trim();
    const normalizedSessionId = String(sessionId || "").trim();
    const normalizedLocale = String(locale || "").trim();
    if (normalizedScopeId) {
      params.set("scopeId", normalizedScopeId);
    }
    if (normalizedSessionId) {
      params.set("sessionId", normalizedSessionId);
    }
    if (normalizedLocale) {
      params.set("locale", normalizedLocale);
    }
    const query = params.toString();
    const pathname = globalThis.location?.pathname || "/visualizer/visualizer.html";
    return pathname + (query ? "?" + query : "");
  }

  function syncQueryWithSelection(scopeId, sessionId) {
    state.query = {
      scopeId: String(scopeId || "").trim(),
      sessionId: String(sessionId || "").trim(),
      locale: String(state.query?.locale || "").trim()
    };
    const nextHref = buildQueryHref(state.query.scopeId, state.query.sessionId, state.query.locale);
    if (globalThis.history?.replaceState && nextHref !== ((globalThis.location?.pathname || "") + (globalThis.location?.search || ""))) {
      globalThis.history.replaceState(null, "", nextHref);
    }
  }

  function getSelectedSessionGroup() {
    const currentScopeId = String(state.run?.meta?.scopeId || state.query.scopeId || "").trim();
    return state.sessionGroups.find(function (group) {
      return String(group?.scopeId || "").trim() === currentScopeId;
    }) || null;
  }

  function getSelectedGroupEntries() {
    return Array.isArray(getSelectedSessionGroup()?.entries) ? getSelectedSessionGroup().entries : [];
  }

  function getAllSessionEntries() {
    const entries = [];
    state.sessionGroups.forEach(function (group) {
      (group?.entries || []).forEach(function (entry) {
        entries.push({
          ...entry,
          groupTitle: group?.title || "",
          groupSubtitle: group?.subtitle || ""
        });
      });
    });
    entries.sort(function (left, right) {
      const updatedDiff = Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0);
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
      if (!!left?.active !== !!right?.active) {
        return left?.active ? -1 : 1;
      }
      return Number(right?.createdAt || 0) - Number(left?.createdAt || 0);
    });
    return entries;
  }

  function getDirectNodeForCurrentEvent(nodes, currentEventId) {
    return (Array.isArray(nodes) ? nodes : []).find(function (node) {
      return node.sourceEventId && node.sourceEventId === currentEventId;
    }) || null;
  }

  function buildSimulatorPresentation(run) {
    const events = Array.isArray(run?.events)
      ? run.events.filter(function (event) {
        return event && event.type !== "turn_boundary";
      })
      : [];
    const toolUseById = new Map();
    events.forEach(function (event) {
      if (event.type === "tool_use" && event.toolUseId) {
        toolUseById.set(event.toolUseId, event);
      }
    });

    const nodes = [];
    let pendingRequestTrigger = null;

    function pushNode(node) {
      if (!node) {
        return;
      }
      nodes.push({
        ...node,
        index: nodes.length + 1
      });
    }

    events.forEach(function (event) {
      if (event.type === "user_text") {
        pushNode({
          id: "node_" + event.id,
          sourceEventId: event.id,
          sourceEventType: event.type,
          stageId: event.stage,
          badge: state.strings.badge.input,
          title: state.strings.node.userInput,
          summary: event.text || state.strings.noSummary,
          detailTitle: state.strings.node.userInput,
          laneBadge: state.strings.lanes.runtime,
          fromLane: "runtime",
          toLane: "runtime",
          placement: "self",
          tone: "input",
          text: event.text || "",
          summaryDetail: event.text || state.strings.noSummary,
          payloadPreview: "",
          payloadFull: "",
          resultPreview: event.text || "",
          resultFull: event.text || "",
          note: "",
          imageUrl: "",
          derived: false
        });
        pendingRequestTrigger = event;
        return;
      }

      if (event.type === "tool_result") {
        const toolName = toolUseById.get(event.toolUseId || "")?.toolName || state.strings.node.toolResult;
        pushNode({
          id: "node_" + event.id,
          sourceEventId: event.id,
          sourceEventType: event.type,
          stageId: event.stage,
          badge: state.strings.badge.toolResult,
          title: toolName,
          summary: event.text || event.rawPreview || state.strings.noSummary,
          detailTitle: state.strings.node.toolResult,
          laneBadge: state.strings.lanes.tools,
          fromLane: "tools",
          toLane: "runtime",
          placement: "between-right",
          tone: event.isError ? "error" : "result",
          text: event.text || event.rawPreview || "",
          summaryDetail: event.rawFull || event.fullText || event.text || event.rawPreview || state.strings.noSummary,
          payloadPreview: "",
          payloadFull: "",
          resultPreview: event.rawPreview || event.text || "",
          resultFull: event.rawFull || event.fullText || event.rawPreview || event.text || "",
          note: event.isError ? "Tool returned an error result." : "",
          imageUrl: event.imageUrl || "",
          derived: false
        });
        pendingRequestTrigger = event;
        return;
      }

      if (event.type === "permission_required") {
        pushNode({
          id: "node_" + event.id,
          sourceEventId: event.id,
          sourceEventType: event.type,
          stageId: event.stage,
          badge: state.strings.badge.permission,
          title: event.toolName || state.strings.node.permission,
          summary: event.url || event.actionDataPreview || state.strings.noSummary,
          detailTitle: state.strings.node.permission,
          laneBadge: state.strings.lanes.tools,
          fromLane: "tools",
          toLane: "runtime",
          placement: "between-right",
          tone: "permission",
          text: event.url || "",
          summaryDetail: core.exactJsonString(event.actionData) || event.actionDataPreview || event.url || state.strings.noSummary,
          payloadPreview: core.exactJsonString(event.actionData) || event.actionDataPreview || "",
          payloadFull: core.exactJsonString(event.actionData) || event.actionDataPreview || "",
          resultPreview: "",
          resultFull: "",
          note: "",
          imageUrl: "",
          derived: false
        });
        pendingRequestTrigger = null;
        return;
      }

      if (event.type === "assistant_text" || event.type === "tool_use" || event.type === "final_answer") {
        if (pendingRequestTrigger) {
          pushNode(buildDerivedRequestNode(pendingRequestTrigger, event));
          pendingRequestTrigger = null;
        }
        pushNode(buildAssistantFacingNode(event));
      }
    });

    return {
      nodes,
      currentNodeId: getDirectNodeForCurrentEvent(nodes, run?.meta?.currentEventId)?.id || ""
    };
  }

  function getEventFullDetailText(event) {
    if (!event || typeof event !== "object") {
      return "";
    }
    const actionData = event.actionData;
    const hasActionData = Array.isArray(actionData)
      ? actionData.length > 0
      : !!(actionData && typeof actionData === "object" && Object.keys(actionData).length);
    if (hasActionData) {
      return core.exactJsonString(actionData);
    }
    return String(
      event.resultSummaryFull ||
      event.rawFull ||
      event.fullText ||
      event.text ||
      event.url ||
      ""
    ).trim();
  }

  function buildDerivedRequestNode(triggerEvent, nextEvent) {
    const nextType = nextEvent?.type === "final_answer"
      ? state.strings.node.final
      : nextEvent?.type === "tool_use"
        ? state.strings.node.toolCall
        : state.strings.node.assistantResponse;
    const triggerType = triggerEvent?.type || "default";
    const derivedPayload = {
      triggerType,
      nextResponseType: nextEvent?.type || "assistant_text",
      triggerSummary: getEventFullDetailText(triggerEvent)
    };
    return {
      id: "derived_request_" + String(triggerEvent?.id || Math.random()),
      sourceEventId: "",
      sourceEventType: "api_request",
      stageId: nextEvent?.stage || triggerEvent?.stage || "planning",
      badge: state.strings.badge.request,
      title: state.strings.node.requestToModel,
      summary: state.strings.derivedRequestSummary[triggerType] || state.strings.derivedRequestSummary.default,
      detailTitle: nextType,
      laneBadge: state.strings.lanes.runtime,
      fromLane: "runtime",
      toLane: "assistant",
      placement: "between-left",
      tone: "request",
      text: triggerEvent?.text || "",
      summaryDetail: state.strings.modal.derived,
      payloadPreview: core.safeJsonPreview(derivedPayload, 1000),
      payloadFull: core.exactJsonString(derivedPayload),
      resultPreview: "",
      resultFull: "",
      note: state.strings.modal.derived,
      imageUrl: "",
      derived: true
    };
  }

  function buildAssistantFacingNode(event) {
    if (event.type === "tool_use") {
      return {
        id: "node_" + event.id,
        sourceEventId: event.id,
        sourceEventType: event.type,
        stageId: event.stage,
        badge: state.strings.badge.toolCall,
        title: event.toolName || state.strings.node.toolCall,
        summary: event.resultSummary || clampText(core.safeJsonPreview(event.input, 500), 160) || state.strings.noSummary,
        detailTitle: state.strings.node.toolCall,
        laneBadge: state.strings.lanes.assistant,
        fromLane: "assistant",
        toLane: "runtime",
        placement: "between-left",
        tone: event.resultType === "permission_required" ? "permission" : event.pending ? "pending" : "assistant",
        text: event.resultSummary || "",
        summaryDetail: event.resultSummaryFull || core.exactJsonString(event.input) || core.safeJsonPreview(event.input, 1400) || state.strings.noSummary,
        payloadPreview: core.exactJsonString(event.input) || core.safeJsonPreview(event.input, 1400) || "",
        payloadFull: core.exactJsonString(event.input) || core.safeJsonPreview(event.input, 1400) || "",
        resultPreview: event.resultSummary || "",
        resultFull: event.resultSummaryFull || "",
        note: event.pending ? "Waiting for matching tool_result." : "",
        imageUrl: "",
        derived: false
      };
    }

    if (event.type === "final_answer") {
      return {
        id: "node_" + event.id,
        sourceEventId: event.id,
        sourceEventType: event.type,
        stageId: event.stage,
        badge: state.strings.badge.final,
        title: state.strings.node.final,
        summary: event.text || state.strings.noSummary,
        detailTitle: state.strings.node.final,
        laneBadge: state.strings.lanes.assistant,
        fromLane: "assistant",
        toLane: "runtime",
        placement: "between-left",
        tone: "final",
        text: event.text || "",
        summaryDetail: event.text || state.strings.noSummary,
        payloadPreview: "",
        payloadFull: "",
        resultPreview: event.text || "",
        resultFull: event.text || "",
        note: "",
        imageUrl: "",
        derived: false
      };
    }

    return {
      id: "node_" + event.id,
      sourceEventId: event.id,
      sourceEventType: event.type,
      stageId: event.stage,
      badge: state.strings.badge.assistant,
      title: state.strings.node.assistantResponse,
      summary: event.text || state.strings.noSummary,
      detailTitle: state.strings.node.assistantResponse,
      laneBadge: state.strings.lanes.assistant,
      fromLane: "assistant",
      toLane: "runtime",
      placement: "between-left",
      tone: "assistant",
      text: event.text || "",
      summaryDetail: event.text || state.strings.noSummary,
      payloadPreview: "",
      payloadFull: "",
      resultPreview: event.text || "",
      resultFull: event.text || "",
      note: "",
      imageUrl: "",
      derived: false
    };
  }

  function syncPresentationSelection() {
    state.presentation = buildSimulatorPresentation(state.run);
    const nodeIds = new Set((state.presentation?.nodes || []).map(function (node) {
      return node.id;
    }));

    if (!nodeIds.has(state.selectedNodeId)) {
      state.selectedNodeId = state.presentation.currentNodeId || state.presentation?.nodes?.[0]?.id || "";
    }
    if (state.modalNodeId && !nodeIds.has(state.modalNodeId)) {
      state.modalNodeId = "";
    }
  }

  function getSelectedNode() {
    return (state.presentation?.nodes || []).find(function (node) {
      return node.id === state.selectedNodeId;
    }) || state.presentation?.nodes?.[0] || null;
  }

  function getNodeById(id) {
    return (state.presentation?.nodes || []).find(function (node) {
      return node.id === id;
    }) || null;
  }

  function renderMetaItem(label, value) {
    return `
      <div class="cpv-meta-item">
        <span class="cpv-meta-label">${escapeHtml(label)}</span>
        <div class="cpv-meta-value">${escapeHtml(value || "—")}</div>
      </div>
    `;
  }

  function getLaneIconSvg(key) {
    if (key === "assistant") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2.5v6.2M12 15.3v6.2M2.5 12h6.2M15.3 12h6.2M5.6 5.6l4.4 4.4M14 14l4.4 4.4M18.4 5.6 14 10M10 14l-4.4 4.4" />
        </svg>
      `;
    }
    if (key === "runtime") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 7.5h14v7H5z" />
          <path d="M8 4.5v3M12 4.5v3M16 4.5v3M8 14.5v5M12 14.5v5M16 14.5v5" />
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14.5 5.5a4.2 4.2 0 1 1 4 4l-4.8 4.8 1.8 1.8-1.4 1.4-1.8-1.8-4.8 4.8a1.8 1.8 0 0 1-2.5-2.5l4.8-4.8-1.8-1.8 1.4-1.4 1.8 1.8 4.8-4.8a4.2 4.2 0 0 1 2.5-7.5Z" />
      </svg>
    `;
  }

  function renderStageChip(stage, active) {
    return `
      <button type="button" class="cpv-stage-link" data-stage-id="${escapeHtml(stage.id)}" data-active="${active ? "true" : "false"}">
        <span class="cpv-stage-link-label">${escapeHtml(getStageLabel(stage.id))}</span>
        <span class="cpv-stage-link-count">${escapeHtml(String(stage.eventCount || 0))}</span>
      </button>
    `;
  }

  function getCurrentSessionEntry(run) {
    const scopeId = String(run?.meta?.scopeId || "").trim();
    const sessionId = String(run?.meta?.sessionId || "").trim();
    if (!scopeId || !sessionId) {
      return null;
    }
    return getSelectedGroupEntries().find(function (entry) {
      return String(entry?.scopeId || "").trim() === scopeId
        && String(entry?.sessionId || "").trim() === sessionId;
    }) || null;
  }

  function getLoadedConversationUrl(run) {
    const entry = getCurrentSessionEntry(run);
    const group = getSelectedSessionGroup();
    return clampText(
      entry?.url ||
      group?.title ||
      run?.meta?.url ||
      run?.meta?.domain ||
      run?.meta?.scopeId,
      240
    ) || "—";
  }

  function getLoadedConversationSubtitle(run) {
    const entry = getCurrentSessionEntry(run);
    const group = getSelectedSessionGroup();
    const primary = getLoadedConversationUrl(run);
    const candidates = [
      group?.subtitle,
      entry?.preview,
      entry?.tabTitle,
      run?.meta?.tabTitle,
      run?.meta?.title,
      run?.snapshot?.meta?.preview
    ];
    const match = candidates.find(function (value) {
      const text = clampText(value, 180);
      return text && text !== primary;
    });
    return match || "—";
  }

  function renderSessionBadge(label, tone) {
    if (!label) {
      return "";
    }
    return `<span class="cpv-session-pill" data-tone="${escapeHtml(tone || "neutral")}">${escapeHtml(label)}</span>`;
  }

  function renderSessionEntryButton(entry, currentRun) {
    const scopeId = String(entry?.scopeId || "").trim();
    const sessionId = String(entry?.sessionId || "").trim();
    if (!scopeId || !sessionId) {
      return "";
    }
    const isCurrent = scopeId === String(currentRun?.meta?.scopeId || "").trim()
      && sessionId === String(currentRun?.meta?.sessionId || "").trim();
    const title = entry?.title || sessionId;
    const preview = clampText(entry?.preview || entry?.tabTitle || entry?.url || "", 88);
    const messageText = interpolate(state.strings.sessions.messageCount, {
      count: Number(entry?.messageCount) || 0
    });
    const updatedAt = formatDateTime(entry?.updatedAt);
    const modelText = entry?.model || "—";
    return `
      <button
        type="button"
        class="cpv-session-item cpv-session-item--entry"
        data-cpv-select-session="true"
        data-scope-id="${escapeHtml(scopeId)}"
        data-session-id="${escapeHtml(sessionId)}"
        data-active="${isCurrent ? "true" : "false"}"
        aria-pressed="${isCurrent ? "true" : "false"}"
      >
        <div class="cpv-session-item-head">
          <div class="cpv-session-item-copy">
            <div class="cpv-session-item-title">${escapeHtml(title)}</div>
            ${preview ? `<div class="cpv-session-item-subtitle">${escapeHtml(preview)}</div>` : ""}
          </div>
          ${isCurrent ? renderSessionBadge(state.strings.sessions.selected, "selected") : ""}
        </div>
        <div class="cpv-session-item-meta">
          ${entry?.active ? renderSessionBadge(state.strings.sessions.active, "active") : ""}
          <span class="cpv-session-item-meta-text">${escapeHtml(messageText)}</span>
          <span class="cpv-session-item-meta-text">${escapeHtml(updatedAt)}</span>
        </div>
        <div class="cpv-session-item-model">${escapeHtml(modelText)}</div>
      </button>
    `;
  }

  function renderLaneActor(key, label) {
    return `
      <div class="cpv-lane-actor cpv-lane-actor--${escapeHtml(key)}" data-lane="${escapeHtml(key)}">
        <span class="cpv-lane-label">${escapeHtml(label)}</span>
        <span class="cpv-lane-icon" aria-hidden="true">${getLaneIconSvg(key)}</span>
      </div>
    `;
  }

  function renderArrow(fromLane, toLane, tone) {
    const from = Number(LANE_POSITIONS[fromLane]);
    const to = Number(LANE_POSITIONS[toLane]);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      return "";
    }
    const left = Math.min(from, to);
    const width = Math.abs(to - from);
    const direction = to > from ? "ltr" : "rtl";
    return `<div class="cpv-seq-arrow" data-dir="${direction}" data-tone="${escapeHtml(tone || "request")}" style="left:${left}%; width:${width}%;"></div>`;
  }

  function isSummaryCollapsible(value, context) {
    return core.shouldCollapseText(value, context);
  }

  function getModalPayloadText(node) {
    return String(
      node?.payloadFull ||
      node?.payloadPreview ||
      ""
    ).trim();
  }

  function isModalPayloadExpanded(nodeId) {
    return String(nodeId || "").trim() === state.expandedModalPayloadId;
  }

  function renderModalPayloadSection(node) {
    const payloadText = getModalPayloadText(node);
    if (!payloadText) {
      return "";
    }
    const collapsible = isSummaryCollapsible(payloadText, "modal");
    const expanded = collapsible && isModalPayloadExpanded(node?.id);
    const toggleLabel = expanded
      ? state.strings.summaryToggle.collapse
      : state.strings.summaryToggle.expand;
    return `
      <section
        class="cpv-modal-section ${collapsible ? "cpv-modal-section--collapsible" : ""}"
        data-expanded="${expanded ? "true" : "false"}"
      >
        <div class="cpv-modal-section-title">${escapeHtml(state.strings.modal.payload)}</div>
        <div class="cpv-modal-result-shell">
          <pre class="cpv-code-block ${collapsible ? "cpv-code-block--collapsible" : ""}">${escapeHtml(payloadText)}</pre>
          ${collapsible && !expanded ? `
            <div class="cpv-modal-result-overlay">
              <button
                type="button"
                class="cpv-modal-summary-toggle cpv-modal-summary-toggle--overlay"
                data-cpv-toggle-modal-payload="true"
                data-node-id="${escapeHtml(node.id)}"
                aria-expanded="false"
              >${escapeHtml(toggleLabel)}</button>
            </div>
          ` : ""}
        </div>
        ${collapsible && expanded ? `
          <div class="cpv-modal-result-actions">
            <button
              type="button"
              class="cpv-modal-summary-toggle"
              data-cpv-toggle-modal-payload="true"
              data-node-id="${escapeHtml(node.id)}"
              aria-expanded="true"
            >${escapeHtml(toggleLabel)}</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function getModalResultText(node) {
    return String(
      node?.resultFull ||
      node?.resultPreview ||
      ""
    ).trim();
  }

  function shouldAlwaysRenderModalText(node) {
    const sourceType = String(node?.sourceEventType || "").trim();
    return sourceType === "tool_result"
      || sourceType === "final_answer"
      || sourceType === "assistant_text"
      || sourceType === "user_text";
  }

  function getModalResultTitle(node) {
    const sourceType = String(node?.sourceEventType || "").trim();
    if (sourceType === "tool_result") {
      return state.strings.modal.resultJson;
    }
    if (sourceType === "final_answer" || sourceType === "assistant_text" || sourceType === "user_text") {
      return state.strings.modal.content;
    }
    return state.strings.modal.result;
  }

  function isModalResultExpanded(nodeId) {
    return String(nodeId || "").trim() === state.expandedModalResultId;
  }

  function renderModalResultSection(node) {
    const resultText = getModalResultText(node);
    const forceRender = shouldAlwaysRenderModalText(node);
    const resultTitle = getModalResultTitle(node);
    if (!resultText || (!forceRender && resultText === String(node?.text || "").trim())) {
      return "";
    }
    const collapsible = isSummaryCollapsible(resultText, "modal");
    const expanded = collapsible && isModalResultExpanded(node?.id);
    const toggleLabel = expanded
      ? state.strings.summaryToggle.collapse
      : state.strings.summaryToggle.expand;
    return `
      <section
        class="cpv-modal-section ${collapsible ? "cpv-modal-section--collapsible" : ""}"
        data-expanded="${expanded ? "true" : "false"}"
      >
        <div class="cpv-modal-section-title">${escapeHtml(resultTitle)}</div>
        <div class="cpv-modal-result-shell">
          <pre class="cpv-code-block ${collapsible ? "cpv-code-block--collapsible" : ""}">${escapeHtml(resultText)}</pre>
          ${collapsible && !expanded ? `
            <div class="cpv-modal-result-overlay">
              <button
                type="button"
                class="cpv-modal-summary-toggle cpv-modal-summary-toggle--overlay"
                data-cpv-toggle-modal-result="true"
                data-node-id="${escapeHtml(node.id)}"
                aria-expanded="false"
              >${escapeHtml(toggleLabel)}</button>
            </div>
          ` : ""}
        </div>
        ${collapsible && expanded ? `
          <div class="cpv-modal-result-actions">
            <button
              type="button"
              class="cpv-modal-summary-toggle"
              data-cpv-toggle-modal-result="true"
              data-node-id="${escapeHtml(node.id)}"
              aria-expanded="true"
            >${escapeHtml(toggleLabel)}</button>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderSequenceNode(node, selectedId, currentId) {
    const isSelected = node.id === selectedId;
    const isCurrent = node.id === currentId;
    const arrowHtml = node.placement === "self" ? "" : renderArrow(node.fromLane, node.toLane, node.tone);
    return `
      <div class="cpv-seq-row" data-placement="${escapeHtml(node.placement)}" data-selected="${isSelected ? "true" : "false"}" data-current="${isCurrent ? "true" : "false"}">
        ${arrowHtml}
        <article
          class="cpv-seq-node"
          data-node-id="${escapeHtml(node.id)}"
          data-cpv-open-node="true"
          data-tone="${escapeHtml(node.tone)}"
          aria-label="${escapeHtml(node.title)}"
          role="button"
          tabindex="0"
        >
          <div class="cpv-seq-node-top">
            <span class="cpv-seq-badge" data-tone="${escapeHtml(node.tone)}">${escapeHtml(node.badge)}</span>
            <span class="cpv-seq-order" data-current="${isCurrent ? "true" : "false"}">${escapeHtml(String(node.index))}</span>
          </div>
          <div class="cpv-seq-title">${escapeHtml(node.title)}</div>
          <div class="cpv-seq-summary">${escapeHtml(clampText(node.summary || state.strings.noSummary, 92))}</div>
        </article>
      </div>
    `;
  }

  function renderStepButton(node, selectedId, currentId) {
    const isSelected = node.id === selectedId;
    const isCurrent = node.id === currentId;
    const label = [String(node.index), node.badge, node.title].filter(Boolean).join(" ");
    return `
      <article
        class="cpv-step-btn"
        data-node-id="${escapeHtml(node.id)}"
        data-cpv-select-node="true"
        data-active="${isSelected ? "true" : "false"}"
        data-tone="${escapeHtml(node.tone)}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(label)}"
        title="${escapeHtml(label)}"
      >
        <span class="cpv-step-index">${escapeHtml(String(node.index))}</span>
        ${isCurrent ? `<span class="cpv-step-current">${escapeHtml(state.strings.layout.current)}</span>` : ""}
      </article>
    `;
  }

  function getModalToolName(node) {
    if (!node) {
      return "";
    }
    const specificEventTypes = new Set(["tool_use", "tool_result", "permission_required"]);
    const primaryTitle = String(node.title || "").trim();
    const secondaryTitle = String(node.detailTitle || "").trim();
    if (!specificEventTypes.has(String(node.sourceEventType || ""))) {
      return "";
    }
    if (!primaryTitle || primaryTitle === secondaryTitle) {
      return "";
    }
    return primaryTitle;
  }

  function getModalHeading(node) {
    if (!node) {
      return "";
    }
    const primaryTitle = String(node.title || "").trim();
    const secondaryTitle = String(node.detailTitle || "").trim();
    const toolName = getModalToolName(node);
    if (toolName) {
      return secondaryTitle || primaryTitle;
    }
    if (primaryTitle && secondaryTitle && secondaryTitle !== primaryTitle) {
      return primaryTitle + " / " + secondaryTitle;
    }
    return primaryTitle || secondaryTitle;
  }

  function renderModal(node) {
    if (!node) {
      return "";
    }
    const imageUrl = sanitizeImageUrl(node.imageUrl);
    const modalToolName = getModalToolName(node);
    const modalHeading = getModalHeading(node);
    const modalAriaLabel = modalToolName ? modalToolName + " / " + modalHeading : modalHeading;
    return `
      <div class="cpv-modal-overlay" data-cpv-close-modal="overlay">
        <section class="cpv-modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(modalAriaLabel)}">
          <button type="button" class="cpv-modal-close" data-cpv-close-modal="button" aria-label="${escapeHtml(state.strings.modal.close)}">×</button>
          <header class="cpv-modal-head">
            <span class="cpv-seq-badge cpv-modal-pill" data-tone="${escapeHtml(node.tone)}">${escapeHtml(node.laneBadge)}</span>
            <h2 class="cpv-modal-title">${escapeHtml(modalHeading)}</h2>
          </header>
          <div class="cpv-modal-body">
            <div class="cpv-modal-grid" data-columns="${modalToolName ? "3" : "2"}">
              ${renderMetaItem(state.strings.modal.stage, getStageLabel(node.stageId))}
              ${modalToolName ? renderMetaItem(state.strings.modal.tool, modalToolName) : ""}
              ${renderMetaItem(state.strings.modal.source, node.derived ? "derived" : (node.sourceEventType || "event"))}
            </div>
            ${renderModalPayloadSection(node)}
            ${renderModalResultSection(node)}
            ${imageUrl ? `
              <section class="cpv-modal-section">
                <div class="cpv-modal-section-title">${escapeHtml(state.strings.modal.screenshot)}</div>
                <img class="cpv-image-preview" src="${escapeHtml(imageUrl)}" alt="preview" />
              </section>
            ` : ""}
          </div>
        </section>
      </div>
    `;
  }

  function renderSessionBrowserModal(run) {
    const sessionEntries = getAllSessionEntries();
    return `
      <div class="cpv-modal-overlay cpv-modal-overlay--session-browser" data-cpv-close-session-browser="overlay">
        <section class="cpv-modal-card cpv-modal-card--session-browser" role="dialog" aria-modal="true" aria-label="${escapeHtml(state.strings.sessions.browserTitle)}">
          <button type="button" class="cpv-modal-close" data-cpv-close-session-browser="button" aria-label="${escapeHtml(state.strings.sessions.browserClose)}">×</button>
          <header class="cpv-modal-head">
            <span class="cpv-meta-pill cpv-modal-pill">${escapeHtml(state.strings.sessions.browserCurrent)}</span>
            <h2 class="cpv-modal-title">${escapeHtml(state.strings.sessions.browserTitle)}</h2>
          </header>
          <div class="cpv-modal-body cpv-modal-body--session-browser">
            <section class="cpv-session-browser-column">
              <div class="cpv-session-browser-head">
                <div class="cpv-modal-section-title">${escapeHtml(state.strings.sessions.groupsTitle)}</div>
              </div>
              ${sessionEntries.length ? `
                <div class="cpv-session-list cpv-session-list--browser" aria-label="${escapeHtml(state.strings.sessions.groupsTitle)}">
                  ${sessionEntries.map(function (entry) {
                    return renderSessionEntryButton(entry, run);
                  }).join("")}
                </div>
              ` : `
                <div class="cpv-empty-inline cpv-empty-inline--sidebar">${escapeHtml(state.strings.sessions.groupsEmpty)}</div>
              `}
            </section>
          </div>
        </section>
      </div>
    `;
  }

  function renderEmptyState() {
    root.dataset.cpvApp = "ready";
    root.innerHTML = `
      <main class="cpv-shell" data-cpv-app="ready">
        <div class="cpv-live-pill" data-status="empty">
          <span class="cpv-live-dot"></span>
          <span>${escapeHtml(state.strings.liveEmpty)}</span>
        </div>
        <header class="cpv-page-header cpv-page-header--single">
          <div class="cpv-page-title-wrap">
            <h1 class="cpv-page-title">${escapeHtml(state.strings.pageHeading)}</h1>
            <p class="cpv-page-subtitle">${escapeHtml(state.strings.pageSubtitle)}</p>
          </div>
        </header>
        <section class="cpv-card cpv-empty-state">
          <div class="cpv-empty-state-copy">
            <h2>${escapeHtml(state.strings.emptyTitle)}</h2>
            <p>${escapeHtml(state.strings.emptyBody)}</p>
            <p class="cpv-footer-note">${escapeHtml(state.strings.footerNote)}</p>
          </div>
        </section>
      </main>
    `;
  }

  function renderRun(run) {
    syncPresentationSelection();
    const presentation = state.presentation;
    const nodes = presentation?.nodes || [];
    const sessionEntries = getAllSessionEntries();
    const modalNode = state.modalNodeId ? getNodeById(state.modalNodeId) : null;
    const hasSessionSidebar = sessionEntries.length > 0;
    const hasSidebarContent = false;

    root.dataset.cpvApp = "ready";
    root.innerHTML = `
      <main class="cpv-shell" data-cpv-app="ready" data-has-sidebar="${hasSidebarContent ? "true" : "false"}" data-has-session-rail="${hasSessionSidebar ? "true" : "false"}">
        <header class="cpv-page-header">
          <div class="cpv-page-title-wrap">
            <h1 class="cpv-page-title">${escapeHtml(state.strings.pageHeading)}</h1>
            <p class="cpv-page-subtitle">${escapeHtml(state.strings.pageSubtitle)}</p>
          </div>
        </header>

        <div class="cpv-workspace">
          ${hasSessionSidebar ? `
            <aside class="cpv-session-rail">
              <section class="cpv-card cpv-sidebar-card cpv-session-sidebar-card">
                <header class="cpv-sidebar-card-head">
                  <div class="cpv-sidebar-card-title">${escapeHtml(state.strings.sessions.groupsTitle)}</div>
                  <div class="cpv-sidebar-card-copy">${escapeHtml(state.strings.sessions.groupsHint)}</div>
                </header>
                ${sessionEntries.length ? `
                  <div class="cpv-session-list cpv-session-list--sidebar" aria-label="${escapeHtml(state.strings.sessions.groupsTitle)}">
                    ${sessionEntries.map(function (entry) {
                      return renderSessionEntryButton(entry, run);
                    }).join("")}
                  </div>
                ` : `
                  <div class="cpv-empty-inline cpv-empty-inline--sidebar">${escapeHtml(state.strings.sessions.groupsEmpty)}</div>
                `}
              </section>
            </aside>
          ` : ""}

          <div class="cpv-content-column">
            <section class="cpv-card cpv-loaded-card" aria-label="${escapeHtml(state.strings.layout.loadedTitle)}">
              <div class="cpv-loaded-title">${escapeHtml(getLoadedConversationUrl(run))}</div>
              <div class="cpv-loaded-preview">${escapeHtml(getLoadedConversationSubtitle(run))}</div>
            </section>

            <div class="cpv-page-layout">
              <div class="cpv-main-stack">
                <section class="cpv-flow-card cpv-flow-card--stage-only">
                  <div class="cpv-seq-stage cpv-seq-stage--only">
                    <div class="cpv-seq-frame">
                      <div class="cpv-seq-actors">
                        ${renderLaneActor("assistant", state.strings.lanes.assistant)}
                        ${renderLaneActor("runtime", state.strings.lanes.runtime)}
                        ${renderLaneActor("tools", state.strings.lanes.tools)}
                      </div>
                      <div class="cpv-seq-scroll">
                        ${nodes.length ? `
                          <div class="cpv-seq-track">
                            <span class="cpv-seq-lane-line" data-lane="assistant" style="left:${LANE_POSITIONS.assistant}%;"></span>
                            <span class="cpv-seq-lane-line" data-lane="runtime" style="left:${LANE_POSITIONS.runtime}%;"></span>
                            <span class="cpv-seq-lane-line" data-lane="tools" style="left:${LANE_POSITIONS.tools}%;"></span>
                            ${nodes.map(function (node) {
                              return renderSequenceNode(node, state.selectedNodeId, presentation.currentNodeId);
                            }).join("")}
                          </div>
                        ` : `
                          <div class="cpv-empty-inline">${escapeHtml(state.strings.layout.emptyNodes)}</div>
                        `}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        ${state.sessionBrowserOpen ? renderSessionBrowserModal(run) : ""}
        ${modalNode ? renderModal(modalNode) : ""}
      </main>
    `;
  }

  function recomputeRun() {
    state.sessionGroups = core.collectVisualizerSessionGroups(state.storageSnapshot, {
      prefix: getChatScopePrefix()
    });
    const nextRun = core.selectVisualizerRun(state.storageSnapshot, {
      prefix: getChatScopePrefix(),
      scopeId: state.query.scopeId,
      sessionId: state.query.sessionId
    });
    const nextRunKey = nextRun ? [nextRun.meta.scopeId, nextRun.meta.sessionId, nextRun.meta.updatedAt].join("::") : "";
    if (nextRunKey !== state.currentRunKey) {
      state.expandedModalPayloadId = "";
      state.expandedModalResultId = "";
      state.currentRunKey = nextRunKey;
    }
    state.run = nextRun;
    document.title = state.strings.pageTitle;
    document.documentElement.lang = state.strings.htmlLang;
    if (!state.run) {
      state.presentation = null;
      state.selectedNodeId = "";
      state.modalNodeId = "";
      renderEmptyState();
      return;
    }
    if (
      (state.query.scopeId && state.query.scopeId !== state.run.meta.scopeId)
      || (state.query.sessionId && state.query.sessionId !== state.run.meta.sessionId)
    ) {
      syncQueryWithSelection(
        state.run.meta.scopeId,
        state.query.sessionId ? state.run.meta.sessionId : ""
      );
    }
    renderRun(state.run);
  }

  async function loadInitialStorage() {
    state.storageSnapshot = await chrome.storage.local.get(null);
    recomputeRun();
  }

  function handleStorageChanges(changes, areaName) {
    if (areaName !== "local") {
      return;
    }
    const localeChanged = Object.prototype.hasOwnProperty.call(changes, PREFERRED_LOCALE_STORAGE_KEY)
      ? applyLocalePreference(changes[PREFERRED_LOCALE_STORAGE_KEY]?.newValue)
      : false;
    const changedScopeIds = core.getChangedScopeIds(changes, getChatScopePrefix());
    if (changedScopeIds.length === 0) {
      if (localeChanged) {
        recomputeRun();
      }
      return;
    }
    state.storageSnapshot = core.applyStorageChanges(state.storageSnapshot, changes);
    recomputeRun();
  }

  function moveSelection(direction) {
    const nodes = state.presentation?.nodes || [];
    if (!nodes.length) {
      return;
    }
    const foundIndex = nodes.findIndex(function (node) {
      return node.id === state.selectedNodeId;
    });
    const currentIndex = foundIndex >= 0 ? foundIndex : 0;
    const nextIndex = direction === "prev"
      ? Math.max(0, currentIndex - 1)
      : Math.min(nodes.length - 1, currentIndex + 1);
    state.selectedNodeId = nodes[nextIndex]?.id || state.selectedNodeId;
    renderRun(state.run);
  }

  function selectNodeById(nodeId) {
    const normalizedId = String(nodeId || "").trim();
    if (!normalizedId || !getNodeById(normalizedId)) {
      return false;
    }
    state.selectedNodeId = normalizedId;
    return true;
  }

  function openNodeById(nodeId) {
    if (!selectNodeById(nodeId)) {
      return false;
    }
    state.sessionBrowserOpen = false;
    state.modalNodeId = String(nodeId || "").trim();
    state.expandedModalPayloadId = "";
    state.expandedModalResultId = "";
    renderRun(state.run);
    return true;
  }

  function toggleModalPayload(nodeId) {
    const normalizedId = String(nodeId || "").trim();
    if (!normalizedId) {
      return;
    }
    state.expandedModalPayloadId = state.expandedModalPayloadId === normalizedId ? "" : normalizedId;
    if (state.run) {
      renderRun(state.run);
    }
  }

  function toggleModalResult(nodeId) {
    const normalizedId = String(nodeId || "").trim();
    if (!normalizedId) {
      return;
    }
    state.expandedModalResultId = state.expandedModalResultId === normalizedId ? "" : normalizedId;
    if (state.run) {
      renderRun(state.run);
    }
  }

  function selectStage(stageId) {
    const target = (state.presentation?.nodes || []).find(function (node) {
      return node.stageId === stageId;
    });
    if (!target) {
      return;
    }
    selectNodeById(target.id);
    renderRun(state.run);
  }

  function openSelectedNode() {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    openNodeById(node.id);
  }

  function openSessionBrowser() {
    if (!state.run) {
      return;
    }
    state.modalNodeId = "";
    state.expandedModalPayloadId = "";
    state.expandedModalResultId = "";
    state.sessionBrowserOpen = true;
    renderRun(state.run);
  }

  function closeSessionBrowser() {
    if (!state.sessionBrowserOpen) {
      return;
    }
    state.sessionBrowserOpen = false;
    renderRun(state.run);
  }

  function closeModal() {
    if (!state.modalNodeId) {
      return;
    }
    state.modalNodeId = "";
    state.expandedModalPayloadId = "";
    state.expandedModalResultId = "";
    renderRun(state.run);
  }

  function handleRootClick(event) {
    const modalPayloadToggle = event.target.closest("[data-cpv-toggle-modal-payload='true']");
    if (modalPayloadToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleModalPayload(modalPayloadToggle.getAttribute("data-node-id"));
      return;
    }

    const modalResultToggle = event.target.closest("[data-cpv-toggle-modal-result='true']");
    if (modalResultToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleModalResult(modalResultToggle.getAttribute("data-node-id"));
      return;
    }

    if (event.target.closest("[data-cpv-open-session-browser='true']")) {
      openSessionBrowser();
      return;
    }

    const selectSession = event.target.closest("[data-cpv-select-session='true']");
    if (selectSession) {
      syncQueryWithSelection(
        selectSession.getAttribute("data-scope-id"),
        selectSession.getAttribute("data-session-id")
      );
      state.sessionBrowserOpen = false;
      recomputeRun();
      return;
    }

    const openNode = event.target.closest("[data-cpv-open-node='true']");
    if (openNode) {
      const nodeId = String(openNode.getAttribute("data-node-id") || "").trim();
      openNodeById(nodeId);
      return;
    }

    const selectNode = event.target.closest("[data-cpv-select-node='true']");
    if (selectNode) {
      const nodeId = String(selectNode.getAttribute("data-node-id") || "").trim();
      if (selectNodeById(nodeId)) {
        renderRun(state.run);
      }
      return;
    }

    const stageButton = event.target.closest("[data-stage-id]");
    if (stageButton) {
      selectStage(String(stageButton.getAttribute("data-stage-id") || ""));
      return;
    }

    const navButton = event.target.closest("[data-cpv-nav]");
    if (navButton) {
      moveSelection(String(navButton.getAttribute("data-cpv-nav") || "next"));
      return;
    }

    if (event.target.closest("[data-cpv-open-selected='true']")) {
      openSelectedNode();
      return;
    }

    const closeTarget = event.target.closest("[data-cpv-close-modal]");
    if (closeTarget) {
      const mode = closeTarget.getAttribute("data-cpv-close-modal");
      if (mode === "button" || closeTarget === event.target) {
        closeModal();
      }
      return;
    }

    const closeSessionBrowserTarget = event.target.closest("[data-cpv-close-session-browser]");
    if (closeSessionBrowserTarget) {
      const mode = closeSessionBrowserTarget.getAttribute("data-cpv-close-session-browser");
      if (mode === "button" || closeSessionBrowserTarget === event.target) {
        closeSessionBrowser();
      }
    }
  }

  function handleKeyDown(event) {
    if (!state.run) {
      return;
    }
    if (event.key === "Escape") {
      if (state.modalNodeId) {
        event.preventDefault();
        closeModal();
        return;
      }
      if (state.sessionBrowserOpen) {
        event.preventDefault();
        closeSessionBrowser();
        return;
      }
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection("prev");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection("next");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const selectSession = document.activeElement?.closest?.("[data-cpv-select-session='true']");
      if (selectSession) {
        event.preventDefault();
        syncQueryWithSelection(
          selectSession.getAttribute("data-scope-id"),
          selectSession.getAttribute("data-session-id")
        );
        recomputeRun();
        return;
      }
      const openNode = document.activeElement?.closest?.("[data-cpv-open-node='true']");
      if (openNode) {
        event.preventDefault();
        openNodeById(openNode.getAttribute("data-node-id"));
        return;
      }
      const selectNode = document.activeElement?.closest?.("[data-cpv-select-node='true']");
      if (selectNode) {
        event.preventDefault();
        openNodeById(selectNode.getAttribute("data-node-id"));
      }
    }
  }

  async function bootstrap() {
    root.addEventListener("click", handleRootClick);
    document.addEventListener("keydown", handleKeyDown);
    try {
      await ensureStrings(
        (await readPreferredLocaleTag()) || state.query?.locale || navigator.language,
      );
    } catch {}
    loadInitialStorage().catch(function (error) {
      console.error("[visualizer] failed to load storage", error);
      renderEmptyState();
    });
    chrome.storage.onChanged.addListener(handleStorageChanges);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
