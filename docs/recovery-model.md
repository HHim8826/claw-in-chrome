# Recovery model

This document explains how maintainable code extends the upstream browser
bundle. It replaces the former root-level deobfuscation map with a smaller,
operational contract.

## Source ownership

Use file location to determine the expected maintenance strategy.

- `src/assets/sidepanel-BoLm9pmH.js` is the upstream side-panel bundle and the
  main remaining bundle patch surface.
- `src/assets/service-worker.ts-H0DVM1LS.js` is the upstream background bundle.
- `src/assets/accessibility-tree.js-D8KNCIWO.js` and
  `src/assets/agent-visual-indicator.js-Ct7LqXhp.js` are upstream content
  scripts.
- `src/shared/` owns recovered cross-context contracts and adapters.
- `src/background/service-worker-loader.js` owns composition order.
- Readable page modules under `src/options/`, `src/sidepanel/`, and
  `src/visualizer/` own local enhancements.

## Stable seams

Prefer these seams when implementing behavior.

- `globalThis.__CP_CONTRACT__` provides frozen storage, message, permission,
  session, and UI constants.
- `service-worker-loader.js` loads the contract before the upstream worker and
  loads recovered runtimes afterward.
- `service-worker-runtime.js` and
  `service-worker-detached-window-runtime.js` expose injectable runtime APIs.
- `sidepanel-debug-logger.js` and `options-debug-logger.js` expose sanitized
  diagnostics through `globalThis` debug APIs.
- `sidepanel-debug-logger.js` exposes `globalThis.__CP_INCOGNITO__` before the
  upstream application loads. The runtime filters request context, excludes
  temporary messages from session snapshots, and guards scope-ledger storage
  while incognito mode is enabled.
- `custom-provider-settings.js` owns prompt-rule migration, scope
  normalization, and built-in prompt override persistence. The side-panel
  reads the same storage record through a Chrome storage subscription and a
  narrow built-in-override reader; workflow-store writes still cross the
  background mutation boundary.
- `managed-policy.js` owns site blocking: administrator `blockedUrlPatterns`
  from managed storage, the user's `userBlockedUrlPatterns` list in local
  storage, user-pattern normalization, matching, and live updates from both
  areas. `getBlockSource(url)` returns `"managed"`, `"user"`, or `null`, and an
  administrator match wins. The generated permission bundle delegates URL
  policy semantics to this readable runtime.
- `mermaid-renderer.js` owns Mermaid source limits, strict renderer
  configuration, timeout handling, and SVG sanitization. The side-panel
  Markdown enhancer lazy-loads the packaged Mermaid 11.17.2 UMD asset only when
  a `language-mermaid` code fence appears.
- The Mermaid enhancer retains React-owned pre/code nodes and appends its SVG
  host inside the pre. Source and theme changes refresh that host, stale async
  results are discarded, and removing the pre removes the diagram with it.
  Reused code nodes that change language clear the diagram and restore source
  visibility; class changes and nested text updates share the same observer.
- Provider stream adapters share a demand-driven SSE reader. Body cancellation
  reaches the upstream reader and releases its lock. Chat requires a finish
  reason; Responses requires a completed or supported incomplete outcome.
  Error envelopes and premature EOF never emit successful message completion.
- Tool-result images reach both OpenAI formats. Each `tool_result` still
  becomes a tool message or function output that describes its images as
  metadata. Chat Completions keeps consecutive `role: "tool"` messages
  adjacent to `tool_calls`. It then sends one user message with a
  `Visual output returned by tool <id>` marker and `image_url` parts per
  result, in order, before any trailing user text. Responses appends the same
  marker and images after each function output. The DeepSeek chat profile
  stays metadata-only because its API is text-only. Chat Completions forwards
  only the eight most recent tool-result images per request; older images stay
  described in their tool messages. A 400, 415, or 422 whose error mentions
  images retries once:
  - A count-limit error, such as vLLM's "At most 1 image(s)", lowers the cap.
  - Any other image error drops images to metadata.

  The adapter remembers the new cap or mode for that base URL and model for the
  page session only when the retry succeeds. Errors that don't mention images
  never trigger this fallback. A rebuilt body keeps any earlier `max_tokens`
  clamp, and exhausted retries return the provider's last error.
- The visualizer builds its browser from session metadata, deduplicates active
  and historical records before graph construction, and caches one selected
  graph by snapshot identity and metadata revision. Storage updates are batched;
  deletion events without newValue evict cached keys.
- `settings-backup.js` owns the versioned settings envelope, reviewed storage
  allowlist, default credential exclusion, and identity-bound import merge.
  Secretless restores preserve provider credentials only when the normalized
  format and endpoint match; changed or ambiguous provider identities clear
  legacy credential keys instead of carrying them across origins.
- `provider-observability.js` owns the local-only provider measurement schema,
  30-day and 500-record retention limits, and dashboard aggregation. The
  provider adapter records status, first-token and total latency, errors, and
  normalized usage without storing request or response content. Its random
  measurement ID becomes the transformed response ID and is published through
  the versioned `cp:provider-measurement-complete` page event.
- `answer-provider-metrics.js` consumes only sanitized measurements and joins
  them to answers by exact ID. It supports event-first, DOM-first, and shared
  storage arrival, expires unmatched entries after five minutes, and never
  falls back to timestamps or DOM order.
- The `useStorageState` model-config seam resolves configured, fetched, and
  cached custom-provider models before shortcut editors render. Both shortcut
  bundles track the resolved default and replace only empty, temporary, or
  stale selections.
- The MCP bundle's service-worker diagnostic seam sanitizes persisted and
  console payloads with the same helper. Permission `action_data` is treated as
  private text and raw payloads are never used as a logging fallback.
- The accessibility-tree content script owns `read_page` serialization. It
  redacts password, hidden, credential, one-time-code, and payment-card values,
  never lists options of those selects, reuses refs through
  `__claudeElementReverseMap`, and names fields from `label[for]` text while
  skipping form controls nested in the label. It adds a truncation note only
  when an element beyond 10,000 would have been serialized. Oversized output
  is truncated at a line boundary with a size note instead of returning an
  error; an overlong first line is cut at `max_chars`.
- `javascript_tool` evaluates code through `Runtime.evaluate` with `replMode`
  inside a block statement, so top-level `await` works, the last expression is
  returned, and declarations don't leak between calls. A parse-time
  `Illegal return statement` retries once inside an async wrapper. `chrome:`
  and `chrome-extension:` pages are rejected before any permission prompt.
- The `computer` tool normalizes `scale` to [0.1, 1] for screenshots and zoom.
  A scaled screenshot records `frameWidth` and `frameHeight` in the coordinate
  ledger so clicks stay in the full-resolution frame, including when a large
  capture falls back to content-script compression. The `key` action rejects
  page-zoom shortcuts before dispatching keys, and `type` requires non-empty
  string text.
- `__cpInstallBlockedNavigationGuard(za)` wraps every page-acting tool in the
  shared tool list, so the side panel and MCP executors both see it. After a
  successful call it checks the target tab's URL and pending URL; a blocked
  category discards the result and any screenshot and returns
  `navigation_blocked_mid_call`.
  - Items inside `browser_batch` skip the guard because the batch checks each
    item before and after it runs. For the batch itself, the guard only records
    a block the batch already reported.
  - A discarded result is recorded under the MCP tool-use ID, and only when the
    MCP executor marks its context with `trackBlockedNavigation`. The executor
    consumes that entry and clears the webNavigation error that would
    otherwise repeat on the next call.

  Managed-policy matches use the browser-administrator wording everywhere.
  User blocked-sites matches reuse `category_org_blocked`, so every existing
  blocked-category check applies to them without new category plumbing.
  `$.isUrlBlockedBySitePolicy` feeds `O.getCategory`, and
  `__cpBlockedSiteErrorMessage` asks `$.getUrlBlockSource` which list matched
  to pick the administrator or user-list wording. The side-panel notice `QY`
  receives the blocked tab's URL, resolves the source through
  `__cpUseSiteBlockSource`, and leaves the text empty until it resolves so the
  administrator wording doesn't flash for a user rule.
- `attachDebugger` wraps the raw attach in a replayable closure. When Chrome
  reports a foreign-extension URL, the tool runtime finds frames whose DOM
  iframes outnumber their navigation child frames. It removes foreign
  extension iframes, then removes at most that many unknown visible iframes,
  and retries attach with backoff. Setting
  `chrome.storage.local.cicStripExtensionInterference` to `false` disables the
  recovery. The Options Browser tools card exposes this switch. `sendCommand`
  re-attaches after that error once the debugger is gone.
- Plain left clicks in a minimized window arm a one-shot page click guard.
  Trusted clicks on links that would open a new window are prevented, and the
  runtime opens up to three unique `http(s)` links as background tabs next to
  the source tab in its group, then reports the new tab IDs. The
  `cicMinimizedWindowGuard` storage value `false` disables the guard. The
  Options Browser tools card exposes this switch.
- `dispatchMouseEvent` sends the contract message `UPDATE_PHANTOM_CURSOR` before
  each CDP mouse event. The indicator content script draws an `aria-hidden`
  cursor only while the agent indicator is active. It keeps the plain arrow
  visible during screenshots and hides the highlight layer. The Stop button
  ignores untrusted clicks. If the agent is still active 1.5 seconds later,
  the page sends `STOP_AGENT_DROPPED`, which the worker only acknowledges, and
  shows a short hint.
- `browser_batch` is registered in the shared tool list (`za`) and exported to
  the side panel. Both executors pass `availableTools`. The side panel also
  passes `onBatchProgress` and `isCancelled`, and both convert `batchItems` to
  interleaved text and image content. In-batch screenshots stash coordinate
  contexts in a pending scope that commits only when the batch succeeds; any
  other exit forgets the batch's screenshot IDs. A one-time permission grant
  for the batch's tool-use ID covers later items on the same host during that
  run, because `PermissionManager` revokes the grant on first use. A blocked
  item's own result isn't counted as a prior result. Without live progress
  events, a failed batch shows only its action count. The
  side panel adds the tool and its system-prompt guidance only while
  `browserBatchEnabled` isn't `false`. Its row shows live `completed/total`
  progress from a bounded store that holds no image bytes. The GIF recorder is
  now the named helper `__cpRecordGifFrameForToolCall`.
- `tool-activity-labels.js` owns running, done, and failed labels for
  browser tool rows. The state comes from the tool result: no result is
  running, `is_error` is failed, and anything else is done. The side-panel
  label function asks it first and keeps its older labels for tools it
  doesn't cover. Field values and typed text never appear in these labels.
- The side-panel external-link dialog uses `link-safety.js` to warn about
  `user:password@` links and show the real host. Its open button stays
  disabled until the dialog has been visible for 400 ms. Hiding the panel
  restarts that delay, and the dialog no longer auto-focuses the open button.
- The MCP bridge uses `nativeMessaging`; it doesn't require Chrome Identity.
  Diagnostic sanitizers continue to redact access and refresh tokens because
  configured providers may use those fields.

## Bundle patch contract

Direct bundle patches require stronger evidence than readable module changes.

1. Identify a stable semantic anchor near the behavior.
2. Add or update a regression test that proves the user-visible contract.
3. Keep the patch local and avoid global search-and-replace operations.
4. Run `npm run validate:full`.
5. Update this document when a new stable seam or ownership boundary emerges.

The side-panel message renderer has one narrow provider-metrics patch. A normal
assistant answer exposes a React-owned footer anchor only after visible answer
content. A tool group exposes the same anchor only after it completes with
visible final text and no newer visible assistant answer exists before the next
real user prompt. The anchor carries the ID of the assistant message that owns
the final visible text as `data-cp-provider-request-id`; a later tool-only
assistant message can't replace it. Outer React wrappers remain unmodified.
Session serialization preserves this bounded assistant ID so restored sessions
retain the exact join. This ownership prevents React reconciliation from moving
an externally inserted row above the answer. It also prevents intermediate or
superseded tool groups from rendering duplicate rows. The value is a random
correlation key created by
`provider-observability.js`; the generated bundle does not receive token math,
storage access, localization, or presentation logic. The
`deobfuscation-anchors.regression.test.js` assertions protect both render paths.

## Critical workflows

The current recovered layer protects these workflows.

- Custom provider configuration and provider-format adaptation.
- Runtime message contracts between the side panel, service worker, offscreen
  page, pairing page, and MCP bridge.
- Session hydration, detached-window locks, and closed-group cleanup.
- Permission prompts and MCP permission responses.
- GitHub update metadata, release downloads, and update presentation.
- Tool-result visualization and diagnostic logging.
- Incognito request and persistence boundaries for standard chat, quick mode,
  small-model helpers, and local session snapshots.
- Custom-provider errors stay inside the provider flow. The quick-mode bundle
  displays the returned error and never redirects custom-provider failures to
  Claude account usage settings.
- Prompt rules compose deterministically by `main`, `relaxed`, and `quick`
  scope. Built-in prompt overrides change model instructions only; they don't
  change runtime permissions or bypass the permission manager.
- Local session content uses a Markdown-preserving text normalizer, while
  titles, labels, and search keys use single-line whitespace normalization.
  Context metrics skip restored assistant records whose usage fields are all
  zero so an earlier usable measurement remains visible.
- Enterprise-managed URL patterns and the user's blocked-sites list block
  matching browser targets. Missing or malformed values preserve normal
  unblocked behavior. The Permissions tab edits the user's list and shows
  administrator patterns read-only through the bundle's
  `cp-options-permissions-anchor` mount point.
- Generic internal `OPEN_SIDE_PANEL` messages can open the current tab's side
  panel and populate a direct prompt. No external website owns this bridge.
- Mermaid Markdown fences render as isolated SVG diagrams. Invalid, oversized,
  over-connected, timed-out, or unsanitizable diagrams remain readable as code
  instead of replacing the conversation with a failed render.
- Options can export and import reviewed settings without chat history or
  diagnostics. Provider credentials require explicit plain-text export opt-in,
  and secretless provider restores bind preserved credentials to the same
  normalized format and endpoint.
- Options displays local provider request, token, latency, success, and error
  summaries and can clear only those measurement records.
- Completed custom-provider answers display model, truthful streamed
  first-token latency, output Tokens/s, total Tokens, and total duration in a
  readable side-panel enhancer. Non-stream first-token values stay unavailable
  instead of being inferred from the completed body.

## Known constraint

The side-panel bundle remains large and expensive to review. New behavior must
move toward readable modules where practical; the quality score tracks this
debt explicitly.

The generated bundles retain historical compatibility names and dormant
upstream code. These strings don't make Claude an active product dependency.
Agents must follow the provider-independent boundary in `AGENTS.md` and
`ARCHITECTURE.md` instead of inferring product scope from bundled names.
