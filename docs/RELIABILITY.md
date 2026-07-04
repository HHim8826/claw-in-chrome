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
- Session cleanup retains scopes needed for URL-based recovery.
- Runtime message handlers acknowledge only messages they own.
- Release packages contain every manifest, HTML, worker, and runtime dependency.
- Diagnostics never persist raw secrets.
- Release versions increase monotonically, use an unused Git tag, and never
  overwrite assets for an existing release.
- Offscreen GIF generation rejects more than 50 frames or more than 50,000,000
  decoded pixels before starting the encoder.

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
