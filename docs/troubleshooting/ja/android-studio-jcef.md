# Android Studio でチャット画面が表示されません（JCEF）

🌐 [English](../en/android-studio-jcef.md) | [한국어](../ko/android-studio-jcef.md) | **日本語** | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_最終更新: 2026-08-22_

このプラグインのチャット UI は **JCEF**（Chromium Embedded Framework）の上に描画されます。Android Studio は他の JetBrains IDE と違って JCEF を標準では含んでいないため、チャットの代わりに案内パネルが表示されることがあります。

**解決方法は Android Studio のバージョンによってまったく異なります。** まずご自分のバージョンをご確認ください（**Help → About**）。

| お使いのバージョン | 参照先 |
|---|---|
| **2026.2 以降**（Rabbit） | [2026.2 以降: プラグインをインストールしてください](#20262-以降-プラグインをインストールしてください) |
| **2026.1.3 〜 2026.1.x** | [2026.1: ランタイムを切り替えてください](#20261-ランタイムを切り替えてください) |
| **2026.1.2 以前** | [2026.1.2 以前: 動作する組み合わせがありません](#202612-以前-動作する組み合わせがありません) |

---

## 2026.2 以降: プラグインをインストールしてください

### 症状

チャットを開くと案内パネルが表示されます。古いバージョンのプラグインでは例外が発生します。`idea.log` には次のような内容が残ります。

```
java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
```

ログの前の方には、こちらも記録されています。

```
plugin com.intellij.modules.jcef is not resolved
```

### 原因

**2026.2 から、JCEF が IDE 本体から独立したプラグインに分離されました。** なくなったのではなく、置き場所が変わったということです。

JetBrains は自社の IDE にはこのプラグインを同梱していますが、**Android Studio には同梱されていません。** そのため `com.intellij.ui.jcef` のクラスが IDE のどこにも存在しない状態になります。

ここで大切なのは、**ランタイムを切り替えても解決しない**という点です。JetBrains Runtime が提供するのは `org.cef.*` のみで、プラットフォームのコードである `com.intellij.ui.jcef` は IDE 側から来る必要があるからです。JCEF 入りのランタイムで起動しても結果は同じです。

### 解決方法

1. **Settings → Plugins → Marketplace** を開きます
2. **Web Browser (JCEF)** を検索します（提供元が **JetBrains** のもの）
3. インストールして IDE を再起動します

再起動するとチャットが正常に表示されます。ランタイムは標準のままで構いません。

> Marketplace ページ: [Web Browser (JCEF)](https://plugins.jetbrains.com/plugin/31360)

### 確認済みの組み合わせ

| Android Studio | 標準の状態 | Web Browser (JCEF) 導入後 |
|---|---|---|
| **2026.2.1 Canary 2**（AI-262.9437） | 案内パネル（古いプラグインでは例外） | **正常に動作** — ランタイムの交換は不要 |

---

## 2026.1: ランタイムを切り替えてください

### 症状

チャット UI の代わりに案内パネルが表示されます。

### 原因

Android Studio に同梱されている JetBrains Runtime（JBR）に JCEF が含まれていません。2026.1 では JCEF はまだ IDE 本体に入っているため、**JCEF 入りのランタイムに切り替えれば解決します。**

### 解決方法

1. Android Studio が **2026.1.3 以降**であることをご確認ください（2026.1.2 以前は下の項目をご覧ください）
2. Find Action を開きます。`Cmd+Shift+A`（macOS）または `Ctrl+Shift+A`（Windows/Linux）
3. **Choose Boot Java Runtime for the IDE…** を実行します
4. 名前に **JCEF** が含まれるランタイムを選びます
5. インストールが終わったら IDE を再起動します

プラグインの案内パネルにあるボタンからも同じダイアログが開きます。

---

## 2026.1.2 以前: 動作する組み合わせがありません

### 症状

ランタイムを切り替えたあと、次のいずれかが起こります。

- Android Studio がまったく起動しません
- 起動はするものの、プラグインのウィンドウが完全に空です。案内パネルもエラーメッセージもありません

ウィンドウが空の場合、`idea.log` には次のような内容が残ります。

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

### 原因

- 2026.1.2 以前は Java 21 上で動作し、独自の `JCefAppConfig` を同梱しています
- JCEF 入りの **JBR 21** を選ぶと、ランタイム側のモジュールが同梱分を覆い隠します。JBR 21 の `JCefAppConfig` には、プラットフォームが呼び出す `isRemoteEnabled()` メソッドがありません。そのためブラウザーが生成されず、ウィンドウが空のままになります
- **JBR 25** にはそのメソッドがありますが、2026.1.2 以前は Java 25 では起動できません。Java 24 で Security Manager が削除されたのに、これらのビルドはまだそれを有効にしようとするためです

Android Studio **2026.1.3** が標準ランタイムを Java 21 から Java 25 へ移行したことで、この問題は解消しました。

### 解決方法

Android Studio を **2026.1.3 以降**に更新してください。

### 確認済みの組み合わせ

| Android Studio | 標準の JBR | JCEF 入り JBR 21 | JCEF 入り JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — 案内パネルのみ | 空のウィンドウ | 起動失敗 |
| 2026.1.2 | Java 21 — 案内パネルのみ | 空のウィンドウ | 起動失敗 |
| **2026.1.3** | **Java 25** | — | **正常に動作** |

---

## ランタイムを切り替えたあと IDE が起動しない場合

Android Studio の設定フォルダーから `studio.jdk` ファイルを削除すると、標準のランタイムに戻ります。

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<バージョン>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<バージョン>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<バージョン>\studio.jdk`

## 関連リンク

### このリポジトリの Issue

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### このリポジトリの Pull Request

- [#327 — Keep the chat panel loadable on an IDE without JCEF](https://github.com/Swttch/swttch/pull/327)
- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### 外部の参考資料

- [Web Browser (JCEF) Marketplace プラグイン](https://plugins.jetbrains.com/plugin/31360) — Android Studio に JCEF を追加する JetBrains のプラグイン
- [JetBrains のお知らせ: Experimental JCEF Web Browser API support for Android Studio](https://platform.jetbrains.com/t/experimental-jcef-web-browser-api-support-for-android-studio/4117)
