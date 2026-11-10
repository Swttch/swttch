# CCG_HOME を設定していると、アップデート後に設定と保存したアカウントが初期化されたように見える

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | **日本語** | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_最終更新: 2026-11-10_

**環境変数 `CCG_HOME` をご自身で設定している方だけが対象です。** 設定したことがなければ何も変わらないので、ここで読むのをやめて構いません。

v0.36.1 以前では、3 種類のデータが `CCG_HOME` を無視し、`CCG_HOME` を別の場所に向けていても既定のフォルダ `~/.claude-code-gui` に残っていました。v0.36.1 の次のリリースからは、プラグインの他のデータと同じように、この 3 種類も `CCG_HOME` に従います。そのため、プラグインは `CCG_HOME` が指すフォルダを開いても以前のファイルを見つけられず、初期値で始まります。**削除されたものはありません。** 以前のファイルは既定のフォルダにそのまま残っており、下の手順でコピーすれば解決します。

## 症状

- アップデート後、設定が初期値に戻っている(テーマ、文字サイズなど)
- 以前アカウントを保存したのに、`swttch account`(または `ccg account`)が保存済みアカウントなしと表示する
- 保存したアカウントを表示する他の場所も空になっている

## 対象かどうかの確認方法

IDE やプラグインを起動するターミナルで、次のコマンドを実行します。

| システム | コマンド | 次の出力なら対象外 |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | 空、または `~/.claude-code-gui` と同じフォルダ |
| Windows (PowerShell) | `echo $env:CCG_HOME` | 空、または `%USERPROFILE%\.claude-code-gui` と同じフォルダ |
| Windows (cmd) | `echo %CCG_HOME%` | 空(未設定の場合、cmd は `%CCG_HOME%` という文字列をそのまま表示します)、または `%USERPROFILE%\.claude-code-gui` と同じフォルダ |

別のフォルダが表示された場合は対象です。

## 何が移ったか

| ファイルまたはフォルダ(以前の既定のフォルダ内) | 内容 |
|---|---|
| `settings.js` | プラグインの設定 |
| `accounts.json` と `accounts` フォルダ | すばやく切り替えるために保存した Claude アカウント(**サインイン情報を含む**) |
| `cli-registry` | 実行中の Claude プロセスを一時的に記録する一覧。**対応は不要**で、自動的に作り直されます |

## 解決方法

更新後のバージョンで設定を変更したり、アカウントを保存したりする**前に**行ってください。コピーすると新しいフォルダの内容が上書きされます(「知っておくこと」を参照)。

### 1. プラグインを止める

IDE のプラグインタブを閉じるか、IDE を終了します。ブラウザ版を使っている場合は `swttch stop` を実行します。

### 2. `CCG_HOME` が指すフォルダへファイルをコピーする

macOS · Linux:

```bash
mkdir -p "$CCG_HOME"
cp -p ~/.claude-code-gui/settings.js "$CCG_HOME/"
cp -pR ~/.claude-code-gui/accounts.json ~/.claude-code-gui/accounts "$CCG_HOME/"
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force $env:CCG_HOME | Out-Null
Copy-Item "$env:USERPROFILE\.claude-code-gui\settings.js" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts.json" $env:CCG_HOME -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude-code-gui\accounts" $env:CCG_HOME -Recurse -ErrorAction SilentlyContinue
```

もともと存在しないファイル(例: アカウントを一度も保存していない場合)について「見つかりません」と表示されても問題ありません。

### 3. プラグインを再び起動する

設定と保存したアカウントが戻ります。`swttch account` で一覧を確認できます。

### 4. 古いコピーを削除する(任意)

すべて戻ったことを確認したら、`~/.claude-code-gui` の `settings.js`、`accounts.json`、`accounts` フォルダを削除して構いません。アカウントのファイルにはサインイン情報が入っているため、コピーが残り続けるのを減らすことが削除する唯一の理由です。古いコピーを必要とするものは、もうありません。

## 知っておくこと

- **コピーは上書きします。** 更新後にすでに設定を変更したりアカウントを保存したりしている場合、その内容は新しいフォルダにあり、コピーすると古い内容に置き換わります。その場合は、足りないファイルだけをコピーしてください。失ったアカウントが 1 つだけなら、`claude` でもう一度サインインして `swttch account save` を実行する方法もあります
- `CCG_HOME` の設定を変える必要はありません。変わったのはデータを読む場所だけです
- 上のコマンド(`cp -p`)でコピーすると、所有者のみのアクセス権が保たれます。`accounts.json` と `accounts` フォルダの権限を広げないでください
- プロンプト、プロジェクト、アップロードしたファイルは影響を受けていません。以前から `CCG_HOME` に従っていました

## 関連リンク

### このリポジトリのドキュメント

- [プロンプトライブラリ、プロンプトの保存場所](../../features/064-prompt_library/en.md) — `CCG_HOME` がデータフォルダ全体を移すことを説明しています(英語)
- [あらゆる種類のファイルを添付、コピーの保存場所](../../features/085-attach_any_file_type/en.md) — アップロードしたコピーも `CCG_HOME` に従います(英語)
