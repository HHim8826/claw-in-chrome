#  Claw in Chrome

<div align="center">

![Claw in Chrome](https://img.shields.io/badge/Claw-in%20Chrome-blue?style=for-the-badge)
![Release](https://img.shields.io/github/v/release/HHim8826/claw-in-chrome?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Chrome%20116%2B-lightgrey?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)

</div>

简体中文 | [English](./README_EN.md)

把 Claw 放进 Chrome 侧边栏，让你在浏览网页时直接接入自己的模型供应商，并把浏览器内的部分操作能力交给 AI。本项目是供应商无关的 Chrome 扩展，不依赖 Claude 帐号、Claude.ai 页面或 Claude 组织策略。

<a href="#-快速开始"><b>🚀 快速开始</b></a> | <a href="#-功能亮点"><b>✨ 功能亮点</b></a> | <a href="#-项目结构"><b>🗂️ 项目结构</b></a>

![侧边栏聊天界面](./screenshots/03.png) 
![流程可视化](./screenshots/06.png)

---

## ✨ 功能亮点

- **🧠 自定义模型供应商**
  - 支持接入你自己的模型接口，按需配置 `Base URL`、`API Key`、`模型` 等关键参数。
- **🧩 侧边栏内直接使用**
  - 作为 Chrome 扩展运行，无需额外桌面客户端，打开侧边栏即可完成对话与任务辅助。
- **🔗 可与 Claw in Chrome MCP 联动**
  - 支持与 [`claw-in-chrome-mcp`](https://github.com/S-Trespassing/claw-in-chrome-mcp) 配合使用，扩展浏览器内的自动化与协同能力。MCP 使用 Chrome `nativeMessaging`，不需要 Chrome Identity 权限。
- **⚙️ 更细粒度的参数控制**
  - 可编辑原插件中不方便调整的供应商参数，方便适配自建网关、本地模型和第三方平台。
- **💾 设置备份与迁移**
  - 可导出和导入经过审核的设置。默认排除供应商凭据、聊天记录、诊断日志和运行
    指标。
- **📊 本地供应商洞察**
  - 在设置页查看请求数、成功率、Token、延迟和错误汇总。指标只保存在本机，
    不记录提示词或回复内容。
- **🌍 多语言与界面增强**
  - 仓库内置多语言资源、设置页增强与可视化相关模块，方便持续迭代与日常排查。

## 💡 适用场景

- 想在 Chrome 里直接调用自己的模型接口，而不是受限于默认提供方
- 想保留侧边栏工作流，同时接入本地模型、代理网关或第三方平台
- 想让 AI 在浏览网页时承担更多辅助操作与信息整理工作
- 想使用不依赖 Claude.ai 登录状态或 Claude 组织策略的扩展版本

## 🚀 快速开始

### 1. 安装扩展

1. 打开 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择当前仓库的 `src/` 文件夹
5. 将 `Claw` 固定到浏览器工具栏，并打开侧边栏

### 2. 配置模型供应商

打开扩展设置页，进入左侧 `模型供应商`。新增一套配置后，主要填写：

- `供应商格式`
- `Base URL`
- `API Key`
- `模型`

保存并应用后，关闭并重新打开一次侧边栏即可生效。

### 3. 推荐设置

**推荐优先使用 `Anthropic` 协议格式。**

在当前项目的目标场景下，这种格式通常更能发挥工具能力，也更容易对齐交互预期。

## 🗂️ 项目结构

- `src/`：可直接加载到 Chrome 的扩展根目录
- `src/assets/`：上游资源与打包产物
- `src/i18n/`：多语言文案
- `tests/`：单元、集成与 E2E 测试
- `scripts/`：验证、检查与发布辅助脚本
- `docs/`：架构、安全、可靠性与恢复模型说明

开发者和代码代理应先阅读 [`AGENTS.md`](./AGENTS.md)，并在提交前运行
`npm run validate:fast`。涉及扩展页面、后台脚本或发布内容的变更还应运行
`npm run validate:full`。

## ⚖️ License

**MIT** 

---

**⭐ 如果这个项目对你有帮助，欢迎点个 Star 支持一下。**

##  Star 历史


[![Star History Chart](https://api.star-history.com/svg?repos=S-Trespassing/claw-in-chrome&type=date&legend=top-left)](https://www.star-history.com/#S-Trespassing/claw-in-chrome&type=date&legend=top-left)
