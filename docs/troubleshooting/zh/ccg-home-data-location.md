# 设置了 CCG_HOME 的用户，更新后已保存的账号、许可证等看起来被重置了

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | **中文** | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_最后更新: 2026-11-10_

**只有自己设置了环境变量 `CCG_HOME` 的用户才会遇到这个问题。** 如果你从未设置过，对你没有任何影响，读到这里即可。

在 v0.36.1 及更早版本中，有几类数据忽略了 `CCG_HOME`，即使你把 `CCG_HOME` 指向了别处，它们仍然留在默认文件夹 `~/.claude-code-gui` 里。从 v0.36.1 之后的版本开始，这些数据和原本就遵循 `CCG_HOME` 的提示词、项目、上传的文件一样，也遵循 `CCG_HOME`。因此插件打开 `CCG_HOME` 指向的文件夹时，找不到你以前的文件，只能从头开始。**没有任何内容被删除。** 旧文件还在默认文件夹里，按下面的方法复制过去即可解决。

## 症状

- 你以前保存过账号，但 `swttch account`(或 `ccg account`)显示没有已保存的账号
- 赞助功能是关闭的，看起来像没有许可证密钥
- 关于是否发送匿名使用数据的提问再次出现，就像你从没回答过
- 你预约的消息从列表中消失了

## 如何确认是否受影响

在启动 IDE 或插件的终端中运行下面的命令。

| 系统 | 命令 | 输出为以下情况则不受影响 |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | 为空，或与 `~/.claude-code-gui` 是同一个文件夹 |
| Windows (PowerShell) | `echo $env:CCG_HOME` | 为空，或与 `%USERPROFILE%\.claude-code-gui` 是同一个文件夹 |
| Windows (cmd) | `echo %CCG_HOME%` | 为空(未设置时 cmd 会原样输出 `%CCG_HOME%` 这几个字符)，或与 `%USERPROFILE%\.claude-code-gui` 是同一个文件夹 |

如果输出的是另一个文件夹，则说明你受到影响。

## 哪些内容改变了位置

| 文件或文件夹(在旧的默认文件夹中) | 内容 | 怎么做 |
|---|---|---|
| `accounts.json` 和 `accounts` 文件夹 | 为快速切换而保存的 Claude 账号，**包含登录信息** | 复制 |
| `license.json` | 你的赞助许可证密钥 | 复制 |
| `profile.json` | 你对匿名使用数据的回答，以及这份安装的随机标识 | 复制 |
| `scheduled-messages.json` | 你预约的消息 | 复制 |
| `workflow-agents` 文件夹 | 重新打开聊天后，已结束的工作流所显示的代理名称 | 想保留就复制 |
| `account-pool-recovery` 文件夹、`cli-registry` 文件夹、`logs/lifecycle.log`、`bin` 文件夹 | 短期笔记、正在运行的 Claude 进程列表、启动记录、下载的隧道工具 | 无需处理，会自动重新生成或重新下载 |

## 没有移动的内容

- **`settings.js`**(插件设置)特意留在默认文件夹。IDE 插件会读写同一个文件，而且它不认识 `CCG_HOME`，所以两边必须继续使用这个文件。这次变更不会重置你的设置
- **`auth-secret`**(保护聊天页面与后端之间连接的密钥)出于同样的原因也留在原处。`swttch` 命令和 IDE 插件共用它
- 你的提示词、项目、上传的文件、发送的文件和用量数字原本就遵循 `CCG_HOME`，不受影响

## 解决方法

请在更新后的版本中保存账号、输入许可证或做其他修改**之前**操作。复制会覆盖新文件夹中的内容(见"需要了解")。

### 1. 停止插件

关闭 IDE 中的插件标签页，或退出 IDE。如果你使用浏览器版本，请运行 `swttch stop`。

### 2. 把文件复制到 `CCG_HOME` 指向的文件夹

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

你本来就没有的文件(例如从未预约过消息)会被直接跳过。

### 3. 重新启动插件

已保存的账号、许可证、使用数据的回答和预约的消息都回来了。可以用 `swttch account` 查看账号列表。

### 4. 删除旧的副本(可选)

确认一切恢复后，可以删除 `~/.claude-code-gui` 中已复制的文件。仍在那里使用的 `settings.js` 和 `auth-secret` 请保留。`accounts.json`、`accounts` 文件夹和 `license.json` 里有登录信息和许可证密钥，删除的唯一理由是减少多余的副本。现在已经没有任何地方需要这些旧副本了。

## 需要了解

- **复制会覆盖。** 如果更新后你已经保存过账号、输入过许可证或回答过使用数据的提问，这些内容在新文件夹里，复制会把它们替换成旧内容。这种情况下请只复制缺少的项目。如果只丢了一个账号，也可以用 `claude` 重新登录，再运行 `swttch account save`。丢失的许可证密钥可以重新输入
- 你不需要改动 `CCG_HOME` 的设置。变化的只是读取数据的位置
- 用上面的命令(`cp -p`)复制时，文件的仅所有者可访问的权限会保留。请不要放宽 `accounts.json`、`accounts` 文件夹和 `license.json` 的权限

## 相关链接

### 本仓库中的文档

- [提示词库，提示词保存在哪里](../../features/064-prompt_library/en.md) — 说明了 `CCG_HOME` 会移动整个数据文件夹(英文)
- [附加任意类型的文件，副本保存在哪里](../../features/085-attach_any_file_type/en.md) — 上传文件的副本同样遵循 `CCG_HOME`(英文)
