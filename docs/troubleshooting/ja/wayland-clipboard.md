# JetBrains IDE を Wayland で実行すると貼り付けができません

🌐 [English](../en/wayland-clipboard.md) | [한국어](../ko/wayland-clipboard.md) | **日本語** | [中文](../zh/wayland-clipboard.md) | [Español](../es/wayland-clipboard.md) | [Deutsch](../de/wayland-clipboard.md) | [Français](../fr/wayland-clipboard.md)

_最終更新: 2026-10-05_

## 症状

プラグインのチャット入力欄への貼り付けが、何の反応もなく失敗します。

エラーメッセージも表示されません。

ひとつ特徴があります。

プラグインの**内側**でコピーしたテキストは問題なく貼り付けられるのに、ブラウザ・ターミナル・IDE のエディタなど**外側**でコピーしたものだけが失敗します。

同じ IDE のコードエディタや検索欄には正常に貼り付けられます。

テキストだけではありません。**スクリーンショットなどの画像も同じように失敗します。**

## 該当する環境

Linux の Wayland セッションで、IDE 自体がネイティブの Wayland プログラムとして動作している場合に発生します。

既定の `-Dawt.toolkit.name=auto` がこの方式を選ぶことがあり、`WLToolkit` を指定すると強制されます。

これまでに Fedora 44、Ubuntu 26.04、CachyOS で報告されており、いずれも KDE Plasma デスクトップです。

sway コンポジターのテストセッションで、IDE 2025.3.4 と IDE 2026.2.3 の両方で同じ症状を再現しました。

GNOME に切り替えると症状が消えたという報告があります。

## 原因

プラグインの画面は、IDE 内のブラウザエンジンである JCEF が描画しています。

私たちが検証した IDE（2025.3.4 と 2026.2.3）では、JCEF は別プロセスとして動作し、そのプロセスは X11 プログラム向けの互換レイヤーである XWayland を通して画面につながっています。

IDE のウィンドウ自体はネイティブの Wayland ウィンドウです。

プラグインの外でコピーしたテキストは、Wayland のクリップボードにあります。

XWayland は、X11 のウィンドウにフォーカスがある間だけ、Wayland のクリップボードを X11 プログラムに渡します。

IDE のウィンドウは Wayland ウィンドウなので、その受け渡しが起きず、JCEF からはクリップボードが空に見えます。

プラグインの中でコピーしたテキストは X11 のクリップボードに入るため、問題なく貼り付けられます。

この受け渡しを、sway、KWin 5.27.5、KWin 6.7.5（Fedora 44 と同じ Plasma 6.7 系列）の 3 つのコンポジターで測定しました。

3 つとも、Wayland ウィンドウにフォーカスがある間は X11 プログラムが Wayland のクリップボードを読めず、X11 ウィンドウにフォーカスがある間は読めました。

`-Dawt.toolkit.name=XToolkit` を使うと IDE のウィンドウ自体が X11 ウィンドウになるため、クリップボードが渡され、貼り付けができます。

JCEF を使う他の JetBrains プラグインでも同じ症状が報告されています。

IDE のプロセス自体はこのクリップボードを読めるため、新しいバージョンのプラグインは、貼り付けが空のまま届くたびに IDE へクリップボードの読み取りを依頼します。これで設定なしでも貼り付けができます。

以前のバージョンをお使いの場合や、貼り付けがそれでも失敗する場合は、以下の設定を使ってください。

## 解決方法

`Help → Edit Custom VM Options` を開き、以下の行を追加して IDE を再起動してください。

```
-Dawt.toolkit.name=XToolkit
```

すでに `-Dawt.toolkit.name=` で始まる行がある場合（`auto` や `WLToolkit` など）は、その行を上の内容に置き換えてください。

この方法は 3 名の方が、それぞれ異なるディストリビューションで効果を確認してくださいました。

## 注意点

この設定は IDE を XWayland に戻します。

そのため、**125%、150% などの分数スケーリングをお使いの場合、画面がぼやけて見えることがあります。**

一時的な回避策であり、本当の解決ではありません。

ぼやけるほうが気になる場合は、設定を元に戻していただいて構いません。

Arch Linux の omarchy をお使いの方から、この設定にすると IDE のポップアップなど浮遊ウィンドウが誤った位置に表示される、という報告がありました。

sway ではこの症状を再現できませんでした。150% のスケーリングでも、メニューとポップアップは正しい位置に開きました。

同じ症状が出る場合は、お使いのデスクトップまたはコンポジターを教えてください。

## いつ解消されますか

JetBrains のネイティブ Wayland サポートが安定すれば不要になります。

関連チケット [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) はまだオープンのままです。

投票していただくと優先度を上げる助けになります。

## 関連リンク

### このリポジトリの Issue

- [#278 — Cannot paste external text into chat input on Fedora KDE (Wayland)](https://github.com/Swttch/swttch/issues/278)
- [#262 — no paste function at linux fedora](https://github.com/Swttch/swttch/issues/262)

### JetBrains のチケット

- [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) — JCEF のクリップボード問題。**まだオープンで、投票できます**
- [JBR-10222](https://youtrack.jetbrains.com/issue/JBR-10222) — KDE の問題とみなされ "Third-Party problem" としてクローズされました
- [JBR-5857](https://youtrack.jetbrains.com/issue/JBR-5857) — Wayland のクリップボードサポート。2024 年に Fixed とされています
- [JBR-10504](https://youtrack.jetbrains.com/issue/JBR-10504) — Arch/Hyprland で JCEF プレビューからコピーできない問題
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — ネイティブ Wayland サポート自体がまだ進行中です
- [PY-76704](https://youtrack.jetbrains.com/issue/PY-76704) — Continue プラグインについての最初の報告。JBR-5857 の重複としてクローズされました

### 他のプラグインでの同じ症状

- [cline/cline#8877](https://github.com/cline/cline/issues/8877) — オープン
- [cline/cline#8383](https://github.com/cline/cline/issues/8383) — プラグイン側では修正できないというメンテナの[コメント](https://github.com/cline/cline/issues/8383#issuecomment-4173099236)があります
- [Kilo-Org/kilocode#8998](https://github.com/Kilo-Org/kilocode/issues/8998) — Fedora 43/44、Arch、Kubuntu 26.04 などで報告されています
- [continuedev/continue#2567](https://github.com/continuedev/continue/issues/2567)

### 外部の参考情報

- [KDE bug 490577](https://bugs.kde.org/show_bug.cgi?id=490577) — JetBrains が JBR-10222 をクローズする際に原因として挙げた KDE のバグです。ただしこのバグは Plasma 6.2.0 ですでに修正されており、報告者の方々はそれより新しいバージョンをお使いです
