# Swttch (ex - Claude Code with GUI)

**在 Cursor 和 VS Code 中熟悉的 Claude Code GUI 界面——现已登陆 JetBrains IDE。**

> **我们更名了 —— Claude Code with GUI 现已更名为 Swttch。**
> 这仍是同一位开发者打造的同一款产品。为了支持 Claude Code 之外的更多提供方，
> 我们更换了名称。

🌐 [English](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/en.md) | [한국어](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ko.md) | [日本語](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ja.md) | **中文** | [Español](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/es.md) | [Deutsch](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/de.md) | [Français](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/fr.md)

> **这个插件是用它自己开发的。**
> 就在这个聊天面板里，运行在 JetBrains IDE 内部，开发工作在这里进行。

## 为什么选择这个插件

- **上手即熟悉** — 与 Cursor 和 VS Code 中的 Claude Code 界面和操作感完全一致，无需重新学习任何东西。
- **透明且安全** — 直接调用 Claude Code CLI，没有中间代理，没有静默扫描凭证的环节。
- **快速改进** — 作为一个开源项目，用户反馈的问题通常在一天内完成修复。

## 功能特性

- **基于 Anthropic 官方扩展** — Claude Code for VS Code 是由 Anthropic 官方开发和维护的扩展。本插件以该官方扩展为基准，将同样的使用体验带入 JetBrains。
- **深度融入 IDE** — 一键发送选中代码（`Alt+K`），在 IDE diff viewer 中查看并应用变更，直接在编辑器里打开文件和终端。
- **随心放置** — 可将聊天窗口放在侧边栏工具窗口或编辑器标签页中，自由构建专属工作区。
- **会话一目了然** — 在左侧面板浏览所有对话记录，单击即可打开任意一条。
- **远程设备访问** — 通过 QR 码（Cloudflare 隧道）在手机或平板上无缝继续工作。
- **支持 Windows 与 WSL** — 同样支持 PowerShell 和 WSL 环境下的用户。
- **GUI 内管理设置** — 不仅可以管理插件本身的设置，还能通过 GUI 直接编辑 Claude Code 的 `.claude` 和 `.claude.json` 配置文件。*(开发中)*

## 使用要求

- JetBrains IDE 2024.2 或更高版本
- Claude Code CLI 1.0.0 或更高版本 — 建议使用最新版本，且已安装并完成身份验证
- Node.js 18 或更高版本

## 快速开始

1. 确认 `claude` CLI 已安装并完成身份验证（`claude --version`）。
2. 从 JetBrains Marketplace 安装本插件。
3. 通过 **Tools > Open Claude Code** 打开，或按下 `Ctrl+Shift+C`。
4. 开始与 Claude 一起编写代码。
