# Quality score

This scorecard tracks the repository's current agent-development readiness.
Update it when a gate is added, removed, or proven insufficient.

## Current score

The target is four or higher in every category.

| Area | Score | Evidence | Next improvement |
| --- | ---: | --- | --- |
| Agent navigation | 4/5 | `AGENTS.md` and architecture index | Add module-local guides only when needed |
| Automated tests | 4/5 | Unit, integration, and extension E2E suites | Add coverage reporting for readable modules |
| Architecture safety | 4/5 | Contract and loader checks | Extract more side-panel behavior from the bundle |
| CI and release | 3/5 | Fast CI, E2E CI, package validation, and immutable version policy are defined | Confirm the first green immutable release run, then add signed provenance |
| Runtime diagnostics | 4/5 | Sanitized debug exports, provider metrics dashboard, and inspection command | Export diagnostics directly from E2E failures |
| Security | 3/5 | Permission baseline plus sanitized storage and console diagnostics | Add secret scanning and dependency review |
| Documentation | 4/5 | Required-doc and local-link checks | Add automated command example execution |

The provider insights dashboard adds bounded local measurements for request
status, latency, errors, and normalized token usage. Settings backup adds a
versioned, allowlisted portability contract with default secret exclusion.
Encrypted credential-bearing backups remain a future security design rather
than part of the plain JSON v1 format.

## Scoring rule

Use one for undocumented/manual behavior, three for documented and partially
tested behavior, and five for an enforced, observable, and low-maintenance
contract. Do not raise a score without repository evidence.

## Current recovery debt

The upstream e58 recovery adds tested semantic anchors to the side-panel,
options, and storage bundles because those React owners have no readable
extension seam. Future upstream rebases should extract the model resolver,
session text normalizers, and context-usage selector into readable modules.
The source commit's font-preload-only HTML churn is intentionally excluded: it
is not one of the seven advertised functional or bug-fix behaviors and would
expand page/release churn without changing their contract.

The extension vendors patched Mermaid 11.17.2 as a lazy-loaded
browser asset. This avoids loading upstream application bundles as Mermaid
dependencies, but release-size tracking remains necessary. The opaque
`Conway` and `squares` remote-host surfaces remain excluded until they have a
stable local user contract and security model.

The upstream 1.0.94 recovery adds readable modules for `browser_batch`, tool
activity labels, and link safety, plus narrow anchored patches for the tool
runtime, content scripts, and side panel. The 1.0.94 behavior matrix fails
while any accepted group remains `missing`. Chat Completions providers still
receive tool-result screenshots only as metadata because tool messages can't
carry image parts. That pre-existing limitation affects single screenshots
and batches alike.

The provider-independence pass removes the recovered Claude.ai onboarding,
forced-organization, and Chrome Identity slices while retaining generic MCP
Native Messaging, Mermaid, and managed URL policy. The upstream behavior matrix
now fails when any `testTarget` path is missing, preventing documentation-only
false-green entries. Historical Claude names remain in generated compatibility
surfaces and are not an active product contract.
