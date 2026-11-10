# トラブルシューティング

🌐 [English](../en/README.md) | [한국어](../ko/README.md) | **日本語** | [中文](../zh/README.md) | [Español](../es/README.md) | [Deutsch](../de/README.md) | [Français](../fr/README.md)

_最終更新: 2026-11-10_

よく発生する問題のうち、まだこちらで直せていないものの、既知の解決方法があるものをまとめています。

それぞれの文書に、症状・原因・解決方法、そして関連する Issue へのリンクが載っています。

## 一覧

| 文書 | こんなときに |
|---|---|
| [Wayland のクリップボード](wayland-clipboard.md) | Linux · Wayland でチャット入力欄に貼り付けができないとき |
| [Linux でチャットタブが空](linux-jcef-blank-panel.md) | Linux でチャットタブが完全に空で、IDE の Markdown プレビューも空のとき |
| [Android Studio の JCEF](android-studio-jcef.md) | Android Studio でチャット画面の代わりに案内パネルや例外が出る、またはウィンドウが空のとき |
| [変更内容の画面の色](diff-colors-old-ide.md) | 2025.2 以前の IDE で変更内容の画面に色がつかないとき |
| [Claude Desktop にセッションが表示されない](desktop-session-import.md) | プラグインで作成したセッションが Claude Desktop の Code タブに表示されないとき |
| [CCG_HOME 設定後に設定・アカウントが初期化される](ccg-home-data-location.md) | `CCG_HOME` を設定していて、アップデート後に設定が初期値に戻る、または `swttch account` が保存済みアカウントなしと表示するとき |

## ここにない問題の場合

[Issue を開いて](https://github.com/Swttch/swttch/issues/new/choose)お知らせください。

IDE の種類とバージョン、プラグインのバージョン、OS を一緒に書いていただけると、原因の特定に大きく役立ちます。

Linux をお使いの場合は、デスクトップ環境（KDE、GNOME など）とセッションの種類（Wayland、X11）もお知らせください。

すでに報告されている内容は [Issue 一覧](https://github.com/Swttch/swttch/issues)でご確認いただけます。
