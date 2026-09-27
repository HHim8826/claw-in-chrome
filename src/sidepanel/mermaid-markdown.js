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
  const VENDOR_PATH = "assets/vendor/mermaid-11.17.2.min.js";
  let vendorPromise;
  let renderRuntimePromise;
  let nextDiagramId = 0;
  const renderAttempts = new WeakMap();
  const diagramHosts = new WeakMap();

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
    const documentMode = String(
      root.document.documentElement.dataset.mode || "",
    ).toLowerCase();
    if (documentMode === "dark") {
      return "dark";
    }
    if (documentMode === "light") {
      return "light";
    }
    return root.matchMedia?.("(prefers-color-scheme: dark)")?.matches
      ? "dark"
      : "light";
  }

  async function renderCodeBlock(codeElement) {
    const pre = codeElement?.parentElement;
    if (!pre || !pre.isConnected) {
      return;
    }
    const source = String(codeElement.textContent || "");
    const theme = getTheme();
    const previousAttempt = renderAttempts.get(pre);
    if (previousAttempt?.source === source && previousAttempt.theme === theme) {
      return;
    }
    const attempt = { source, theme };
    renderAttempts.set(pre, attempt);
    pre.dataset.cpMermaidState = "loading";
    try {
      const runtime = await getRenderRuntime();
      const result = await runtime.render(source, {
        id: `cp-mermaid-${++nextDiagramId}`,
        theme,
      });
      if (renderAttempts.get(pre) !== attempt || !pre.isConnected || codeElement.textContent !== source || getTheme() !== theme) {
        return;
      }
      if (!result.ok) {
        pre.dataset.cpMermaidState = result.reason || "error";
        return;
      }
      const container = diagramHosts.get(pre) || root.document.createElement("div");
      container.className = "cp-mermaid-diagram";
      container.dataset.cpMermaidState = "rendered";
      container.setAttribute("role", "img");
      container.setAttribute("aria-label", "Mermaid diagram");
      container.innerHTML = result.svg;
      // React retains its pre/code nodes. Our host shares the pre lifecycle,
      // so React can update or remove its children without detached-node errors.
      if (!diagramHosts.has(pre)) {
        diagramHosts.set(pre, container);
        pre.appendChild(container);
      }
      pre.dataset.cpMermaidState = "rendered";
    } catch (error) {
      if (renderAttempts.get(pre) !== attempt || !pre.isConnected || codeElement.textContent !== source || getTheme() !== theme) {
        return;
      }
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
        if (record.type === "characterData") {
          const codeElement = record.target?.parentElement;
          if (codeElement?.matches?.(MERMAID_SELECTOR)) {
            renderCodeBlock(codeElement);
          }
          continue;
        }
        if (record.target?.matches?.(MERMAID_SELECTOR)) {
          renderCodeBlock(record.target);
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) {
            if (node.matches?.(MERMAID_SELECTOR)) {
              renderCodeBlock(node);
            }
            scanForMermaidCodeBlocks(node);
          } else if (node.nodeType === 3) {
            const codeElement = node.parentElement;
            if (codeElement?.matches?.(MERMAID_SELECTOR)) {
              renderCodeBlock(codeElement);
            }
          }
        }
      }
    });
    observer.observe(root.document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const themeObserver = new root.MutationObserver(() => scanForMermaidCodeBlocks(root.document));
    themeObserver.observe(root.document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    root.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => scanForMermaidCodeBlocks(root.document));
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
    getTheme,
    loadMermaidVendor,
    renderCodeBlock,
    scanForMermaidCodeBlocks,
    startObserver,
  });
});
