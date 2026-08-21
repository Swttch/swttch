# Swttch (ex - Claude Code with GUI)

Cursor と VS Code で親しまれている Claude Code GUI が、JetBrains IDE でも利用できるようになりました。

> **名称が変わりました — Claude Code with GUI は Swttch になりました。**
>
> このリポジトリは `yhk1038/claude-code-gui-jetbrains` から `Swttch/swttch` へ移行しました。
> 既存のリンクや `git clone` の URL はそのまま動作します。
>
> 製品は同じです。Claude Code にとどまらず、より多くのプロバイダーに対応していくために名称を変更しました。

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/30313?label=Marketplace)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/30313?label=Downloads)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
![JetBrains IDE](https://img.shields.io/badge/JetBrains%20IDE-2024.2%2B-000000?logo=jetbrains)
![Claude Code](https://img.shields.io/badge/Claude%20Code%20CLI-%3E%3D1.0.0-blueviolet)

🌐 [English](../README.md) | [한국어](README.ko.md) | **日本語** | [中文](README.zh.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Français](README.fr.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-chat.png" alt="Chat interface" width="800" />
</p>

## Highlights

- Cursor/VS Code の Claude Code と**同等の UI/UX** を JetBrains IDE で提供
- Claude Code CLI を spawn するラッパー — 公式 VS Code 拡張と同じアプローチ
- **すべてのソースコードをゼロから独自に設計・作成** — 他のプロジェクトのクローンではない
- JetBrains IDE だけでなく、**ブラウザ/モバイルでも独立して動作**できるデュアル環境アーキテクチャ
- 急速に進化する Claude Code 体験（Agent Team、Remote Control など）を GUI として提供

> 現在、サービスの安定化に大きな力を注いでいます。バグを報告していただければ、平均1日以内に解決しますので、ぜひご報告ください。
>
> このプロジェクトはグローバルな開発者コミュニティとともに成長したいと考えています。できるだけ多くの開発者とのコラボレーションを可能にするため、**英語を公式共通言語**として採用しています。

## 機能

### ストリーミングチャット

- リアルタイム Markdown レンダリングと構文ハイライト（数式レンダリング対応）
- Claude の思考プロセス（thinking）をリアルタイムで表示

### ツール呼び出しカード

- ファイルの読み書き、Bash コマンド、検索結果をビジュアルカードで表示
- Cursor/VS Code と一貫した UI

### 権限管理

- ファイルおよび Bash 操作の権限に関するネイティブダイアログ
- 設定で柔軟な権限ポリシーを構成

### 複数セッション

- タブで複数の会話を同時に管理
- セッションドロップダウンで素早く切り替え
- セッション履歴全体を閲覧

### ファイルおよび画像の添付

- ファイルや画像をドラッグ＆ドロップまたは選択してチャットに添付

### スラッシュコマンド

- `/clear` — セッションの初期化
- `/compact` — 会話のコンパクト化
- その他、利用可能なコマンドを動的にロード

### 割り込み

- ストリーミング中のメッセージおよびツール実行を即座に停止

### トンネルおよびスリープ防止

- **外部からのリモートアクセスをサポート**
  - 外部からアクセス可能な URL の生成と QR コードの提供
  - Cloudflare が提供する [cloudflared](https://github.com/cloudflare/cloudflared) を使用してローカルサーバーをトンネリング（無料・無制限）
  - ポートフォワーディングを提供する Cloudflare プロキシサーバー以外のサードパーティ通信なし
  - コミュニティ独自実装であり、Claude の Remote Control ネイティブ公式機能とは無関係（将来対応予定）

- **スリープ防止**
  - macOS（caffeinate）、Linux（systemd-inhibit）、Windows（powercfg）でのスリープ防止

### 設定の双方向同期

- プラグイン設定だけでなく、Claude Code オリジナル設定（グローバル/ローカル）も設定メニューから直接制御
- 今後、設定ファイルの公式仕様全体を GUI で制御できるよう改善予定
- MCP サーバー、スキル、エージェントなど `.claude` が担う領域を GUI で管理できるよう対応予定

### ブラウザ/モバイル独立実行

- JetBrains IDE がなくても、ブラウザやモバイルから単独で使用可能
- Node.js バックエンドが WebSocket サーバーを提供し、ブラウザがクライアントとして接続
- 開発専用ではなく独立したデプロイ対象 — IDE 環境と同等の機能をブラウザで提供

### その他の機能

- **Open Claude in Terminal** — コマンドパレットから IDE ターミナルで Claude を起動
- **セッション URL ルーティング** — IDE を再起動してもセッションが自動復元
- **シングルプロセス・マルチプロジェクト** — 1つのバックエンドプロセスで複数のプロジェクトを同時にサポート
- **設定** — CLI パス、テーマ、フォントサイズ、権限ポリシー、ログレベルの構成

<details>
<summary>その他のスクリーンショット</summary>

**ウェルカム画面**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-welcome.png" alt="Welcome screen" width="400" />

**設定パネル**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-settings.png" alt="Settings panel" width="400" />

</details>

## 要件

- JetBrains IDE 2024.2 — 2025.3
- Claude Code CLI >= 1.0.0（インストール済みおよび認証済み）
- Node.js >= 18

## クイックスタート

1. `claude` CLI がインストールされ、認証されていることを確認します（`claude --version`）。
2. JetBrains Marketplace からプラグインをインストールします。
3. **Tools > Open Claude Code** からパネルを開くか、`Ctrl+Shift+C` を押します。
4. Claude とコーディングを開始します。

**ショートカット**

- `Ctrl+Shift+C` — Claude Code パネルを開く
- `Cmd+N` / `Ctrl+N`（パネルフォーカス時）— 新規セッションタブ

## トラブルシューティング

よく発生する問題のうち、まだこちらで直せていないものの既知の解決方法があるものを、**[docs/troubleshooting](troubleshooting/ja/README.md)** に症状・原因・解決方法と関連 Issue へのリンクとともにまとめてあります。

- [Wayland のクリップボード](troubleshooting/ja/wayland-clipboard.md) — Linux · Wayland · KDE Plasma でチャット入力欄に貼り付けができないとき
- [Android Studio の JCEF ランタイム](troubleshooting/ja/android-studio-jcef.md) — Android Studio でチャット画面の代わりに案内パネルが出る、またはウィンドウが空のとき

一覧にない問題は [Issue を開いて](https://github.com/Swttch/swttch/issues/new/choose)お知らせください。

## コントリビューション

あらゆる種類のコントリビューションを歓迎します — バグ報告、機能提案、コード、ドキュメント、翻訳など。

- **始めるには？** [CONTRIBUTING.md](../CONTRIBUTING.md) でセットアップ手順とガイドラインを確認してください。
- **取り組む課題を探しているなら？** [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue) ラベルの付いた Issue を確認してください。
- **大きな変更を計画しているなら？** まず [Issue を開いて](https://github.com/Swttch/swttch/issues)議論してください。

## ライセンス

このプロジェクトは [GNU Affero General Public License v3.0](../LICENSE) の下でライセンスされています。
