# Swttch (ex - Claude Code with GUI)

在 Cursor 和 VS Code 中广受欢迎的 Claude Code GUI，现已支持 JetBrains IDE。

> **我们更名了 —— Claude Code with GUI 现已更名为 Swttch。**
>
> 本仓库已从 `yhk1038/claude-code-gui-jetbrains` 迁移至 `Swttch/swttch`。
> 原有链接和 `git clone` 地址仍然有效。
>
> 这仍是同一款产品。许多用户希望我们支持 Claude Code 之外的更多提供方，
> 我们认真对待这一需求，因此更换了名称。

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/30313?label=Marketplace)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/30313?label=Downloads)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
![JetBrains IDE](https://img.shields.io/badge/JetBrains%20IDE-2024.2%2B-000000?logo=jetbrains)
![Claude Code](https://img.shields.io/badge/Claude%20Code%20CLI-%3E%3D1.0.0-blueviolet)

🌐 [English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | **中文** | [Español](README.es.md) | [Deutsch](README.de.md) | [Français](README.fr.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-chat.png" alt="Chat interface" width="800" />
</p>

## 亮点

- 在 JetBrains IDE 中提供与 Cursor/VS Code 的 Claude Code **完全相同的 UI/UX**
- 以封装器方式启动 Claude Code CLI — 与官方 VS Code 扩展采用相同的方式
- **所有源代码从零开始自主设计编写** — 并非其他项目的克隆
- 双环境架构，不仅支持 JetBrains IDE，还可**在浏览器/移动端独立运行**
- 通过 GUI 提供快速演进的 Claude Code 体验（Agent Team、Remote Control 等）

> 我们目前正在大力投入服务稳定化工作。如果您提交错误报告，我们通常会在平均 1 天内解决。非常感谢您的反馈。
>
> 本项目希望与全球开发者社区共同成长。为了与尽可能多的开发者协作，我们采用**英语**作为官方通用语言。

## 功能

### 流式聊天

- 实时 Markdown 渲染与语法高亮（支持数学公式渲染）
- 实时展示 Claude 的思考过程（thinking）

### 工具调用卡片

- 以可视化卡片形式展示文件读写、Bash 命令和搜索结果
- 与 Cursor/VS Code 保持一致的 UI

### 权限管理

- 针对文件及 Bash 操作权限的原生对话框
- 在设置中灵活配置权限策略

### 多会话

- 通过标签页同时管理多个对话
- 通过会话下拉菜单快速切换
- 查看完整会话历史

### 文件与图片附件

- 支持拖拽或选择文件和图片附加到聊天中

### 斜杠命令

- `/clear` — 重置会话
- `/compact` — 压缩对话
- 动态加载其他可用命令

### 中断

- 在流式传输过程中立即中止消息及工具执行

### 隧道与防休眠

- **支持外部远程访问**
  - 生成可从外部访问的 URL 并提供 QR Code
  - 使用 Cloudflare 提供的 [cloudflared](https://github.com/cloudflare/cloudflared) 对本地服务器进行隧道穿透（免费、无限制）
  - 除提供端口转发的 Cloudflare 代理服务器外，无任何第三方通信
  - 此为社区自主实现版本，与 Claude 的 Remote Control 原生官方功能无关（未来计划支持）

- **防休眠**
  - 支持 macOS（caffeinate）、Linux（systemd-inhibit）、Windows（powercfg）防休眠

### 设置双向同步

- 不仅支持插件设置，还可在设置菜单中直接控制 Claude Code 原始设置（全局/本地）
- 未来计划改进为通过 GUI 控制完整的官方设置文件规范
- 计划支持通过 GUI 管理 `.claude` 所负责的 MCP 服务器、技能、代理等内容

### 浏览器/移动端独立运行

- 无需 JetBrains IDE，即可在浏览器或移动端单独使用
- Node.js 后端提供 WebSocket 服务器，浏览器作为客户端连接
- 非仅用于开发，而是独立部署目标 — 在浏览器中提供与 IDE 环境相同的功能

### 附加功能

- **Open Claude in Terminal** — 通过命令面板在 IDE 终端中启动 Claude
- **会话 URL 路由** — 即使重启 IDE，会话也会自动恢复
- **单进程多项目** — 一个后端进程同时支持多个项目
- **设置** — 配置 CLI 路径、主题、字体大小、权限策略和日志级别

<details>
<summary>更多截图</summary>

**欢迎界面**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-welcome.png" alt="Welcome screen" width="400" />

**设置面板**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-settings.png" alt="Settings panel" width="400" />

</details>

## 系统要求

- JetBrains IDE 2024.2 — 2025.3
- Claude Code CLI >= 1.0.0（已安装并完成身份验证）
- Node.js >= 18

## 快速开始

1. 确认 `claude` CLI 已安装并完成身份验证（`claude --version`）。
2. 从 JetBrains Marketplace 安装插件。
3. 通过 **Tools > Open Claude Code** 打开面板，或按下 `Ctrl+Shift+C`。
4. 开始与 Claude 一起编码。

**快捷键**

- `Ctrl+Shift+C` — 打开 Claude Code 面板
- `Cmd+N` / `Ctrl+N`（面板聚焦时）— 新建会话标签页

## 贡献

欢迎各种形式的贡献 — 错误报告、功能建议、代码、文档、翻译等。

- **如何开始？** 请查阅 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解配置说明和贡献指南。
- **寻找可参与的任务？** 请查看标有 [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue) 标签的 Issue。
- **计划较大的变更？** 请先[提交 Issue](https://github.com/Swttch/swttch/issues) 进行讨论。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](../LICENSE) 许可证。
