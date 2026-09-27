# Upstream 1.0.94 feature recovery

This feature selectively recovers provider-independent browser-agent behavior
from the locally supplied Claude in Chrome 1.0.94 package. The package is an
input specification, not a tree to copy over this repository.

## User and problem

Claw in Chrome already carries the applicable 1.0.79 behavior. The 1.0.94
package adds faster multi-step tool execution, safer page reading, better
recovery from browser interference, clearer agent feedback on the page, and
clearer tool activity in the side panel. Users of configured providers and the
generic MCP bridge can't benefit from those improvements until they are ported
through Claw's readable recovery layer.

## Source baseline

The supplied source is `C:\Users\leo\Downloads\Claude-Chrome.zip` with manifest
version `1.0.94` and `git-hash.txt` value
`e884a41a3e844489d46a5eac649ad57d54a9c5bf`. The current Claw manifest version
is `1.0.79.6`.

Inspection compared localized strings that the source code actually
references, both content scripts, the tool runtime, the service worker, the
side panel, the options page, and the offscreen document. Most new catalog
strings in the source are unused by the extension code and don't describe
extension behavior.

## Desired outcome

Claw in Chrome implements the accepted 1.0.94 behavior groups below through its
current seams. Each group is recorded in the executable behavior matrix in
`scripts/upstream-1.0.94-matrix.js` with an owner and a test target.

1. `browser_batch` executes several browser tool calls sequentially in one
   model round trip, stops on the first error, keeps per-item permission
   checks, and reports progress in the side panel. A local setting controls
   it and defaults to enabled.
2. `javascript_tool` evaluates code with REPL semantics: top-level `await`
   works and the last expression is returned. Code that uses `return` still
   runs. Extension-internal pages are rejected with a clear error.
3. `read_page` redacts sensitive form values, reuses stable references in
   constant time, caps traversal at 10,000 elements, and truncates oversized
   output at a line boundary with guidance instead of failing.
4. The `computer` tool accepts a `scale` factor for screenshots and zoom,
   rejects page-zoom keyboard shortcuts with guidance, and validates `type`
   text.
5. Debugger attachment recovers from foreign-extension frames by removing
   them and retrying once, with a local kill switch.
6. Clicks in a minimized window can't pull new windows to the foreground;
   intercepted links open as tabs in the same group.
7. A tool call that navigates into a managed-policy-blocked URL discards its
   result and reports the block. Managed-policy blocks use dedicated wording.
8. The page shows an animated cursor at the agent's pointer position. The stop
   button accepts only trusted user clicks and explains when a stop request
   didn't reach the agent.
9. GIF export pads mixed-size frames to one canvas so overlays stay anchored.
10. Side-panel tool rows use running, done, and failed labels and show
    permission states for the affected host.
11. External-link confirmation warns about embedded credentials and delays
    activation of the open button.
12. Times with an explicit time zone in answers show the reader's local time.

## Non-goals

This work doesn't rename the product, copy the source package, import its
update URL, signing metadata, or telemetry, or change manifest permissions,
host permissions, or the content security policy.

It doesn't port Claude account, Claude.ai, Claude Desktop, Cowork, remote
bridge, server-side URL classification, voice authentication, or Claude.ai
skill-schedule behavior. The provider-independence specification continues to
govern those surfaces.

Shiki syntax highlighting, the source Mermaid renderer, and the dormant
element-selection MCP notification are not ported because Claw already has
equivalent highlighting and Mermaid rendering and the source never invokes
the notification path.

## User-visible contract

Recovered behavior must coexist with the current extension contract.

- Custom providers, MCP Native Messaging, incognito boundaries, prompt rules,
  workflows, scheduled tasks, local history, provider metrics, settings
  backup, and GitHub updates keep their current behavior.
- `browser_batch` never bypasses the permission manager. An item that needs a
  permission prompt stops the batch and asks the model to call that tool
  standalone, unless the prompt is the first non-trivial item.
- Sensitive input values never appear in `read_page` output.
- New user-visible strings exist in every shipped locale.

## Acceptance criteria

The implementation is accepted when the following evidence exists.

1. The behavior matrix lists every accepted group with owners and an existing
   test target, and no group remains `missing`.
2. Each group has focused RED and GREEN evidence recorded in the execution
   plan.
3. Every generated bundle patch has a semantic anchor test and a
   `docs/recovery-model.md` note.
4. `npm run validate:fast`, `npm run validate:full`, and
   `npm run inspect:runtime` pass, and the manifest permission baseline is
   unchanged.
5. The manifest version is `1.0.94.0`, the four-segment form of `1.0.94`
   required by the release workflow.

## Data, permissions, and failure states

No new permission, host permission, externally connectable origin, or remote
endpoint is added. The batch setting and the extension-interference kill
switch are local `chrome.storage.local` values. A malformed batch input, an
unknown tool, a nested batch, a tab outside the group, a cancelled run, or a
blocked navigation returns a structured error with the number of completed
and remaining actions.

## Architecture impact

Batch validation, execution, and error formatting live in
`src/shared/browser-batch.js`. Tool activity labels live in
`src/shared/tool-activity-labels.js`. External-link inspection lives in
`src/shared/link-safety.js`. Generated bundles receive only narrow
registration, rendering, and content-script patches with anchor tests.

## Risks and rollback

The highest risks are a batch bypassing a permission prompt, tool results with
several images failing in non-Anthropic provider formats, and content-script
changes breaking page reading. Each group ships as an independent commit and
can be reverted without touching the others.
