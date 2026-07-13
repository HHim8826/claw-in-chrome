# Per-answer provider metrics

This brief defines how Claw in Chrome presents provider performance where a
user needs it: directly below a newly completed assistant answer. It also
repairs the Options **Data and insights** panel so it participates in the
existing settings layout instead of rendering as unstyled body content.

## User and problem

The current Options panel is appended outside the React settings layout and
uses class names without a packaged stylesheet. The result is a raw,
full-width block at the bottom of the page. The aggregate dashboard also makes
users leave the conversation to understand the performance of one answer.

The supplied screenshots show both failures: the unstyled Options panel and a
compact reference row containing model, token, and timing information below an
answer.

## Desired outcome

The Options panel must render as a responsive settings card inside the default
**Options** content column. Each new custom-provider assistant answer in the
current side-panel page must gain a compact metadata row after completion.

The row displays these values when available:

- Provider model.
- First-token latency.
- Output throughput in Tokens per second.
- Total Tokens, defined as input Tokens plus output Tokens.
- Total request duration.

## Non-goals

This slice doesn't add Chrome permissions, store prompts or responses,
calculate monetary cost, or guess answer ownership from timestamps or DOM
order. The generated message renderer receives only one reviewed semantic data
attribute because no readable layer otherwise exposes the response ID in DOM.

Measurements created before this feature don't have a matching answer ID and
remain undecorated. New measurements use their random record ID as a safe
correlation key shared by the transformed provider response and answer DOM.

## UX contract

The Options panel uses the existing content column and theme variables. It
remains visible only on the default `#options` route, remains usable at narrow
widths, and groups backup controls separately from aggregate provider metrics.

The per-answer row is visually secondary to the answer, remains readable in
light and dark themes, and uses locale-aware English, Simplified Chinese, or
Traditional Chinese labels. It doesn't overflow a 320-pixel viewport. Missing
or zero-valued measurements display an em dash instead of misleading rates.

Formatting is deterministic. Durations below 1,000 milliseconds use a rounded
integer and `ms` in English or `毫秒` in Chinese. Longer durations use one
decimal place and `s` in English or `秒` in Chinese. Throughput uses one decimal
place. Token totals use locale-aware integer grouping. The full model remains
in the element title while CSS truncates visible overflow.

For example, an English row can read:

```text
model-main · First token 842 ms · 21.5 Tokens/s · Total 140 Tokens · 2.7 s
```

A Traditional Chinese row with unavailable streaming timing can read:

```text
model-main · 首 Token — · Tokens/秒 — · 總計 140 Tokens · 2.7 秒
```

## Measurement contract

`provider-observability.js` adds `firstTokenLatencyMs` to the strict sanitized
measurement schema. The request tracker records the first meaningful streamed
text, reasoning, or tool delta. Non-stream responses set the field to zero
because a completed response body doesn't expose a truthful first-token
boundary. Their First token and Token/s values render as an em dash.

Output throughput uses this formula:

```text
outputTokens / ((totalDurationMs - firstTokenLatencyMs) / 1000)
```

The UI displays an em dash when output Tokens are zero or the generation
window isn't positive.

Every request tracker owns a random measurement ID. The adapter replaces the
transformed response message ID with this correlation ID. The readable bundle
anchor exposes the same value as `data-cp-provider-request-id` on a dedicated
React-owned footer after visible answer content. A tool group exposes the
footer only after it completes with visible final text and no newer visible
assistant answer exists before the next real user prompt. Session serialization
preserves this bounded assistant ID. The footer uses the ID of the assistant
message that owns the final visible text, not a later tool-only message. The
persisted measurement uses the same ID, so concurrent requests, restored
sessions, and reversed DOM/storage arrival order remain deterministic.

`claw-contract.js` owns the page-local event contract:

```text
name: cp:provider-measurement-complete
version: 1
detail: { version: 1, measurement: <sanitized measurement> }
```

The tracker synchronously invokes its completion callback after normalizing
the measurement and before scheduling best-effort storage. The provider adapter
dispatches the event only when the current context supports `CustomEvent` and
`dispatchEvent`. The event doesn't cross side-panel or detached-window
contexts. Its payload contains only the persisted schema fields.

## Data, permissions, and failure states

Measurements stay in `chrome.storage.local` under the existing 30-day and
500-record limits. The feature adds no permission, URL, prompt, response,
header, credential, or request-body field.

If the answer surface isn't available when a measurement completes, the
side-panel adapter queues the sanitized measurement by ID. If the DOM arrives
first, it waits for the matching event or storage record. Pending entries
expire after five minutes. Separate page contexts can observe shared storage,
but they attach only exact IDs present in their own DOM. Failure to render
metadata must never change the provider response.

## Acceptance criteria

The feature is accepted when all of these behaviors are proven:

1. The Options panel mounts inside `#cp-options-debug-anchor` and has packaged,
   responsive card, control, and metric-grid styles.
2. The Options E2E check proves the panel has a non-transparent background,
   bounded width, and a grid rather than raw body flow at desktop and
   320-pixel widths in light and dark themes.
3. A request tracker records one sanitized `firstTokenLatencyMs` value and
   keeps completion and storage best-effort and non-blocking.
4. Streaming OpenAI Chat and Responses paths mark the first meaningful delta;
   non-streaming paths keep first-token timing unavailable.
5. A newly completed answer receives one compact metrics row with model,
   first-token latency, Token/s, total Tokens, and total duration below its
   visible content. Intermediate and superseded tool groups don't receive a
   row, and each separator stays attached to its metric at narrow widths.
6. Correlation tests prove metric-first, DOM-first, concurrent, duplicate,
   cross-context-storage, expiry, and legacy-unmatched behavior.
7. English, Simplified Chinese, and Traditional Chinese labels are covered by
   focused tests.
8. Narrow-width and light/dark E2E checks prove controls and per-answer rows
   remain visible without horizontal overflow.
9. Producer and consumer tests use the versioned event name from
   `claw-contract.js` and reject mismatched payload versions.
10. `npm run validate:fast`, `npm run validate:full`, and runtime inspection
    pass without manifest permission changes.

## Architecture and harness impact

The strict measurement field remains owned by
`src/shared/provider-observability.js`. Provider adapters mark timing through
the tracker and publish sanitized completion data. `claw-contract.js` owns the
event name and version. A readable side-panel adapter owns DOM enhancement,
and packaged Options and side-panel stylesheets own presentation.

The generated message renderer needs one minimal semantic anchor because no
readable layer can otherwise expose the response ID in DOM. The patch adds only
an explicit footer anchor with `data-cp-provider-request-id` after visible
answer content, includes an anchor regression test, and is recorded in
`docs/recovery-model.md`. The readable adapter mutates only this anchor, not a
React-owned answer wrapper.

Focused unit tests cover measurement math, adapter timing, and DOM behavior.
The headed extension E2E test restores real direct-answer and tool-group session
fixtures, then provides renderer-order, uniqueness, computed-style, and live
attachment evidence. Release and architecture inventories must include every
new runtime file.

## Risks and rollback

The main risk is attaching a measurement to the wrong answer. Exact random ID
matching prevents ordering guesses across concurrent requests, contexts, and
page reloads. Removing the side-panel adapter and its stylesheet rolls back
the answer row without changing stored records; removing the semantic data
attribute disables attachment safely.

Update this brief when the metric formula, displayed fields, correlation
strategy, retention behavior, or answer-surface contract changes. Legacy
answers created before the correlation field remain an intentional open gap.
