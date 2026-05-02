const SAVED_PROMPTS_KEY = globalThis.__CP_CONTRACT__?.permissionManager?.SAVED_PROMPTS_STORAGE_KEY || "savedPrompts";
const WORKFLOW_STORAGE_KEY = globalThis.__CP_CONTRACT__?.workflows?.STORAGE_KEY || "claw_site_workflows_v1";
const SYNC_SOURCE = "shortcut";

let syncScheduled = false;
let syncInFlight = false;
let syncPending = false;

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeNumber(value, fallbackValue) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallbackValue;
}

function truncateText(value, maxLength) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  const limit = Number.isFinite(Number(maxLength)) && Number(maxLength) > 0 ? Number(maxLength) : 160;
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : text;
}

function humanizeCommand(command) {
  const normalized = normalizeText(command).replace(/[-_]+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.replace(/\b([a-z])/g, function (_, letter) {
    return letter.toUpperCase();
  });
}

function buildWorkflowDescription(promptText) {
  const normalized = normalizeText(promptText);
  if (!normalized) {
    return "";
  }
  const firstLine = normalized.split(/\n+/).find(function (entry) {
    return normalizeText(entry);
  }) || normalized;
  return truncateText(firstLine, 160);
}

function buildUrlPatterns(urlValue) {
  const normalized = normalizeText(urlValue);
  if (!normalized) {
    return [];
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return [`${parsed.protocol}//${parsed.host}/*`];
    }
  } catch {}
  return [];
}

function normalizePromptEntry(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const id = normalizeText(source.id);
  const command = normalizeText(source.command);
  const prompt = normalizeText(source.prompt);
  if (!id || !command || !prompt) {
    return null;
  }
  return {
    ...source,
    id,
    command,
    prompt,
    url: normalizeText(source.url),
    repeatType: normalizeText(source.repeatType || "none") || "none",
    specificTime: normalizeText(source.specificTime),
    specificDate: normalizeText(source.specificDate),
    dayOfWeek: source.dayOfWeek,
    dayOfMonth: source.dayOfMonth,
    monthAndDay: normalizeText(source.monthAndDay),
    model: normalizeText(source.model),
    createdAt: normalizeNumber(source.createdAt, Date.now())
  };
}

function normalizeWorkflowEntry(raw) {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? {
    ...raw
  } : {};
}

function buildSyncSignature(promptEntry) {
  return JSON.stringify({
    command: promptEntry.command,
    prompt: promptEntry.prompt,
    url: promptEntry.url,
    repeatType: promptEntry.repeatType,
    specificTime: promptEntry.specificTime,
    specificDate: promptEntry.specificDate,
    dayOfWeek: promptEntry.dayOfWeek ?? null,
    dayOfMonth: promptEntry.dayOfMonth ?? null,
    monthAndDay: promptEntry.monthAndDay,
    model: promptEntry.model
  });
}

function comparableWorkflowShape(workflow) {
  const source = normalizeWorkflowEntry(workflow);
  return JSON.stringify({
    name: normalizeText(source.name),
    label: normalizeText(source.label),
    description: normalizeText(source.description),
    prompt: normalizeText(source.prompt),
    url_patterns: Array.isArray(source.url_patterns) ? source.url_patterns.slice() : [],
    source: normalizeText(source.source),
    linkedPromptId: normalizeText(source.linkedPromptId),
    shortcutSyncSignature: normalizeText(source.shortcutSyncSignature),
    shortcutMeta: source.shortcutMeta && typeof source.shortcutMeta === "object" ? source.shortcutMeta : {},
    enabled: source.enabled !== false
  });
}

function buildShortcutWorkflow(promptEntry, existingWorkflow, nameOverride) {
  const existing = normalizeWorkflowEntry(existingWorkflow);
  const signature = buildSyncSignature(promptEntry);
  const workflowName = normalizeText(nameOverride || promptEntry.command);
  const next = {
    ...existing,
    name: workflowName,
    label: humanizeCommand(promptEntry.command) || workflowName,
    description: buildWorkflowDescription(promptEntry.prompt),
    prompt: promptEntry.prompt,
    url_patterns: buildUrlPatterns(promptEntry.url),
    inputs: Array.isArray(existing.inputs) ? existing.inputs : [],
    enabled: existing.enabled !== false,
    source: SYNC_SOURCE,
    version: Math.max(1, normalizeNumber(existing.version, 1)),
    createdAt: normalizeNumber(existing.createdAt, promptEntry.createdAt || Date.now()),
    updatedAt: Date.now(),
    linkedPromptId: promptEntry.id,
    linkedCommand: promptEntry.command,
    shortcutSyncSignature: signature,
    shortcutMeta: {
      id: promptEntry.id,
      command: promptEntry.command,
      url: promptEntry.url,
      repeatType: promptEntry.repeatType,
      specificTime: promptEntry.specificTime,
      specificDate: promptEntry.specificDate,
      dayOfWeek: promptEntry.dayOfWeek ?? null,
      dayOfMonth: promptEntry.dayOfMonth ?? null,
      monthAndDay: promptEntry.monthAndDay,
      model: promptEntry.model
    }
  };
  if (existingWorkflow && comparableWorkflowShape(existingWorkflow) === comparableWorkflowShape(next)) {
    return existingWorkflow;
  }
  return next;
}

function resolveUniqueWorkflowName(baseName, usedNames, existingWorkflow) {
  const normalizedBase = normalizeText(baseName) || "shortcut-workflow";
  const existingName = normalizeText(existingWorkflow?.name);
  if (existingName && existingName === normalizedBase) {
    usedNames.add(existingName);
    return existingName;
  }
  if (!usedNames.has(normalizedBase)) {
    usedNames.add(normalizedBase);
    return normalizedBase;
  }
  let index = 2;
  while (usedNames.has(`${normalizedBase}-shortcut-${index}`)) {
    index += 1;
  }
  const nextName = `${normalizedBase}-shortcut-${index}`;
  usedNames.add(nextName);
  return nextName;
}

async function readSavedPrompts() {
  const stored = await chrome.storage.local.get([SAVED_PROMPTS_KEY]);
  const raw = stored[SAVED_PROMPTS_KEY];
  return (Array.isArray(raw) ? raw : []).map(normalizePromptEntry).filter(Boolean);
}

async function readWorkflowStore() {
  const stored = await chrome.storage.local.get([WORKFLOW_STORAGE_KEY]);
  const raw = stored[WORKFLOW_STORAGE_KEY];
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    version: 1,
    updatedAt: normalizeNumber(payload.updatedAt, Date.now()),
    workflows: (Array.isArray(payload.workflows) ? payload.workflows : []).map(normalizeWorkflowEntry)
  };
}

async function writeWorkflowStore(workflows) {
  await chrome.storage.local.set({
    [WORKFLOW_STORAGE_KEY]: {
      version: 1,
      updatedAt: Date.now(),
      workflows
    }
  });
}

function serializeWorkflowStore(workflows) {
  return JSON.stringify((Array.isArray(workflows) ? workflows : []).map(function (entry) {
    return {
      ...entry,
      inputs: Array.isArray(entry.inputs) ? entry.inputs : [],
      url_patterns: Array.isArray(entry.url_patterns) ? entry.url_patterns : []
    };
  }));
}

async function syncSavedPromptsIntoWorkflowLibrary() {
  const [savedPrompts, workflowStore] = await Promise.all([
    readSavedPrompts(),
    readWorkflowStore()
  ]);
  const currentWorkflows = Array.isArray(workflowStore.workflows) ? workflowStore.workflows.slice() : [];
  const promptIds = new Set(savedPrompts.map(function (entry) {
    return entry.id;
  }));
  const manualWorkflows = currentWorkflows.filter(function (entry) {
    return !(normalizeText(entry.source) === SYNC_SOURCE && normalizeText(entry.linkedPromptId));
  });
  const existingShortcutWorkflows = currentWorkflows.filter(function (entry) {
    return normalizeText(entry.source) === SYNC_SOURCE && normalizeText(entry.linkedPromptId);
  });
  const existingByPromptId = new Map(existingShortcutWorkflows.map(function (entry) {
    return [normalizeText(entry.linkedPromptId), entry];
  }));
  const usedNames = new Set(manualWorkflows.map(function (entry) {
    return normalizeText(entry.name);
  }).filter(Boolean));
  const syncedWorkflows = [];

  for (const promptEntry of savedPrompts) {
    const existing = existingByPromptId.get(promptEntry.id) || null;
    const workflowName = resolveUniqueWorkflowName(promptEntry.command, usedNames, existing);
    syncedWorkflows.push(buildShortcutWorkflow(promptEntry, existing, workflowName));
  }

  const nextWorkflows = manualWorkflows.concat(syncedWorkflows).filter(Boolean).sort(function (left, right) {
    return normalizeNumber(right.updatedAt, 0) - normalizeNumber(left.updatedAt, 0);
  });

  const currentComparable = serializeWorkflowStore(currentWorkflows);
  const nextComparable = serializeWorkflowStore(nextWorkflows);

  if (currentComparable !== nextComparable) {
    await writeWorkflowStore(nextWorkflows);
  }
}

function runSync(reason) {
  if (syncInFlight) {
    syncPending = true;
    return;
  }
  syncScheduled = false;
  syncInFlight = true;
  Promise.resolve().then(function () {
    return syncSavedPromptsIntoWorkflowLibrary();
  }).catch(function (error) {
    console.warn("[Claw] shortcut workflow sync failed", reason, error);
  }).finally(function () {
    syncInFlight = false;
    if (syncPending) {
      syncPending = false;
      queueSync("pending");
    }
  });
}

function queueSync(reason) {
  if (syncInFlight) {
    syncPending = true;
    return;
  }
  if (syncScheduled) {
    return;
  }
  syncScheduled = true;
  setTimeout(function () {
    runSync(reason);
  }, 50);
}

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") {
    return;
  }
  if (!(SAVED_PROMPTS_KEY in changes)) {
    return;
  }
  queueSync("storage");
});

queueSync("init");
