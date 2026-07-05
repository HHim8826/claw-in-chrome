# Recovery model

This document explains how maintainable code extends the upstream browser
bundle. It replaces the former root-level deobfuscation map with a smaller,
operational contract.

## Source ownership

Use file location to determine the expected maintenance strategy.

- `src/assets/sidepanel-BoLm9pmH.js` is the upstream side-panel bundle and the
  main remaining bundle patch surface.
- `src/assets/service-worker.ts-H0DVM1LS.js` is the upstream background bundle.
- `src/assets/accessibility-tree.js-D8KNCIWO.js` and
  `src/assets/agent-visual-indicator.js-Ct7LqXhp.js` are upstream content
  scripts.
- `src/shared/` owns recovered cross-context contracts and adapters.
- `src/background/service-worker-loader.js` owns composition order.
- Readable page modules under `src/options/`, `src/sidepanel/`, and
  `src/visualizer/` own local enhancements.

## Stable seams

Prefer these seams when implementing behavior.

- `globalThis.__CP_CONTRACT__` provides frozen storage, message, permission,
  session, and UI constants.
- `service-worker-loader.js` loads the contract before the upstream worker and
  loads recovered runtimes afterward.
- `service-worker-runtime.js` and
  `service-worker-detached-window-runtime.js` expose injectable runtime APIs.
- `sidepanel-debug-logger.js` and `options-debug-logger.js` expose sanitized
  diagnostics through `globalThis` debug APIs.
- `sidepanel-debug-logger.js` exposes `globalThis.__CP_INCOGNITO__` before the
  upstream application loads. The runtime filters request context, excludes
  temporary messages from session snapshots, and guards scope-ledger storage
  while incognito mode is enabled.
- The MCP bundle's service-worker diagnostic seam sanitizes persisted and
  console payloads with the same helper. Permission `action_data` is treated as
  private text and raw payloads are never used as a logging fallback.

## Bundle patch contract

Direct bundle patches require stronger evidence than readable module changes.

1. Identify a stable semantic anchor near the behavior.
2. Add or update a regression test that proves the user-visible contract.
3. Keep the patch local and avoid global search-and-replace operations.
4. Run `npm run validate:full`.
5. Update this document when a new stable seam or ownership boundary emerges.

## Critical workflows

The current recovered layer protects these workflows.

- Custom provider configuration and provider-format adaptation.
- Runtime message contracts between the side panel, service worker, offscreen
  page, pairing page, and MCP bridge.
- Session hydration, detached-window locks, and closed-group cleanup.
- Permission prompts and MCP permission responses.
- GitHub update metadata, release downloads, and update presentation.
- Tool-result visualization and diagnostic logging.
- Incognito request and persistence boundaries for standard chat, quick mode,
  small-model helpers, and local session snapshots.

## Known constraint

The side-panel bundle remains large and expensive to review. New behavior must
move toward readable modules where practical; the quality score tracks this
debt explicitly.
