# Upstream e58 feature recovery

This feature selectively recovers user-visible behavior from upstream commit
[`e58afcc`](https://github.com/S-Trespassing/claw-in-chrome/commit/e58afcc2fbeaa988508d08cef08f837fd85665fa)
without replacing this repository's readable recovery layer or later safety
fixes. The commit is an input specification, not a patch to apply verbatim.

## User and problem

This fork is behind an upstream feature and bug-fix commit. Directly
cherry-picking that commit would overwrite code that this repository has since
moved under `src/`, mix generated bundle changes with readable modules, and
risk regressing local session, privacy, release, and runtime hardening.

Users need the still-missing upstream capabilities while keeping all behavior
and safeguards already present in this fork.

## Desired outcome

The extension provides every applicable behavior introduced by the source
commit, using current architecture seams and tests. Existing equivalent fixes
remain intact, and generated bundle changes are limited to behavior that has no
stable readable seam.

The recovered behavior includes:

- An incognito conversation mode that sends only the temporary conversation
  segment and doesn't persist that segment after the mode ends.
- Gemini-compatible OpenAI request and provider-health behavior.
- Editable built-in prompts and additive custom rules with explicit scopes.
- DeepSeek-safe context-compaction replay.
- Markdown-preserving local session serialization.
- Correct custom-provider handling for HTTP `429` responses without unrelated
  self-disable behavior.
- A populated model list while creating shortcuts and stable context-control
  presentation.

## Non-goals

This work does not import the source commit's version bump, README badge
changes, broad formatting changes, or unrelated generated-file churn. It does
not replace the current directory layout, weaken diagnostic sanitization,
remove local rate-limit retries, or change Chrome permissions.

## User-visible contract

The recovered behavior must remain compatible with existing settings and
sessions.

- Enabling incognito mode starts a boundary at the current message list.
  Requests include messages created after that boundary, and persistent
  session snapshots exclude those messages. Disabling the mode discards the
  temporary segment while retaining earlier history.
- Gemini OpenAI-compatible providers use supported request fields and endpoint
  fallbacks. A valid Gemini provider must not fail only because unsupported
  OpenAI-specific fields were included.
- Users can add scoped prompt rules, enable or disable each rule, edit supported
  built-in prompts, and restore an override to its built-in value.
- DeepSeek context compaction preserves a valid assistant/tool transcript and
  doesn't replay incompatible reasoning fields.
- Stored chat content preserves Markdown-significant newlines while labels,
  titles, and search text retain bounded normalization.
- A provider `429` response follows the existing bounded retry policy and, if
  exhausted, surfaces the provider error without triggering unrelated product
  account or feature-disable flows.
- Shortcut creation resolves configured and fetched custom-provider models.
  Context controls remain visible only in their valid states.

## Acceptance criteria

The implementation is accepted when tests and runtime validation prove these
claims.

1. Incognito request filtering, persistence filtering, boundary reset, storage
   updates, and mode-off cleanup pass focused unit or integration tests.
2. Gemini provider detection, health-check selection, endpoint normalization,
   request-field filtering, and response conversion pass focused adapter tests.
3. Prompt-rule persistence, scoped composition, built-in override, restore,
   and options-page controls pass focused tests.
4. A DeepSeek compaction transcript passes conversion tests without invalid
   reasoning replay or tool-order corruption.
5. A multiline Markdown session round-trip preserves newlines and existing
   local history behavior.
6. `429` retry success and exhaustion remain tested, and no exhausted response
   enters an unrelated self-disable branch.
7. Shortcut creation receives the resolved custom-provider model list, and
   context-control anchors pass regression tests.
8. `npm run validate:fast`, `npm run validate:full`, and
   `npm run inspect:runtime` pass without permission or entry-point drift.

## Data, permissions, and failure states

The feature may add storage keys for incognito state and prompt configuration.
New records must have safe defaults, tolerate malformed legacy values, and
remain local to `chrome.storage.local`. No new Chrome permission or external
service is required.

Failure handling must preserve existing data and controls.

- A malformed incognito or prompt record falls back to a disabled or built-in
  state without deleting unrelated storage.
- An unavailable provider returns a bounded, actionable error and doesn't
  mutate provider enablement.
- Unsupported Gemini fields are omitted instead of retrying destructive or
  unrelated request variants.
- A missing generated-bundle anchor fails validation instead of applying a
  broad replacement.

## Architecture impact

Stable storage keys and cross-context names belong in
`src/shared/claw-contract.js`. Provider and prompt behavior belongs in readable
modules under `src/shared/`. Options controls belong under `src/options/` or the
existing readable settings adapter.

Only behavior embedded in the upstream React bundle may modify `src/assets/`.
Every such patch must use a semantic anchor, have a regression test, and update
`docs/recovery-model.md`. The release package must continue to load only files
declared by the current manifest and release inventory.

## Risks and rollback

The largest risks are overwriting later local bundle recovery, leaking
temporary incognito messages into storage, and changing request conversion for
non-Gemini providers. Each behavior is implemented as an independently tested
slice and can be reverted without reverting the complete recovery.

Rollback must restore the prior behavior and its tests together. It must not
restore broad whitespace collapsing, remove bounded `429` retries, weaken
diagnostic sanitization, or import the upstream version number.
