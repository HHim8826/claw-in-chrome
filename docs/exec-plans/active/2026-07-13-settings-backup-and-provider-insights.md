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

- [ ] Add stable backup and telemetry keys to `claw-contract.js`.
- [ ] Add pure unit-testable modules for backup and telemetry behavior.
- [ ] Add an Options DOM harness for export, preview, apply, filter, and clear.
- [ ] Add provider-adapter regression tests for success and failure recording.
- [ ] Add content-exclusion tests for secrets, prompts, responses, and URLs.
- [ ] Add retention fixtures for age and record-count limits.
- [ ] Add the new runtime files to HTML, architecture checks, and release checks.
- [ ] Expose backup schema and telemetry limits in `inspect:runtime`.
- [ ] Update architecture, reliability, security, and quality documentation.
- [ ] Run focused tests, `validate:fast`, `validate:full`, and runtime inspection.

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

- [ ] All acceptance criteria in the product specification have focused tests.
- [ ] Default exports contain no credential or private runtime data.
- [ ] Invalid imports prove storage remains unchanged.
- [ ] Provider requests behave identically when telemetry storage fails.
- [ ] Telemetry records contain no prompt, response, credential, or full URL.
- [ ] Options controls pass DOM-level behavior tests in supported custom locales.
- [ ] `npm run validate:fast` passes.
- [ ] `npm run validate:full` passes with a loadable unpacked extension.
- [ ] `npm run inspect:runtime` reports the schema and retention limits.
- [ ] The architecture and durable security and reliability docs match code.
- [ ] Review finds no generated bundle edit or manifest permission drift.
- [ ] Task-owned changes are committed on the feature branch and pushed when
      the branch is shareable.

## Evidence log

Record each RED and GREEN result, browser evidence, validation result, commit,
and unresolved risk here while executing the plan.

- Baseline: `npm run validate:fast` reached `check:mermaid-vendor`, then failed
  because only `mermaid-LICENSE.txt` used CRLF instead of the package's LF.
  No feature file had changed.

