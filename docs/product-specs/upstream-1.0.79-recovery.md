# Upstream 1.0.79 feature recovery

This feature selectively recovers applicable user-visible behavior from the
locally supplied Claude in Chrome 1.0.79 package without replacing Claw in
Chrome's readable recovery layer or its existing hardening. The source package
is an input specification, not a directory tree to copy over this repository.

## User and problem

The current extension is based on an older upstream runtime and contains local
features and safety fixes that don't exist as equivalent readable code in the
new package. Replacing the current bundles, manifest, or page shells wholesale
would remove local behavior and make regressions difficult to diagnose.

Users need the applicable functionality added between the current upstream
baseline and Claude in Chrome 1.0.79 while retaining custom providers,
incognito boundaries, prompt rules, workflow synchronization, local history,
diagnostic sanitization, GitHub updates, and detached-window recovery.

## Source baseline

The supplied source is `C:\Users\leo\Downloads\Claude-Chrome` with manifest
version `1.0.79` and `git-hash.txt` value
`84be9f3a200dd6d7aea5b06ceeb8faf753f0a443`. The current Claw manifest version
is `1.0.67.8`.

Inspection confirms these source-level behavior groups require reconciliation:

- Managed browser policies for blocked URL patterns and forced organization
  login.
- MCP OAuth support through `chrome.identity` and PKCE redirect handling.
- A Claude.ai onboarding content-script bridge that opens the side panel and
  populates a validated starter task.
- Expanded artifact presentation, including Mermaid diagrams and interactive
  artifacts loaded through split runtime assets.
- New `Conway` and `squares` settings and background contracts whose exact
  user-visible behavior must be established before inclusion.
- Changed generated side-panel, options, storage, permission, service-worker,
  and content-script runtimes that may contain smaller fixes or behavior
  changes not identifiable from filenames alone.

The new manifest adds `identity`, declares the managed-storage schema, changes
the Claude.ai content-script loader, and narrows its network policy. The
current fork also has capabilities absent from the source manifest, including
configured-provider network access and `system.display`; source differences
must not silently remove them.

## Desired outcome

Claw in Chrome implements every applicable 1.0.79 behavior through its current
architecture seams. Each source difference is classified as missing, locally
equivalent, divergent, or excluded. Missing behavior is ported with focused
tests, and exclusions include evidence and user-impact reasoning.

The final extension remains loadable from `src/`, preserves existing settings
and sessions, and packages every new runtime dependency without broad bundle
replacement.

## Non-goals

This work doesn't rename the product to Claude, copy the source package over
`src/`, import its update URL or signing metadata, or adopt its manifest version
as the Claw release version. It doesn't remove local permissions, relax the
configured-provider content security policy, re-enable telemetry, or discard
existing readable adapters.

The feature doesn't ship the `Conway` or `squares` capability. Source inspection
shows that it provisions a remote container, sends organization and bearer-token
credentials to `/sandbox/proxy/my`, and exposes browser tools to that remote
host. This is a new external browser-control trust boundary without a stable
local product contract.

## User-visible contract

Recovered behavior must coexist with the current extension contract.

- Enterprise policy blocks configured URL patterns deterministically and
  restricts organization login without deleting user data or weakening other
  permission checks.
- MCP OAuth uses a PKCE flow, validates redirects and state, stores tokens
  through the existing credential boundary, and never exposes tokens through
  diagnostics.
- A supported Claude.ai onboarding button can open the correct side panel and
  populate only a known starter prompt. Invalid task identifiers are ignored.
- Supported Mermaid artifacts render in an isolated, content-security-policy
  compatible surface. Invalid or oversized diagrams fail safely without
  breaking the conversation.
- Existing custom-provider, incognito, prompt, history, workflow, scheduled
  task, permission, and update behavior remains unchanged unless a separately
  documented source fix requires an intentional change.

## Acceptance criteria

The implementation is accepted when the following evidence exists.

1. A source-to-local behavior matrix accounts for manifest, HTML entry points,
   runtime messages, storage keys, managed policies, and user-visible source
   strings as missing, equivalent, divergent, or excluded.
2. Managed blocked-URL and forced-organization behavior passes focused tests,
   including malformed policy data and policy updates.
3. MCP OAuth passes focused PKCE, state, redirect, token-storage, cancellation,
   and diagnostic-redaction tests. The `identity` permission is added only if
   this slice remains in the approved scope.
4. The onboarding bridge accepts known task identifiers, rejects unknown
   values, opens the intended tab's side panel, and delivers the prompt across
   service-worker restarts.
5. Mermaid and other accepted artifact additions pass rendering, sanitization,
   content security policy, size-limit, lazy-asset, and failure-state tests.
6. `Conway`, `squares`, and every other opaque source delta is either proven
   through a public behavior test or excluded with explicit reasoning.
7. Existing focused regression suites and release-package checks prove that
   local features and runtime entry points remain intact.
8. `npm run validate:fast`, `npm run validate:full`, and
   `npm run inspect:runtime` pass with intentional manifest changes recorded.

## Data, permissions, and failure states

Managed policies are read-only inputs from `chrome.storage.managed`. Invalid
patterns or organization identifiers must fail closed only for the affected
policy and must not corrupt local storage.

OAuth credentials and verifier material are sensitive. Logs, screenshots,
fixtures, and persisted diagnostics must not contain authorization codes,
access tokens, refresh tokens, PKCE verifiers, or raw redirect URLs. A denied,
cancelled, malformed, or expired flow must leave existing connector state
usable.

Adding `identity` expands the manifest permission surface and requires an
explicit security review. No other permission, host permission, externally
connectable origin, or remote endpoint may change without separate evidence.

## Architecture impact

Stable storage keys, runtime messages, and policy names belong in
`src/shared/claw-contract.js`. Managed-policy matching and OAuth protocol logic
must use readable modules where practical. The service-worker loader must keep
the shared contract and local recovery runtimes around the accepted upstream
worker in its existing order.

The onboarding bridge may introduce a readable content-script loader and
validated prompt map. Artifact rendering must prefer readable visualizer or
side-panel adapters and isolate untrusted diagram input. Direct changes under
`src/assets/` require semantic anchor tests and a recovery-model update.

## Risks and rollback

The highest risks are token leakage, enterprise policy over-blocking, generated
bundle replacement, content security policy regressions, and loss of local
features during entry-point reconciliation. Each behavior group must ship as
an independently tested and revertible slice.

Rollback removes the affected slice, its new assets, manifest declaration, and
contract additions together. It must not restore an older complete source tree
or revert unrelated local recovery work.
