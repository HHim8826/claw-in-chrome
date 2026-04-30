# Project Reorganization: Move Extension Code to `src/`

## 1. Overview
The current repository structure places all Chrome extension runtime files directly in the root directory. To improve maintainability and clean up the repository, all extension runtime assets will be migrated into a dedicated `src/` folder. Within that folder, assets will be categorized by feature or module. 

This design document outlines the exact reorganization steps, path updates, and test updates needed to preserve the full functionality of the Chrome extension while cleaning up the repository root.

## 2. Directory Structure Reorganization
All extension runtime files, which are later packaged for deployment, will be moved from the repository root to `src/` and its subdirectories.

### `src/manifest.json` and `src/managed_schema.json`
- Will sit at the root of `src/` to define the extension configuration.
- Will reference subdirectories (e.g. `background/service-worker-loader.js` instead of `service-worker-loader.js`).

### `src/assets/`, `src/sounds/`, `src/i18n/`
- Relocated from the root directory to `src/` intact.

### `src/background/`
Stores the background service workers:
- `service-worker-loader.js`
- `service-worker-runtime.js`
- `service-worker-detached-window-runtime.js`
- `service-worker-shortcut-workflow-sync.js`
- `github-update-worker.js`
- `github-update-worker-runtime.js`
- `github-update-shared.js` (Wait. Or `shared/`?) -> Best fit for background or shared. Let's put in `background/`. Wait, `options` probably also imports `github-update-shared.js`. Let's put `github-update-shared.js` in `src/shared/`.

### `src/sidepanel/`
- `sidepanel.html`
- `sidepanel-inline-provider.js`
- `sidepanel-inline-provider.css`
- `sidepanel-debug-logger.js`
- `github-update-sidepanel.js`

### `src/options/`
- `options.html`
- `options-debug-logger.js`
- `options-update-enhancer.js`
- `options-update-preview.local.js`
- `options-visualizer-launcher.js`
- `github-update-options.js`

### `src/offscreen/`
- `offscreen.html`
- `offscreen.js`

### `src/visualizer/`
- `visualizer.html`
- `visualizer.js`
- `visualizer.css`
- `visualizer-core.js`
- `gif_viewer.html`
- `gif_viewer.js`
- `gif.js`
- `gif.worker.js`

### `src/pages/`
Standalone feature pages:
- `pairing.html`
- `blocked.html`

### `src/shared/`
Shared modules imported by various pages:
- `claw-contract.js`
- `custom-provider-models.js`
- `custom-provider-settings.js`
- `detached-window-title.js`
- `mcp-permission-popup-protocol.js`
- `native-host-binding.js`
- `provider-format-adapter.js`
- `telemetry-disable.js`
- `theme-init.js`
- `github-update-shared.js`

### Remained in Root / Development
These are not shipped:
- `package.json`, `package-lock.json`
- `README.md`, `README_EN.md`, `DEOBFUSCATION_MAP.md`, `任务规格计划书.md`
- `scripts/`
- `tests/`
- `.github/`
- `docs/`
- `screenshots/`
- `claude_icon.svg`
- `icon-128.png` (Wait, this icon is usually packaged in the extension. So it should move to `src/`! We will move `icon-128.png` to `src/`).

## 3. Code Adjustments
### HTML Files
Update script and style tags inside `src/*/*.html` to reference their new relative paths (e.g. `<script src="../shared/theme-init.js"></script>`).

### JavaScript Imports
Any `importScripts()` in background workers or dynamic loading paths must reflect the new structure (e.g. `importScripts('./service-worker-runtime.js', '../shared/theme-init.js')`).

### `manifest.json`
Update paths for background (`background/service-worker-loader.js`), action (`sidepanel/sidepanel.html`), icons (`icon-128.png`), and web accessible resources to point to correctly prefixed items if they moved away from `manifest.json`'s current directory (e.g. `assets/...` stays the same relative from `src/`).

## 4. Tests and CI
- `tests/`: Extensive updates to `require("../file.js")` imports across ~55 files to `require("../src/shared/file.js")`.
- **E2E loading**: The playwright smoke test will be updated to point the dummy extension context at `--disable-extensions-except=.../src`.
- `.github/release-package-items.txt` and `scripts/check-release-package.js` need to correctly track the new prefixes within `src/` or be updated to just package the entire `src/` contents.

## 5. Scope and Ambiguity
**Ambiguity Check**: "icon-128.png" and "claude_icon.svg" packaging - Both will be moved to `src/` to ensure they are deployed, as well as fixing references in HTML/manifest.
**Scope**: Changing file location imports does not change application logic but requires exhaustive test validation. None of the application feature codes will be altered during this migration.