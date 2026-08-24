# 変更内容の画面に色がつきません

🌐 [English](../en/diff-colors-old-ide.md) | [한국어](../ko/diff-colors-old-ide.md) | **日本語** | [中文](../zh/diff-colors-old-ide.md) | [Español](../es/diff-colors-old-ide.md) | [Deutsch](../de/diff-colors-old-ide.md) | [Français](../fr/diff-colors-old-ide.md)

_最終更新: 2026-08-24_

Claude がファイルの編集を提案すると変更内容をお見せしますが、**2025.2 以前の IDE ではその画面に色がつきません。** 回避策をまだ入れられておらず、IDE を上げていただくとすぐに解決します。

## 症状

変更内容の画面全体が同じ色で表示されます。

![色がつかない変更内容の画面 — コードがすべて白く、変更された行に背景色がありません](../../img/screenshot-diff-colors-missing.png)

- キーワード・文字列・数値が区別されず、すべて白（または黒）です
- **追加された行と削除された行の背景色がありません。** どの行が変わったのか色で分かりません
- 行番号や区切り線も同じ平坦なトーンです

正常であればこう見えます。

![正常な変更内容の画面 — 構文強調があり、追加された行が緑の背景で表示されます](../../img/screenshot-diff-colors-ok.png)

文字も行番号も正しく出ており、承認・拒否などの動作もすべて正常です。**読みにくいだけで、壊れているわけではありません。**

## 原因

この画面は IDE に内蔵された **JCEF**（Chromium ベースのブラウザエンジン）の上に描かれます。色を決めるのに `light-dark()` という CSS 機能を使っており、明るいテーマと暗いテーマの色を 1 行に書いて今のテーマに合う方を選ぶ仕組みです。

この機能は **Chromium 123 以降**で使えます。IDE に入っている Chromium のバージョンは次のとおりです。

| IDE バージョン | Chromium | 色 |
|---|---|---|
| 2024.2 〜 2025.2 | **122** | つかない |
| **2025.3 以降** | **137** | 正常 |

1 バージョンの差で分かれます。122 では `light-dark()` を使った色指定がまるごと無効になり、何も適用されない状態が残ります。

Chromium 122 は 2024 年 3 月のビルドです。同じ IDE を長くお使いなら、その中のブラウザエンジンもそれだけ古いままです。

## 解決方法

**IDE を 2025.3 以降に更新してください。** 可能であれば最新版をおすすめします。

- **Help → Check for Updates** から更新できます
- Toolbox をお使いなら Toolbox から更新してください

更新後に IDE を再起動すると色が戻ります。プラグインの設定を変える必要はありません。

現在のバージョンは **Help → About** で確認できます。

### IDE を更新できない場合

変更内容は **IDE 自体の差分ビューア**でもご覧いただけます。そちらは IDE が直接描画するため、この問題は起きません。

**設定 → 差分ビュー → 変更の確認場所** で **IDE の差分ビューア** をお選びください。

ただしその場合、ハンク単位の承認と提案内容の直接編集はご利用いただけません。これらは私たちの画面でのみ提供しています。

## 関連リンク

### このリポジトリの PR

- [#342 — Make the proposed side of a review diff editable](https://github.com/Swttch/swttch/pull/342)

### 外部参考

- [MDN: `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) — ブラウザ別の対応状況
- [JetBrains Runtime](https://github.com/JetBrains/JetBrainsRuntime) — IDE に同梱されるランタイム。JCEF もここに含まれます
