#  Claw in Chrome

<div align="center">

![Claw in Chrome](https://img.shields.io/badge/Claw-in%20Chrome-blue?style=for-the-badge)
![Release](https://img.shields.io/github/v/release/HHim8826/claw-in-chrome?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Chrome%20116%2B-lightgrey?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)

</div>

[简体中文](./README.md) | English

Put Claw into Chrome's sidebar so you can connect your own model providers directly while giving AI access to browser-side assistance and task execution. This project is a provider-independent Chrome extension and doesn't depend on Claude accounts, Claude.ai pages, or Claude organization policy.

<a href="#-quick-start"><b>🚀 Quick Start</b></a> | <a href="#-features"><b>✨ Features</b></a> | <a href="#-project-structure"><b>🗂️ Project Structure</b></a>

![Sidebar chat](./screenshots/03.png) 
![Flow visualizer](./screenshots/06.png)

---

## ✨ Features

- **🧠 Custom model providers**
  - Connect your own model APIs and configure key fields such as `Base URL`, `API Key`, and `Model`.
- **🧩 Native sidebar workflow**
  - Run as a Chrome extension with no extra desktop client required. Open the sidebar and start using it directly in your browser.
- **🔗 Works with Claw in Chrome MCP**
  - Can be used together with [`claw-in-chrome-mcp`](https://github.com/S-Trespassing/claw-in-chrome-mcp) to expand browser-side automation and coordination capabilities. MCP uses Chrome `nativeMessaging` and doesn't require Chrome Identity.
- **⚙️ Finer-grained parameter control**
  - Edit provider parameters that are difficult or impossible to adjust in the original plugin, making it easier to support local models, custom gateways, and third-party platforms.
- **💾 Settings backup and migration**
  - Export and import reviewed settings. Provider credentials, chat history,
    diagnostics, and runtime measurements are excluded by default.
- **📊 Local provider insights**
  - Review request count, success rate, tokens, latency, and error summaries in
    Options. Measurements stay local and don't record prompts or responses.
    Completed custom-provider answers also show model, first-token latency,
    Tokens/s, total Tokens, and total duration directly below the answer;
    non-streaming answers don't invent first-token data.
- **🌍 Multilingual and UI enhancements**
  - Includes multilingual resources, settings-page enhancements, and visualization-related modules for ongoing iteration and easier troubleshooting.

## 💡 Use Cases

- Connect your own model APIs in Chrome instead of being limited to the default provider
- Keep the sidebar workflow while integrating local models, proxy gateways, or third-party platforms
- Let AI handle more browser-side assistance and information-organizing tasks for you
- Use an extension version that doesn't depend on Claude.ai login state or Claude organization policy

## 🚀 Quick Start

### 1. Install the extension

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the repository's `src/` folder
5. Pin `Claw` to the browser toolbar and open the sidebar

### 2. Configure a model provider

Open the extension options page and go to `Model provider` in the left menu. Create a new profile and fill in:

- `Provider format`
- `Base URL`
- `API Key`
- `Model`

After saving and applying the configuration, close and reopen the sidebar once to make it take effect.

### 3. Recommended setting

**We recommend using the `Anthropic` protocol format first.**

For this project's target workflow, that format usually unlocks the best tool behavior and aligns more closely with expected interactions.

## 🗂️ Project Structure

- `src/`: unpacked extension root loaded by Chrome
- `src/assets/`: upstream assets and bundled files
- `src/i18n/`: localization resources
- `tests/`: unit, integration, and E2E tests
- `scripts/`: validation, inspection, and release helper scripts
- `docs/`: architecture, security, reliability, and recovery documentation

Developers and coding agents must read [`AGENTS.md`](./AGENTS.md) and run
`npm run validate:fast` before committing. Changes to extension pages,
background runtime, or release contents must also run `npm run validate:full`.

## ⚖️ License

**MIT**

---

**⭐ If this project helps you, consider giving it a Star.**

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=S-Trespassing/claw-in-chrome&type=date&legend=top-left)](https://www.star-history.com/#S-Trespassing/claw-in-chrome&type=date&legend=top-left)
