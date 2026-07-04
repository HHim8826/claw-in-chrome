# Known issue hardening

This feature closes five reliability, privacy, and release-integrity gaps found
during the July 4, 2026 repository review. The extension must preserve user
data during concurrent updates, keep runtime diagnostics private, publish
immutable releases, and reject GIF work that exceeds a safe memory budget.

## User and problem

People using the extension can currently encounter state loss or excessive
resource use under valid but uncommon timing and workload conditions.
Maintainers can also publish a release under a reused version, and service
worker diagnostics can print unsanitized action data to the console.

The known failures are:

- Shortcut synchronization can overwrite a workflow saved at the same time.
- Concurrent detached-window operations can create duplicate windows or lose
  lock entries.
- Service worker diagnostic console output can contain raw permission action
  data.
- The release workflow can reuse a lower or existing version and overwrite its
  assets.
- GIF generation can decode and retain more image data than the renderer can
  safely hold.

## Desired outcome

The extension preserves all committed workflow and detached-window state,
emits only sanitized diagnostics, rejects mutable release attempts, and fails
oversized GIF exports with an actionable error instead of exhausting browser
memory.

## Non-goals

This feature does not redesign the workflow editor, replace the upstream GIF
encoder, change extension permissions, alter the release artifact format, or
extract unrelated code from generated bundles.

## User-visible contract

The feature preserves existing successful behavior and adds deterministic
failure handling at unsafe boundaries.

- Saving a workflow while shortcut synchronization runs must preserve both the
  user's workflow edit and the synchronized shortcut entries.
- Opening a detached window repeatedly or concurrently must produce one owned
  window per resolved group and must preserve locks for other groups.
- Diagnostic storage and console output must not expose raw secrets, URLs,
  prompts, action data, or browsing content.
- A release must use a version strictly greater than the previous manifest
  version and must not reuse an existing Git tag.
- An oversized GIF request must return a clear failure without starting the
  encoder or leaving retained frame data behind.

## Acceptance criteria

The implementation is accepted when the following behavior is enforced by
tests and project validation.

1. A controlled interleaving test proves that workflow synchronization does
   not overwrite a concurrent user mutation.
2. Concurrent detached-window requests for the same group create one popup,
   and concurrent requests for different groups retain both locks.
3. A diagnostic test proves that console arguments contain the same sanitized
   payload written to storage and never contain the supplied secret or action
   text.
4. Release validation rejects equal, lower, and already-tagged versions while
   accepting a strictly newer unused version.
5. Offscreen tests exercise `GENERATE_GIF` validation and reject requests that
   exceed the frame or decoded-pixel budget before encoding.
6. `npm run validate:fast` and `npm run validate:full` pass.

## Data, permissions, and failure states

The implementation changes synchronization and validation around existing
`chrome.storage.local` records. It adds no storage keys and requests no new
Chrome permissions.

Failures must follow these rules:

- A workflow mutation reports an error instead of silently discarding a newer
  revision.
- A detached-window operation releases its queue after success or failure so
  later requests can continue.
- Diagnostic sanitization failure must not fall back to printing raw payloads.
- Release validation exits before archive creation or GitHub publication.
- GIF validation returns a bounded error message and does not invoke `GIF`.

## Architecture impact

Readable modules remain the owners of workflow synchronization,
detached-window coordination, and offscreen validation. Stable message names
belong in `src/shared/claw-contract.js` if workflow mutations require a new
background message.

The service worker diagnostic fix touches the generated MCP bundle because the
logger currently lives there. That patch must remain local, keep a semantic
anchor test, and update `docs/recovery-model.md`.

## Risks and rollback

Serialization can increase latency when many operations arrive together, and
GIF limits can reject exports that previously attempted to run. Tests must
prove queues continue after rejection and error messages identify the applied
limit.

Each slice is independently revertible. If a slice causes a regression, revert
its implementation and tests together; do not revert unrelated hardening
slices or the planning artifacts.
