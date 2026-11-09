# 在插件中创建的会话没有出现在 Claude Desktop 的 Code 标签页

🌐 [English](../en/desktop-session-import.md) | [한국어](../ko/desktop-session-import.md) | [日本語](../ja/desktop-session-import.md) | **中文** | [Español](../es/desktop-session-import.md) | [Deutsch](../de/desktop-session-import.md) | [Français](../fr/desktop-session-import.md)

_最后更新: 2026-11-09_

在插件中创建的会话不会自动出现在 Claude Desktop 的 Code 标签页。反方向,也就是在插件中打开 Desktop 创建的会话,一直都可以。Desktop 用来生成列表的文件没有公开文档,我们无法替您写入。不过有一个办法:**把 Desktop 自带的"导入会话"执行一次**。从 v0.36.0 起,新建的会话在启动时就能被这个导入识别;在此之前创建的会话,可以在设置里点一个按钮完成准备。

## 现象

- 在插件中使用的会话,没有出现在 Claude Desktop 的 Code 标签页左侧列表中
- 在同一个文件夹里,用终端的 `claude --resume` 可以打开这个会话,对话记录还在
- 反过来,在 Desktop 中开始的会话会出现在插件的会话列表中

## 原因

Desktop 不会直接把对话记录文件当作列表,而是用自己的索引生成列表。即使记录文件存在,没有进入索引的会话也不会出现在列表中。

把会话加入索引的办法是 Desktop 的 **Import Claude Code CLI Sessions…**(导入 Claude Code CLI 会话)。但这个导入会跳过记录中写着 `sdk-cli` 的会话。插件以与 SDK 工具相同的非交互方式启动 Claude,所以以前每个会话的记录里都写着 `sdk-cli`。

从 v0.36.0 起,插件用自己的名字启动新会话:在 IDE 中是 `swttch-jetbrains`,在浏览器(`ccg`)中是 `swttch-standalone`。Desktop 的导入接受这些名字。

## 解决方法

### 1. 如果有 v0.36.0 之前创建的会话 — 先在插件中做准备

**设置 → 通用 → 为导入 Claude Desktop 准备会话 → 准备**

- 只准备当前打开的文件夹中的会话。其他文件夹的会话,请打开那个文件夹后再点一次
- 显示"已准备的会话:N 个"就完成了
- 正在运行的会话不会被改动。如果看到"因正在使用而保持原样的会话",请关闭这些会话后再点一次
- 如果所有会话都是 v0.36.0 之后创建的,可以跳过这一步

### 2. 在 Claude Desktop 中导入

在菜单中选择 **Help → Troubleshooting → Import Claude Code CLI Sessions…**。

Claude Desktop 没有中文界面,这个菜单会以英文显示。

出现"Import N Claude Code sessions?"确认框时,点击 **Import sessions**。显示"Imported N sessions"后,即可在 Code 标签页的列表中看到它们。

- 这个导入会把列表中还没有的会话**一次性**全部导入。不需要逐个会话去点。在插件中创建了几个会话之后,偶尔点一次即可
- 在确认框中点击 **Cancel** 不会导入任何内容
- 以上菜单位置是在 macOS 的桌面应用中确认的。在 Windows 和 Linux 上位置可能不同

### 3. 继续使用

在导入的会话中发送消息,会追加到同一份对话记录里。在插件中重新打开这个会话,也能看到在 Desktop 中进行的对话。

请不要在两个地方**同时**运行同一个会话,否则两个程序会写入同一个记录文件。请在一边结束后,再在另一边继续。

## 需要了解的事项

- 只会导入**您信任的文件夹**中的会话。如果提示"No CLI sessions to import",说明可导入的会话已经在列表中、之前被删除过,或位于 Claude 尚未信任的文件夹中。如果插件中的会话没有被识别,请先确认是否已完成第 1 步
- 在 Desktop 中**删除过**的会话不会再次导入
- 导入的会话会保留历史记录和权限模式(绕过权限模式除外),但不会保留归档状态和已授予的权限
- 第 1 步的按钮会把记录文件每一行里的 `sdk-cli` 改成新名称,并给没有用 `/rename` 命名的会话**追加一行会话标题(插件为该会话显示的名称)。** 没有这一行时,Desktop 会用第一条消息给导入的会话命名,于是 IDE 上下文那句话(例如 "The user opened the file .env in the IDE")会成为标题。其余内容保持原样。同一文件夹里由其他 SDK 工具创建的会话也会一并被修改
- 我们不会直接写入 Desktop 应用自己的文件来把会话加入列表。这些文件没有公开文档,Desktop 更新后可能悄悄失效

### 仍然不行的话

在同一个文件夹里,可以用终端的 `claude --resume` 继续这个会话。

## 相关链接

### 本仓库的 Issue

- [#647 — Sessions created in the plugin don't appear in the Claude Desktop Code tab](https://github.com/Swttch/swttch/issues/647)

### 本仓库的文档

- [原则例外记录:用于会话导入的 `CLAUDE_CODE_ENTRYPOINT`](../../principle-exceptions/647-entrypoint-for-desktop-import.md) — 为什么选这种方式,以及确认了什么(韩文)
