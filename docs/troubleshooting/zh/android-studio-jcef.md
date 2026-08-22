# 在 Android Studio 上聊天界面不显示（JCEF）

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | [日本語](../ja/android-studio-jcef.md) | **中文** | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_最后更新：2026-08-22_

本插件的聊天界面绘制在 **JCEF**（Chromium Embedded Framework）之上。与其他 JetBrains IDE 不同，Android Studio 默认不包含 JCEF，因此可能会显示引导面板而不是聊天界面。

**解决方法因 Android Studio 版本而完全不同。** 请先确认您的版本（**Help → About**）。

| 您的版本 | 请查看 |
|---|---|
| **2026.2 及以上**（Rabbit） | [2026.2 及以上：安装插件](#20262-及以上安装插件) |
| **2026.1.3 – 2026.1.x** | [2026.1：切换运行时](#20261切换运行时) |
| **2026.1.2 及以下** | [2026.1.2 及以下：没有可用的组合](#202612-及以下没有可用的组合) |

---

## 2026.2 及以上：安装插件

### 症状

打开聊天时显示引导面板；在旧版插件上则会抛出异常。`idea.log` 中会有：

```
java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
```

在日志靠前的位置还能看到：

```
plugin com.intellij.modules.jcef is not resolved
```

### 原因

**从 2026.2 起，JCEF 从 IDE 主体中分离为一个独立插件。** 它没有被移除，只是换了位置。

JetBrains 在自家 IDE 中捆绑了这个插件，但 **Android Studio 并未捆绑**。因此 `com.intellij.ui.jcef` 这些类在 IDE 中完全不存在。

关键在于：**切换运行时并不能解决问题。** JetBrains Runtime 只提供 `org.cef.*`，而属于平台代码的 `com.intellij.ui.jcef` 必须由 IDE 提供。即使用带 JCEF 的运行时启动，结果也一样。

### 解决方法

1. 打开 **Settings → Plugins → Marketplace**
2. 搜索 **Web Browser (JCEF)**（提供方为 **JetBrains** 的那个）
3. 安装后重启 IDE

重启之后聊天界面即可正常显示。运行时保持默认即可。

> Marketplace 页面：[Web Browser (JCEF)](https://plugins.jetbrains.com/plugin/31360)

### 已验证的组合

| Android Studio | 默认状态 | 安装 Web Browser (JCEF) 后 |
|---|---|---|
| **2026.2.1 Canary 2**（AI-262.9437） | 引导面板（旧版插件会抛异常） | **正常工作** — 无需更换运行时 |

---

## 2026.1：切换运行时

### 症状

显示引导面板而不是聊天界面。

### 原因

Android Studio 自带的 JetBrains Runtime（JBR）不包含 JCEF。在 2026.1 上，JCEF 仍属于 IDE 主体，因此**切换到带 JCEF 的运行时即可解决**。

### 解决方法

1. 请确认 Android Studio 为 **2026.1.3 或更高版本**（2026.1.2 及以下请看下一节）
2. 打开 Find Action：`Cmd+Shift+A`（macOS）或 `Ctrl+Shift+A`（Windows/Linux）
3. 执行 **Choose Boot Java Runtime for the IDE…**
4. 选择名称中含有 **JCEF** 的运行时
5. 安装完成后重启 IDE

插件引导面板上的按钮也会打开同一个对话框。

---

## 2026.1.2 及以下：没有可用的组合

### 症状

切换运行时之后，会出现下面两种情况之一。

- Android Studio 完全无法启动
- 能启动，但插件窗口完全空白 —— 既没有引导面板，也没有错误信息

窗口空白时，`idea.log` 中会有：

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

### 原因

- 这些版本运行在 Java 21 上，并自带了一份 `JCefAppConfig`
- 若选择带 JCEF 的 **JBR 21**，运行时模块会遮蔽自带的那一份。而 JBR 21 中的 `JCefAppConfig` 没有平台所调用的 `isRemoteEnabled()` 方法，浏览器因此无法创建，窗口保持空白
- **JBR 25** 有这个方法，但 2026.1.2 及以下无法在 Java 25 上启动。Java 24 移除了 Security Manager，而这些构建仍试图启用它

Android Studio **2026.1.3** 将自带运行时从 Java 21 迁移到 Java 25，从而解决了这个问题。

### 解决方法

请将 Android Studio 更新到 **2026.1.3 或更高版本**。

### 已验证的组合

| Android Studio | 自带 JBR | 带 JCEF 的 JBR 21 | 带 JCEF 的 JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — 仅引导面板 | 空白窗口 | 启动失败 |
| 2026.1.2 | Java 21 — 仅引导面板 | 空白窗口 | 启动失败 |
| **2026.1.3** | **Java 25** | — | **正常工作** |

---

## 切换运行时后 IDE 无法启动

删除 Android Studio 配置目录中的 `studio.jdk` 文件即可恢复默认运行时。

- **macOS**：`~/Library/Application Support/Google/AndroidStudio<版本>/studio.jdk`
- **Linux**：`~/.config/Google/AndroidStudio<版本>/studio.jdk`
- **Windows**：`%APPDATA%\Google\AndroidStudio<版本>\studio.jdk`

## 相关链接

### 本仓库的 Issue

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### 本仓库的 Pull Request

- [#327 — Keep the chat panel loadable on an IDE without JCEF](https://github.com/Swttch/swttch/pull/327)
- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### 外部参考

- [Web Browser (JCEF) Marketplace 插件](https://plugins.jetbrains.com/plugin/31360) — JetBrains 为 Android Studio 添加 JCEF 的插件
- [JetBrains 公告：Experimental JCEF Web Browser API support for Android Studio](https://platform.jetbrains.com/t/experimental-jcef-web-browser-api-support-for-android-studio/4117)
