# Architecture

Claw in Chrome is a Manifest V3 Chrome extension built from an upstream bundle
plus a maintainable recovery layer. The primary architecture constraint is to
keep new behavior in readable modules and use bundle edits only when no stable
extension seam exists.

## Runtime layers

The extension loads code in four layers.

1. `src/assets/` contains upstream or generated browser bundles. These files
   are large, name-hashed, and expensive to review.
2. `src/shared/` contains stable contracts and reusable recovered behavior.
3. `src/background/`, `src/options/`, `src/sidepanel/`, `src/offscreen/`, and
   `src/visualizer/` contain readable runtime adapters and features.
4. `src/background/service-worker-loader.js` composes the shared contract,
   upstream service worker, and recovered runtime in a fixed order.

## Dependency rules

Apply these rules to every change.

- Readable modules may depend on `src/shared/`.
- Only designated loader or page shells may load `src/assets/` directly.
- `src/shared/claw-contract.js` owns stable storage keys, message names, and
  cross-context constants.
- Producers and consumers of a runtime message must use the same contract key.
- A bundle patch must include a semantic anchor test and an update to
  `docs/recovery-model.md` when the recovered understanding changes.
- Release contents must come from `.github/release-package-items.txt`.

## Verification boundaries

Use the narrowest test that proves the behavior, then run the project gate.

- Unit tests cover contracts, pure helpers, bundle anchors, and page adapters.
- Integration tests cover service-worker and storage workflows with Chrome
  mocks.
- E2E tests load the unpacked extension and exercise extension pages.
- Release checks verify every packaged runtime dependency exists.
- Architecture and documentation checks keep these boundaries discoverable.

## Change strategy

Prefer a readable adapter or extracted module over another direct bundle edit.
When a direct bundle patch is unavoidable, keep it small, add a stable semantic
name, test the observable behavior, and record the seam in the recovery model.

