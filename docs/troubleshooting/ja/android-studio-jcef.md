# Android Studio でチャット画面が表示されません（JCEF ランタイム）

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | **日本語** | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_最終更新: 2026-08-22_

## 症状

Android Studio でプラグインを開くと、チャット UI ではなく案内パネルが表示されます。

ランタイムを切り替えたあとは、次のいずれかが起こることがあります。

- Android Studio がまったく起動しません
- 起動はするものの、プラグインのウィンドウが完全に空です。案内パネルもエラーメッセージもありません

ウィンドウが空の場合、`idea.log` に次の内容が残ります。

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

## 原因

Android Studio に標準で含まれる JetBrains Runtime（JBR）には、**JCEF**（Chromium Embedded Framework）が含まれていません。

このプラグインの UI は JCEF の上に描画されるため、標準のランタイムではチャット画面ではなく案内パネルが表示されます。

ここまでは、JCEF を含むランタイムに切り替えれば解決します。

ただし、**Android Studio 2026.1.2 以前では動作する組み合わせが存在しません。**

- 2026.1.2 以前は Java 21 上で動作し、独自の `JCefAppConfig` を同梱しています
- JCEF を含む **JBR 21** を選ぶと、ランタイム側のモジュールがそれを覆い隠します。JBR 21 の `JCefAppConfig` には、プラットフォームが呼び出す `isRemoteEnabled()` メソッドがありません。そのためブラウザが生成されず、ウィンドウが空のままになります
- **JBR 25** にはそのメソッドがありますが、2026.1.2 以前は Java 25 では起動できません。Java 24 で Security Manager が削除されたにもかかわらず、これらのビルドはそれを有効にしようとするためです

Android Studio **2026.1.3** が標準ランタイムを Java 21 から Java 25 に移したことで、この問題は解消されました。

## 確認された組み合わせ

| Android Studio | 標準 JBR | JCEF 入り JBR 21 | JCEF 入り JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — 案内パネルのみ | 空のウィンドウ | 起動失敗 |
| 2026.1.2 | Java 21 — 案内パネルのみ | 空のウィンドウ | 起動失敗 |
| **2026.1.3** | **Java 25** | — | **正常動作** |

## 解決方法

1. Android Studio を **2026.1.3 以降**に更新してください
2. Find Action を開きます。`Cmd+Shift+A`（macOS）または `Ctrl+Shift+A`（Windows/Linux）
3. **Choose Boot Java Runtime for the IDE…** を実行します
4. 一覧から名前に **JCEF** が含まれるランタイムを選びます
5. インストールが終わったら IDE を再起動します

プラグインの案内パネルにある **Switch Runtime** ボタンを押しても、同じダイアログが開きます。

## ランタイムを切り替えたあと IDE が起動しない場合

Android Studio の設定フォルダから `studio.jdk` ファイルを削除すると、標準のランタイムに戻ります。

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<バージョン>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<バージョン>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<バージョン>\studio.jdk`

## いつ解消されますか

JetBrains は 2025 年 4 月に、[**Web Browser (JCEF)**](https://plugins.jetbrains.com/plugin/31360) という実験的なマーケットプレイスプラグインを公開しました。

Android Studio 2026.1 Nightly 以降に JCEF を追加するプラグインです。

これが安定すれば、上記のランタイム切り替え自体が不要になります。

## 関連リンク

### このリポジトリの Issue

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### このリポジトリの PR

- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### 外部の参考情報

- [Web Browser (JCEF) マーケットプレイスプラグイン](https://plugins.jetbrains.com/plugin/31360) — Android Studio に JCEF を追加する JetBrains の実験的なプラグイン
