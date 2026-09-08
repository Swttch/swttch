# 在 Linux 上聊天标签页打开后完全空白

🌐 [English](../en/linux-jcef-blank-panel.md) | [한국어](../ko/linux-jcef-blank-panel.md) | [日本語](../ja/linux-jcef-blank-panel.md) | **中文** | [Español](../es/linux-jcef-blank-panel.md) | [Deutsch](../de/linux-jcef-blank-panel.md) | [Français](../fr/linux-jcef-blank-panel.md)

_最后更新: 2026-09-08_

## 症状

聊天标签页可以打开，但里面完全是空的。

`Waiting for project indexing...` 这行文字会短暂出现，随后消失，之后没有任何内容显示出来。

既没有错误提示，也没有引导面板，画面就这样一直空着。

## 请先确认这一点

在同一个 IDE 中打开任意一个 `.md` 文件，并打开它的 Markdown 预览。

**如果 Markdown 预览同样是空白的，那么这篇文档就是你要找的。**

Markdown 预览是由 IDE 自己绘制的，与本插件无关。当两个画面同时变空时，问题出在 IDE 的内置浏览器（JCEF）上，而不是某一个插件。

这一步确认能节省大量时间，因为仅从聊天标签页来看，插件的问题和 JCEF 的问题在外观上完全一样。

## 受影响的环境

该问题出现在 Linux 上。

已在 Ubuntu 22.04 配合 PhpStorm 2026.2.2 的环境中确认，该机器使用 NVIDIA 显卡并运行在 Wayland 会话中。

报告者为了绕过另一个 Wayland 问题，曾把几个 JCEF 相关的注册表项从默认值改掉。

符合以下两点时更容易遇到：

- 使用 **Wayland** 会话而非 X11
- 使用 **NVIDIA** 闭源驱动

## 原因

本插件的聊天界面绘制在 **JCEF**（Chromium Embedded Framework）之上，这与 IDE 绘制 Markdown 预览和内置浏览器所用的是同一个组件。

JCEF 通过 GPU 进行渲染。当这条路径在某些驱动与会话的组合下无法工作时，浏览器本身会被正常创建，但一帧画面也绘制不出来，面板因此保持空白。

我们目前还无法识别这种情况。当 JCEF 不可用，或者我们的后端启动失败时，我们会把占位内容替换成说明面板。但 JCEF 正常启动之后只是不绘制画面，从我们这一侧看起来就是成功的，所以你看到的是一个没有任何提示的空标签页。

## 解决方法

请按顺序尝试。已报告的案例在第 1 步就解决了。

### 1. 把 JCEF 的注册表项恢复为默认值

打开 `Help → Find Action`，执行 **Registry…**，然后搜索 `jcef`。

检查下面四项，如果有不是默认值的，请恢复。

| 项 | 默认值 |
|---|---|
| `ide.browser.jcef.gpu.disable` | `false` |
| `ide.browser.jcef.osr.enabled` | `true` |
| `ide.browser.jcef.markdownView.osr.enabled` | `true` |
| `ide.browser.jcef.sandbox.enable` | `true` |

被修改过的项会以粗体显示，Registry 对话框中也有 **Restore Defaults** 按钮。

修改后请重启 IDE。

为了绕过其他 Wayland 问题而设置的开关，正是导致这一症状的常见原因。

### 2. 把会话切换为 X11

注销后，在登录界面选择 **X11**（或 “Xorg”）会话，而不是 Wayland。

如果你希望桌面继续使用 Wayland，也可以只把 IDE 切到 XWayland。打开 `Help → Edit Custom VM Options`，添加下面这行并重启。

```
-Dawt.toolkit.name=XToolkit
```

如果已经存在以 `-Dawt.toolkit.name=` 开头的行，请替换它。

### 3. 仅当前两步无效时，再关闭 GPU 加速

这一步与第 1 步方向相反，请在第 1 步无效之后再尝试。

在 **Registry…** 中把 `ide.browser.jcef.gpu.disable` 设为 `true`，然后重启。

另一位用户的内置浏览器同样是空白的，JetBrains 给出的正是这个建议，之后该用户确认画面可以正常显示了（[IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573)）。

## 需要注意

**修改任何注册表项之前，请先记下原来的值。** 这些设置影响的不只是本插件，而是 IDE 中所有使用内置浏览器的界面。

切换到 X11 或 XWayland 会让 IDE 回到较旧的显示路径。因此 **如果你使用 125%、150% 这类小数缩放，画面可能会显得模糊。** 这是临时的绕行方案，随时可以还原。

关闭 GPU 加速后，JCEF 会改用 CPU 渲染，在内容较重的页面上可能会变慢。

## 如果都没有效果

遇到这种情况时，JetBrains 会要求提供 JCEF 的详细日志。

在 `Help → Edit Custom VM Options` 中添加下面这行并重启，复现空白标签页后，取出 `~/jcef_<PID>.log` 文件。

```
-Dide.browser.jcef.log.level=verbose
```

[提交 issue 时](https://github.com/Swttch/swttch/issues/new/choose)请附上该文件，并告诉我们你的发行版、会话类型（Wayland 还是 X11）以及显卡驱动。

## 什么时候会消失

当 JCEF 在这些驱动与会话组合下能够稳定绘制画面时，这个绕行方案就不再需要了。

下面的工单仍然是开放状态，投票有助于提高它们的优先级。

我们也在研究插件能否识别出“始终不绘制的浏览器”，从而在画面上说明发生了什么，而不是留给你一个空标签页。

## 相关链接

### 本仓库的 issue

- [#420 — Blank content of Claude Code tab](https://github.com/Swttch/swttch/issues/420)

### JetBrains 工单

- [IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573) — Linux 上内置浏览器显示为空白的问题，原因指向 VA-API 错误。**仍然开放，可以投票。** JetBrains 在该工单中建议使用 `ide.browser.jcef.gpu.disable`，报告者确认有效
- [JBR-5969](https://youtrack.jetbrains.com/issue/JBR-5969) — Linux 上 NVIDIA 驱动导致 GPU 加速破坏 JCEF，以及希望提供可靠关闭方式的请求。**仍然开放**
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — 原生 Wayland 支持本身，目前仍在推进中
- [IDEA-349995](https://youtrack.jetbrains.com/issue/IDEA-349995) — 相同的白屏症状，因信息不足被以 Incomplete 关闭

### 相关文档

- [Wayland 剪贴板](wayland-clipboard.md) — 另一个 Wayland 问题，聊天输入框无法粘贴
