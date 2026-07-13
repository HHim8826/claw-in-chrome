# Plan: Settings backup and provider insights

This plan delivers two independent vertical slices: portable settings and
local provider observability. Each slice must reach a GREEN checkpoint before
the next slice begins.

## Goal

Users can move reviewed extension settings between installations and evaluate
provider token usage, latency, and errors without exposing conversation or
credential data by default.

## Constraints

Implementation must preserve provider independence, avoid generated bundle
edits, add no permissions, and keep provider requests independent from
telemetry persistence. Backup and telemetry records must use strict schemas.

The clean worktree baseline currently fails `npm run check:mermaid-vendor`
because Git checks out the vendored text license with CRLF while the npm
package contains LF. The JavaScript asset matches. The implementation must fix
this Windows-only validation mismatch without weakening the JavaScript vendor
integrity check.

## Public interfaces

The backup module exposes operations to create, inspect, and apply a versioned
backup through reviewed storage keys. The observability module exposes
operations to normalize, retain, aggregate, filter, and clear measurements.

The Options page adds a visible **Data and insights** panel with backup export,
import preview, import apply, provider filtering, summary cards, error groups,
and telemetry clearing.

## Harness checklist

The feature requires the following harness updates:

- [x] Add stable backup and telemetry keys to `claw-contract.js`.
- [x] Add pure unit-testable modules for backup and telemetry behavior.
- [x] Add an Options DOM harness for export, preview, apply, filter, and clear.
- [x] Add provider-adapter regression tests for success and failure recording.
- [x] Add content-exclusion tests for secrets, prompts, responses, and URLs.
- [x] Add retention fixtures for age and record-count limits.
- [x] Add the new runtime files to HTML, architecture checks, and release checks.
- [x] Expose backup schema and telemetry limits in `inspect:runtime`.
- [x] Update architecture, reliability, security, and quality documentation.
- [x] Run focused tests, `validate:fast`, `validate:full`, and runtime inspection.

## TDD tracer bullet

The first observable behavior is: creating a default backup from a realistic
storage snapshot returns a schema-versioned document containing reviewed
settings while excluding API keys, chat sessions, debug logs, and unknown
keys.

The RED command is:

```text
node tests/unit/settings-backup.test.js
```

The expected RED failure is that `src/shared/settings-backup.js` and its public
`createBackup` interface don't exist. The minimal GREEN implementation creates
the reviewed backup envelope and recursive secret exclusion. No import or UI
behavior is implemented in that first cycle.

## Slices

### Slice 1: Backup export core

Add the first failing behavior test, implement the versioned envelope and
reviewed-key export, then add explicit secret opt-in and round-trip tests.
Record RED and GREEN evidence below.

### Slice 2: Backup import and Options flow

Add one behavior at a time for document inspection, schema rejection,
secret-preserving merge, storage application, file preview, and visible export
and import controls.

### Slice 3: Provider measurements

Add one behavior at a time for sanitized record creation, bounded retention,
aggregation, and best-effort adapter instrumentation. Streaming and
non-streaming usage must use the same normalized token shape.

### Slice 4: Insights dashboard

Add provider filters, summary cards, error grouping, refresh, and clear
controls. Verify English and custom Chinese locale resources.

### Slice 5: Harness and runtime completion

Update runtime inspection, release inventory, architecture, security,
reliability, and quality evidence. Fix the Windows Mermaid license comparison,
run aggregate validation, review the complete diff, and move this plan to
`docs/exec-plans/completed/`.

## Done criteria

The feature is done only when every criterion below is satisfied:

- [x] All acceptance criteria in the product specification have focused tests.
- [x] Default exports contain no credential or private runtime data.
- [x] Invalid imports prove storage remains unchanged.
- [x] Provider requests behave identically when telemetry storage fails.
- [x] Telemetry records contain no prompt, response, credential, or full URL.
- [x] Options controls pass DOM-level behavior tests in supported custom locales.
- [x] `npm run validate:fast` passes.
- [x] `npm run validate:full` passes with a loadable unpacked extension.
- [x] `npm run inspect:runtime` reports the schema and retention limits.
- [x] The architecture and durable security and reliability docs match code.
- [x] Review finds no generated bundle edit or manifest permission drift.
- [x] Task-owned changes are committed on the feature branch and pushed when
      the branch is shareable.

## Evidence log

Record each RED and GREEN result, browser evidence, validation result, commit,
and unresolved risk here while executing the plan.

- Baseline: `npm run validate:fast` reached `check:mermaid-vendor`, then failed
  because only `mermaid-LICENSE.txt` used CRLF instead of the package's LF.
  No feature file had changed.
- Slice 1 RED: `node tests/unit/settings-backup.test.js` failed with
  `MODULE_NOT_FOUND` for `src/shared/settings-backup.js`.
- Slice 1 GREEN: the same command passed after adding the versioned envelope,
  reviewed-key allowlist, and recursive default secret exclusion.
- Slice 2 RED: backup inspection first failed because `inspectBackup` didn't
  exist; secret-preserving restore then failed because `buildRestoreChanges`
  didn't exist.
- Slice 2 core GREEN: inspection rejects unsupported schemas, restore accepts
  only reviewed keys, and omitted provider secrets preserve installed values.
- Slice 3 RED cycles: measurement creation, retention and aggregation, storage
  recording, and request tracking each failed first because its public
  interface didn't exist.
- Slice 3 core GREEN: focused tests prove strict record fields, 30-day and
  500-record bounds, provider filtering, token aggregation, best-effort
  storage, and one-shot header and total latency tracking.
- Slice 3 adapter GREEN: success, HTTP error, network error, invalid JSON, and
  streaming usage regression tests pass without exposing provider content.
- Slice 4 RED: the Options test failed because `data-insights-options.js` didn't
  exist. GREEN proves visible backup, import, aggregate, and clear behavior.
- Harness: focused checks pass for syntax, docs, architecture, manifest,
  Mermaid vendor integrity, release packaging, and runtime inspection.
- Independent review: one read-only reviewer reported five findings. The
  implementation now keeps telemetry off the response critical path,
  serializes concurrent writes with an extension-origin Web Lock, displays
  separate token and error groups, classifies stream aborts, and preserves an
  actionable import retry state. Focused tests cover every review fix.
- Final validation: `npm run validate:full` passed after review fixes. The
  headed extension E2E found the **Data and insights** panel and reported no
  Options or Visualizer console or page errors.
- Git finalization: after explicit user approval, task-owned changes were
  committed as `7326b8e` (`Add settings portability and provider insights`).
  The unrelated `.gitignore` workspace change remained unstaged. This plan is
  completed on the feature branch before its final push to `origin`.
