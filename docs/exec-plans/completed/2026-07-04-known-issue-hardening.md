# Known issue hardening execution plan

This plan delivers the
[known issue hardening specification](../../product-specs/known-issue-hardening.md)
as five test-driven vertical slices. Each slice must reach GREEN before the
next behavior begins.

## Goal

Close the reviewed reliability, privacy, release-integrity, and resource-budget
gaps without changing extension permissions or broadening generated bundle
patches.

## Constraints

Implementation must preserve the repository's recovery architecture and use
the existing stable validation entry points.

- Preserve unrelated working-tree changes and generated assets outside the
  targeted MCP logger patch.
- Add one failing behavior test before each implementation slice.
- Keep workflow and detached-window ownership in readable background modules.
- Add a semantic anchor test and recovery-model note for the MCP bundle patch.
- Run `npm run validate:fast` before every coherent commit.
- Run `npm run validate:full` because background runtime, bundle behavior,
  offscreen behavior, and release loading are in scope.

## Execution slices

The slices are ordered by user-data impact and dependency risk.

### Slice 1: Preserve concurrent workflow mutations

This slice prevents shortcut synchronization from overwriting a workflow
mutation committed during the synchronization window.

1. Add an integration test that pauses synchronization after its read, commits
   a user workflow mutation, and then resumes synchronization.
2. Confirm the test fails because the user mutation disappears.
3. Introduce one serialized workflow mutation boundary shared by shortcut sync
   and the settings page, or an equivalent ownership mechanism that removes
   stale whole-record writes.
4. Confirm both user and shortcut workflows remain and failure responses are
   observable.

The focused test command is
`node tests/integration/service-worker-shortcut-workflow-sync.integration.test.js`.

### Slice 2: Serialize detached-window ledger operations

This slice makes popup discovery, creation, reuse, cleanup, and lock writes one
ordered operation stream.

1. Add concurrent integration cases for the same group and different groups.
2. Confirm duplicate popup creation or a missing lock reproduces the RED state.
3. Add a runtime-local operation queue around public mutating operations while
   keeping internal helpers non-reentrant.
4. Confirm a rejected operation does not block later work.

The focused test command is
`node tests/integration/service-worker-detached-window.runtime.test.js`.

### Slice 3: Sanitize service worker console diagnostics

This slice makes console output use the already-sanitized diagnostic entry.

1. Extend the background logger regression test with a secret, URL, prompt,
   and action payload.
2. Confirm storage is sanitized while the console still receives raw values.
3. Patch the anchored bundle logger to output sanitized data and remove raw
   fallback logging.
4. Update the semantic anchor and recovery model for the changed seam.

The focused test command is
`node tests/unit/mcp-background-debug-logger.regression.test.js`.

### Slice 4: Enforce immutable release versions

This slice prevents version rollback and release-asset replacement.

1. Add executable version-policy tests for newer, equal, lower, malformed, and
   existing-tag cases.
2. Confirm current workflow behavior accepts at least one forbidden case.
3. Add a reusable release-version check and call it before archive creation.
4. Remove release-asset overwrite behavior and keep failure output actionable.

The focused test command is
`node tests/unit/release-workflow.metadata.test.js`.

### Slice 5: Bound GIF generation memory

This slice validates frame count and decoded pixel totals before starting GIF
encoding.

1. Add offscreen message tests that exceed frame and pixel budgets.
2. Confirm the current handler attempts to load or encode those frames.
3. Add contract-backed limits, sequential image validation, and deterministic
   rejection messages.
4. Confirm rejected work never constructs the GIF encoder and valid work keeps
   its current response contract.

The focused test command is `node tests/unit/offscreen.test.js`.

## Harness checklist

The feature must leave repeatable guardrails instead of relying on manual
review.

- [x] Product behavior is recorded in `docs/product-specs/`.
- [x] Multi-step work is recorded in `docs/exec-plans/active/`.
- [x] Workflow concurrency is covered by a controlled interleaving fixture.
- [x] Detached-window concurrency and queue recovery are integration-tested.
- [x] Diagnostic storage and console sanitization share one tested contract.
- [x] Release version policy is an executable local check used by CI.
- [x] GIF limits live in the shared contract and are tested through the
  runtime message boundary.
- [x] `docs/recovery-model.md` records the targeted bundle logger seam.
- [x] `docs/SECURITY.md` and `docs/RELIABILITY.md` match final behavior.
- [x] `docs/QUALITY_SCORE.md` records any remaining gap.
- [x] `npm run inspect:runtime` confirms entry points and permissions are
  unchanged.
- [x] Spec, harness, and architecture self-review passes are recorded.

No new seed service, network dependency, permission, or screenshot baseline is
required. The existing Chrome mocks and headed extension smoke test provide the
necessary runtime harness.

## Done criteria

The feature is done only when all implementation, evidence, and Git conditions
are satisfied.

- [x] All five acceptance criteria have focused RED and GREEN evidence.
- [x] All task-owned tests pass after refactoring.
- [x] `npm run validate:fast` passes.
- [x] `npm run validate:full` passes with no extension page or console errors.
- [x] `npm run inspect:runtime` shows no permission or entry-point drift.
- [x] Generated bundle edits are limited to the diagnostic logger anchor.
- [x] Documentation links pass `npm run check:docs`.
- [x] Review findings are fixed, rejected with evidence, or recorded as
  blockers.
- [x] The active plan moves to `docs/exec-plans/completed/` with final
  validation evidence.
- [x] Task-owned changes are committed as a coherent GREEN checkpoint.
- [x] The final handoff reports the commit hash and push result or exact push
  blocker.

## Runtime evidence

The final evidence must include the extension root, manifest version, unchanged
permission list, headed E2E result, and any console or page errors reported by
the smoke test.

## Review and rollback

After all slices pass focused validation, run separate spec, harness, and
architecture self-review passes. Independent sub-agent review is required by
the selected skill for this risk level but is unavailable unless the user
authorizes sub-agent use, so compensate with focused tests and full validation.

Rollback must revert only the failing slice. Release-policy rollback must not
restore mutable asset publication, and diagnostic rollback must not restore raw
payload logging.

## Progress evidence

Record RED and GREEN commands, important failures, review outcomes, and commit
hashes here as implementation proceeds.

- Planning completed before implementation on July 4, 2026.
- Starting branch: `main` tracking `origin/main`.
- Starting HEAD: `ab824fe8b5e9d1844381573b2e181164d4268a6b`.
- Starting task-owned dirty state: clean.
- Slice 1 RED: the workflow test failed because no background mutation
  listener was registered. GREEN: the focused workflow integration and
  contract tests passed.
- Slice 2 RED: concurrent same-group opens created two popups. GREEN:
  same-group, different-group, and post-rejection queue tests passed.
- Slice 3 RED: persisted `action_data` remained unredacted. GREEN: diagnostic,
  bundle-anchor, and syntax tests passed with sanitized console output.
- Slice 4 RED: the release workflow had no executable version-policy check.
  GREEN: metadata tests and a successful CLI policy smoke passed.
- Slice 5 RED: a 51-frame request allocated all 51 `Image` objects. GREEN:
  frame-count and decoded-pixel rejection tests passed before encoding.
- Integrated GREEN: `npm run validate:fast` passed after all five slices.
- Spec review added a valid, within-budget GIF success test and found no
  unresolved acceptance gap.
- Harness review moved all detached-window writes behind the operation queue
  and kept the CI/release score at 3 until a remote immutable release run is
  observed.
- Architecture review confirmed shared contract ownership, one background
  workflow mutation boundary, and one documented generated-bundle patch.
- `npm run validate:full` passed 96 syntax checks, 53 unit/integration test
  files, release-package validation, and the headed extension E2E smoke.
- E2E reported no options or visualizer console errors and no page errors.
- `npm run inspect:runtime` confirmed version `1.0.67.7`, the existing
  background and options entry points, and an unchanged permission list.
- Independent sub-agent review was not run because this task did not authorize
  sub-agent use; focused self-review and full validation supplied the review
  evidence.
