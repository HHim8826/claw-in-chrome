# Reliability

The extension must preserve user sessions and recover across service-worker
restarts, side-panel navigation, detached windows, and storage events. Tests
and diagnostics must make these transitions reproducible.

## Reliability invariants

Preserve these invariants.

- The shared contract loads before every recovered background module.
- A detached-window lock has one owning window and can be swept after failure.
- Detached-window discovery, creation, cleanup, and lock mutations run through
  one operation queue so concurrent requests cannot create duplicate owners or
  overwrite unrelated locks.
- User-authored workflow replacement and shortcut synchronization run through
  one background mutation queue. The background preserves shortcut-owned
  entries when it commits user-owned workflow changes.
- Prompt-rule migrations normalize malformed scopes to the supported
  `main`, `relaxed`, and `quick` contexts, and settings writes preserve the
  background workflow mutation boundary.
- Local history serialization preserves Markdown-significant newlines without
  allowing multiline labels or search keys. Restored zero-filled usage
  records do not replace the last usable context measurement.
- Shortcut model selectors merge configured and cached provider models and
  retain an explicitly saved model while replacing only stale defaults.
- Session cleanup retains scopes needed for URL-based recovery.
- Runtime message handlers acknowledge only messages they own.
- Release packages contain every manifest, HTML, worker, and runtime dependency.
- Diagnostics never persist raw secrets.
- Release versions increase monotonically, use an unused Git tag, and never
  overwrite assets for an existing release.
- Offscreen GIF generation rejects more than 50 frames or more than 50,000,000
  decoded pixels before starting the encoder. Mixed-size frames are padded to
  the largest frame. When that padded grid would exceed the pixel budget, the
  grid and every frame scale down proportionally instead of failing the export.
- `browser_batch` runs items sequentially and stops at the first error,
  cancellation, unknown tool, or tab outside the group. It waits up to three
  seconds for a loading tab between items and commits in-batch screenshot
  coordinate contexts only when the whole batch succeeds.
- `read_page` never fails on size alone. It stops after 10,000 elements and
  truncates oversized output at a line boundary with a size note.
- Debugger attach retries with backoff after removing foreign-extension frames
  and rethrows the original error when retries are exhausted.
- Links opened by clicks in a minimized window become background tabs in the
  same group instead of foreground windows.
- Managed URL policy uses safe defaults when policy storage is unavailable or
  malformed, and it refreshes when managed storage changes.
- The manifest remains provider-independent: it has no Claude.ai site bridge,
  external Claude origin, forced-organization policy, or `identity` permission.
- Generic internal side-panel prompt delivery retains its bounded readiness
  retry without exposing that bridge to external websites.
- Mermaid rendering rejects source over 20,000 encoded bytes or 400 likely
  edges, limits asynchronous waits to five seconds, and preserves the code on
  any load, render, or sanitization failure.
- Provider streams propagate body cancellation, respect downstream demand, and
  release reader locks on success, failure, and cancellation. Terminal protocol
  errors and missing completion never become successful answers or tool turns.
- Visualizer storage deletions evict cached records immediately. Session lists
  read metadata only; unrelated updates reuse the selected event graph.
- Settings imports validate the document before writing and update only
  reviewed keys. Credential-free imports preserve installed provider secrets.
- Provider measurements are best effort and can't fail provider requests. The
  response path doesn't await storage, writes are serialized through an
  extension-origin Web Lock, and the store keeps at most 500 records from the
  most recent 30 days.
- Per-answer metrics use one random ID across the request tracker, transformed
  response, rendered answer, event, and storage record. Event-first and
  DOM-first arrivals converge by exact ID; duplicates render once, unmatched
  entries expire after five minutes, and non-stream timing remains unavailable.

## Local verification

Use the following command levels.

- Run `npm run validate:fast` for contract, unit, integration, package,
  architecture, manifest, and documentation checks.
- Run `npm run validate:full` after changes to the manifest, background worker,
  extension pages, bundles, or release composition.
- Run `npm run inspect:runtime` to print the current entry points, permissions,
  debug APIs, and extension version.

## Runtime evidence

For UI or service-worker changes, record the extension root, browser version,
action path, console errors, and produced E2E artifacts. Set
`CLAW_E2E_ARTIFACT_DIR` when evidence must be retained at a known path.

## Failure handling

When validation fails, preserve the first actionable error and the complete
failure summary. Do not release when the package checker, manifest baseline,
integration suite, or extension E2E smoke test fails.
