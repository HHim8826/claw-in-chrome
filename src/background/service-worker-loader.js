import "./claw-contract.js";
// 先补原生宿主显式绑定补丁，确保后续 bundle connectNative 时会主动上报 browser/profile 实例归属。
import "./native-host-binding.js";
import "./mcp-permission-popup-protocol.js";
import "./custom-provider-models.js";
import "./provider-format-adapter.js";
import "./telemetry-disable.js";
// 先加载发行版 bundle，保留原有 background 主桥。
import "./assets/service-worker.ts-H0DVM1LS.js";
import "./github-update-shared.js";
import "./github-update-worker.js";
// 再加载 detached window runtime，与 recovered runtime 组合出第二轮恢复层。
import "./service-worker-detached-window-runtime.js";
import "./service-worker-shortcut-workflow-sync.js";
import "./service-worker-runtime.js";

const serviceWorkerRuntimeApi = globalThis.__CP_SERVICE_WORKER_RUNTIME__;
const detachedWindowRuntimeApi = globalThis.__CP_DETACHED_WINDOW_RUNTIME__;
const detachedWindowRuntime = detachedWindowRuntimeApi?.createDetachedWindowRuntime({
  chrome,
  console
});

// Clear the uninstall survey URL registered by the bundled worker.
const clearUninstallUrl = async () => {
  try {
    await chrome.runtime.setUninstallURL("");
  } catch {}
};

// loader 的职责边界：
// 1) 保留 bundle 原来的 runtime.onMessage / onStartup / onInstalled 主桥
// 2) 额外挂入 recovered runtime，补 detached window / cleanup / maintenance
// 3) 通过依赖注入把 lock sweep/open/close/remove 串到 recovered runtime
if (serviceWorkerRuntimeApi && detachedWindowRuntime) {
  serviceWorkerRuntimeApi.registerServiceWorkerRuntimeHandlers({
    chrome,
    console,
    clearUninstallUrl,
    sweepDetachedWindowLocks: detachedWindowRuntime.sweepDetachedWindowLocks,
    readDetachedWindowLocks: detachedWindowRuntime.readDetachedWindowLocks,
    closeDetachedWindowForLockEntry: detachedWindowRuntime.closeDetachedWindowForLockEntry,
    removeDetachedWindowLockByWindowId: detachedWindowRuntime.removeDetachedWindowLockByWindowId,
    openDetachedWindowForGroup: detachedWindowRuntime.openDetachedWindowForGroup,
    normalizePositiveNumber: detachedWindowRuntime.normalizePositiveNumber
  });
}
