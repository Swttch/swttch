# CCG_HOME を設定していると、アップデート後に保存したアカウントやライセンスなどが初期化されたように見える

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | **日本語** | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_最終更新: 2026-11-10_

**環境変数 `CCG_HOME` をご自身で設定している方だけが対象です。** 設定したことがなければ何も変わらないので、ここで読むのをやめて構いません。

v0.36.1 以前では、何種類かのデータが `CCG_HOME` を無視し、`CCG_HOME` を別の場所に向けていても既定のフォルダ `~/.claude-code-gui` に残っていました。v0.36.1 の次のリリースからは、すでに `CCG_HOME` に従っていたプロンプト、プロジェクト、アップロードしたファイルと同じように、これらも `CCG_HOME` に従います。そのため、プラグインは `CCG_HOME` が指すフォルダを開いても以前のファイルを見つけられず、最初からの状態で始まります。**削除されたものはありません。** 以前のファイルは既定のフォルダにそのまま残っており、下の手順でコピーすれば解決します。

## 症状

- 以前アカウントを保存したのに、`swttch account`(または `ccg account`)が保存済みアカウントなしと表示する
- スポンサー機能がオフになっている(ライセンスキーがないように見える)
- 匿名の利用データを送るかどうかの質問が、答えたことがないかのように再び表示される
- 予約しておいたメッセージが一覧から消えている

## 対象かどうかの確認方法

IDE やプラグインを起動するターミナルで、次のコマンドを実行します。

| システム | コマンド | 次の出力なら対象外 |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | 空、または `~/.claude-code-gui` と同じフォルダ |
| Windows (PowerShell) | `echo $env:CCG_HOME` | 空、または `%USERPROFILE%\.claude-code-gui` と同じフォルダ |
| Windows (cmd) | `echo %CCG_HOME%` | 空(未設定の場合、cmd は `%CCG_HOME%` という文字列をそのまま表示します)、または `%USERPROFILE%\.claude-code-gui` と同じフォルダ |

別のフォルダが表示された場合は対象です。

## 何が移ったか

| ファイルまたはフォルダ(以前の既定のフォルダ内) | 内容 | 対応 |
|---|---|---|
| `accounts.json` と `accounts` フォルダ | すばやく切り替えるために保存した Claude アカウント(**サインイン情報を含む**) | コピー |
| `license.json` | スポンサーのライセンスキー | コピー |
| `profile.json` | 匿名の利用データについての回答と、この環境のランダムな ID | コピー |
| `scheduled-messages.json` | 予約したメッセージ | コピー |
| `workflow-agents` フォルダ | チャットを開き直したときに、終わったワークフローが表示するエージェント名 | 残したい場合はコピー |
| `account-pool-recovery` フォルダ、`cli-registry` フォルダ、`logs/lifecycle.log`、`bin` フォルダ | 短期間のメモ、実行中の Claude プロセスの一覧、起動時の記録、ダウンロードしたトンネルツール | 対応不要。自動的に作り直されるか、再びダウンロードされます |

## 移っていないもの

- **`settings.js`**(プラグインの設定)は、意図的に既定のフォルダに残します。IDE プラグインが同じファイルを読み書きしていて `CCG_HOME` を知らないため、両方が引き続きこのファイルを使う必要があります。今回の変更で設定が初期化されることはありません
- **`auth-secret`**(チャット画面とバックエンドの間の接続を守る秘密の値)も、同じ理由で残ります。`swttch` コマンドと IDE プラグインが共有しています
- プロンプト、プロジェクト、アップロードしたファイル、送信したファイル、使用量の数値は、以前から `CCG_HOME` に従っていたので影響を受けません

## 解決方法

更新後のバージョンでアカウントを保存したり、ライセンスを入力したり、他の操作をしたりする**前に**行ってください。コピーすると新しいフォルダの内容が上書きされます(「知っておくこと」を参照)。

### 1. プラグインを止める

IDE のプラグインタブを閉じるか、IDE を終了します。ブラウザ版を使っている場合は `swttch stop` を実行します。

### 2. `CCG_HOME` が指すフォルダへファイルをコピーする

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
for f in accounts.json accounts license.json profile.json scheduled-messages.json workflow-agents; do
  [ -e ~/.claude-code-gui/$f ] && cp -pR ~/.claude-code-gui/$f "$CCG_HOME/"
done
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
foreach ($f in 'accounts.json','accounts','license.json','profile.json','scheduled-messages.json','workflow-agents') {
  $src = Join-Path $env:USERPROFILE ".claude-code-gui\$f"
  if (Test-Path $src) { Copy-Item $src $env:CCG_HOME -Recurse -Force }
}
```

もともと存在しないファイル(例: メッセージを一度も予約していない場合)は、そのまま飛ばされます。

### 3. プラグインを再び起動する

保存したアカウント、ライセンス、利用データの回答、予約したメッセージが戻ります。`swttch account` でアカウントの一覧を確認できます。

### 4. 古いコピーを削除する(任意)

すべて戻ったことを確認したら、`~/.claude-code-gui` からコピーしたファイルを削除して構いません。まだそこで使われている `settings.js` と `auth-secret` は残してください。`accounts.json`、`accounts` フォルダ、`license.json` にはサインイン情報とライセンスキーが入っているため、コピーが残り続けるのを減らすことが削除する唯一の理由です。古いコピーを必要とするものは、もうありません。

## 知っておくこと

- **コピーは上書きします。** 更新後にすでにアカウントを保存した、ライセンスを入力した、または利用データの質問に答えた場合、その内容は新しいフォルダにあり、コピーすると古い内容に置き換わります。その場合は、足りない項目だけをコピーしてください。失ったアカウントが 1 つだけなら、`claude` でもう一度サインインして `swttch account save` を実行する方法もあります。失ったライセンスキーは入力し直せます
- `CCG_HOME` の設定を変える必要はありません。変わったのはデータを読む場所だけです
- 上のコマンド(`cp -p`)でコピーすると、所有者のみのアクセス権が保たれます。`accounts.json`、`accounts` フォルダ、`license.json` の権限を広げないでください

## 関連リンク

### このリポジトリのドキュメント

- [プロンプトライブラリ、プロンプトの保存場所](../../features/064-prompt_library/en.md) — `CCG_HOME` がデータフォルダ全体を移すことを説明しています(英語)
- [あらゆる種類のファイルを添付、コピーの保存場所](../../features/085-attach_any_file_type/en.md) — アップロードしたコピーも `CCG_HOME` に従います(英語)
