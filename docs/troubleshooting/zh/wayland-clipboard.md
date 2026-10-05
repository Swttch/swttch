# 在 Wayland 上运行 JetBrains IDE 时无法粘贴

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | [日本語](../ja/wayland-clipboard.md) | **中文** | [Español](../es/wayland-clipboard.md) | [Deutsch](../de/wayland-clipboard.md) | [Français](../fr/wayland-clipboard.md)

_最后更新：2026-10-05_

## 症状

向插件聊天输入框粘贴时毫无反应，静默失败。

也不会出现任何错误提示。

有一个明显的特征。

在插件**内部**复制的文本可以正常粘贴，而从浏览器、终端、IDE 编辑器等**外部**复制的内容则会失败。

在同一个 IDE 的代码编辑器和搜索框中粘贴都正常。

不仅仅是文本。**截图之类的图片也会以同样的方式失败。**

## 受影响的环境

在 Linux 的 Wayland 会话中，当 IDE 本身作为原生 Wayland 程序运行时会出现。

默认的 `-Dawt.toolkit.name=auto` 设置可能会选择这种方式，指定 `WLToolkit` 则会强制使用它。

目前已在 Fedora 44、Ubuntu 26.04 和 CachyOS 上收到报告，全部是 KDE Plasma 桌面。

我们在 sway 合成器上的测试会话中，使用 IDE 2025.3.4 和 IDE 2026.2.3 都复现了同样的症状。

有报告称切换到 GNOME 后问题消失。

## 原因

插件界面由 JCEF 绘制，JCEF 是 IDE 内部的浏览器引擎。

在我们测试的 IDE（2025.3.4 和 2026.2.3）中，JCEF 作为单独的进程运行，该进程通过 XWayland（面向 X11 程序的兼容层）连接到显示。

IDE 窗口本身是原生的 Wayland 窗口。

在插件外部复制的文本位于 Wayland 剪贴板中。

只有在某个 X11 窗口拥有焦点期间，XWayland 才会把 Wayland 剪贴板交给 X11 程序。

IDE 窗口是 Wayland 窗口，所以这种交接不会发生，JCEF 看到的是空的剪贴板。

在插件内部复制的文本会进入 X11 剪贴板，所以可以正常粘贴。

我们在 sway、KWin 5.27.5 和 KWin 6.7.5（与 Fedora 44 同属 Plasma 6.7 系列）三种合成器上测量了这种交接。

三者都是：Wayland 窗口拥有焦点时，X11 程序读不到 Wayland 剪贴板；X11 窗口拥有焦点时，则可以读到。

使用 `-Dawt.toolkit.name=XToolkit` 后，IDE 窗口本身变成 X11 窗口，剪贴板得以交接，粘贴随之恢复正常。

其他使用 JCEF 的 JetBrains 插件也报告了同样的症状。

IDE 进程本身可以读取这个剪贴板，所以新版插件每当粘贴到达时内容为空，就会请求 IDE 代为读取剪贴板，这样无需任何设置即可粘贴。

如果您使用的是旧版本，或者粘贴仍然失败，请使用下面的设置。

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

有一位使用 Arch Linux（omarchy）的用户报告，启用这项设置后，IDE 的弹出菜单等浮动窗口会出现在错误的位置。

我们在 sway 上没有复现这个问题。即使在 150% 缩放下，菜单和弹出窗口也都出现在正确的位置。

如果您遇到了这种情况，请告诉我们您使用的桌面或合成器。

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
