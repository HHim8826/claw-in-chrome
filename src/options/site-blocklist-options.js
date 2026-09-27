(function () {
  "use strict";

  const card = globalThis.__CP_OPTIONS_CARD__;
  const policy = globalThis.__CP_MANAGED_POLICY__;
  if (!card || !policy || !globalThis.chrome?.storage?.local) {
    return;
  }
  const { localeKey, node } = card;

  // Blocked sites live on the Permissions tab. The user's list is editable;
  // administrator patterns come from chrome.storage.managed and are shown
  // read-only because the extension can't write managed storage.
  const ROOT_ID = "cp-site-blocklist-root";
  const contract = globalThis.__CP_CONTRACT__?.siteBlocklist || {};
  const USER_KEY = contract.USER_BLOCKED_URL_PATTERNS_STORAGE_KEY || policy.USER_BLOCKED_URL_PATTERNS_KEY;
  const MANAGED_KEY = contract.MANAGED_BLOCKED_URL_PATTERNS_KEY || policy.BLOCKED_URL_PATTERNS_KEY;
  const MAX_PATTERNS = policy.MAX_USER_BLOCKED_URL_PATTERNS;
  const stringsByLocale = {
    en: {
      title: "Blocked sites",
      subtitle: "Claw won't read or operate pages that match these rules, from the side panel or from MCP.",
      inputLabel: "Site to block",
      placeholder: "example.com or example.com/admin/*",
      add: "Block",
      help: "example.com blocks the whole site, *.example.com blocks its subdomains, and example.com/admin/* blocks only that path.",
      empty: "You haven't blocked any sites.",
      remove: "Remove",
      emptyError: "Enter a domain or URL pattern.",
      invalidError: "Use a domain or URL pattern such as example.com or example.com/admin/*.",
      duplicateError: (pattern) => `${pattern} is already on the list.`,
      limitError: (limit) => `You can block up to ${limit} patterns.`,
      saveError: "Couldn't save the blocked sites list. Try again.",
      managedTitle: "Set by your browser administrator",
      managedBadge: "Administrator",
      managedHelp: "These rules come from the blockedUrlPatterns Chrome enterprise policy and can only be changed by an administrator.",
      managedNone: "Administrators can also block sites with the blockedUrlPatterns Chrome enterprise policy. No such rules apply to this browser.",
    },
    "zh-CN": {
      title: "屏蔽网站",
      subtitle: "Claw 不会读取或操作符合这些规则的网页，侧边栏和 MCP 都适用。",
      inputLabel: "要屏蔽的网站",
      placeholder: "example.com 或 example.com/admin/*",
      add: "屏蔽",
      help: "example.com 会屏蔽整个网站，*.example.com 屏蔽它的子域名，example.com/admin/* 只屏蔽该路径。",
      empty: "还没有屏蔽任何网站。",
      remove: "移除",
      emptyError: "请输入域名或网址规则。",
      invalidError: "请输入域名或网址规则，例如 example.com 或 example.com/admin/*。",
      duplicateError: (pattern) => `${pattern} 已经在列表中。`,
      limitError: (limit) => `最多只能屏蔽 ${limit} 条规则。`,
      saveError: "无法保存屏蔽网站列表，请重试。",
      managedTitle: "由浏览器管理员设置",
      managedBadge: "管理员",
      managedHelp: "这些规则来自 Chrome 企业策略 blockedUrlPatterns，只能由管理员修改。",
      managedNone: "管理员也可以通过 Chrome 企业策略 blockedUrlPatterns 屏蔽网站，目前此浏览器没有这类规则。",
    },
    "zh-TW": {
      title: "封鎖網站",
      subtitle: "Claw 不會讀取或操作符合這些規則的網頁，側邊欄和 MCP 都適用。",
      inputLabel: "要封鎖的網站",
      placeholder: "example.com 或 example.com/admin/*",
      add: "封鎖",
      help: "example.com 會封鎖整個網站，*.example.com 封鎖它的子網域，example.com/admin/* 只封鎖該路徑。",
      empty: "還沒有封鎖任何網站。",
      remove: "移除",
      emptyError: "請輸入網域或網址規則。",
      invalidError: "請輸入網域或網址規則，例如 example.com 或 example.com/admin/*。",
      duplicateError: (pattern) => `${pattern} 已經在清單中。`,
      limitError: (limit) => `最多只能封鎖 ${limit} 條規則。`,
      saveError: "無法儲存封鎖網站清單，請再試一次。",
      managedTitle: "由瀏覽器管理員設定",
      managedBadge: "管理員",
      managedHelp: "這些規則來自 Chrome 企業政策 blockedUrlPatterns，只能由管理員修改。",
      managedNone: "管理員也可以透過 Chrome 企業政策 blockedUrlPatterns 封鎖網站，目前此瀏覽器沒有這類規則。",
    },
  };
  let userPatterns = [];
  let managedPatterns = [];
  let draft = "";
  let error = "";
  let mountObserver = null;

  function strings() {
    return stringsByLocale[localeKey()] || stringsByLocale.en;
  }

  async function saveUserPatterns(next) {
    try {
      await chrome.storage.local.set({ [USER_KEY]: next });
      userPatterns = next;
      error = "";
      return true;
    } catch {
      error = strings().saveError;
      return false;
    }
  }

  async function addPattern() {
    const copy = strings();
    const raw = draft.trim();
    const pattern = policy.normalizeUserBlockedUrlPattern(raw);
    if (!raw) {
      error = copy.emptyError;
    } else if (!pattern) {
      error = copy.invalidError;
    } else if (userPatterns.includes(pattern)) {
      error = copy.duplicateError(pattern);
    } else if (userPatterns.length >= MAX_PATTERNS) {
      error = copy.limitError(MAX_PATTERNS);
    } else if (await saveUserPatterns([...userPatterns, pattern])) {
      draft = "";
    }
    render({ focusInput: true });
  }

  async function removePattern(pattern) {
    await saveUserPatterns(userPatterns.filter((entry) => entry !== pattern));
    render();
  }

  function patternRow(pattern, attribute, action) {
    const row = node("div", "cp-site-blocklist-row");
    row.setAttribute(attribute, pattern);
    row.appendChild(node("code", "cp-site-blocklist-pattern", pattern));
    if (action) {
      row.appendChild(action);
    }
    return row;
  }

  function render(options = {}) {
    const existing = document.getElementById(ROOT_ID);
    const mountTarget = card.getMountTarget(card.PERMISSIONS_ANCHOR_ID);
    if (!card.isPermissionsRoute() || !mountTarget) {
      existing?.remove();
      return;
    }
    const copy = strings();
    const root = card.panel(ROOT_ID, copy.title, copy.subtitle);

    const form = node("div", "cp-site-blocklist-form");
    const input = node("input", "cp-page-input cp-site-blocklist-input");
    input.id = "cp-site-blocklist-input";
    input.type = "text";
    input.value = draft;
    input.placeholder = copy.placeholder;
    input.setAttribute("aria-label", copy.inputLabel);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.addEventListener("input", function (event) {
      draft = String(event?.target?.value ?? input.value ?? "");
    });
    input.addEventListener("keydown", function (event) {
      if (event?.key === "Enter" && !event.isComposing) {
        event.preventDefault?.();
        addPattern().catch(function () {});
      }
    });
    const addButton = node("button", "cp-page-btn cp-page-btn-primary cp-site-blocklist-add", copy.add);
    addButton.id = "cp-site-blocklist-add";
    addButton.type = "button";
    addButton.addEventListener("click", function () {
      addPattern().catch(function () {});
    });
    form.appendChild(input);
    form.appendChild(addButton);
    root.appendChild(form);
    root.appendChild(node("p", "cp-page-row-help", copy.help));
    const status = node("div", "cp-page-status", error);
    status.id = "cp-site-blocklist-status";
    status.dataset.kind = "error";
    status.hidden = !error;
    status.setAttribute("role", "alert");
    root.appendChild(status);

    const list = node("div", "cp-site-blocklist-list");
    list.id = "cp-site-blocklist-list";
    if (userPatterns.length) {
      for (const pattern of userPatterns) {
        const remove = node("button", "cp-site-blocklist-remove", copy.remove);
        remove.type = "button";
        remove.setAttribute("data-cp-remove-pattern", pattern);
        remove.setAttribute("aria-label", `${copy.remove} ${pattern}`);
        remove.addEventListener("click", function () {
          removePattern(pattern).catch(function () {});
        });
        list.appendChild(patternRow(pattern, "data-cp-blocked-pattern", remove));
      }
    } else {
      list.appendChild(node("p", "cp-page-row-help", copy.empty));
    }
    root.appendChild(list);

    const managed = node("div", "cp-site-blocklist-managed");
    if (managedPatterns.length) {
      managed.appendChild(node("div", "cp-page-row-title", copy.managedTitle));
      for (const pattern of managedPatterns) {
        managed.appendChild(patternRow(pattern, "data-cp-managed-pattern", node("span", "cp-site-blocklist-badge", copy.managedBadge)));
      }
      managed.appendChild(node("p", "cp-page-meta", copy.managedHelp));
    } else {
      managed.appendChild(node("p", "cp-page-meta", copy.managedNone));
    }
    root.appendChild(managed);

    if (existing?.parentNode === mountTarget) {
      existing.replaceWith(root);
    } else {
      existing?.remove();
      mountTarget.appendChild(root);
    }
    if (options.focusInput) {
      input.focus?.();
    }
  }

  // The first managed-storage read can take seconds while Chrome loads
  // policy, so the user's list renders without waiting for it.
  async function refresh() {
    const runtime = policy.getRuntime(chrome);
    const managedLoad = runtime.loadBlockedUrlPatterns().then(function (managed) {
      managedPatterns = [...managed];
      render();
    });
    userPatterns = [...(await runtime.loadUserBlockedUrlPatterns())];
    render();
    await managedLoad;
  }

  globalThis.__CP_SITE_BLOCKLIST_OPTIONS__ = Object.freeze({ refresh });
  mountObserver ||= card.observeMountTarget(ROOT_ID, render, card.PERMISSIONS_ANCHOR_ID);
  window.addEventListener("hashchange", function () {
    render();
  });
  window.addEventListener("cp:ui-locale-changed", function () {
    render();
  });
  chrome.storage.onChanged?.addListener?.(function (changes, areaName) {
    if (areaName === "local" && changes[USER_KEY]) {
      userPatterns = policy.normalizeUserPatternList(changes[USER_KEY].newValue);
      render();
    }
    if (areaName === "managed" && changes[MANAGED_KEY]) {
      const next = changes[MANAGED_KEY].newValue;
      managedPatterns = Array.isArray(next) ? next.filter((pattern) => typeof pattern === "string" && pattern) : [];
      render();
    }
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refresh().catch(function () {});
    }, { once: true });
  } else {
    refresh().catch(function () {});
  }
})();
