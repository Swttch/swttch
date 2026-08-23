# 变更内容界面没有颜色

🌐 [English](../en/diff-colors-old-ide.md) | [한국어](../ko/diff-colors-old-ide.md) | [日本語](../ja/diff-colors-old-ide.md) | **中文** | [Español](../es/diff-colors-old-ide.md) | [Deutsch](../de/diff-colors-old-ide.md) | [Français](../fr/diff-colors-old-ide.md)

_最后更新: 2026-08-24_

Claude 提议修改文件时我们会展示变更内容，但**在 2025.2 及更早的 IDE 上，这个界面不会显示颜色。** 我们还没能加入变通方案，升级 IDE 即可立刻解决。

## 症状

整个变更界面都是同一种颜色。

![没有颜色的变更界面 — 代码全是白色，变更的行没有背景色](../../img/screenshot-diff-colors-missing.png)

- 关键字、字符串和数字无法区分，全部是白色（或黑色）
- **新增行和删除行没有背景色。** 无法通过颜色判断哪些行发生了变化
- 行号和分隔线也是同样平淡的色调

正常时应该是这样。

![正常的变更界面 — 有语法高亮，新增行显示为绿色背景](../../img/screenshot-diff-colors-ok.png)

文字和行号都正确显示，批准、拒绝等操作也完全正常。**只是不便阅读，功能并没有损坏。**

## 原因

这个界面绘制在 IDE 内置的 **JCEF**（基于 Chromium 的浏览器引擎）之上。它使用名为 `light-dark()` 的 CSS 功能来决定颜色 —— 在一行中同时写下浅色主题和深色主题的颜色，由浏览器选择匹配当前主题的那个。

该功能需要 **Chromium 123 或更新版本**。IDE 内置的版本如下：

| IDE 版本 | Chromium | 颜色 |
|---|---|---|
| 2024.2 – 2025.2 | **122** | 缺失 |
| **2025.3 及更新** | **137** | 正常 |

一个版本之差就决定了结果。在 122 上，使用 `light-dark()` 的颜色声明会被整体丢弃，最终没有任何颜色被应用。

Chromium 122 是 2024 年 3 月的构建。如果您长期使用同一个 IDE，其中的浏览器引擎也就一直停留在那个版本。

## 解决方法

**请将 IDE 升级到 2025.3 或更新版本。** 如果条件允许，建议使用最新版。

- 通过 **Help → Check for Updates** 更新
- 如果使用 Toolbox，请从 Toolbox 更新

升级后重启 IDE，颜色就会恢复。无需更改插件设置。

当前版本可在 **Help → About** 中查看。

### 如果无法升级

您也可以使用 **IDE 自带的差异查看器**来审阅变更。那个界面由 IDE 直接绘制，因此不受此问题影响。

请前往 **设置 → 差异视图 → 查看更改的位置**，选择 **IDE 差异查看器**。

需要注意的是，那里无法逐块批准，也无法直接编辑提议内容 —— 这些功能只在我们的界面中提供。

## 相关链接

### 本仓库的 PR

- [#342 — Make the proposed side of a review diff editable](https://github.com/Swttch/swttch/pull/342)

### 外部参考

- [MDN: `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) — 浏览器支持情况
- [JetBrains Runtime](https://github.com/JetBrains/JetBrainsRuntime) — IDE 附带的运行时，JCEF 就包含在其中
