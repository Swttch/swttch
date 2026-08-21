# 在 Android Studio 上聊天界面不显示（JCEF 运行时）

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | **中文** | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_最后更新：2026-08-22_

## 症状

在 Android Studio 中打开插件时，显示的是引导面板而不是聊天界面。

切换运行时之后，可能会出现下面两种情况之一。

- Android Studio 完全无法启动
- 能够启动，但插件窗口完全空白 —— 既没有引导面板，也没有错误提示

窗口空白时，`idea.log` 中会留下这样的内容。

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

## 原因

Android Studio 自带的 JetBrains Runtime（JBR）**不包含 JCEF**（Chromium Embedded Framework）。

本插件的界面绘制在 JCEF 之上，所以在默认运行时下会显示引导面板而不是聊天界面。

到这一步为止，切换到包含 JCEF 的运行时即可解决。

但是，**在 Android Studio 2026.1.2 及更早版本上不存在可用的组合。**

- 这些版本运行在 Java 21 上，并且自带了一份 `JCefAppConfig`
- 如果选择包含 JCEF 的 **JBR 21**，运行时模块会遮蔽自带的那一份。而 JBR 21 中的 `JCefAppConfig` 没有平台会调用的 `isRemoteEnabled()` 方法，因此浏览器无法创建，窗口保持空白
- **JBR 25** 有这个方法，但 2026.1.2 及更早版本无法在 Java 25 上启动。Java 24 移除了 Security Manager，而这些构建仍然试图启用它

Android Studio **2026.1.3** 将自带运行时从 Java 21 换成了 Java 25，从而解决了这个问题。

## 已验证的组合

| Android Studio | 自带 JBR | 含 JCEF 的 JBR 21 | 含 JCEF 的 JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — 仅引导面板 | 空白窗口 | 启动失败 |
| 2026.1.2 | Java 21 — 仅引导面板 | 空白窗口 | 启动失败 |
| **2026.1.3** | **Java 25** | — | **正常工作** |

## 解决方法

1. 请将 Android Studio 更新到 **2026.1.3 或更高版本**
2. 打开 Find Action：`Cmd+Shift+A`（macOS）或 `Ctrl+Shift+A`（Windows/Linux）
3. 执行 **Choose Boot Java Runtime for the IDE…**
4. 在列表中选择名称包含 **JCEF** 的运行时
5. 安装完成后重启 IDE

点击插件引导面板上的 **Switch Runtime** 按钮也会打开同一个对话框。

## 切换运行时后 IDE 无法启动时

从 Android Studio 配置目录中删除 `studio.jdk` 文件，即可恢复默认运行时。

- **macOS**：`~/Library/Application Support/Google/AndroidStudio<版本>/studio.jdk`
- **Linux**：`~/.config/Google/AndroidStudio<版本>/studio.jdk`
- **Windows**：`%APPDATA%\Google\AndroidStudio<版本>\studio.jdk`

## 什么时候会解决

JetBrains 在 2025 年 4 月发布了一个名为 [**Web Browser (JCEF)**](https://plugins.jetbrains.com/plugin/31360) 的实验性插件。

它能为 Android Studio 2026.1 Nightly 及更高版本提供 JCEF。

等它稳定之后，上面的运行时切换就不再需要了。

## 相关链接

### 本仓库的 Issue

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### 本仓库的 PR

- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### 外部参考

- [Web Browser (JCEF) 插件页面](https://plugins.jetbrains.com/plugin/31360) — JetBrains 为 Android Studio 添加 JCEF 的实验性插件
