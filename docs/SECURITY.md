# Security

Claw in Chrome has broad browser access and stores model-provider credentials.
Changes to permissions, credential handling, native messaging, or remote
connections require explicit review and full validation.

## Sensitive surfaces

Treat these surfaces as security-critical.

- `host_permissions` includes `<all_urls>`.
- Extension permissions include `debugger`, `nativeMessaging`, `downloads`,
  `scripting`, and `unlimitedStorage`.
- Provider configuration may contain API keys, access tokens, and refresh
  tokens in `chrome.storage.local`.
- The content security policy permits HTTPS, HTTP, WebSocket, and localhost
  connections for configured providers and bridges.

## Required controls

Apply these controls to every security-sensitive change.

- Keep credentials out of logs, screenshots, fixtures, and error messages.
- Use the sanitizers in the debug loggers before persisting diagnostics.
- Send the same sanitized payload to diagnostic storage and browser consoles.
  Treat permission `action_data` as private text and never fall back to raw
  payload logging when sanitization or persistence fails.
- Reject unexpected permission additions through `npm run check:manifest`.
- Explain permission changes in the pull request and update the tracked
  baseline intentionally.
- Validate remote URLs and protocols before issuing requests.
- Keep native-host names and runtime message fields in the shared contract.
- Treat editable prompt rules and built-in prompt overrides as model
  instructions, not authorization. They must not grant Chrome permissions,
  bypass permission prompts, or mutate permission policy.
- Treat `blockedUrlPatterns` as administrator-owned, read-only policy.
  Normalize malformed values without writing them to local storage, and apply
  managed-storage changes without requiring a reload.
- Keep the product provider-independent. Don't add Claude-only origins,
  organization gates, onboarding bridges, or the `identity` permission without
  an approved feature brief and security review.
- Keep MCP on the reviewed `nativeMessaging` bridge. Chrome Identity isn't
  required for generic MCP browser tools.
- Redact authorization codes, access tokens, refresh tokens, and verifier
  material from diagnostics even when configured providers introduce those
  fields.
- Render Mermaid with strict security, disabled HTML labels, text and edge
  limits, and a bounded timeout. Remove executable, embedded, animated, event,
  and external-link SVG content before inserting a diagram into the side panel.
- Export only reviewed settings keys. Exclude credentials by default, require
  explicit opt-in before creating a plain-text credential-bearing backup, and
  never include chat history, diagnostics, or telemetry records.
- Keep provider measurements local and schema-bound. Never record prompts,
  responses, request bodies, headers, credentials, full URLs, or stack traces.
- Validate backup kind and schema before previewing or applying an import. Apply
  only reviewed storage keys and preserve installed credentials when an import
  omits them.

## Reporting

Do not include secrets or personal browsing data in a public report. Open a
private maintainer channel and provide the smallest reproducible case.
