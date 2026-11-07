# Swttch (ex - Claude Code with GUI)

在 Cursor 和 VS Code 中广受欢迎的 Claude Code GUI，现已支持 JetBrains IDE。

> **我们更名了 —— Claude Code with GUI 现已更名为 Swttch。**
>
> 本仓库已从 `yhk1038/claude-code-gui-jetbrains` 迁移至 `Swttch/swttch`。
> 原有链接和 `git clone` 地址仍然有效。
>
> 这仍是同一款产品。为了支持 Claude Code 之外的更多提供方，我们更换了名称。

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
  - 支持 macOS（caffeinate）、Linux（systemd-inhibit）、Windows（SetThreadExecutionState）防休眠

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

## 无需 IDE 即可使用（Standalone，`swttch`）

如果想用平时的浏览器而不是 IDE 面板，可以用一行命令安装终端启动器 `swttch`。

### 安装

#### 先决条件:

- [Node.js](https://nodejs.org/) 18 或更高版本
- Claude Code CLI（已安装并登录，`claude --version`）

#### 在 Unix/POSIX 环境中安装（可使用 `curl` 和 `bash`）:

```bash
curl -fsSL https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.sh | bash
```

#### 在 PowerShell 环境中安装:

```powershell
irm https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.ps1 | iex
```

安装后，在任意项目目录中运行:

```bash
swttch browser
```

后端和界面与 IDE 插件相同，会在默认浏览器中打开 `http://localhost:19836`。端口 19836 与 JetBrains 插件共用，因此两者可以共存。详情请参阅 [cli/README.md](../cli/README.md)。

旧的命令名 `ccg` 仍然可用，但已弃用（deprecated）。请改用 `swttch browser`。

**停止 `swttch`。** 在运行 `swttch` 的终端中按 `Ctrl+C`。如果进程仍未退出，请打开另一个终端并运行:

```bash
swttch stop                  # 停止端口 19836 上的后端及其子进程
swttch stop --all --force    # 不等待宽限时间，用 SIGKILL 停止所有后端（包括 IDE 启动的）；停止前会先询问
```

在 Windows 上，按下 `Ctrl+C` 后可能会出现 `Terminate batch job (Y/N)?`，请输入 `Y`。

**更新。** 先停止正在运行的 `swttch`，然后运行:

```bash
swttch self-update           # 更新 swttch 命令本身（重新运行安装脚本）
swttch update                # 将运行时（后端和界面）更新到最新版本
```

**所有命令。** 运行 `swttch --help` 查看完整命令列表，运行 `swttch <命令> -h`（例如 `swttch stop -h`）查看单个命令的选项。

## 故障排查

常见问题中，我们尚未能自行修复、但已有已知解决方法的那些，整理在 **[docs/troubleshooting](troubleshooting/zh/README.md)** 中，每篇都包含症状、原因、解决方法以及相关 Issue 的链接。

- [Wayland 剪贴板](troubleshooting/zh/wayland-clipboard.md) — 在 Linux · Wayland 上无法向聊天输入框粘贴时
- [Linux 上聊天标签页空白](troubleshooting/zh/linux-jcef-blank-panel.md) — 在 Linux 上聊天标签页完全空白，并且 IDE 自带的 Markdown 预览同样空白时
- [Android Studio JCEF](troubleshooting/zh/android-studio-jcef.md) — Android Studio 显示引导面板或抛出异常而不是聊天界面，或者窗口空白时
- [变更界面颜色](troubleshooting/zh/diff-colors-old-ide.md) — 在 2025.2 及更早的 IDE 上变更界面没有颜色时

如果列表中没有您遇到的问题，请[提交 Issue](https://github.com/Swttch/swttch/issues/new/choose) 告诉我们。

## 贡献

欢迎各种形式的贡献 — 错误报告、功能建议、代码、文档、翻译等。

- **如何开始？** 请查阅 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解配置说明和贡献指南。
- **寻找可参与的任务？** 请查看标有 [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue) 标签的 Issue。
- **计划较大的变更？** 请先[提交 Issue](https://github.com/Swttch/swttch/issues) 进行讨论。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](../LICENSE) 许可证。
