# Upstream e58 feature recovery execution plan

This plan delivers the
[upstream e58 recovery specification](../../product-specs/upstream-e58-recovery.md)
as test-driven semantic ports. It treats the source commit as behavior to
recover, not as a patch to cherry-pick.

## Goal

Recover all applicable functionality and fixes from upstream commit
`e58afcc2fbeaa988508d08cef08f837fd85665fa` without regressing this fork's
current architecture, runtime hardening, tests, or release layout.

## Constraints

Implementation must preserve current ownership boundaries and prove each
ported behavior independently.

- Preserve unrelated working-tree changes and the starting `main` history.
- Don't cherry-pick the source commit or copy its root-level layout.
- Don't import its version bump, README badge edits, or unrelated bundle churn.
- Add one focused failing behavior test before each missing implementation.
- Recognize equivalent local fixes as satisfied only after focused tests pass.
- Prefer readable modules and patch `src/assets/` only when no stable seam
  exists.
- Add a semantic anchor test and recovery-model note for each bundle patch.
- Run `npm run validate:fast` before each coherent GREEN commit.
- Run `npm run validate:full` because UI, background runtime, extension loading,
  and generated bundles are in scope.

## Baseline and source audit

The baseline is `main` at
`35adda7bbac59324c3a5c29fe369a846b3944605`, one commit ahead of
`origin/main`, with a clean task-owned working tree. The source commit was
fetched directly from `S-Trespassing/claw-in-chrome`.

Initial inspection shows that Markdown preservation already has a local
equivalent in commit `4989244`. The current `main` branch doesn't contain the
bounded retry work visible on another branch, so this recovery must preserve
the source commit's `429` status, message, and no-fallback behavior directly.

## Execution slices

Each slice begins with one RED behavior and ends with focused GREEN evidence.

### Slice 1: Build an executable upstream behavior matrix

This slice converts the source commit message and diff into explicit tests and
prevents accidental wholesale copying.

1. Map every source behavior to its current file owner and stable public seam.
2. Record each behavior as missing, locally equivalent, or divergent.
3. Add the first focused regression test for the highest-risk missing behavior,
   incognito message boundaries.
4. Confirm the test fails for the expected missing contract or runtime API.

The focused command will use the relevant file through
`node tests/run-suite.js unit` until a narrower stable test command exists.

### Slice 2: Recover incognito conversation mode

This slice adds the storage contract, pure boundary behavior, settings control,
and side-panel integration.

1. Test enable, request filtering, persistence filtering, session changes, and
   disable cleanup through a readable runtime interface.
2. Implement the smallest shared incognito runtime and contract key.
3. Wire the existing options adapter and side-panel bundle through semantic
   anchors only where the generated UI owns the call site.
4. Confirm incognito messages don't survive persistence or mode shutdown.

### Slice 3: Recover provider compatibility fixes

This slice adds Gemini behavior and reconciles DeepSeek and `429` handling with
the current adapter.

1. Test Gemini health-check candidates, endpoint suffix handling, unsupported
   field omission, and chat conversion.
2. Test DeepSeek compaction replay with reasoning and tool content.
3. Preserve `429` status and messages, and test responses against unrelated
   format fallback, account redirects, or disable branches.
4. Implement only the missing provider logic in readable shared modules.

The primary focused tests will extend the existing custom-provider model and
provider-format adapter suites.

### Slice 4: Recover prompt overrides and scoped custom rules

This slice evolves the current single active prompt profile into explicit,
scoped, independently enabled rules plus supported built-in overrides.

1. Test normalization and persistence for legacy profiles, enabled rules,
   scopes, and built-in overrides.
2. Test deterministic prompt composition for each supported request context.
3. Add options controls through the current readable settings module.
4. Test edit, enable, disable, restore, and malformed-storage behavior.

### Slice 5: Reconcile Markdown, shortcut models, and context controls

This slice completes the remaining UI and persistence fixes without broad
bundle replacement.

1. Test multiline Markdown round-trips separately from labels and search text.
2. Replace overly broad whitespace behavior only if the source semantics are
   safer than the current local equivalent.
3. Test shortcut creation against resolved configured and fetched provider
   models, then add the smallest anchored bundle integration.
4. Add regression anchors for the affected context-control visibility states.

### Slice 6: Integrate, inspect, and review

This slice proves the complete extension remains loadable and records all
durable recovery knowledge.

1. Update `docs/recovery-model.md` for every new stable seam and bundle anchor.
2. Run `npm run validate:fast` and fix only task-related failures.
3. Run `npm run validate:full` and inspect extension page and console errors.
4. Run `npm run inspect:runtime` and confirm permissions and entry points are
   unchanged.
5. Perform separate spec, harness, architecture, security, and regression
   self-review passes, then rerun affected validation.
6. Move this plan to `docs/exec-plans/completed/` with RED, GREEN, runtime, and
   Git evidence.

## Harness checklist

The feature must leave repeatable guardrails for future upstream recovery.

- [x] Product behavior is recorded in `docs/product-specs/` before code changes.
- [x] Multi-step work is recorded in `docs/exec-plans/active/` before code
  changes.
- [x] Every source-commit claim maps to a focused test or documented exclusion.
- [x] Incognito storage and message boundaries have pure deterministic tests.
- [x] Gemini, DeepSeek, and `429` behavior use provider boundary tests.
- [x] Prompt migrations and scoped composition have malformed-data fixtures.
- [x] Markdown preservation has a multiline session round-trip fixture.
- [x] Shortcut model resolution has configured and fetched-model fixtures.
- [x] Every generated bundle patch has a semantic anchor regression test.
- [x] `docs/recovery-model.md` describes each new stable seam.
- [x] `docs/SECURITY.md` and `docs/RELIABILITY.md` reflect final state when
  behavior changes their contracts.
- [x] `docs/QUALITY_SCORE.md` records any deferred source behavior or residual
  bundle debt.
- [x] `npm run inspect:runtime` confirms no permission or entry-point drift.
- [x] Spec, harness, architecture, security, and regression reviews are
  recorded.

No new external service, permission, or generated fixture is planned. Existing
Chrome mocks, provider fetch mocks, storage fixtures, and the headed E2E smoke
test form the runtime harness.

## Done criteria

The feature is done only when all behavior, validation, documentation, and Git
conditions are satisfied.

- [x] All seven source behavior groups are implemented, proven equivalent, or
  explicitly excluded with evidence and user-impact reasoning.
- [x] Every implemented behavior has recorded RED and GREEN evidence.
- [x] Existing local Markdown behavior and current provider error handling
  remain covered and aren't weakened.
- [x] `npm run validate:fast` passes.
- [x] `npm run validate:full` passes without extension page or console errors.
- [x] `npm run inspect:runtime` shows unchanged permissions and entry points.
- [x] No source version bump, root-layout rollback, or unrelated generated
  bundle change appears in the final diff.
- [x] Documentation links pass `npm run check:docs`.
- [x] Review findings are fixed or recorded as explicit blockers.
- [x] This plan moves to `docs/exec-plans/completed/` with final evidence.
- [x] Task-owned changes are committed as coherent GREEN checkpoints.
- [x] The final handoff reports commit hashes and the push result or exact push
  blocker.

## Runtime and rollback evidence

Final evidence must include the extension root, manifest version, permission
list, runtime entry points, headed E2E result, and any page or console errors.
Each slice must remain independently revertible; rollback must not remove later
local hardening that predates this task.

## Progress evidence

Record focused RED and GREEN commands, source-to-local decisions, validation
results, review findings, commits, and push state here as work proceeds.

- Planning completed before implementation on July 5, 2026.
- Starting branch: `main` tracking `origin/main`.
- Starting HEAD: `35adda7bbac59324c3a5c29fe369a846b3944605`.
- Starting task-owned dirty state: clean.
- Source commit fetched as
  `e58afcc2fbeaa988508d08cef08f837fd85665fa`.
- Planning note: no implementation file was changed before this brief, plan,
  harness checklist, and done criteria were recorded.
- Incognito RED: `node tests/unit/sidepanel-debug-logger.test.js` failed because
  enabled mode still exposed `claw.chat.scopes.*` records.
- Incognito GREEN: request filtering, temporary boundaries, persistence guards,
  options placement and toggle behavior, bundle anchors, contract checks, i18n
  parity, and syntax checks passed their focused commands.
- Provider RED: Gemini health checks selected `/responses`, runtime `429`
  handling fell through to another API format, DeepSeek compaction replayed
  structured tool history, and Responses tool calls used the item ID instead
  of `call_id`.
- Provider GREEN: focused model and adapter suites pass Gemini endpoint and
  field filtering, endpoint normalization, `429` no-fallback behavior,
  DeepSeek transcript flattening, and Responses tool-call replay.
- Prompt RED: the settings regression test failed because prompt rules had no
  scope normalizer or context payload builder.
- Prompt GREEN: scoped `main`, `relaxed`, and `quick` composition, legacy
  prompt-profile migration, built-in override persistence, side-panel storage
  subscriptions, and every supported built-in prompt consumer pass focused
  regression and syntax checks. The fork's background workflow mutation
  boundary was retained while reconciling the source settings module.
- History/context RED: a restored assistant record with all-zero usage hid an
  earlier valid context measurement. The shortcut-model regression also
  failed because custom-provider models were not overlaid into the shared
  model config.
- History/context GREEN: multiline Markdown survives CRLF normalization and
  local serialization while labels remain single-line; zero-filled usage is
  skipped; configured, fetched, and cached provider models merge
  deterministically; both shortcut editors follow the resolved default without
  replacing an explicitly saved selection.
- Source exclusions: version and README edits remain non-goals. Font-only HTML
  preloads are omitted because they are not part of the seven advertised
  behavior groups and would add unrelated release-page churn.
- Validation: `npm run validate:fast` and `npm run validate:full` pass. The
  headed E2E reports no options-page, visualizer-page, or console errors.
- Runtime inspection: extension root `D:\code\claw-in-chrome\src`, version
  `1.0.67.7`, background entry `background/service-worker-loader.js`, options
  entry `options/options.html`, existing 15 extension permissions, and
  `<all_urls>` host access are unchanged.
- Review evidence: the spec review mapped all seven advertised behaviors to
  focused tests; the harness review confirmed RED/GREEN slices and coherent
  commits; the architecture review limited bundle edits to existing React
  owners; the security review found no permission, credential, or
  authorization expansion; the regression review found no task-owned
  failures or E2E page errors.
- Checkpoints: `e0c7f37`, `0c4243b`, `0898fd4`, `98c89b0`, and `87ae2fb`.
- Push state is intentionally reported in the final handoff after the final
  documentation checkpoint.
