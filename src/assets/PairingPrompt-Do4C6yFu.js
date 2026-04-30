import { r as e, j as s } from "./index-BVS4T5_D.js";
import { u as t, M as o } from "./index-5uYI7rOK.js";

// 语义锚点：pairing prompt 的 client_type 与展示名映射
const __cpPairingClientTypeClaudeCode = "claude-code";
const __cpPairingClientLabelClaudeCode = "Claude Code";
const __cpPairingClientLabelDesktop = "Claude Desktop";

// 语义锚点：pairing prompt 输入框提交按键
const __cpPairingPromptSubmitKey = "Enter";
// 语义锚点：PairingPrompt 组件只负责浏览器命名输入与回调，不直接决定 runtime message。
// sidepanel 内联模式与独立 pairing.html 都会复用它，但真正发 pairing_confirmed / pairing_dismissed 的是调用方。
function r({
  requestId: r,
  clientType: a,
  currentName: l,
  onConfirm: n,
  onDismiss: d,
}) {
  const c = t();
  const [i, x] = e.useState(l || "");
  const u = e.useRef(null);
  const __cpPairingPromptInputRef = u;
  e.useEffect(() => {
    // 语义锚点：pairing 对话框打开后，默认把焦点放到浏览器命名输入框。
    __cpPairingPromptInputRef.current?.focus();
  }, []);
  const b = e.useCallback(() => {
    // 语义锚点：确认分支会先 trim 浏览器名称；空字符串不会触发上层 onConfirm。
    const e = i.trim();
    if (e) {
      n(r, e);
    }
  }, [i, r, n]);
  const __cpPairingPromptConfirmHandler = b;
  const f = e.useCallback(
    (e) => {
      if (e.key === __cpPairingPromptSubmitKey) {
        __cpPairingPromptConfirmHandler();
      }
    },
    [__cpPairingPromptConfirmHandler],
  );
  const __cpPairingPromptKeydownHandler = f;
  const g =
    a === __cpPairingClientTypeClaudeCode
      ? __cpPairingClientLabelClaudeCode
      : __cpPairingClientLabelDesktop;
  const __cpPairingPromptResolvedClientLabel = g;
  return s.jsxs("div", {
    className:
      "flex flex-col gap-4 p-5 bg-bg-100 rounded-xl border border-border-300 shadow-lg",
    children: [
      s.jsxs("div", {
        className: "flex flex-col gap-1",
        children: [
          s.jsx("h3", {
            className: "text-base font-medium text-text-000",
            children: s.jsx(o, {
              defaultMessage: "{clientLabel} wants to connect",
              id: "NkHG2fB0cW",
              values: {
                clientLabel: __cpPairingPromptResolvedClientLabel,
              },
            }),
          }),
          s.jsx("p", {
            className: "text-sm text-text-300",
            children: s.jsx(o, {
              defaultMessage: "Name this browser so you can identify it later.",
              id: "nF7/NB+ws3",
            }),
          }),
        ],
      }),
      s.jsx("input", {
        ref: __cpPairingPromptInputRef,
        type: "text",
        value: i,
        onChange: (e) => x(e.target.value),
        onKeyDown: __cpPairingPromptKeydownHandler,
        placeholder: c.formatMessage({
          defaultMessage: 'e.g., "Work laptop", "Personal Chrome"',
          id: "HnoThnsyPP",
        }),
        className:
          "w-full px-3 py-2 text-sm rounded-lg border border-border-300 bg-bg-000 text-text-000 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-transparent",
      }),
      s.jsxs("div", {
        className: "flex gap-2 justify-end",
        children: [
          s.jsx("button", {
            onClick: () => d(r),
            className:
              "px-4 py-2 text-sm rounded-lg border border-border-300 text-text-200 hover:bg-bg-200 transition-colors",
            children: s.jsx(o, {
              defaultMessage: "Ignore",
              id: "paBpxNk4t8",
            }),
          }),
          s.jsx("button", {
            onClick: __cpPairingPromptConfirmHandler,
            disabled: !i.trim(),
            className:
              "px-4 py-2 text-sm rounded-lg bg-brand-100 text-oncolor-100 hover:bg-brand-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            children: s.jsx(o, {
              defaultMessage: "Connect",
              id: "+vVZ/G11Zg",
            }),
          }),
        ],
      }),
    ],
  });
}
// 语义锚点：PairingPrompt 组件导出（供 pairing 页面引用）
const __cpPairingPromptExportedComponent = r;
export { r as P };
