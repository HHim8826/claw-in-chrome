(function () {
  if (globalThis.__CP_GITHUB_UPDATE_WORKER_RUNTIME__) {
    return;
  }

  function createNoopConsole() {
    return {
      info() {},
      warn() {},
      error() {},
    };
  }

  function createGithubUpdateWorkerRuntime(deps) {
    const options = deps && typeof deps === "object" ? deps : {};
    const chromeApi = options.chrome;
    const shared = options.shared;
    if (!chromeApi) {
      throw new Error(
        "createGithubUpdateWorkerRuntime requires a chrome dependency",
      );
    }
    if (!shared) {
      throw new Error(
        "createGithubUpdateWorkerRuntime requires a shared dependency",
      );
    }

    const consoleApi =
      options.console || globalThis.console || createNoopConsole();
    const fetchImpl = options.fetch || globalThis.fetch;
    const now =
      typeof options.now === "function" ? options.now : () => Date.now();
    const {
      LATEST_JSON_URL,
      STORAGE_KEYS,
      MESSAGE_TYPES,
      ALARM_NAME,
      CHECK_INTERVAL_MINUTES,
      normalizeVersion,
      computeHasUpdate,
      isBlockedByMinVersion,
      createDefaultUpdateInfo,
      normalizeStoredInfo,
      normalizeLatestPayload,
    } = shared;

    function log(event, detail, level) {
      const method =
        level === "error" ? "error" : level === "warn" ? "warn" : "info";
      try {
        const logger =
          typeof consoleApi[method] === "function"
            ? consoleApi[method]
            : consoleApi.info;
        logger.call(consoleApi, "[github-update]", event, detail || "");
      } catch {}
    }

    function getCurrentVersion() {
      return normalizeVersion(chromeApi.runtime?.getManifest?.().version || "");
    }

    function getVersionInfoPayload(info) {
      if (info && info.minSupportedVersion) {
        return {
          min_supported_version: info.minSupportedVersion,
        };
      }
      return {};
    }

    function shouldSkipNetworkCheck(info, force) {
      if (force || !info?.lastCheckedAt) {
        return false;
      }
      const lastCheckedTime = new Date(info.lastCheckedAt).getTime();
      if (!Number.isFinite(lastCheckedTime) || lastCheckedTime <= 0) {
        return false;
      }
      return now() - lastCheckedTime < CHECK_INTERVAL_MINUTES * 60 * 1000;
    }

    async function readStoredState() {
      if (!chromeApi.storage?.local) {
        return {
          info: createDefaultUpdateInfo(""),
          dismissedVersion: "",
          autoCheckEnabled: true,
          seenVersion: "",
          previousVersion: "",
        };
      }
      const currentVersion = getCurrentVersion();
      const stored = await chromeApi.storage.local.get([
        STORAGE_KEYS.INFO,
        STORAGE_KEYS.DISMISSED_VERSION,
        STORAGE_KEYS.AUTO_CHECK_ENABLED,
        STORAGE_KEYS.SEEN_VERSION,
        STORAGE_KEYS.PREVIOUS_VERSION,
      ]);
      return {
        info: normalizeStoredInfo(stored[STORAGE_KEYS.INFO], currentVersion),
        dismissedVersion: String(
          stored[STORAGE_KEYS.DISMISSED_VERSION] || "",
        ).trim(),
        autoCheckEnabled: stored[STORAGE_KEYS.AUTO_CHECK_ENABLED] !== false,
        seenVersion: String(stored[STORAGE_KEYS.SEEN_VERSION] || "").trim(),
        previousVersion: String(
          stored[STORAGE_KEYS.PREVIOUS_VERSION] || "",
        ).trim(),
      };
    }

    async function isAutoCheckEnabled() {
      const state = await readStoredState();
      return state.autoCheckEnabled !== false;
    }

    async function syncBadge(hasUpdate) {
      if (!chromeApi.action?.setBadgeText) {
        return;
      }
      const visible = !!hasUpdate;
      try {
        await chromeApi.action.setBadgeText({
          text: visible ? "NEW" : "",
        });
        if (visible) {
          await chromeApi.action.setBadgeBackgroundColor?.({
            color: "#ca4330",
          });
          await chromeApi.action.setBadgeTextColor?.({
            color: "#ffffff",
          });
        }
      } catch (error) {
        log(
          "badge.sync_failed",
          {
            error: String(error?.message || error || ""),
          },
          "warn",
        );
      }
    }

    async function persistInfo(info) {
      const normalizedInfo = normalizeStoredInfo(info, getCurrentVersion());
      await chromeApi.storage.local.set({
        [STORAGE_KEYS.INFO]: normalizedInfo,
        [STORAGE_KEYS.UPDATE_AVAILABLE]: normalizedInfo.hasUpdate,
        [STORAGE_KEYS.VERSION_INFO]: getVersionInfoPayload(normalizedInfo),
      });
      await syncBadge(normalizedInfo.hasUpdate);
      return normalizedInfo;
    }

    async function syncInstalledVersion() {
      const currentVersion = getCurrentVersion();
      const state = await readStoredState();
      const nextInfo = normalizeStoredInfo(state.info, currentVersion);
      const updates = {};
      let needsPersist = false;

      if (
        state.info.currentVersion !== nextInfo.currentVersion ||
        state.info.hasUpdate !== nextInfo.hasUpdate ||
        state.info.latestVersion !== nextInfo.latestVersion ||
        state.info.minSupportedVersion !== nextInfo.minSupportedVersion
      ) {
        needsPersist = true;
      }

      const previousVersion = normalizeVersion(state.previousVersion);
      if (!previousVersion) {
        updates[STORAGE_KEYS.PREVIOUS_VERSION] = currentVersion;
      } else if (previousVersion !== currentVersion) {
        updates[STORAGE_KEYS.PREVIOUS_VERSION] = currentVersion;
        needsPersist = true;
      }

      if (needsPersist) {
        updates[STORAGE_KEYS.INFO] = nextInfo;
        updates[STORAGE_KEYS.UPDATE_AVAILABLE] = nextInfo.hasUpdate;
        updates[STORAGE_KEYS.VERSION_INFO] = getVersionInfoPayload(nextInfo);
      }

      if (Object.keys(updates).length > 0) {
        await chromeApi.storage.local.set(updates);
      }
      await syncBadge(nextInfo.hasUpdate);
      return {
        state,
        info: nextInfo,
      };
    }

    async function fetchLatestPayload() {
      if (typeof fetchImpl !== "function") {
        throw new Error("更新检查缺少 fetch 实现。");
      }
      const response = await fetchImpl(LATEST_JSON_URL, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`更新元数据请求失败（HTTP ${response.status}）。`);
      }
      return response.json();
    }

    async function performUpdateCheck(options) {
      const settings = options && typeof options === "object" ? options : {};
      const currentVersion = getCurrentVersion();
      const lifecycle = await syncInstalledVersion(
        settings.lifecycleReason || "",
      );
      const cachedInfo = normalizeStoredInfo(lifecycle.info, currentVersion);

      if (shouldSkipNetworkCheck(cachedInfo, settings.force === true)) {
        log("check.skipped_recently", {
          reason: settings.reason || "unknown",
          lastCheckedAt: cachedInfo.lastCheckedAt,
        });
        return {
          ok: true,
          info: cachedInfo,
          fromCache: true,
        };
      }

      try {
        const rawPayload = await fetchLatestPayload();
        const normalizedInfo = normalizeLatestPayload(
          rawPayload,
          currentVersion,
        );
        const persistedInfo = await persistInfo(normalizedInfo);
        log("check.success", {
          reason: settings.reason || "unknown",
          currentVersion,
          latestVersion: persistedInfo.latestVersion,
          hasUpdate: persistedInfo.hasUpdate,
          minSupportedVersion: persistedInfo.minSupportedVersion,
        });
        return {
          ok: true,
          info: persistedInfo,
          fromCache: false,
        };
      } catch (error) {
        const errorMessage = String(error?.message || error || "未知错误");
        log(
          "check.failed",
          {
            reason: settings.reason || "unknown",
            error: errorMessage,
          },
          settings.silent ? "warn" : "error",
        );
        if (!settings.silent) {
          throw error instanceof Error ? error : new Error(errorMessage);
        }
        return {
          ok: false,
          info: cachedInfo,
          error: errorMessage,
          fromCache: true,
        };
      }
    }

    async function dismissUpdateBanner(version) {
      const currentDismissedVersion = normalizeVersion(version);
      await chromeApi.storage.local.set({
        [STORAGE_KEYS.DISMISSED_VERSION]: currentDismissedVersion,
      });
    }

    async function initializeAlarm(forceEnabled) {
      if (!chromeApi.alarms?.create) {
        return;
      }
      const enabled =
        typeof forceEnabled === "boolean"
          ? forceEnabled
          : await isAutoCheckEnabled();
      if (!enabled) {
        await chromeApi.alarms.clear?.(ALARM_NAME);
        return;
      }
      await chromeApi.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: CHECK_INTERVAL_MINUTES,
      });
    }

    async function onInstalled(details) {
      const reason = details?.reason || "";
      try {
        await initializeAlarm();
        if (!(await isAutoCheckEnabled())) {
          await syncInstalledVersion(reason);
          return;
        }
        await performUpdateCheck({
          force: true,
          silent: true,
          reason: "onInstalled",
          lifecycleReason: reason,
        });
      } catch (error) {
        log(
          "install.init_failed",
          {
            reason,
            error: String(error?.message || error || ""),
          },
          "warn",
        );
      }
    }

    async function onStartup() {
      try {
        await initializeAlarm();
        if (!(await isAutoCheckEnabled())) {
          await syncInstalledVersion("startup");
          return;
        }
        await performUpdateCheck({
          force: false,
          silent: true,
          reason: "onStartup",
          lifecycleReason: "startup",
        });
      } catch (error) {
        log(
          "startup.init_failed",
          {
            error: String(error?.message || error || ""),
          },
          "warn",
        );
      }
    }

    function createAlarmHandler() {
      return function onAlarm(alarm) {
        if (!alarm || alarm.name !== ALARM_NAME) {
          return;
        }
        isAutoCheckEnabled()
          .then(function (enabled) {
            if (!enabled) {
              return initializeAlarm(false);
            }
            return performUpdateCheck({
              force: true,
              silent: true,
              reason: "alarm",
            });
          })
          .catch(function (error) {
            log(
              "alarm.check_failed",
              {
                error: String(error?.message || error || ""),
              },
              "warn",
            );
          });
      };
    }

    function createStorageChangedHandler() {
      return function onStorageChanged(changes, areaName) {
        if (areaName !== "local" || !changes[STORAGE_KEYS.AUTO_CHECK_ENABLED]) {
          return;
        }
        const enabled =
          changes[STORAGE_KEYS.AUTO_CHECK_ENABLED].newValue !== false;
        initializeAlarm(enabled).catch(function (error) {
          log(
            "alarm.reconfigure_failed",
            {
              enabled,
              error: String(error?.message || error || ""),
            },
            "warn",
          );
        });
      };
    }

    function createMessageHandler() {
      return function onMessage(message, sender, sendResponse) {
        const type = message?.type;
        if (type === MESSAGE_TYPES.CHECK_NOW) {
          performUpdateCheck({
            force: true,
            silent: false,
            reason: "manual_check",
          })
            .then(function (result) {
              sendResponse({
                ok: true,
                info: result.info,
              });
            })
            .catch(function (error) {
              sendResponse({
                ok: false,
                error: String(error?.message || error || "检查更新失败。"),
              });
            });
          return true;
        }
        if (type === MESSAGE_TYPES.DISMISS) {
          dismissUpdateBanner(message?.version || "")
            .then(function () {
              sendResponse({
                ok: true,
              });
            })
            .catch(function (error) {
              sendResponse({
                ok: false,
                error: String(error?.message || error || "忽略更新失败。"),
              });
            });
          return true;
        }
        return false;
      };
    }

    async function bootstrap() {
      try {
        await initializeAlarm();
        const state = await readStoredState();
        const currentVersion = getCurrentVersion();
        const info = normalizeStoredInfo(state.info, currentVersion);
        const fixedInfo = {
          ...createDefaultUpdateInfo(currentVersion),
          ...info,
          currentVersion,
          hasUpdate: computeHasUpdate(currentVersion, info.latestVersion),
          minSupportedVersion: info.minSupportedVersion || null,
        };
        fixedInfo.hasUpdate = computeHasUpdate(
          fixedInfo.currentVersion,
          fixedInfo.latestVersion,
        );
        if (
          isBlockedByMinVersion(
            fixedInfo.currentVersion,
            fixedInfo.minSupportedVersion,
          )
        ) {
          fixedInfo.hasUpdate = fixedInfo.hasUpdate || false;
        }
        await persistInfo(fixedInfo);
        await syncInstalledVersion("bootstrap");
      } catch (error) {
        log(
          "bootstrap.failed",
          {
            error: String(error?.message || error || ""),
          },
          "warn",
        );
      }
    }

    const handlers = {
      onInstalled,
      onStartup,
      onAlarm: createAlarmHandler(),
      onStorageChanged: createStorageChangedHandler(),
      onMessage: createMessageHandler(),
    };

    return {
      shared,
      chrome: chromeApi,
      log,
      getCurrentVersion,
      getVersionInfoPayload,
      shouldSkipNetworkCheck,
      readStoredState,
      isAutoCheckEnabled,
      syncBadge,
      persistInfo,
      syncInstalledVersion,
      fetchLatestPayload,
      performUpdateCheck,
      dismissUpdateBanner,
      initializeAlarm,
      createAlarmHandler,
      createStorageChangedHandler,
      createMessageHandler,
      bootstrap,
      handlers,
    };
  }

  function registerGithubUpdateWorker(deps) {
    const runtime = createGithubUpdateWorkerRuntime(deps);
    const chromeApi = runtime.chrome;
    chromeApi.runtime?.onInstalled?.addListener?.(runtime.handlers.onInstalled);
    chromeApi.runtime?.onStartup?.addListener?.(runtime.handlers.onStartup);
    chromeApi.alarms?.onAlarm?.addListener?.(runtime.handlers.onAlarm);
    chromeApi.storage?.onChanged?.addListener?.(
      runtime.handlers.onStorageChanged,
    );
    chromeApi.runtime?.onMessage?.addListener?.(runtime.handlers.onMessage);
    if (deps?.bootstrap !== false) {
      runtime.bootstrap();
    }
    return runtime;
  }

  globalThis.__CP_GITHUB_UPDATE_WORKER_RUNTIME__ = {
    createGithubUpdateWorkerRuntime,
    registerGithubUpdateWorker,
  };
})();
