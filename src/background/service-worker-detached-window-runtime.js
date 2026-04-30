(function () {
  if (globalThis.__CP_DETACHED_WINDOW_RUNTIME__) {
    return;
  }

  const detachedWindowContract = globalThis.__CP_CONTRACT__?.detachedWindow || {};

  function createNoopConsole() {
    return {
      warn() {}
    };
  }

  function normalizeWindowSize(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const normalizeDimension = (value, fallbackValue) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.trunc(numeric) : fallbackValue;
    };
    return Object.freeze({
      width: normalizeDimension(source.width, 500),
      height: normalizeDimension(source.height, 768),
      left: normalizeDimension(source.left, 100),
      top: normalizeDimension(source.top, 100)
    });
  }

  function createDetachedWindowRuntime(deps) {
    const options = deps && typeof deps === "object" ? deps : {};
    const chromeApi = options.chrome || globalThis.chrome;
    if (!chromeApi?.runtime?.getURL || !chromeApi?.storage?.local || !chromeApi?.windows || !chromeApi?.tabs || !chromeApi?.tabGroups) {
      throw new Error("createDetachedWindowRuntime requires chrome runtime, storage, tabs, windows, and tabGroups");
    }

    const consoleApi = options.console || globalThis.console || createNoopConsole();
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const locksStorageKey = String(options.locksStorageKey || detachedWindowContract.LOCKS_STORAGE_KEY || "claw.detachedWindowLocks");
    const pagePath = String(options.pagePath || detachedWindowContract.PAGE_PATH || "sidepanel.html");
    const pageUrl = String(options.pageUrl || chromeApi.runtime.getURL(pagePath));
    const pageMeta = new URL(pageUrl);
    const detachedWindowSize = normalizeWindowSize(options.defaultSize || detachedWindowContract.DEFAULT_SIZE);
    const detachedWindowQueryMode = "window";
    const detachedWindowQueryKeyMode = "mode";
    const detachedWindowQueryKeyTabId = "tabId";
    const detachedWindowQueryKeyGroupId = "groupId";
    const detachedWindowQueryKeyRestoreUrl = "restoreUrl";
    const detachedWindowQueryKeySessionId = "sessionId";
    const detachedWindowChromePopupType = "popup";

    const normalizePositiveNumber = value => {
      const normalizedValue = Number(value);
      return Number.isFinite(normalizedValue) && normalizedValue > 0 ? Math.trunc(normalizedValue) : null;
    };

    const normalizeWindowGroupId = value => {
      const normalizedValue = Number(value);
      return Number.isFinite(normalizedValue) && normalizedValue !== chromeApi.tabGroups.TAB_GROUP_ID_NONE ? Math.trunc(normalizedValue) : null;
    };

    const normalizeRestoreUrl = value => {
      const normalizedValue = String(value || "").trim();
      return normalizedValue || "";
    };

    const normalizeSessionId = value => {
      const normalizedValue = String(value || "").trim();
      return normalizedValue || "";
    };

    // detached window lock 归一化边界：
    // 只把 groupId/windowId 作为硬约束，其余字段都按可选上下文处理。
    // storage.local 里持久化的锁账本也以这层归一化结果为准，避免旧脏数据把复用/清理链拖偏。
    const normalizeDetachedWindowLockEntry = value => {
      const groupId = normalizeWindowGroupId(value?.groupId);
      const windowId = normalizePositiveNumber(value?.windowId);
      if (groupId === null || windowId === null) {
        return null;
      }

      return {
        groupId,
        windowId,
        popupTabId: normalizePositiveNumber(value?.popupTabId),
        mainTabId: normalizePositiveNumber(value?.mainTabId),
        hostWindowId: normalizePositiveNumber(value?.hostWindowId),
        updatedAt: Number.isFinite(Number(value?.updatedAt)) ? Math.trunc(Number(value.updatedAt)) : now()
      };
    };

    // detached lock 读取边界：从 storage.local 拉全量账本后逐项归一化，
    // 无效 entry 直接丢弃，不把坏数据继续传给 open/reuse/cleanup 主链。
    const readDetachedWindowLocks = async () => {
      try {
        const stored = await chromeApi.storage.local.get(locksStorageKey);
        const rawLocks = stored?.[locksStorageKey];
        const normalizedLocks = {};
        if (!rawLocks || typeof rawLocks !== "object") {
          return normalizedLocks;
        }
        for (const [rawGroupId, rawEntry] of Object.entries(rawLocks)) {
          const normalizedEntry = normalizeDetachedWindowLockEntry(rawEntry);
          if (!normalizedEntry) {
            continue;
          }
          normalizedLocks[String(normalizedEntry.groupId || rawGroupId)] = normalizedEntry;
        }
        return normalizedLocks;
      } catch {
        return {};
      }
    };

    // detached lock 写入边界：调用方必须先完成归一化；这里仅负责原样落盘。
    const writeDetachedWindowLocks = async locks => {
      await chromeApi.storage.local.set({
        [locksStorageKey]: locks
      });
      return locks;
    };

    // detached lock upsert 边界：
    // 以 groupId 作为唯一主键覆盖账本里的当前记录；
    // 调用方不需要关心旧 entry 是否存在，只要提供当前最新的窗口上下文即可。
    const upsertDetachedWindowLock = async (entry, previousGroupIdValue = null) => {
      const normalizedEntry = normalizeDetachedWindowLockEntry({
        ...entry,
        updatedAt: now()
      });
      if (!normalizedEntry) {
        return null;
      }

      const locks = await readDetachedWindowLocks();
      const previousGroupId = normalizeWindowGroupId(previousGroupIdValue);
      if (previousGroupId !== null && previousGroupId !== normalizedEntry.groupId) {
        delete locks[String(previousGroupId)];
      }
      locks[String(normalizedEntry.groupId)] = normalizedEntry;
      await writeDetachedWindowLocks(locks);
      return normalizedEntry;
    };

    // detached lock 反向清理入口：
    // 关闭 popup / 监听窗口销毁时，通常只拿得到 windowId，
    // 这里负责把 windowId 反查回 group 锁并统一移除。
    const removeDetachedWindowLockByWindowId = async windowIdValue => {
      const windowId = normalizePositiveNumber(windowIdValue);
      if (windowId === null) {
        return [];
      }

      const locks = await readDetachedWindowLocks();
      const removedLocks = [];
      let changed = false;
      for (const [groupId, lockEntry] of Object.entries(locks)) {
        if (lockEntry?.windowId !== windowId) {
          continue;
        }
        removedLocks.push(lockEntry);
        delete locks[groupId];
        changed = true;
      }

      if (changed) {
        await writeDetachedWindowLocks(locks);
      }
      return removedLocks;
    };

    // detached window URL 契约：
    // restoreUrl 是跨重启唯一稳定的会话锚点；tabId/groupId 只服务当前运行期复用/聚焦。
    // sessionId 只用于区分“同 URL 下的不同本地会话”，避免别的会话抢占正在使用的独立窗口。
    const buildDetachedWindowUrl = ({
      tabId,
      groupId,
      restoreUrl,
      sessionId
    }) => {
      const query = new URLSearchParams();
      query.set(detachedWindowQueryKeyMode, detachedWindowQueryMode);
      query.set(detachedWindowQueryKeyTabId, String(tabId));
      query.set(detachedWindowQueryKeyGroupId, String(groupId));
      const normalizedRestoreUrl = normalizeRestoreUrl(restoreUrl);
      if (normalizedRestoreUrl) {
        query.set(detachedWindowQueryKeyRestoreUrl, normalizedRestoreUrl);
      }
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (normalizedSessionId) {
        query.set(detachedWindowQueryKeySessionId, normalizedSessionId);
      }
      return chromeApi.runtime.getURL(`${pagePath}?${query.toString()}`);
    };

    // detached window URL 解析边界：
    // 只认扩展自己的 sidepanel window URL，其他 popup 页面一律忽略，
    // 这样 find/reuse/sweep 都不会被无关 popup 污染。
    const parseDetachedWindowUrl = url => {
      try {
        const parsedUrl = new URL(String(url || ""));
        if (parsedUrl.origin !== pageMeta.origin || parsedUrl.pathname !== pageMeta.pathname) {
          return null;
        }
        if (parsedUrl.searchParams.get(detachedWindowQueryKeyMode) !== detachedWindowQueryMode) {
          return null;
        }
        const groupId = normalizeWindowGroupId(parsedUrl.searchParams.get(detachedWindowQueryKeyGroupId));
        if (groupId === null) {
          return null;
        }
        return {
          groupId,
          tabId: normalizePositiveNumber(parsedUrl.searchParams.get(detachedWindowQueryKeyTabId)),
          restoreUrl: normalizeRestoreUrl(parsedUrl.searchParams.get(detachedWindowQueryKeyRestoreUrl)),
          sessionId: normalizeSessionId(parsedUrl.searchParams.get(detachedWindowQueryKeySessionId))
        };
      } catch {
        return null;
      }
    };

    const listDetachedWindows = async () => {
      const popupWindows = await chromeApi.windows.getAll({
        populate: true
      });
      const detachedWindows = [];
      for (const popupWindow of popupWindows) {
        if (popupWindow?.type !== detachedWindowChromePopupType) {
          continue;
        }
        for (const popupTab of popupWindow.tabs || []) {
          const detachedWindowMeta = parseDetachedWindowUrl(popupTab?.url);
          if (!detachedWindowMeta) {
            continue;
          }
          detachedWindows.push({
            windowId: normalizePositiveNumber(popupWindow.id),
            tabId: normalizePositiveNumber(popupTab.id),
            meta: detachedWindowMeta
          });
        }
      }
      return detachedWindows;
    };

    // detached window 始终挂在一个真实的 chrome tab group 上；
    // 如果主 tab 还没进组，这里会先补 group，再把 groupId/hostWindowId 统一收口。
    const ensureDetachedWindowGroupContext = async (preferredTabId, preferredSessionId = "") => {
      const tabId = normalizePositiveNumber(preferredTabId);
      if (tabId === null) {
        throw new Error("Missing target tab id");
      }

      const tab = await chromeApi.tabs.get(tabId);
      let groupId = normalizeWindowGroupId(tab?.groupId);
      if (groupId === null) {
        groupId = normalizeWindowGroupId(await chromeApi.tabs.group({
          tabIds: [tabId]
        }));
      }
      if (groupId === null) {
        throw new Error("Failed to resolve tab group");
      }

      return {
        tabId,
        groupId,
        hostWindowId: normalizePositiveNumber(tab?.windowId),
        restoreUrl: normalizeRestoreUrl(tab?.url),
        sessionId: normalizeSessionId(preferredSessionId)
      };
    };

    // 清理顺序固定：先删锁，再尝试关窗。
    // 这样即使 popup window 已经被用户手动关掉，也不会让锁账本残留。
    const closeDetachedWindowForLockEntry = async lockEntryValue => {
      const lockEntry = normalizeDetachedWindowLockEntry(lockEntryValue);
      if (!lockEntry) {
        return false;
      }

      const locks = await readDetachedWindowLocks();
      delete locks[String(lockEntry.groupId)];
      await writeDetachedWindowLocks(locks);

      try {
        await chromeApi.windows.remove(lockEntry.windowId);
      } catch {}
      return true;
    };

    // detached window 查找链：
    // 先按当前 live group 做精确命中；同 URL 的别的 session 不允许抢占这里的结果。
    const findDetachedWindowByGroupId = async groupIdValue => {
      const groupId = normalizeWindowGroupId(groupIdValue);
      if (groupId === null) {
        return null;
      }

      const detachedWindows = await listDetachedWindows();
      return detachedWindows.find(detachedWindow => detachedWindow.meta?.groupId === groupId) || null;
    };

    const findDetachedWindowBySessionContext = async ({
      restoreUrl: restoreUrlValue,
      sessionId: sessionIdValue
    } = {}) => {
      const restoreUrl = normalizeRestoreUrl(restoreUrlValue);
      const sessionId = normalizeSessionId(sessionIdValue);
      if (!restoreUrl || !sessionId) {
        return null;
      }

      const detachedWindows = await listDetachedWindows();
      return detachedWindows.find(detachedWindow => detachedWindow.meta?.restoreUrl === restoreUrl && detachedWindow.meta?.sessionId === sessionId) || null;
    };

    const focusDetachedWindow = async ({
      windowId,
      tabId
    }) => {
      const normalizedWindowId = normalizePositiveNumber(windowId);
      if (tabId) {
        await chromeApi.tabs.update(tabId, {
          active: true
        });
      }
      if (normalizedWindowId !== null) {
        await chromeApi.windows.update(normalizedWindowId, {
          focused: true
        });
      }
    };

    const createDetachedWindow = async ({
      tabId,
      groupId,
      restoreUrl,
      sessionId
    }) => {
      const detachedWindow = await chromeApi.windows.create({
        url: buildDetachedWindowUrl({
          tabId,
          groupId,
          restoreUrl,
          sessionId
        }),
        type: detachedWindowChromePopupType,
        width: detachedWindowSize.width,
        height: detachedWindowSize.height,
        left: detachedWindowSize.left,
        top: detachedWindowSize.top,
        focused: true
      });
      return {
        success: true,
        reused: false,
        groupId,
        windowId: normalizePositiveNumber(detachedWindow?.id),
        popupTabId: normalizePositiveNumber(detachedWindow?.tabs?.[0]?.id)
      };
    };

    // detached lock 巡检链：
    // 1) 只保留当前还能在 windows.getAll 中找到的 popup
    // 2) 用 lock 自己记住的 mainTabId 刷新 hostWindowId
    // 3) 不再按裸 restoreUrl 把锁偷迁移给别的 session，避免同 URL 会话互相抢窗
    const sweepDetachedWindowLocks = async () => {
      const existingLocks = await readDetachedWindowLocks();
      const nextLocks = {};

      for (const lockEntry of Object.values(existingLocks)) {
        const activeDetachedWindow = await findDetachedWindowByGroupId(lockEntry.groupId);
        if (!activeDetachedWindow?.windowId) {
          continue;
        }
        let hostWindowId = lockEntry.hostWindowId;
        if (lockEntry.mainTabId) {
          try {
            hostWindowId = normalizePositiveNumber((await chromeApi.tabs.get(lockEntry.mainTabId)).windowId) ?? hostWindowId;
          } catch {}
        }
        const normalizedLock = normalizeDetachedWindowLockEntry({
          groupId: lockEntry.groupId,
          windowId: activeDetachedWindow.windowId,
          popupTabId: activeDetachedWindow.tabId,
          mainTabId: lockEntry.mainTabId ?? activeDetachedWindow.meta?.tabId,
          hostWindowId,
          updatedAt: now()
        });
        if (!normalizedLock) {
          continue;
        }
        nextLocks[String(normalizedLock.groupId)] = normalizedLock;
      }

      const existingEntries = Object.entries(existingLocks);
      const nextEntries = Object.entries(nextLocks);
      const hasChanged = existingEntries.length !== nextEntries.length || nextEntries.some(([groupId, lockEntry]) => {
        const existingLock = existingLocks[groupId];
        return !existingLock || existingLock.windowId !== lockEntry.windowId || existingLock.popupTabId !== lockEntry.popupTabId || existingLock.mainTabId !== lockEntry.mainTabId || existingLock.hostWindowId !== lockEntry.hostWindowId;
      });

      if (hasChanged) {
        await writeDetachedWindowLocks(nextLocks);
      }

      return nextLocks;
    };

    // openDetachedWindowForGroup 的职责边界：
    // 1) 先清扫锁账本，避免拿过期 popup 做复用
    // 2) 解析主 tab -> group 上下文
    // 3) 只有同 live group / 同 sessionId 才允许复用
    // 4) 若同 URL 的别的 session 正在使用独立窗，则当前请求必须新开，不得切走占用中的窗
    // 5) 最后把 lock/mainTabId/hostWindowId 一并落盘
    const openDetachedWindowForGroup = async payload => {
      await sweepDetachedWindowLocks();
      const preferredMainTabId = normalizePositiveNumber(payload?.mainTabId) ?? normalizePositiveNumber(payload?.tabId);
      const {
        tabId,
        groupId,
        hostWindowId,
        restoreUrl,
        sessionId
      } = await ensureDetachedWindowGroupContext(preferredMainTabId, payload?.sessionId);
      const existingDetachedWindowForGroup = await findDetachedWindowByGroupId(groupId);
      const existingDetachedWindowForSession = existingDetachedWindowForGroup ? null : await findDetachedWindowBySessionContext({
        restoreUrl,
        sessionId
      });
      const existingDetachedWindow = existingDetachedWindowForGroup || existingDetachedWindowForSession;

      if (existingDetachedWindow && existingDetachedWindow.windowId !== null) {
        try {
          if (existingDetachedWindow.tabId && (existingDetachedWindow.meta?.tabId !== tabId || existingDetachedWindow.meta?.groupId !== groupId || existingDetachedWindow.meta?.restoreUrl !== restoreUrl || existingDetachedWindow.meta?.sessionId !== sessionId)) {
            await chromeApi.tabs.update(existingDetachedWindow.tabId, {
              url: buildDetachedWindowUrl({
                tabId,
                groupId,
                restoreUrl,
                sessionId
              }),
              active: true
            });
          }
          await focusDetachedWindow(existingDetachedWindow);
          await upsertDetachedWindowLock({
            groupId,
            windowId: existingDetachedWindow.windowId,
            popupTabId: existingDetachedWindow.tabId,
            mainTabId: tabId,
            hostWindowId
          }, existingDetachedWindow.meta?.groupId);
          return {
            success: true,
            reused: true,
            groupId,
            windowId: existingDetachedWindow.windowId,
            popupTabId: existingDetachedWindow.tabId
          };
        } catch (error) {
          consoleApi.warn?.("[detached-window] failed to reuse popup", {
            groupId,
            message: error instanceof Error ? error.message : String(error || "")
          });
        }
      }

      // 语义锚点：同 URL 下若已有别的 session 占用独立窗，当前请求只能新开，不能切走占用中的窗口。
      const createdDetachedWindow = await createDetachedWindow({
        tabId,
        groupId,
        restoreUrl,
        sessionId
      });
      await upsertDetachedWindowLock({
        groupId,
        windowId: createdDetachedWindow.windowId,
        popupTabId: createdDetachedWindow.popupTabId,
        mainTabId: tabId,
        hostWindowId
      });
      return createdDetachedWindow;
    };

    return {
      constants: {
        LOCKS_STORAGE_KEY: locksStorageKey,
        PAGE_PATH: pagePath,
        DEFAULT_SIZE: detachedWindowSize
      },
      normalizePositiveNumber,
      normalizeWindowGroupId,
      normalizeDetachedWindowLockEntry,
      readDetachedWindowLocks,
      writeDetachedWindowLocks,
      upsertDetachedWindowLock,
      removeDetachedWindowLockByWindowId,
      buildDetachedWindowUrl,
      parseDetachedWindowUrl,
      ensureDetachedWindowGroupContext,
      closeDetachedWindowForLockEntry,
      findDetachedWindowByGroupId,
      findDetachedWindowBySessionContext,
      focusDetachedWindow,
      createDetachedWindow,
      sweepDetachedWindowLocks,
      openDetachedWindowForGroup
    };
  }

  globalThis.__CP_DETACHED_WINDOW_RUNTIME__ = {
    createDetachedWindowRuntime
  };
})();
