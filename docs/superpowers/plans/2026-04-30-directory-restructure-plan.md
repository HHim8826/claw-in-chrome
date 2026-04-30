# Directory Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Chrome extension repository from a root-heavy structure into a well-categorized `src/` directory.

**Architecture:** Mv all runtime extension assets to `src/`, categorized by functional areas (`background/`, `shared/`, `sidepanel/`, `options/`, `offscreen/`, `visualizer/`, `pages/`). Keep tests and configs at repository root.

**Tech Stack:** Node.js, Web Extensions API, Playwright, Jest/Node Test Runner (for unit/integration tests).

---

### Task 1: Initialize Structure and Static Assets

**Files:**
- Create: `src/background/`, `src/shared/`, `src/sidepanel/`, `src/options/`, `src/offscreen/`, `src/visualizer/`, `src/pages/`
- Modify: `.gitignore`
- Move: `manifest.json`, `managed_schema.json`, `assets/`, `sounds/`, `i18n/`, `icon-128.png`, `claude_icon.svg`

- [ ] **Step 1: Create standard directories**

Run:
```bash
mkdir -p src/background src/shared src/sidepanel src/options src/offscreen src/visualizer src/pages
```

- [ ] **Step 2: Move static and core root files**

Run:
```bash
git mv manifest.json src/
git mv managed_schema.json src/
git mv assets src/
git mv sounds src/
git mv i18n src/
git mv icon-128.png src/
git mv claude_icon.svg src/
```

- [ ] **Step 3: Commit**

Run:
```bash
git commit -m "refactor(structure): create src folder and move static assets"
```


### Task 2: Move Background Scripts

**Files:**
- Move: `service-worker-loader.js`, `service-worker-runtime.js`, `service-worker-detached-window-runtime.js`, `service-worker-shortcut-workflow-sync.js`, `github-update-worker.js`, `github-update-worker-runtime.js` to `src/background/`
- Modify: `tests/**/*` referencing these files, `src/manifest.json`

- [ ] **Step 1: Move JS files**

Run:
```bash
git mv service-worker*.js src/background/
git mv github-update-worker*.js src/background/
```

- [ ] **Step 2: Fix manifest.json background script**

Update `src/manifest.json`:
Change `"service_worker": "service-worker-loader.js"` to `"service_worker": "background/service-worker-loader.js"`.
Check if any other references need updates.

- [ ] **Step 3: Fix related test imports**

Run Node script or perform manual find/replace over all `tests/` files to update:
`require("../service-worker-runtime.js")` -> `require("../src/background/service-worker-runtime.js")`
`require("../service-worker-detached-window-runtime.js")` -> `require("../src/background/service-worker-detached-window-runtime.js")`
`require("../service-worker-shortcut-workflow-sync.js")` -> `require("../src/background/service-worker-shortcut-workflow-sync.js")`
`require("../github-update-worker-runtime.js")` -> `require("../src/background/github-update-worker-runtime.js")`

- [ ] **Step 4: Commit**

Run:
```bash
git commit -am "refactor(structure): move background scripts to src/background"
```

### Task 3: Move Shared Logic

**Files:**
- Move: `claw-contract.js`, `custom-provider-models.js`, `custom-provider-settings.js`, `detached-window-title.js`, `mcp-permission-popup-protocol.js`, `native-host-binding.js`, `provider-format-adapter.js`, `telemetry-disable.js`, `theme-init.js`, `github-update-shared.js` to `src/shared/`
- Modify: All tests referencing them, background workers `importScripts`

- [ ] **Step 1: Move JS shared files**

Run:
```bash
git mv claw-contract.js custom-provider-models.js custom-provider-settings.js detached-window-title.js mcp-permission-popup-protocol.js native-host-binding.js provider-format-adapter.js telemetry-disable.js theme-init.js github-update-shared.js src/shared/
```

- [ ] **Step 2: Update internal importScripts and references**

Update `src/background/service-worker-runtime.js` or `service-worker-loader.js`: `importScripts` to reference `../shared/...`.
Update any background script `importScripts` paths! Keep an eye on relative paths when they are now in `src/background/` and need `../shared/`.

- [ ] **Step 3: Update related test imports**

Change `require("../theme-init.js")` -> `require("../src/shared/theme-init.js")`
Change `require("../provider-format-adapter.js")` -> `require("../src/shared/provider-format-adapter.js")`
and similar for all the files above in all `tests/` files.

- [ ] **Step 4: Commit**

Run:
```bash
git commit -am "refactor(structure): move shared scripts to src/shared"
```

### Task 4: Move UI Components and Pages

**Files:**
- Move: `sidepanel*` to `src/sidepanel/`
- Move: `options*` to `src/options/`
- Move: `offscreen*` to `src/offscreen/`
- Move: `visualizer*`, `gif*` to `src/visualizer/`
- Move: `pairing.html`, `blocked.html` to `src/pages/`
- Modify: `src/manifest.json`, `tests/`

- [ ] **Step 1: Move UI files**

Run:
```bash
git mv sidepanel* src/sidepanel/
git mv github-update-sidepanel.js src/sidepanel/
git mv options* src/options/
git mv github-update-options.js src/options/
git mv offscreen* src/offscreen/
git mv visualizer* src/visualizer/
git mv gif* src/visualizer/
git mv pairing.html src/pages/
git mv blocked.html src/pages/
```

- [ ] **Step 2: Fix HTML references and imports**

In all moved `.html` and `.js` files, update relative `<script>`, `<link>`, `import` paths. Examples: 
- `../theme-init.js` -> `../shared/theme-init.js` or `../shared/telemetry-disable.js`
- `../assets/...` to `../assets/...`
Check every HTML file in `src/*/*.html`.

- [ ] **Step 3: Fix manifest references**

Update `src/manifest.json` for:
- `action.default_popup` or `side_panel.default_path` -> `sidepanel/sidepanel.html`
- `options_ui.page` -> `options/options.html`
- Other references to html files.

- [ ] **Step 4: Update test imports**

Replace `require("../sidepanel-debug-logger.js")` -> `require("../src/sidepanel/sidepanel-debug-logger.js")`
etc., for UI scripts tested.

- [ ] **Step 5: Commit**

Run:
```bash
git commit -am "refactor(structure): move UI and pages to src folders"
```


### Task 5: Final CI and Test Fixes

**Files:**
- Modify: `.github/release-package-items.txt`, `scripts/check-release-package.js`, `tests/e2e/extension-pages.smoke.test.js`, `tests/run-all-tests.js`

- [ ] **Step 1: Fix E2E tests and release scripts**

Update `tests/e2e/extension-pages.smoke.test.js`:
Change `--disable-extensions-except=${repoRoot}` to `--disable-extensions-except=${repoRoot}/src`
Change `--load-extension=${repoRoot}` to `--load-extension=${repoRoot}/src`

Update `scripts/check-release-package.js` or `.github/release-package-items.txt` (or simplify it) so it correctly tests the `src` folder. Now all `release-package-items` entries are within `src/`! We should prefix them with `src/` inside the file, or change the check script. Best fix: update `.github/release-package-items.txt` so each line reflects its new path inside `src/`. Actually, if building the distribution, we zip the `src/` folder. So the root of the zip is what matters. Since there is no build step that currently zips it, the GH action probably calls `zip -r extension.zip $(cat .github/release-package-items.txt)`. Thus we should change the release config to just zip `src/` and remove `.github/release-package-items.txt` if not strictly required, OR prefix paths with `src/`. Let's prefix paths with `src/` for safety.

- [ ] **Step 2: Run all tests**

Run:
```bash
npm run test
```
Fix any broken test imports incrementally until PASS.

- [ ] **Step 3: Commit**

Run:
```bash
git commit -am "refactor: update CI tests, runner, and E2E paths to src prefix"
```
