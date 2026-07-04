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
- Reject unexpected permission additions through `npm run check:manifest`.
- Explain permission changes in the pull request and update the tracked
  baseline intentionally.
- Validate remote URLs and protocols before issuing requests.
- Keep native-host names and runtime message fields in the shared contract.

## Reporting

Do not include secrets or personal browsing data in a public report. Open a
private maintainer channel and provide the smallest reproducible case.

