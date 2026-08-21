# 在 Wayland 上运行 JetBrains IDE 时无法粘贴

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | **中文** | [Español](../es/wayland-clipboard.md) | [Deutsch](../de/wayland-clipboard.md) | [Français](../fr/wayland-clipboard.md)

_最后更新：2026-08-22_

## 症状

向插件聊天输入框粘贴时毫无反应，静默失败。

也不会出现任何错误提示。

有一个明显的特征。

在插件**内部**复制的文本可以正常粘贴，而从浏览器、终端、IDE 编辑器等**外部**复制的内容则会失败。

在同一个 IDE 的代码编辑器和搜索框中粘贴都正常。

不仅仅是文本。**截图之类的图片也会以同样的方式失败。**

## 受影响的环境

在 Linux 的 Wayland 会话中使用 KDE Plasma 桌面时会出现。

目前已在 Fedora 44、Ubuntu 26.04 和 CachyOS 上确认。

有报告称切换到 GNOME 后问题消失。

## 原因

JetBrains Runtime 的 Wayland 支持（Project Wakefield）与 JCEF 之间的剪贴板似乎没有打通，导致 IDE 和 JCEF 各自看到不同的剪贴板。

插件界面绘制在 JCEF 之上，因此受到影响。

其他使用 JCEF 的 JetBrains 插件也报告了同样的症状。

由于剪贴板在到达插件之前就已经断开，我们尚未找到仅靠插件代码修复的方法。

## 解决方法

打开 `Help → Edit Custom VM Options`，添加下面这一行，然后重启 IDE。

```
-Dawt.toolkit.name=XToolkit
```

如果已经有以 `-Dawt.toolkit.name=` 开头的行（例如 `auto` 或 `WLToolkit`），请把那一行替换为上面的内容。

已有三位用户分别在三个不同的发行版上确认此方法有效。

## 需要注意的地方

这项设置会让 IDE 退回到 XWayland。

因此，**如果您使用 125%、150% 之类的分数缩放，画面可能会显得模糊。**

这是临时的规避方法，并不是真正的修复。

如果模糊比粘贴问题更让您困扰，可以把设置改回去。

## 什么时候会解决

等 JetBrains 的原生 Wayland 支持稳定之后就不再需要了。

相关工单 [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) 目前仍处于开放状态。

为它投票有助于提高优先级。

## 相关链接

### 本仓库的 Issue

- [#278 — Cannot paste external text into chat input on Fedora KDE (Wayland)](https://github.com/Swttch/swttch/issues/278)
- [#262 — no paste function at linux fedora](https://github.com/Swttch/swttch/issues/262)

### JetBrains 工单

- [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) — JCEF 剪贴板问题。**仍然开放，可以投票**
- [JBR-10222](https://youtrack.jetbrains.com/issue/JBR-10222) — 被视为 KDE 的问题，以 "Third-Party problem" 关闭
- [JBR-5857](https://youtrack.jetbrains.com/issue/JBR-5857) — Wayland 剪贴板支持，2024 年标记为已修复
- [JBR-10504](https://youtrack.jetbrains.com/issue/JBR-10504) — 在 Arch/Hyprland 上无法从 JCEF 预览中复制
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — 原生 Wayland 支持本身仍在推进中
- [PY-76704](https://youtrack.jetbrains.com/issue/PY-76704) — 关于 Continue 插件的最初报告，作为 JBR-5857 的重复项被关闭

### 其他插件中的相同症状

- [cline/cline#8877](https://github.com/cline/cline/issues/8877) — 开放中
- [cline/cline#8383](https://github.com/cline/cline/issues/8383) — 维护者[评论](https://github.com/cline/cline/issues/8383#issuecomment-4173099236)说明这无法在插件端修复
- [Kilo-Org/kilocode#8998](https://github.com/Kilo-Org/kilocode/issues/8998) — 在 Fedora 43/44、Arch、Kubuntu 26.04 等系统上均有报告
- [continuedev/continue#2567](https://github.com/continuedev/continue/issues/2567)

### 外部参考

- [KDE bug 490577](https://bugs.kde.org/show_bug.cgi?id=490577) — JetBrains 关闭 JBR-10222 时指出的 KDE 缺陷。不过该缺陷在 Plasma 6.2.0 中已经修复，而报告者使用的版本都比它更新
