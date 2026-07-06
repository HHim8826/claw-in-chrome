(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_MERMAID_RENDERER__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const MAX_MERMAID_TEXT_BYTES = 20000;
  const MAX_MERMAID_EDGE_COUNT = 400;
  const DEFAULT_RENDER_TIMEOUT_MS = 5000;
  const FORBIDDEN_SVG_TAGS = [
    "script",
    "foreignObject",
    "iframe",
    "object",
    "embed",
    "image",
    "animate",
    "animateMotion",
    "animateTransform",
    "set",
  ];

  function countLikelyEdges(code) {
    return (
      String(code || "").match(/(?:--+>|==+>|-\.->|~~~|--+|==+)/g) || []
    ).length;
  }

  function validateMermaidSource(value) {
    const code = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!code) {
      return { ok: false, reason: "empty" };
    }
    if (new TextEncoder().encode(code).length > MAX_MERMAID_TEXT_BYTES) {
      return { ok: false, reason: "text_limit" };
    }
    if (countLikelyEdges(code) > MAX_MERMAID_EDGE_COUNT) {
      return { ok: false, reason: "edge_limit" };
    }
    return { ok: true, code };
  }

  function sanitizeStyleValue(value) {
    return String(value || "")
      .replace(/@import\b/gi, "@-blocked-import")
      .replace(/url\((?!\s*["']?#)/gi, "url-blocked(");
  }

  function sanitizeMermaidSvg(svg, parserFactory) {
    const Parser = parserFactory || root.DOMParser;
    if (typeof Parser !== "function") {
      throw new Error("DOMParser is required to sanitize Mermaid SVG");
    }
    const document = new Parser().parseFromString(String(svg || ""), "image/svg+xml");
    const svgRoot = document.documentElement;
    if (!svgRoot || String(svgRoot.nodeName).toLowerCase() !== "svg") {
      throw new Error("Mermaid renderer did not return an SVG root");
    }

    for (const tagName of FORBIDDEN_SVG_TAGS) {
      for (const node of Array.from(document.querySelectorAll(tagName))) {
        node.remove();
      }
    }
    for (const node of Array.from(document.querySelectorAll("*"))) {
      for (const attribute of Array.from(node.attributes || [])) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        if (name.startsWith("on")) {
          node.removeAttribute(attribute.name);
        } else if (
          (name === "href" || name === "xlink:href") &&
          !String(value).trim().startsWith("#")
        ) {
          node.removeAttribute(attribute.name);
        } else if (name === "style") {
          node.setAttribute(attribute.name, sanitizeStyleValue(value));
        }
      }
      if (String(node.nodeName).toLowerCase() === "style") {
        node.textContent = sanitizeStyleValue(node.textContent);
      }
    }
    return svgRoot.outerHTML;
  }

  function withTimeout(promise, timeoutMs) {
    let timeoutId;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Mermaid render exceeded ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]).finally(() => clearTimeout(timeoutId));
  }

  function createMermaidRenderRuntime(options) {
    const config = options && typeof options === "object" ? options : {};
    const mermaid = config.mermaid;
    if (!mermaid?.initialize || !mermaid?.render) {
      throw new Error("createMermaidRenderRuntime requires Mermaid");
    }
    const sanitizeSvg = config.sanitizeSvg || sanitizeMermaidSvg;
    const timeoutMs = Number(config.timeoutMs) || DEFAULT_RENDER_TIMEOUT_MS;

    async function render(value, renderOptions) {
      const validated = validateMermaidSource(value);
      if (!validated.ok) {
        return validated;
      }
      const request = renderOptions && typeof renderOptions === "object"
        ? renderOptions
        : {};
      const dark = request.theme === "dark";
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        maxTextSize: MAX_MERMAID_TEXT_BYTES,
        maxEdges: MAX_MERMAID_EDGE_COUNT,
        fontFamily: "inherit",
        theme: "base",
        themeVariables: dark
          ? {
              primaryTextColor: "#E5E5E5",
              lineColor: "#A1A1A1",
              primaryColor: "transparent",
              primaryBorderColor: "#A1A1A1",
            }
          : {
              primaryTextColor: "#191919",
              lineColor: "#91918D",
              primaryColor: "#F0F0EB",
              primaryBorderColor: "#D9D8D5",
            },
      });
      try {
        const result = await withTimeout(
          Promise.resolve(mermaid.render(request.id, validated.code)),
          timeoutMs,
        );
        return {
          ok: true,
          svg: sanitizeSvg(result.svg),
        };
      } catch (error) {
        return {
          ok: false,
          reason: "render_failed",
          error: error instanceof Error ? error.message : String(error || ""),
        };
      }
    }

    return Object.freeze({ render });
  }

  return Object.freeze({
    DEFAULT_RENDER_TIMEOUT_MS,
    MAX_MERMAID_EDGE_COUNT,
    MAX_MERMAID_TEXT_BYTES,
    createMermaidRenderRuntime,
    sanitizeMermaidSvg,
    validateMermaidSource,
  });
});
