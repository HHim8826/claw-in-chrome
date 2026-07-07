# Remove Claude-specific recovery slices execution plan

This plan implements the
[Claude-specific slice removal specification](../../product-specs/remove-claude-specific-slices.md)
through test-first, independently revertible changes. Runtime implementation
starts only after the user approves this plan.

## Goal

Remove active Claude.ai onboarding, forced-organization, and Chrome Identity
behavior without changing provider-independent Claw, MCP, Mermaid, managed URL
policy, or persisted user data.

## Constraints

Implementation must narrow the product contract without using broad bundle
reverts.

- Start from `main` at
  `8a5f4f6cf919d26bcc393d6dd72782eb4962932c`, tracking `origin/main`, with a
  clean working tree.
- Preserve the user-owned version commit at the starting `HEAD`.
- Don't reset or revert the upstream 1.0.79 recovery commits wholesale.
- Write one failing observable contract test before each runtime slice.
- Keep `nativeMessaging`; it powers `claw-in-chrome-mcp` and is independent of
  Chrome Identity.
- Keep `blockedUrlPatterns`; remove only organization-specific policy behavior.
- Keep generic internal `OPEN_SIDE_PANEL` prompt delivery.
- Don't delete existing user storage or provider credentials.
- Patch generated bundles only at the documented Claude-specific semantic
  anchors, then update `docs/recovery-model.md`.
- Run `npm run validate:fast` before each GREEN checkpoint and
  `npm run validate:full` after manifest, worker, package, or E2E changes.

## Approval gate

Planning may change only durable planning documents. Before user approval, no
manifest, runtime, test, bundle, permission baseline, or release-package file
may change. Approval authorizes Slice 1's RED test, not a broad generated-bundle
rewrite.

## Execution slices

Each slice begins with a focused failing test and ends with a coherent GREEN
checkpoint.

### Slice 1: Freeze the provider-independent boundary

This slice creates one executable contract for what must disappear and what
must remain.

1. Add a regression test that fails while `identity`, Claude.ai manifest
   integration, forced-organization policy, onboarding modules, or dedicated
   Claude external messages remain.
2. In the same test, assert that `nativeMessaging`, the MCP setup route,
   Mermaid assets, `blockedUrlPatterns`, custom-provider modules, and generic
   `OPEN_SIDE_PANEL` delivery remain.
3. Record the initial RED output before changing runtime code.

### Slice 2: Remove Claude.ai site integration

This slice removes the onboarding and external-page boundary while preserving
internal side-panel opening.

1. Remove Claude.ai content-script matches, onboarding web-accessible
   resources, and Claude.ai `externally_connectable` entries from the manifest.
2. Remove the onboarding task module and dedicated content-script artifact from
   loaders, architecture checks, release inventory, and source ownership.
3. Remove `onboardingTaskId` resolution and the Claude external-message listener
   from the worker bundle.
4. Retain and test direct internal `OPEN_SIDE_PANEL` prompt delivery, retries,
   selected model, permission mode, and attachments.
5. Replace onboarding-specific tests and semantic anchors with absence and
   retained-path tests.

### Slice 3: Remove Claude organization and Identity behavior

This slice removes account-specific policy and permission surfaces without
weakening generic URL policy or MCP Native Messaging.

1. Remove `identity` from the manifest and reviewed permission baseline.
2. Remove `forceLoginOrgUUID` from the managed schema and remove organization
   parsing, membership checks, live account gating, and policy-specific logout.
3. Remove `auth-session.js`, its loader and release entries, and contract keys
   that have no remaining consumer.
4. Preserve generic credential redaction because configured providers may also
   use access and refresh token fields.
5. Update managed-policy tests to prove URL matching, malformed-data fallback,
   and live updates still work without organization behavior.
6. Replace OAuth Identity tests with permission-absence and MCP
   Native-Messaging-preservation assertions.

### Slice 4: Reconcile harness and product contracts

This slice makes the current repository describe the narrowed product rather
than the removed upstream behavior.

1. Reclassify forced organization, Claude Identity, and Claude onboarding in
   `scripts/upstream-1.0.79-matrix.js` as intentionally excluded, with the new
   feature brief as evidence.
2. Update `docs/recovery-model.md`, `docs/SECURITY.md`,
   `docs/RELIABILITY.md`, and `docs/QUALITY_SCORE.md`.
3. Update `scripts/inspect-runtime.js` to report externally connectable origins
   and content-script match groups so the absence of a Claude site bridge is
   machine-readable.
4. Update release and architecture checks to reject stale removed modules.
5. Run documentation, architecture, manifest, release-package, and focused
   regression checks.

### Slice 5: Validate packaged runtime and review

This slice proves the complete extension remains loadable and independent of
the removed Claude surfaces.

1. Run `npm run validate:fast`.
2. Run `npm run inspect:runtime` and record permissions, managed keys, content
   script matches, external origins, and retained MCP surfaces.
3. Run `npm run validate:full` and confirm extension pages produce no page or
   console errors.
4. Build the browser-importable release package and run the critical E2E path
   against that extracted package.
5. Review the result for spec compliance, harness quality, architecture drift,
   security, reliability, regression risk, and unintended generated churn.
6. Fix review findings, rerun affected validation, move this plan to
   `docs/exec-plans/completed/`, and commit the final GREEN checkpoint.

## Harness checklist

This checklist defines the guardrails required before and during
implementation.

- [x] The feature brief records the goal, scope, non-goals, user contract,
  permissions, data behavior, risks, and rollback.
- [x] This plan records vertical slices, the first RED behavior,
  validation, runtime evidence, and an approval gate.
- [x] A focused removal regression test proves both absence and retained
  provider-independent behavior.
- [x] Manifest validation rejects `identity` and stale Claude.ai site bridges.
- [x] The permission baseline retains `nativeMessaging` while removing only
  `identity`.
- [x] Managed-policy tests retain URL blocking and reject organization-policy
  drift.
- [x] Semantic anchor tests cover every generated bundle removal.
- [x] Release-package validation rejects removed onboarding and auth-session
  modules.
- [x] Runtime inspection exposes permissions, managed keys, external origins,
  and content-script matches.
- [x] MCP regression tests prove native-host tool request, response, connection,
  and permission flows remain intact.
- [x] Custom-provider regression tests prove configuration, models, credentials,
  and side-panel operation remain intact.
- [x] Headed E2E loads the unpacked and packaged extension without page or
  console errors.
- [x] Security and reliability docs describe the narrower permission and site
  integration surface.
- [x] Spec, harness, architecture, security, reliability, and regression review
  findings are resolved or recorded as blockers.
- [x] Each coherent GREEN slice is committed without unrelated changes.

No new external test service is required. Existing Chrome mocks, storage
fixtures, native-host fakes, manifest checks, release-package checks, and headed
extension E2E provide deterministic evidence.

## Done criteria

The feature is done only when behavior, validation, documentation, and Git
conditions are all satisfied.

- [x] The extension manifest contains no `identity`, Claude.ai content-script
  match, Claude.ai `externally_connectable` entry, or onboarding resource.
- [x] The package contains no onboarding task module, dedicated Claude
  onboarding content script, or policy-only auth-session module.
- [x] The background worker contains no Claude external-message listener,
  `onboardingTaskId` branch, forced-organization gate, or policy logout bridge.
- [x] The managed schema contains `blockedUrlPatterns` and doesn't contain
  `forceLoginOrgUUID`.
- [x] `nativeMessaging`, MCP setup, MCP permission prompts, and MCP browser tools
  remain covered and green.
- [x] Mermaid, telemetry suppression, custom providers, workflows, scheduled
  tasks, history, incognito, diagnostics, and detached windows remain covered
  and green.
- [x] Existing user storage is not deleted or migrated.
- [x] Every generated bundle edit has a semantic anchor and recovery-model
  update.
- [x] `npm run validate:fast` passes.
- [x] `npm run validate:full` passes without extension-page or console errors.
- [x] `npm run inspect:runtime` shows no Claude site bridge or `identity` and
  reports the retained MCP and managed URL surfaces.
- [x] The browser-importable release passes its critical E2E flow.
- [x] Documentation links pass `npm run check:docs`.
- [x] Review findings are fixed or recorded as explicit blockers.
- [x] This plan moves to `docs/exec-plans/completed/` with RED, GREEN, runtime,
  review, commit, and push evidence.
- [x] Task-owned changes are committed as coherent GREEN checkpoints.
- [x] The final handoff reports commit hashes and the push result or exact push
  blocker.

## Progress evidence

Record implementation evidence here as work proceeds.

- Planning started on July 6, 2026.
- Starting branch: `main`, tracking `origin/main`.
- Starting HEAD: `8a5f4f6cf919d26bcc393d6dd72782eb4962932c`.
- Starting task-owned dirty state: clean.
- Planning conclusion: remove active Claude.ai site integration, forced
  organization policy, Chrome Identity permission, and their dedicated readable
  recovery modules. Preserve generic MCP Native Messaging, managed URL policy,
  Mermaid, telemetry suppression, custom providers, and persisted user data.
- Approval state: approved on July 6, 2026.
- Slice 1 RED: `node tests/unit/provider-independence.regression.test.js`
  failed because the manifest still granted `identity` and exposed Claude.ai
  integration.
- Slice 1 GREEN: the provider-independence test passes after removing the
  Claude.ai manifest surface and `identity` while retaining `nativeMessaging`.
- Slice 2 RED: the provider-independence test failed on the worker's Claude
  external-message and onboarding constants.
- Slice 2 GREEN: the worker now accepts only generic internal
  `OPEN_SIDE_PANEL` prompts; onboarding modules, assets, tests, and release
  entries are removed.
- Slice 3 RED: the provider-independence test failed because the managed schema
  still exposed `forceLoginOrgUUID`.
- Slice 3 GREEN: organization policy, account blocker, policy logout, and
  `auth-session.js` are removed while managed URL blocking remains green.
- Review finding fixed: Mermaid observes streamed character-data updates,
  retries only changed source, ignores stale async results, and reads
  `data-mode` for the selected theme.
- Review finding fixed: the upstream behavior matrix now verifies every
  `testTarget` exists and records current equivalent or excluded statuses.
- Review findings removed with their features: the arbitrary Claude external
  prompt, OAuth execution-lock path, and blank organization entry no longer
  have active product surfaces.
- Durable agent rule: `AGENTS.md`, `ARCHITECTURE.md`, the recovery model, and a
  regression test declare the provider-independent boundary and prohibit
  unapproved Claude-only integrations or `identity` permission.
- GREEN checkpoint: `9a869b1` (`Remove Claude-specific runtime slices`).
- Documentation completion: `README.md` and `README_EN.md` now state that Claw
  in Chrome is provider-independent, doesn't depend on Claude.ai login or
  Claude organization policy, and keeps MCP on `nativeMessaging` rather than
  Chrome Identity.
- Final validation: `npm run validate:fast` and `npm run validate:full` pass
  58 unit/integration files and headed extension E2E without page or console
  errors.
- Runtime inspection reports `providerIndependent: true`, MCP transport
  `nativeMessaging`, no external origins, no `identity`, and only
  `blockedUrlPatterns` in managed policy.
- Packaged runtime evidence: the 49-item, 181-file browser-importable release
  passes E2E, including streamed Mermaid recovery and `data-mode` theme use.
- Review limitation: independent sub-agent review wasn't available under the
  active collaboration policy; focused spec, harness, architecture, security,
  reliability, and regression self-review used deterministic tests and runtime
  evidence instead.
- Completion checkpoint: this plan moved to `docs/exec-plans/completed/`.
  Final commit hash and push result are reported in the task handoff because
  they can be known only after this completed plan is committed and pushed.
