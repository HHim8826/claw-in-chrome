(function () {
  const DEFAULT_TITLE = "Claw in Chrome";
  const TITLE_SEPARATOR = " - ";

  function parseDetachedWindowGroupId() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") !== "window") {
      return null;
    }
    const groupId = Number(params.get("groupId"));
    if (
      !Number.isFinite(groupId) ||
      groupId === chrome.tabGroups?.TAB_GROUP_ID_NONE
    ) {
      return null;
    }
    return Math.trunc(groupId);
  }

  function normalizeGroupTitle(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function buildWindowTitle(groupTitle) {
    const normalizedGroupTitle = normalizeGroupTitle(groupTitle);
    return normalizedGroupTitle
      ? `${DEFAULT_TITLE}${TITLE_SEPARATOR}${normalizedGroupTitle}`
      : DEFAULT_TITLE;
  }

  const groupId = parseDetachedWindowGroupId();
  if (groupId === null) {
    return;
  }

  let lastAppliedTitle = "";
  const applyWindowTitle = (groupTitle) => {
    const nextTitle = buildWindowTitle(groupTitle);
    if (nextTitle === lastAppliedTitle) {
      return;
    }
    lastAppliedTitle = nextTitle;
    document.title = nextTitle;
  };

  const syncWindowTitle = async () => {
    if (typeof chrome.tabGroups?.get !== "function") {
      applyWindowTitle("");
      return;
    }
    try {
      const group = await chrome.tabGroups.get(groupId);
      applyWindowTitle(group?.title);
    } catch {
      applyWindowTitle("");
    }
  };

  const handleGroupUpdated = (group) => {
    if (Number(group?.id) !== groupId) {
      return;
    }
    applyWindowTitle(group?.title);
  };

  const handleGroupRemoved = (group) => {
    if (Number(group?.id) !== groupId) {
      return;
    }
    applyWindowTitle("");
  };

  applyWindowTitle("");
  syncWindowTitle();

  chrome.tabGroups?.onUpdated?.addListener(handleGroupUpdated);
  chrome.tabGroups?.onRemoved?.addListener(handleGroupRemoved);

  window.addEventListener(
    "unload",
    function cleanupListeners() {
      chrome.tabGroups?.onUpdated?.removeListener(handleGroupUpdated);
      chrome.tabGroups?.onRemoved?.removeListener(handleGroupRemoved);
    },
    {
      once: true,
    },
  );
})();
