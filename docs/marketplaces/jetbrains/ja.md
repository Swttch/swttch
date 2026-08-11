# Swttch (ex - Claude Code with GUI)

**Cursor や VS Code でおなじみの Claude Code GUI が、JetBrains IDE に登場。**

> **名称が変わりました — Claude Code with GUI は Swttch になりました。**
> 同じ開発者による同じ製品です。Claude Code にとどまらず、より多くのプロバイダーに
> 対応していくために名称を変更しました。

🌐 [English](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/en.md) | [한국어](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ko.md) | **日本語** | [中文](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/zh.md) | [Español](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/es.md) | [Deutsch](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/de.md) | [Français](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/fr.md)

> **このプラグインは、このプラグイン自身で開発されています。**
> JetBrains IDE の中で動くこのチャットパネルで、実際に開発が進んでいます。

## このプラグインを選ぶ理由

- **すぐに使いこなせる** — Cursor や VS Code の Claude Code と同じ画面・同じ操作感。新しく覚えることは何もない。
- **透明で安心** — Claude Code CLI を直接実行。間にプロキシはなく、認証情報が密かにスキャンされることもない。
- **改善が早い** — オープンソースプロジェクトとして、報告されたバグはたいてい1日以内に修正される。

## 機能

- **Anthropic 公式拡張機能をベースに** — Claude Code for VS Code は Anthropic が直接開発・保守する公式拡張機能。このプラグインはその公式拡張機能を出発点として、同じ体験を JetBrains へ持ち込む。
- **IDE にとけ込む操作性** — 選択したコードをその場で送信（`Alt+K`）、変更内容は IDE diff viewer で確認・適用、ファイルやターミナルもエディタ内で直接開ける。
- **自由なレイアウト** — チャット画面をサイドバーのツールウィンドウに置くか、エディタタブに配置するかを選んで、自分だけのワークスペースに。
- **会話を一覧で管理** — 左パネルで全セッションをまとめて確認し、クリック一つで目的の会話を開ける。
- **他のデバイスからリモートアクセス** — QR コード（Cloudflare トンネル）を使えば、スマートフォンやタブレットから続きを操作できる。
- **Windows・WSL 対応** — PowerShell 環境でも WSL 環境でも動作する。
- **GUI から設定を管理** — プラグイン設定だけでなく、Claude Code 自身の `.claude` や `.claude.json` 設定ファイルも GUI から編集できる。*(開発中)*

## 動作要件

- JetBrains IDE 2024.2 以降
- Claude Code CLI 1.0.0 以降（最新バージョン推奨、インストール済みかつ認証済みであること）
- Node.js 18 以降

## はじめかた

1. `claude` CLI がインストールされ、認証済みであることを確認する（`claude --version`）。
2. JetBrains Marketplace からプラグインをインストールする。
3. **Tools > Open Claude Code** から開くか、`Ctrl+Shift+C` を押す。
4. Claude とのコーディングを始める。
