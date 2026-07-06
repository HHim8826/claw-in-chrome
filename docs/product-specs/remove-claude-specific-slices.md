# Remove Claude-specific recovery slices

Claw in Chrome must remain useful as a provider-independent browser agent. This
feature removes the Claude-only runtime slices recovered from upstream 1.0.79
while preserving generic browser automation, custom providers, MCP Native
Messaging, Mermaid rendering, and managed URL blocking.

## User and problem

The extension now operates through configurable providers and doesn't require a
Claude account. The current package still grants `identity`, injects a content
script only on Claude.ai, accepts external messages only from Claude.ai, and can
block users by Claude organization UUID. These surfaces add permissions,
maintenance cost, and product behavior that no longer matches the extension's
provider-independent contract.

## Desired outcome

The packaged extension has no active Claude.ai onboarding bridge, forced-Claude
organization gate, or Chrome Identity permission. Removing those paths must not
change custom-provider data, generic side-panel prompt delivery, MCP browser
control, Mermaid diagrams, telemetry disabling, or administrator-managed URL
blocking.

## Scope

Implementation removes the following active product slices:

- The Claude.ai content-script registration, web-accessible onboarding asset,
  and `externally_connectable` origin.
- The Claude.ai onboarding task map, task identifier bridge, and external
  Claude.ai message listener.
- The `forceLoginOrgUUID` managed policy, account gate, and policy-specific
  logout path.
- The readable OAuth-session cleanup module that exists only for the forced
  organization gate.
- The `identity` manifest permission and its reviewed permission baseline.
- Tests, release entries, inspection output, matrix entries, and current docs
  that claim these removed behaviors are supported.

The generic `OPEN_SIDE_PANEL` message continues to accept trusted extension
messages with a direct prompt, model, permission mode, and attachments.

## Non-goals

This feature doesn't perform a broad textual removal of every historical Claude
symbol from generated upstream bundles. It doesn't rename legacy native-host
compatibility identifiers, replace the generated side-panel application, delete
stored OAuth records, or change provider configuration formats.

This feature also doesn't remove the generic `blockedUrlPatterns` managed
policy, MCP Native Messaging, MCP permission prompts, Mermaid rendering,
telemetry suppression, custom-provider credentials, workflows, scheduled tasks,
history, or detached-window recovery.

## User-visible contract

After the change, users observe the following behavior:

- Visiting Claude.ai doesn't activate a Claw-specific onboarding bridge.
- Chrome doesn't request the `identity` extension permission for this package.
- No account is blocked because it belongs to a different Claude organization.
- Custom providers continue to open the side panel and run browser tasks.
- External MCP clients continue to reach browser tools through
  `claw-in-chrome-mcp` and `nativeMessaging`.
- Administrator-managed URL patterns continue to block configured targets.

## Acceptance criteria

The implementation is accepted when all of these conditions are proven:

1. `src/manifest.json` and the tracked permission baseline omit `identity`.
2. The manifest contains no Claude.ai content-script match,
   `externally_connectable` Claude.ai origin, or onboarding web-accessible
   resource.
3. The release package contains no Claude onboarding task module or dedicated
   onboarding content script.
4. The background worker has no Claude external-message listener,
   `onboardingTaskId` branch, or policy-specific OAuth logout bridge.
5. The managed schema and readable policy module retain
   `blockedUrlPatterns` but omit `forceLoginOrgUUID` and organization helpers.
6. Existing custom-provider, direct `OPEN_SIDE_PANEL`, MCP Native Messaging,
   Mermaid, telemetry, permission, workflow, history, and detached-window tests
   remain green.
7. Runtime inspection reports no `identity` permission, no Claude site bridge,
   and only the retained managed-policy keys.
8. The browser-importable release passes the full extension E2E smoke test
   without page or console errors.

## Data, permissions, and failure states

The change removes permission and code paths; it doesn't migrate or delete user
storage. Dormant OAuth records may remain in existing profiles because deleting
them would be an unrelated destructive migration. Custom-provider API keys,
chat history, workflows, prompts, and MCP settings must remain untouched.

Malformed or unavailable managed storage must continue to preserve normal
behavior. Removing the organization policy must not weaken URL-policy matching
or the regular MCP permission manager.

## Architecture impact

The change narrows the readable recovery layer and generated bundle seams. It
removes `auth-session.js` and `onboarding-tasks.js` from the background loader,
release inventory, architecture check, and documentation. Narrow bundle edits
remove only the Claude-specific branches and require semantic regression
anchors that prove the retained generic paths.

`scripts/inspect-runtime.js` must expose enough manifest data to prove that no
Claude.ai bridge or `identity` permission remains. The upstream 1.0.79 behavior
matrix must classify the removed slices as intentionally excluded from the
provider-independent product.

## Risks and rollback

The highest risk is removing a shared branch that custom-provider or MCP flows
still use. Tests must distinguish Claude-specific external messages from the
generic internal `OPEN_SIDE_PANEL` path and distinguish Chrome Identity from
Native Messaging.

Rollback restores one coherent removal slice at a time. It must not revert
Mermaid, telemetry, generic managed URL policy, or unrelated local hardening.
