import { R as e, I as r } from "./index-5uYI7rOK.js";
import { j as t, R as s } from "./index-BVS4T5_D.js";
import { P as i } from "./PairingPrompt-Do4C6yFu.js";

// 语义锚点：pairing 页面 query param 键名
const __cpPairingContract = globalThis.__CP_CONTRACT__?.pairing || {};
const __cpPairingQueryKeys = __cpPairingContract.QUERY_KEYS || {};
const __cpPairingQueryKeyRequestId =
  __cpPairingQueryKeys.REQUEST_ID || "request_id";
const __cpPairingQueryKeyClientType =
  __cpPairingQueryKeys.CLIENT_TYPE || "client_type";
const __cpPairingQueryKeyCurrentName =
  __cpPairingQueryKeys.CURRENT_NAME || "current_name";
const __cpPairingDefaultClientType =
  __cpPairingContract.DEFAULT_CLIENT_TYPE || "desktop";

// 语义锚点：pairing 与后台 bridge 之间的消息 type
const __cpPairingContractMessages = globalThis.__CP_CONTRACT__?.messages || {};
const __cpPairingRuntimeMessageTypeConfirmed =
  __cpPairingContractMessages.pairing_confirmed || "pairing_confirmed";
const __cpPairingRuntimeMessageTypeDismissed =
  __cpPairingContractMessages.pairing_dismissed || "pairing_dismissed";

// 语义锚点：pairing_confirmed / pairing_dismissed 消息 payload 字段名
const __cpPairingMessageFields = __cpPairingContract.MESSAGE_FIELDS || {};
const __cpPairingMessageFieldRequestId =
  __cpPairingMessageFields.REQUEST_ID || "request_id";
const __cpPairingMessageFieldName = __cpPairingMessageFields.NAME || "name";

// 语义锚点：pairing 页面关闭策略（当前 tab 自我关闭）
const __cpPairingCloseDelayMs = __cpPairingContract.CLOSE_DELAY_MS || 100;
const __cpPairingPageRootMountId =
  __cpPairingContract.PAGE_ROOT_MOUNT_ID || "root";
const __cpPairingPromptComponent = i;
function n() {
  chrome.tabs.getCurrent((e) => {
    if (e?.id) {
      chrome.tabs.remove(e.id);
    }
  });
}
// 语义锚点：关闭 pairing 当前标签页（确认/忽略后都会触发）
const __cpPairingCloseCurrentTab = n;
function m() {
  const e = new URLSearchParams(window.location.search);
  // 语义锚点：独立 pairing 页只消费 request_id/client_type/current_name 这 3 个 query 字段；
  // 它不参与 tabId/toolUseId 之类的工具上下文，只负责把配对决定转发给 background / bridge。
  const r = e.get(__cpPairingQueryKeyRequestId) || "";
  const s =
    e.get(__cpPairingQueryKeyClientType) || __cpPairingDefaultClientType;
  const m = e.get(__cpPairingQueryKeyCurrentName) || undefined;
  return t.jsx("div", {
    className: "flex items-center justify-center min-h-screen bg-bg-100 p-4",
    children: t.jsx("div", {
      className: "w-full max-w-md",
      children: t.jsx(__cpPairingPromptComponent, {
        requestId: r,
        clientType: s,
        currentName: m,
        onConfirm: (e, r) => {
          // 用户确认连接：把 request_id + name 回传给 service worker / MCP bridge
          chrome.runtime.sendMessage({
            type: __cpPairingRuntimeMessageTypeConfirmed,
            [__cpPairingMessageFieldRequestId]: e,
            [__cpPairingMessageFieldName]: r,
          });
          setTimeout(__cpPairingCloseCurrentTab, __cpPairingCloseDelayMs);
        },
        onDismiss: (e) => {
          // 用户忽略连接：只回传 request_id（不写入 name）
          // 当前恢复层里未观察到后台显式消费 pairing_dismissed，运行时更接近“取消配对”的协议级 no-op。
          chrome.runtime.sendMessage({
            type: __cpPairingRuntimeMessageTypeDismissed,
            [__cpPairingMessageFieldRequestId]: e,
          });
          setTimeout(__cpPairingCloseCurrentTab, __cpPairingCloseDelayMs);
        },
      }),
    }),
  });
}
// 语义锚点：pairing 页面 React Root 组件入口
const __cpPairingPageAppRootComponent = m;
e.createRoot(document.getElementById(__cpPairingPageRootMountId)).render(
  t.jsx(s.StrictMode, {
    children: t.jsx(r, {
      children: t.jsx(__cpPairingPageAppRootComponent, {}),
    }),
  }),
);
