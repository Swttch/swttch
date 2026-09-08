# Linux でチャットタブが真っ白なまま開きます

🌐 [English](../en/linux-jcef-blank-panel.md) | [한국어](../ko/linux-jcef-blank-panel.md) | **日本語** | [中文](../zh/linux-jcef-blank-panel.md) | [Español](../es/linux-jcef-blank-panel.md) | [Deutsch](../de/linux-jcef-blank-panel.md) | [Français](../fr/linux-jcef-blank-panel.md)

_最終更新: 2026-09-08_

## 症状

チャットタブは開きますが、中身が完全に空のままです。

`Waiting for project indexing...` という文字が一瞬表示されて消え、その後は何も表示されません。

エラーメッセージも案内パネルも出ず、ただ空白の画面が残ります。

## 最初に確認してください

同じ IDE で `.md` ファイルを開き、Markdown プレビューを表示してみてください。

**Markdown プレビューも空白であれば、このドキュメントが該当します。**

Markdown プレビューはこのプラグインではなく IDE 自身が描画している画面です。両方が同時に表示されなくなる場合、原因は特定のプラグインではなく IDE の組み込みブラウザ（JCEF）にあります。

この確認だけで時間を大きく節約できます。チャットタブを見ただけでは、プラグインの問題なのか JCEF の問題なのか区別がつかないためです。

## 該当する環境

Linux で発生します。

Ubuntu 22.04 と PhpStorm 2026.2.2 の組み合わせで確認されており、NVIDIA のグラフィックカードを使用した Wayland セッションでした。

報告者は、別の Wayland の問題を回避するために JCEF 関連のレジストリ値をいくつか既定値から変更していました。

次の 2 つに当てはまる場合、発生しやすくなります。

- X11 ではなく **Wayland** セッション
- **NVIDIA** のプロプライエタリドライバ

## 原因

このプラグインはチャット画面を **JCEF**（Chromium Embedded Framework）上に描画します。IDE が Markdown プレビューや組み込みブラウザを描画するときに使うものと同じコンポーネントです。

JCEF は GPU を経由して描画します。ドライバとセッションの組み合わせによってこの経路が機能しないと、ブラウザ自体は正常に生成されるのに一度も描画されず、パネルが空のままになります。

この状態を私たちはまだ検出できていません。JCEF が使用できない場合や、バックエンドが起動しなかった場合には、案内パネルに切り替えて表示しています。しかし JCEF が正常に起動したあとで描画だけされない状況は、私たちの側からは成功に見えてしまいます。そのためメッセージのない空のタブが残ります。

## 解決方法

次の順に試してください。報告された事例は 1 番で解決しました。

### 1. JCEF のレジストリ値を既定値に戻す

`Help → Find Action` を開いて **Registry…** を実行し、`jcef` で検索してください。

次の 4 項目を確認し、既定値でないものがあれば戻してください。

| 項目 | 既定値 |
|---|---|
| `ide.browser.jcef.gpu.disable` | `false` |
| `ide.browser.jcef.osr.enabled` | `true` |
| `ide.browser.jcef.markdownView.osr.enabled` | `true` |
| `ide.browser.jcef.sandbox.enable` | `true` |

変更された項目は太字で表示され、Registry のダイアログには **Restore Defaults** ボタンがあります。

変更後は IDE を再起動してください。

別の Wayland の問題を回避するために設定したフラグが、この症状の原因になっていることがよくあります。

### 2. セッションを X11 に切り替える

ログアウトし、ログイン画面で Wayland ではなく **X11**（または「Xorg」）セッションを選択してください。

デスクトップは Wayland のままにしたい場合、IDE だけを XWayland に移すこともできます。`Help → Edit Custom VM Options` を開き、次の行を追加して再起動してください。

```
-Dawt.toolkit.name=XToolkit
```

`-Dawt.toolkit.name=` で始まる行がすでにある場合は、その行を置き換えてください。

### 3. 1 番と 2 番で解決しない場合のみ、GPU アクセラレーションを無効にする

これは 1 番とは逆方向の設定です。1 番を試して解決しなかった場合にのみ実行してください。

**Registry…** で `ide.browser.jcef.gpu.disable` を `true` にして再起動します。

組み込みブラウザが空で表示されていた別の利用者に対して、JetBrains はまさにこの方法を案内し、その利用者は画面が表示されるようになったと報告しています（[IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573)）。

## 注意点

**レジストリ値を変更する前に、元の値を控えておいてください。** これらの設定はこのプラグインだけでなく、IDE の組み込みブラウザを使うすべての画面に影響します。

X11 や XWayland に移すと、IDE は以前の表示経路に戻ります。そのため **125%、150% のような分数スケーリングを使っている場合、画面がぼやけて見えることがあります。** 一時的な回避策なので、いつでも元に戻せます。

GPU アクセラレーションを無効にすると JCEF が CPU で描画するため、重いページでは動作が遅くなることがあります。

## それでも解決しない場合

この状況で JetBrains は JCEF の詳細ログを求めています。

`Help → Edit Custom VM Options` に次の行を追加して再起動し、空のタブを再現したうえで `~/jcef_<PID>.log` を取得してください。

```
-Dide.browser.jcef.log.level=verbose
```

[イシューを作成いただく際](https://github.com/Swttch/swttch/issues/new/choose)に、そのファイルとあわせてディストリビューション、セッションの種類（Wayland か X11 か）、グラフィックドライバをお知らせいただけると大変助かります。

## いつ解消されますか

これらのドライバとセッションの組み合わせで JCEF が安定して描画するようになれば、この回避策は不要になります。

以下のチケットはまだオープンで、投票していただくと優先度を上げる助けになります。

私たちの側でも、一度も描画されないブラウザを検出して、空のタブの代わりに何が起きたのかを画面でお伝えできないか検討しています。

## 関連リンク

### このリポジトリのイシュー

- [#420 — Blank content of Claude Code tab](https://github.com/Swttch/swttch/issues/420)

### JetBrains のチケット

- [IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573) — Linux で組み込みブラウザが空で表示される問題。VA-API のエラーが原因として挙げられています。**まだオープンで、投票できます。** JetBrains はここで `ide.browser.jcef.gpu.disable` を案内し、報告者が効果を確認しています
- [JBR-5969](https://youtrack.jetbrains.com/issue/JBR-5969) — Linux の NVIDIA ドライバで GPU アクセラレーションが JCEF を壊す問題と、それを確実に無効化する手段を求める要望。**まだオープンです**
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — ネイティブ Wayland サポートそのもの。現在も進行中です
- [IDEA-349995](https://youtrack.jetbrains.com/issue/IDEA-349995) — 同じ白い画面の症状。情報が不足していたため Incomplete としてクローズされました

### 関連ドキュメント

- [Wayland のクリップボード](wayland-clipboard.md) — チャット入力欄に貼り付けができない、もう一つの Wayland の問題
