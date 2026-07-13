# Settings backup and provider insights

Claw in Chrome must let users move their settings safely and understand how
their configured providers perform. This feature adds two independent product
slices: a versioned settings backup workflow and a local provider insights
dashboard.

## Users and problems

Users can configure provider profiles, prompt rules, workflows, permissions,
and UI preferences, but they can't move the complete configuration between
Chrome profiles or installations. Workflow-only export doesn't preserve the
rest of the extension setup.

Users can run provider health checks and inspect debug logs, but they can't see
token totals, request latency, or failure trends across providers. Diagnosing a
slow or unreliable profile currently requires manual log inspection.

## Desired outcomes

The settings backup slice lets a user export a versioned JSON document, inspect
an import before applying it, and restore supported settings without exposing
credentials by default.

The provider insights slice records bounded, local request measurements and
shows token, latency, success, and error summaries without storing prompts,
responses, credentials, or full provider URLs.

## Non-goals

This feature doesn't sync data through a remote service, export chat history,
provide cloud backup, calculate monetary cost, or collect product analytics.
It doesn't add a provider, change provider selection, or alter request and
response conversion semantics.

The first release doesn't encrypt credential-bearing exports. A user may opt
in to a plain JSON export that contains credentials, but the UI must present a
clear warning before creating it. Password-encrypted exports require a
separate security design.

## Settings backup contract

The backup document uses a stable top-level envelope:

```json
{
  "kind": "claw-in-chrome-settings-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-07-13T00:00:00.000Z",
  "includesSecrets": false,
  "settings": {}
}
```

The exporter includes only reviewed settings keys. It excludes chat scopes,
debug logs, update metadata, cleanup audit records, transient permission
prompts, and telemetry records. Secret fields are removed recursively unless
the user explicitly enables **Include provider credentials**.

The importer must validate the envelope and schema version before presenting a
preview. Applying an import updates only reviewed settings keys. A secret field
omitted from an export must preserve the current stored secret during merge.
Unknown keys must never reach `chrome.storage.local`.

## Provider insights contract

Each measurement contains only these normalized fields:

- A generated record identifier and start timestamp.
- Provider profile identifier, display name, format, and model identifier.
- HTTP status, outcome category, error category, and retry count.
- Header latency, total duration, and normalized token usage.

Measurements must not contain prompts, response text, message arrays,
credentials, authorization headers, request bodies, full URLs, or stack traces.
The store retains at most 500 records and removes records older than 30 days.

The dashboard displays aggregate request count, success rate, average latency,
input tokens, output tokens, cache-read tokens, and grouped error counts. The
user can filter by provider profile and clear all measurements.

## Data, permissions, and failure states

Both slices use the existing `storage` and `downloads` permissions. They don't
add manifest or host permissions.

An invalid, unsupported, or unreadable backup must leave storage unchanged.
An import failure must show an actionable error and retain the selected file
for another attempt. A storage write failure must not report success.

Telemetry persistence is best effort. A telemetry failure must never fail or
delay a provider request. Aborted requests are recorded as `aborted`, while
network failures and HTTP failures use separate categories. Clearing telemetry
must not remove provider settings, sessions, workflows, or debug logs.

## Architecture impact

Pure backup and telemetry behavior belongs in readable modules under
`src/shared/`. The Options UI adapter belongs under `src/options/`. Provider
request instrumentation uses the existing readable provider adapter seam and
must not patch the generated side-panel bundle.

Stable backup and telemetry storage names belong in
`src/shared/claw-contract.js`. The Options page must load the shared modules
before the UI adapter. Release-package and architecture checks must cover the
new runtime files.

## Acceptance criteria

The settings backup slice is accepted when all of these behaviors are proven:

1. A default export contains every reviewed non-secret setting and no secret,
   session, debug, update, transient, or telemetry data.
2. A credential-bearing export happens only after explicit user opt-in and is
   marked with `includesSecrets: true`.
3. Import preview rejects the wrong document kind, an unsupported schema, and
   unknown or empty payloads without modifying storage.
4. Import applies only reviewed keys and preserves current secrets when the
   backup omits them.
5. Provider profiles, prompt rules, workflows, permission preferences, and UI
   preferences survive an export and import round trip.

The provider insights slice is accepted when all of these behaviors are proven:

1. Successful, HTTP-error, network-error, and aborted provider requests create
   sanitized measurements without changing the returned response or error.
2. Non-streaming and streaming usage updates produce normalized token totals
   when the provider supplies usage.
3. Retention removes records older than 30 days and limits the store to 500
   newest records.
4. Dashboard totals and provider filtering are deterministic and testable
   through the public aggregation interface.
5. The Options UI can export, preview, apply, and clear through visible user
   controls in English, Simplified Chinese, and Traditional Chinese.

## Risks and rollback

The highest backup risk is leaking secrets or overwriting unrelated storage.
The reviewed allowlist, default secret exclusion, preview gate, and merge
behavior bound that risk.

The highest telemetry risks are request-path regression, unbounded storage,
and recording private content. Instrumentation must stay best effort, use a
strict record schema, and pass content-exclusion tests.

Rollback removes the Options adapter, shared modules, contract keys, and HTML
load entries together. Existing settings and telemetry records may remain
dormant; rollback must not delete user data automatically.

