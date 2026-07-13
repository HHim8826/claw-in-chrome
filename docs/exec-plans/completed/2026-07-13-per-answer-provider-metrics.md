# Plan: Repair insights UI and add per-answer metrics

This plan delivers the Options presentation repair and live per-answer
provider metrics as separate GREEN slices. It implements the contract in
`docs/product-specs/per-answer-provider-metrics.md`.

## Goal

Users see a polished **Data and insights** panel in Options and can evaluate a
new custom-provider answer without leaving the conversation.

## Constraints

The implementation must remain provider-independent, add no permission,
publish only sanitized measurements, and keep provider responses independent
from metric persistence or UI enhancement. The only generated bundle change is
one reviewed semantic correlation attribute.

Legacy answers without the new random correlation ID remain undecorated. New
answers must use exact ID matching and never timestamp or DOM-order guessing.

## Public behavior

The default `#options` view contains a responsive card for backup and aggregate
provider insights. Each newly completed custom-provider answer receives one
localized metadata row with model, first-token latency, output Token/s, total
Tokens, and total duration.

## Harness checklist

This work requires the following harness updates before it is complete:

- [x] Add a stable Options mount-target behavior test.
- [x] Add packaged CSS and release-inventory coverage for the Options panel.
- [x] Add a strict `firstTokenLatencyMs` schema and retention test.
- [x] Add OpenAI Chat and Responses first-token timing tests and prove
      non-stream timing remains unavailable.
- [x] Add the versioned completion event to `claw-contract.js` with producer
      and consumer contract tests.
- [x] Add a side-panel DOM harness for attachment, formatting, localization,
      duplicate prevention, exact ID correlation, both arrival orders,
      concurrency, expiry, and legacy-answer protection.
- [x] Add a semantic anchor test for `data-cp-provider-request-id` on normal
      and tool-group answer wrappers.
- [x] Add the side-panel module and stylesheet to loader-order, architecture,
      and release checks.
- [x] Extend headed E2E with Options computed-style evidence at desktop and
      320-pixel widths in light and dark themes.
- [x] Extend headed E2E with a synthetic answer and sanitized measurement
      event that proves the row is visible below the exact answer without
      horizontal overflow.
- [x] Update architecture, recovery, reliability, and security documentation.
- [x] Run focused tests, runtime inspection, `validate:fast`, and
      `validate:full`.

## Sprint contract: Options presentation

This slice fixes only the panel's mount location and visual presentation. It
doesn't change backup, import, aggregate, filter, or clear behavior.

The first RED behavior asserts that `#cp-data-insights-root` is a child of
`#cp-options-debug-anchor` after that React-owned anchor appears. Run it with:

```text
node tests/unit/data-insights-options.test.js
```

The RED result must show that the current implementation appends the panel to
`document.body`. GREEN requires stable mounting plus packaged styles, followed
by Options computed-style evidence in the headed E2E test.

## Sprint contract: Per-answer metrics

This slice adds one sanitized timing field, a versioned page-local event, one
minimal generated-renderer data attribute, and one readable side-panel
enhancer. It doesn't infer ownership by timestamps or DOM order.

The first RED behavior asserts that a tracker with a deterministic clock
records `firstTokenLatencyMs` after `markFirstToken()`. Run it with:

```text
node tests/unit/provider-observability.test.js
```

After GREEN, add one behavior at a time for stream timing, the contract event,
exact response ID propagation, formatting, attachment, localization, both
arrival orders, concurrency, duplicate prevention, expiry, and legacy-answer
protection. Each RED must fail for the missing behavior before its
implementation changes.

## Slices

The work proceeds through these vertical slices:

1. Mount and style the Options panel inside the settings content column.
2. Extend the sanitized tracker with first-token timing.
3. Mark first content for streaming paths and preserve unavailable non-stream
   timing.
4. Propagate the random measurement ID into transformed responses and the
   semantic answer DOM anchor.
5. Attach a localized metric row through exact ID matching.
6. Add runtime evidence, durable docs, review fixes, and final validation.

## Done criteria

The work is done only when every criterion below is satisfied:

- [x] All acceptance criteria have focused behavior tests.
- [x] Options no longer displays raw body-level content.
- [x] First-token timing is sanitized, bounded, retained, and aggregated only
      where explicitly required.
- [x] Per-answer Token/s uses output Tokens and the post-first-token window.
- [x] One measurement produces at most one answer row.
- [x] DOM-first and metric-first arrivals attach by exact ID.
- [x] Concurrent requests can't swap rows, and separate contexts attach only
      IDs present in their own DOM.
- [x] Pending unmatched entries expire after five minutes.
- [x] Legacy answers without correlation IDs aren't decorated.
- [x] Missing data renders an em dash without `NaN` or `Infinity`.
- [x] The UI works in English, Simplified Chinese, and Traditional Chinese.
- [x] Exact unit, rounding, grouping, and model-overflow examples pass focused
      formatting tests.
- [x] The only generated bundle change is the reviewed semantic correlation
      attribute; no manifest permission, prompt, or response content is added.
- [x] Headed E2E proves both Options styling and answer-row placement.
- [x] Independent review findings are fixed, rejected with a concrete reason,
      or recorded as blockers.
- [x] `npm run validate:fast`, `npm run validate:full`, and
      `npm run inspect:runtime` pass.
- [x] Task-owned changes are committed and pushed to the existing PR branch.

## Evidence log

Record RED and GREEN results, browser evidence, review findings, validation,
commit hashes, and push status here during implementation. The starting HEAD
is `9a275f93b44e15a9cf7de7c592787e4a3c32531d`; the worktree started clean on
`codex/settings-backup-observability` with its existing upstream configured.

- Contract review initially blocked timestamp-based answer correlation,
  non-stream TTFT, an unowned event, incomplete theme evidence, and ambiguous
  formatting. The revised exact-ID contract resolved every finding, and the
  reviewer confirmed it was executable before runtime implementation began.
- Options mount RED: `node tests/unit/data-insights-options.test.js` proved the
  panel parent was `BODY` instead of `#cp-options-debug-anchor`.
- Options route RED: the same test proved an empty hash incorrectly rendered
  the panel on the default Permissions page.
- Options GREEN: the focused test passes after exact-route gating, stable
  anchor mounting, and late React-mount observation.
- Options style RED: the headed E2E found a transparent panel background.
  GREEN proves a non-transparent bordered card, metric grid, correct mount,
  and no horizontal overflow at desktop and 320-pixel widths in light and dark
  themes.
- First-token RED: the tracker test failed because `markFirstToken` did not
  exist. GREEN records the first meaningful boundary once and preserves zero
  for non-stream responses.
- Correlation/event RED: adapter tests showed the upstream response ID instead
  of the measurement ID. GREEN propagates one random ID, dispatches the frozen
  versioned event with sanitized fields, and keeps storage non-blocking.
- Answer-row RED: the readable side-panel module did not exist. GREEN covers
  both arrival orders, concurrency, one row per ID, storage hydration,
  five-minute expiry, legacy answers, unavailable values, and all three UI
  locales.
- Bundle-anchor RED: the generated renderer lacked both semantic data
  attributes. GREEN adds only the normal-answer and final-assistant
  tool-group ID anchors, protected by deobfuscation regression assertions.
- Side-panel E2E GREEN: a real extension page at 320 pixels attaches one row
  below the exact synthetic answer in light and dark modes, preserves the full
  model title, and has no horizontal overflow or page errors.
- Independent implementation review found four actionable issues and all were
  adopted: preserve the original tool-group streaming boundary, truncate only
  the model while keeping four metric spans visible, prevent storage snapshots
  from reviving expired IDs, and ignore empty tool-call placeholders for TTFT.
  Each fix has focused regression evidence; the side-panel E2E now verifies
  every metric span at 320- and 1,280-pixel widths.
- Targeted re-review found one matched-row expiry regression. The final state
  expires only never-matched entries, preserves first-seen time, tombstones
  expired unmatched IDs, and restores a matched row after a React-style DOM
  replacement beyond five minutes. The reviewer confirmed all prior findings
  resolved with no remaining issue.
- Final runtime inspection confirms provider independence, local-only storage,
  event version 1, and the readable answer enhancer. Final `validate:full`
  passed syntax, docs, architecture, manifest, release packaging, 63 unit and
  integration files, and the headed extension E2E with no page or console
  errors. Expected negative-path fixture logs did not fail the suite.
- Feature checkpoint `b37322b` (`Add per-answer provider performance metrics`)
  was pushed successfully to `origin/codex/settings-backup-observability`.
