(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.__CP_TOOL_ACTIVITY_LABELS__ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Running, done, and failed labels for browser tool rows (upstream 1.0.94).
  // Each entry is a react-intl descriptor so side-panel locales can translate it.
  const MESSAGES = Object.freeze({
    "capturePage_running": Object.freeze({ id: "o6xZ7JK8IM", defaultMessage: "Capturing page" }),
    "capturePage_done": Object.freeze({ id: "EAZPUYU73J", defaultMessage: "Captured page" }),
    "capturePage_failed": Object.freeze({ id: "b4+liC9hEn", defaultMessage: "Couldn't capture page" }),
    "click_running": Object.freeze({ id: "n43/KMHgLD", defaultMessage: "Clicking" }),
    "click_done": Object.freeze({ id: "+g7iCcSth9", defaultMessage: "Clicked" }),
    "click_failed": Object.freeze({ id: "wWOoIV6956", defaultMessage: "Click failed" }),
    "type_running": Object.freeze({ id: "N2bqd9kL1X", defaultMessage: "Typing" }),
    "type_done": Object.freeze({ id: "0e82oPizDE", defaultMessage: "Typed" }),
    "type_failed": Object.freeze({ id: "aYjRki9tcg", defaultMessage: "Couldn't type" }),
    "pressKeys_running": Object.freeze({ id: "kxP/97PJd1", defaultMessage: "Pressing {keys}" }),
    "pressKeys_done": Object.freeze({ id: "PcXD15icqQ", defaultMessage: "Pressed {keys}" }),
    "pressKeys_failed": Object.freeze({ id: "xPw8nmmI29", defaultMessage: "Couldn't press {keys}" }),
    "pressKey_running": Object.freeze({ id: "R6bmgzv6Xs", defaultMessage: "Pressing key" }),
    "pressKey_done": Object.freeze({ id: "XTce7I09Ix", defaultMessage: "Pressed key" }),
    "pressKey_failed": Object.freeze({ id: "Nu/BcHWKn0", defaultMessage: "Couldn't press key" }),
    "holdKeys_running": Object.freeze({ id: "/WafiQssBm", defaultMessage: "Holding {keys}" }),
    "holdKeys_done": Object.freeze({ id: "N6B+P+IR5D", defaultMessage: "Held {keys}" }),
    "holdKeys_failed": Object.freeze({ id: "PT2vOoFi9y", defaultMessage: "Couldn't hold {keys}" }),
    "holdKey_running": Object.freeze({ id: "4p9ISBT4CQ", defaultMessage: "Holding key" }),
    "holdKey_done": Object.freeze({ id: "0XKB/myU8B", defaultMessage: "Held key" }),
    "holdKey_failed": Object.freeze({ id: "ZIVgIYKP1n", defaultMessage: "Couldn't hold key" }),
    "scrollDown_running": Object.freeze({ id: "SvPr/lnfNb", defaultMessage: "Scrolling down" }),
    "scrollDown_done": Object.freeze({ id: "dZdDvwP+62", defaultMessage: "Scrolled down" }),
    "scrollDown_failed": Object.freeze({ id: "lz6EpfL021", defaultMessage: "Couldn't scroll" }),
    "scrollUp_running": Object.freeze({ id: "gsZoWr7ipW", defaultMessage: "Scrolling up" }),
    "scrollUp_done": Object.freeze({ id: "bH5aVBZ5W2", defaultMessage: "Scrolled up" }),
    "scrollUp_failed": Object.freeze({ id: "lz6EpfL021", defaultMessage: "Couldn't scroll" }),
    "scrollLeft_running": Object.freeze({ id: "80JDFNGo43", defaultMessage: "Scrolling left" }),
    "scrollLeft_done": Object.freeze({ id: "d9LnYFiznm", defaultMessage: "Scrolled left" }),
    "scrollLeft_failed": Object.freeze({ id: "lz6EpfL021", defaultMessage: "Couldn't scroll" }),
    "scrollRight_running": Object.freeze({ id: "73TpAH/Qml", defaultMessage: "Scrolling right" }),
    "scrollRight_done": Object.freeze({ id: "IImRsQp5Uv", defaultMessage: "Scrolled right" }),
    "scrollRight_failed": Object.freeze({ id: "lz6EpfL021", defaultMessage: "Couldn't scroll" }),
    "scroll_running": Object.freeze({ id: "/UUUqdefcb", defaultMessage: "Scrolling" }),
    "scroll_done": Object.freeze({ id: "672p7Kbd7U", defaultMessage: "Scrolled" }),
    "scroll_failed": Object.freeze({ id: "lz6EpfL021", defaultMessage: "Couldn't scroll" }),
    "scrollTo_running": Object.freeze({ id: "XHgDuj8n73", defaultMessage: "Scrolling to element" }),
    "scrollTo_done": Object.freeze({ id: "ILYvJegu9k", defaultMessage: "Scrolled to element" }),
    "scrollTo_failed": Object.freeze({ id: "ozLC2SiMGF", defaultMessage: "Couldn't scroll to element" }),
    "waitSeconds_running": Object.freeze({ id: "PYMhR4zruJ", defaultMessage: "Waiting {count, plural, one {# second} other {# seconds}}" }),
    "waitSeconds_done": Object.freeze({ id: "AuyYFaSPkw", defaultMessage: "Waited {count, plural, one {# second} other {# seconds}}" }),
    "waitSeconds_failed": Object.freeze({ id: "tpPpYuvoAg", defaultMessage: "Couldn't wait" }),
    "wait_running": Object.freeze({ id: "dZd8H/KE0T", defaultMessage: "Waiting" }),
    "wait_done": Object.freeze({ id: "sZ3Xznotg3", defaultMessage: "Waited" }),
    "wait_failed": Object.freeze({ id: "tpPpYuvoAg", defaultMessage: "Couldn't wait" }),
    "drag_running": Object.freeze({ id: "A/Bht8akH/", defaultMessage: "Dragging" }),
    "drag_done": Object.freeze({ id: "M1glAkJ8dR", defaultMessage: "Dragged" }),
    "drag_failed": Object.freeze({ id: "OY26Syn2dl", defaultMessage: "Couldn't drag" }),
    "zoom_running": Object.freeze({ id: "NJUeUCIdF0", defaultMessage: "Zooming in" }),
    "zoom_done": Object.freeze({ id: "6LV0jSPpSu", defaultMessage: "Zoomed in" }),
    "zoom_failed": Object.freeze({ id: "+5o4AqxYL8", defaultMessage: "Couldn't zoom in" }),
    "hover_running": Object.freeze({ id: "ZJVy4R7mdx", defaultMessage: "Hovering" }),
    "hover_done": Object.freeze({ id: "ZBSugpNONo", defaultMessage: "Hovered" }),
    "hover_failed": Object.freeze({ id: "u/wRvRWkOt", defaultMessage: "Couldn't hover" }),
    "interact_running": Object.freeze({ id: "ooBXkRqiEz", defaultMessage: "Interacting with page" }),
    "interact_done": Object.freeze({ id: "69a0ZeJ7BD", defaultMessage: "Interacted with page" }),
    "interact_failed": Object.freeze({ id: "4c5vo8jUYc", defaultMessage: "Action failed" }),
    "openHost_running": Object.freeze({ id: "7fA2y973hk", defaultMessage: "Opening {host}" }),
    "openHost_done": Object.freeze({ id: "3fKEDnuUaH", defaultMessage: "Opened {host}" }),
    "openHost_failed": Object.freeze({ id: "coSVU1oSuH", defaultMessage: "Couldn't open {host}" }),
    "open_running": Object.freeze({ id: "d0Gd72QIqC", defaultMessage: "Opening" }),
    "open_done": Object.freeze({ id: "ADKsIDW3/I", defaultMessage: "Opened" }),
    "open_failed": Object.freeze({ id: "nxzRsqxNJt", defaultMessage: "Couldn't open" }),
    "openWebPage_running": Object.freeze({ id: "Qb4fM+3ryM", defaultMessage: "Opening a web page" }),
    "openWebPage_done": Object.freeze({ id: "w/5sCJCcq9", defaultMessage: "Opened a web page" }),
    "openWebPage_failed": Object.freeze({ id: "sheWUP5dl/", defaultMessage: "Couldn't open a web page" }),
    "openPage_running": Object.freeze({ id: "4AgEiHUd74", defaultMessage: "Opening a page" }),
    "openPage_done": Object.freeze({ id: "y2UvQOooaD", defaultMessage: "Opened a page" }),
    "openPage_failed": Object.freeze({ id: "XE6tFsxNtw", defaultMessage: "Couldn't open the page" }),
    "goBack_running": Object.freeze({ id: "83gEHpex/T", defaultMessage: "Going back" }),
    "goBack_done": Object.freeze({ id: "pru+m10FBY", defaultMessage: "Went back" }),
    "goBack_failed": Object.freeze({ id: "WduMa14SDg", defaultMessage: "Couldn't go back" }),
    "goForward_running": Object.freeze({ id: "hSULs7vBDV", defaultMessage: "Going forward" }),
    "goForward_done": Object.freeze({ id: "ZCDFvBAl0X", defaultMessage: "Went forward" }),
    "goForward_failed": Object.freeze({ id: "X0ZUYNBZZU", defaultMessage: "Couldn't go forward" }),
    "readPage_running": Object.freeze({ id: "eEZaxWqt5u", defaultMessage: "Reading page" }),
    "readPage_done": Object.freeze({ id: "hbWicV9xaa", defaultMessage: "Read page" }),
    "readPage_failed": Object.freeze({ id: "OnXxw7JgDl", defaultMessage: "Couldn't read page" }),
    "readPageInteractive_running": Object.freeze({ id: "n//GvnuhK4", defaultMessage: "Reading page (interactive)" }),
    "readPageInteractive_done": Object.freeze({ id: "6kGP03sC6R", defaultMessage: "Read page (interactive)" }),
    "readPageInteractive_failed": Object.freeze({ id: "OnXxw7JgDl", defaultMessage: "Couldn't read page" }),
    "readPageText_running": Object.freeze({ id: "m6WGRc6ReI", defaultMessage: "Reading page text" }),
    "readPageText_done": Object.freeze({ id: "onPRJ+aSFI", defaultMessage: "Read page text" }),
    "readPageText_failed": Object.freeze({ id: "elRNF3ZpcK", defaultMessage: "Couldn't read page text" }),
    "findQuery_running": Object.freeze({ id: "GCJIjd0qGP", defaultMessage: "Finding \"{query}\"" }),
    "findQuery_done": Object.freeze({ id: "K8xPRrHYKK", defaultMessage: "Found \"{query}\"" }),
    "findQuery_failed": Object.freeze({ id: "S8/4g6nLzi", defaultMessage: "Couldn't find \"{query}\"" }),
    "find_running": Object.freeze({ id: "RbTkag4BPg", defaultMessage: "Finding" }),
    "find_done": Object.freeze({ id: "I0XzdzV1yn", defaultMessage: "Found" }),
    "find_failed": Object.freeze({ id: "Vdohls7eQo", defaultMessage: "Couldn't find" }),
    "findOnPage_running": Object.freeze({ id: "9t4b7HghkI", defaultMessage: "Finding on page" }),
    "findOnPage_done": Object.freeze({ id: "KOkigyvwo6", defaultMessage: "Found on page" }),
    "findOnPage_failed": Object.freeze({ id: "uMeMeJOiSW", defaultMessage: "Couldn't search the page" }),
    "fillField_running": Object.freeze({ id: "7lU62JULDn", defaultMessage: "Filling in a field" }),
    "fillField_done": Object.freeze({ id: "U1xvVC82vn", defaultMessage: "Filled in a field" }),
    "fillField_failed": Object.freeze({ id: "w+tlc3bi3x", defaultMessage: "Couldn't fill in a field" }),
    "runScript_running": Object.freeze({ id: "9llqYnE3I/", defaultMessage: "Running page script" }),
    "runScript_done": Object.freeze({ id: "TQ0tUh4WNd", defaultMessage: "Ran page script" }),
    "runScript_failed": Object.freeze({ id: "IYHsoxgIYp", defaultMessage: "Page script failed" }),
    "readConsole_running": Object.freeze({ id: "heJE9n5znd", defaultMessage: "Reading console" }),
    "readConsole_done": Object.freeze({ id: "wRiIV0NI3D", defaultMessage: "Read console" }),
    "readConsole_failed": Object.freeze({ id: "CqfcGaccdR", defaultMessage: "Couldn't read console" }),
    "readNetwork_running": Object.freeze({ id: "JfpnrWBMe7", defaultMessage: "Reading network activity" }),
    "readNetwork_done": Object.freeze({ id: "73Ps4Q7rMy", defaultMessage: "Read network activity" }),
    "readNetwork_failed": Object.freeze({ id: "8wDr80s9Is", defaultMessage: "Couldn't read network activity" }),
    "resizeBrowser_running": Object.freeze({ id: "HxVOuDCcNs", defaultMessage: "Resizing browser" }),
    "resizeBrowser_done": Object.freeze({ id: "nmwZ2p6b9I", defaultMessage: "Resized browser" }),
    "resizeBrowser_failed": Object.freeze({ id: "G2aEPJXfDc", defaultMessage: "Couldn't resize browser" }),
    "checkTabs_running": Object.freeze({ id: "UG+F+Yk+/S", defaultMessage: "Checking tabs" }),
    "checkTabs_done": Object.freeze({ id: "6ACIjWz1m/", defaultMessage: "Checked tabs" }),
    "checkTabs_failed": Object.freeze({ id: "ISp+T0X+Ni", defaultMessage: "Couldn't check tabs" }),
    "openTab_running": Object.freeze({ id: "ySnoI+lduZ", defaultMessage: "Opening tab" }),
    "openTab_done": Object.freeze({ id: "pYfiD43Tm8", defaultMessage: "Opened tab" }),
    "openTab_failed": Object.freeze({ id: "qS02VU0B5G", defaultMessage: "Couldn't open tab" }),
    "closeTab_running": Object.freeze({ id: "T6ehqzKTJn", defaultMessage: "Closing tab" }),
    "closeTab_done": Object.freeze({ id: "41aIFCLMZP", defaultMessage: "Closed tab" }),
    "closeTab_failed": Object.freeze({ id: "UvTY5LfvD8", defaultMessage: "Couldn't close tab" }),
    "uploadImage_running": Object.freeze({ id: "91bF7FZ/XO", defaultMessage: "Uploading image" }),
    "uploadImage_done": Object.freeze({ id: "W3e7Z5tuOJ", defaultMessage: "Uploaded image" }),
    "uploadImage_failed": Object.freeze({ id: "lsSn6Q7oyA", defaultMessage: "Couldn't upload image" }),
    "uploadFile_running": Object.freeze({ id: "Jm6wfb7Z/V", defaultMessage: "Uploading file" }),
    "uploadFile_done": Object.freeze({ id: "aybHCNr4ux", defaultMessage: "Uploaded file" }),
    "uploadFile_failed": Object.freeze({ id: "JIppAYNwOi", defaultMessage: "Couldn't upload file" }),
    "createGif_running": Object.freeze({ id: "8TttJwI4dK", defaultMessage: "Creating GIF" }),
    "createGif_done": Object.freeze({ id: "/HtX391N53", defaultMessage: "Created GIF" }),
    "createGif_failed": Object.freeze({ id: "OurtqejoUB", defaultMessage: "Couldn't create GIF" }),
    "browserActions_running": Object.freeze({ id: "5BlyZiq8dj", defaultMessage: "Performing browser actions" }),
    "browserActions_done": Object.freeze({ id: "nfn1MOHJNy", defaultMessage: "Performed browser actions" }),
    "browserActions_failed": Object.freeze({ id: "+dIJ5ibT8Q", defaultMessage: "Couldn't perform browser actions" }),
    "batchCount": Object.freeze({ id: "9PnBSKt3zo", defaultMessage: "Batch — {count, plural, one {# action} other {# actions}}" }),
    "planCreated": Object.freeze({ id: "aXfQ2L8ErF", defaultMessage: "Created a plan" }),
    "planRejected": Object.freeze({ id: "7wJz7kSrLT", defaultMessage: "Plan rejected" }),
    "planFollowing": Object.freeze({ id: "UJdVFK2KyY", defaultMessage: "Following a plan" }),
    "computerAction": Object.freeze({ id: "xLpBTyWHMH", defaultMessage: "Computer action: {action}" }),
  });

  function truncate(value, limit = 30) {
    const text = String(value);
    if (text.length <= limit) {
      return text;
    }
    const code = text.charCodeAt(limit - 1);
    const end = code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit;
    return `${text.slice(0, end)}...`;
  }

  // Returns a short host for labels, or undefined for non-web URLs.
  function hostFromUrl(value) {
    if (typeof value !== "string" || value.length > 2048) {
      return undefined;
    }
    const trimmed = value.trim();
    const schemeless = !/^https?:\/\//i.test(trimmed);
    let parsed;
    try {
      parsed = new URL(schemeless ? `https://${trimmed}` : trimmed);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    let host = parsed.hostname.replace(/\.+$/, "");
    if (!host || host.length > 253 || (schemeless && !host.includes(".") && host !== "localhost" && !parsed.port)) {
      return undefined;
    }
    if (host.startsWith("www.") && host.indexOf(".", 4) !== -1) {
      host = host.slice(4);
    }
    return host.length > 48 ? `…${host.slice(-48)}` : host;
  }

  function stateFor(toolResult) {
    if (!toolResult || toolResult.cancelled === true) {
      return "running";
    }
    return toolResult.is_error === true ? "failed" : "done";
  }

  function resultText(toolResult) {
    const content = toolResult?.content;
    if (typeof content === "string") {
      return content;
    }
    if (!Array.isArray(content)) {
      return "";
    }
    return content
      .filter((block) => block && block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
  }

  function humanize(value) {
    return String(value)
      .split("_")
      .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part.toLowerCase()))
      .join(" ");
  }

  function describe(toolName, input, toolResult, intl) {
    if (!intl || typeof intl.formatMessage !== "function") {
      return null;
    }
    const name = String(toolName || "");
    const values = input && typeof input === "object" ? input : {};
    const state = stateFor(toolResult);
    const say = (key, params) => intl.formatMessage(MESSAGES[`${key}_${state}`], params);
    const text = (key) => {
      const value = values[key];
      return typeof value === "string" && value !== "" ? value : undefined;
    };
    const keys = (withKeys, withoutKeys, value) =>
      value
        ? { text: say(withKeys, { keys: truncate(value) }), icon: "keyboard" }
        : { text: say(withoutKeys), icon: "keyboard" };
    const wait = (duration) => ({
      text:
        typeof duration === "number" && duration > 0 && duration <= 3600
          ? say("waitSeconds", { count: duration })
          : say("wait"),
      icon: "timer",
    });
    const scroll = (direction) => {
      switch (direction) {
        case "up":
          return { text: say("scrollUp"), icon: "scroll-up" };
        case "left":
          return { text: say("scrollLeft"), icon: "scroll-left" };
        case "right":
          return { text: say("scrollRight"), icon: "scroll-right" };
        case "down":
          return { text: say("scrollDown"), icon: "scroll-down" };
        default:
          return { text: say("scroll"), icon: "scroll-down" };
      }
    };
    const open = (url) => {
      const host = hostFromUrl(url);
      if (host) {
        return { text: say("openHost", { host }), icon: "navigate" };
      }
      return { text: say(url === undefined ? "openPage" : "openWebPage"), icon: "navigate" };
    };
    const click = () => ({ text: say("click"), icon: "click" });

    if (name === "computer") {
      const action = text("action");
      switch (action) {
        case "screenshot":
          return { text: say("capturePage"), icon: "camera" };
        case "left_click":
        case "right_click":
        case "double_click":
        case "triple_click":
          return click();
        case "type":
          return { text: say("type"), icon: "keyboard" };
        case "wait":
          return wait(values.duration);
        case "scroll":
          return scroll(text("scroll_direction"));
        case "key":
          return keys("pressKeys", "pressKey", text("text"));
        case "hold_key":
          return keys("holdKeys", "holdKey", text("text"));
        case "left_click_drag":
          return { text: say("drag"), icon: "drag" };
        case "zoom":
          return { text: say("zoom"), icon: "zoom" };
        case "hover":
          return { text: say("hover"), icon: "computer" };
        case "scroll_to":
          return { text: say("scrollTo"), icon: "scroll-down" };
        default:
          return action
            ? { text: intl.formatMessage(MESSAGES.computerAction, { action: truncate(humanize(action)) }), icon: "computer" }
            : { text: say("interact"), icon: "computer" };
      }
    }
    switch (name) {
      case "browser_batch": {
        const count = Array.isArray(values.actions) ? values.actions.length : 0;
        return count > 0
          ? { text: intl.formatMessage(MESSAGES.batchCount, { count }), icon: "computer" }
          : { text: say("browserActions"), icon: "computer" };
      }
      case "screenshot":
        return { text: say("capturePage"), icon: "camera" };
      case "read_page":
        return { text: say(text("filter") === "interactive" ? "readPageInteractive" : "readPage"), icon: "eye" };
      case "find": {
        const query = text("query");
        return query
          ? { text: say("findQuery", { query: truncate(query) }), icon: "search" }
          : { text: say("findOnPage"), icon: "search" };
      }
      case "get_page_text":
        return { text: say("readPageText"), icon: "eye" };
      case "form_input":
        return { text: say("fillField"), icon: "form" };
      case "click":
        return click();
      case "navigate": {
        const url = text("url");
        if (url?.toLowerCase() === "back") {
          return { text: say("goBack"), icon: "navigate" };
        }
        if (url?.toLowerCase() === "forward") {
          return { text: say("goForward"), icon: "navigate" };
        }
        return open(url);
      }
      case "type":
        return { text: say("type"), icon: "keyboard" };
      case "wait":
        return wait(values.duration);
      case "key":
        return keys("pressKeys", "pressKey", text("text"));
      case "hold_key":
        return keys("holdKeys", "holdKey", text("text"));
      case "scroll":
        return scroll(text("scroll_direction"));
      case "tabs_create":
      case "tabs_create_mcp":
        return { text: say("openTab"), icon: "tabs" };
      case "tabs_context":
      case "tabs_context_mcp":
        return { text: say("checkTabs"), icon: "tabs" };
      case "tabs_close_mcp":
        return { text: say("closeTab"), icon: "tabs" };
      case "upload_image":
        return { text: say("uploadImage"), icon: "upload" };
      case "file_upload":
        return { text: say("uploadFile"), icon: "upload" };
      case "javascript_tool":
      case "execute_js":
        return { text: say("runScript"), icon: "code" };
      case "read_console_messages":
        return { text: say("readConsole"), icon: "console" };
      case "read_network_requests":
        return { text: say("readNetwork"), icon: "network" };
      case "resize_window":
        return { text: say("resizeBrowser"), icon: "computer" };
      case "gif_creator":
        return { text: say("createGif"), icon: "gif" };
      case "update_plan": {
        const output = resultText(toolResult);
        if (output.includes("approved your plan") || output.includes("User has approved")) {
          return { text: intl.formatMessage(MESSAGES.planCreated), icon: "plan" };
        }
        if (output.includes("Plan rejected by user") || output.includes("User rejected") || output.includes("Permission denied")) {
          return { text: intl.formatMessage(MESSAGES.planRejected), icon: "plan" };
        }
        return { text: intl.formatMessage(MESSAGES.planFollowing), icon: "plan" };
      }
      default:
        return null;
    }
  }

  return Object.freeze({
    MESSAGES,
    describe,
    hostFromUrl,
    stateFor,
    truncate,
  });
});
