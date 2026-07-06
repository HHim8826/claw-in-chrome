(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_MERMAID_MARKDOWN__ = api;
  if (root.document && root.chrome?.runtime) {
    api.bootstrap();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const MERMAID_SELECTOR =
    "pre > code.language-mermaid, pre > code.lang-mermaid";
  const VENDOR_PATH = "assets/vendor/mermaid-11.15.0.min.js";
  let vendorPromise;
  let renderRuntimePromise;
  let nextDiagramId = 0;

  function loadMermaidVendor() {
    const existing = root.mermaid?.default || root.mermaid;
    if (existing?.render) {
      return Promise.resolve(existing);
    }
    if (!vendorPromise) {
      vendorPromise = new Promise((resolve, reject) => {
        const script = root.document.createElement("script");
        script.src = root.chrome.runtime.getURL(VENDOR_PATH);
        script.async = true;
        script.dataset.cpMermaidVendor = "true";
        script.addEventListener("load", () => {
          const mermaid = root.mermaid?.default || root.mermaid;
          if (mermaid?.render) {
            resolve(mermaid);
          } else {
            reject(new Error("Mermaid vendor loaded without a render API"));
          }
        });
        script.addEventListener("error", () => {
          reject(new Error("Failed to load the packaged Mermaid vendor"));
        });
        root.document.head.appendChild(script);
      });
    }
    return vendorPromise;
  }

  async function getRenderRuntime() {
    if (!renderRuntimePromise) {
      renderRuntimePromise = loadMermaidVendor().then((mermaid) =>
        root.__CP_MERMAID_RENDERER__.createMermaidRenderRuntime({ mermaid }),
      );
    }
    return renderRuntimePromise;
  }

  function getTheme() {
    const documentTheme = String(
      root.document.documentElement.dataset.theme || "",
    ).toLowerCase();
    if (documentTheme === "dark") {
      return "dark";
    }
    return root.matchMedia?.("(prefers-color-scheme: dark)")?.matches
      ? "dark"
      : "light";
  }

  async function renderCodeBlock(codeElement) {
    const pre = codeElement?.parentElement;
    if (!pre || pre.dataset.cpMermaidState) {
      return;
    }
    pre.dataset.cpMermaidState = "loading";
    try {
      const runtime = await getRenderRuntime();
      const result = await runtime.render(codeElement.textContent, {
        id: `cp-mermaid-${++nextDiagramId}`,
        theme: getTheme(),
      });
      if (!result.ok) {
        pre.dataset.cpMermaidState = result.reason || "error";
        return;
      }
      const container = root.document.createElement("div");
      container.className = "cp-mermaid-diagram";
      container.dataset.cpMermaidState = "rendered";
      container.setAttribute("role", "img");
      container.setAttribute("aria-label", "Mermaid diagram");
      container.innerHTML = result.svg;
      pre.replaceWith(container);
    } catch (error) {
      pre.dataset.cpMermaidState = "error";
      root.console?.warn?.("[mermaid] diagram render failed", {
        message: error instanceof Error ? error.message : String(error || ""),
      });
    }
  }

  function scanForMermaidCodeBlocks(target) {
    if (!target?.querySelectorAll) {
      return;
    }
    for (const codeElement of target.querySelectorAll(MERMAID_SELECTOR)) {
      renderCodeBlock(codeElement);
    }
  }

  function startObserver() {
    scanForMermaidCodeBlocks(root.document);
    const observer = new root.MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) {
            if (node.matches?.(MERMAID_SELECTOR)) {
              renderCodeBlock(node);
            }
            scanForMermaidCodeBlocks(node);
          }
        }
      }
    });
    observer.observe(root.document.body, { childList: true, subtree: true });
    return observer;
  }

  function bootstrap() {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", startObserver, {
        once: true,
      });
      return;
    }
    startObserver();
  }

  return Object.freeze({
    MERMAID_SELECTOR,
    VENDOR_PATH,
    bootstrap,
    loadMermaidVendor,
    renderCodeBlock,
    scanForMermaidCodeBlocks,
    startObserver,
  });
});
