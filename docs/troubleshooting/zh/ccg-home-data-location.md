# 设置了 CCG_HOME 的用户，更新后设置和已保存的账号看起来被重置了

🌐 [English](../en/ccg-home-data-location.md) | [한국어](../ko/ccg-home-data-location.md) | [日本語](../ja/ccg-home-data-location.md) | **中文** | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_最后更新: 2026-11-10_

**只有自己设置了环境变量 `CCG_HOME` 的用户才会遇到这个问题。** 如果你从未设置过，对你没有任何影响，读到这里即可。

在 v0.36.1 及更早版本中，有三类数据忽略了 `CCG_HOME`，即使你把 `CCG_HOME` 指向了别处，它们仍然留在默认文件夹 `~/.claude-code-gui` 里。从 v0.36.1 之后的版本开始，这三类数据和插件的其他数据一样遵循 `CCG_HOME`。因此插件打开 `CCG_HOME` 指向的文件夹时，找不到你以前的文件，只能从默认值开始。**没有任何内容被删除。** 旧文件还在默认文件夹里，按下面的方法复制过去即可解决。

## 症状

- 更新后，设置回到了默认值(主题、字号等)
- 你以前保存过账号，但 `swttch account`(或 `ccg account`)显示没有已保存的账号
- 其他显示已保存账号的地方也是空的

## 如何确认是否受影响

在启动 IDE 或插件的终端中运行下面的命令。

| 系统 | 命令 | 输出为以下情况则不受影响 |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | 为空，或与 `~/.claude-code-gui` 是同一个文件夹 |
| Windows (PowerShell) | `echo $env:CCG_HOME` | 为空，或与 `%USERPROFILE%\.claude-code-gui` 是同一个文件夹 |
| Windows (cmd) | `echo %CCG_HOME%` | 为空(未设置时 cmd 会原样输出 `%CCG_HOME%` 这几个字符)，或与 `%USERPROFILE%\.claude-code-gui` 是同一个文件夹 |

如果输出的是另一个文件夹，则说明你受到影响。

## 哪些内容改变了位置

| 文件或文件夹(在旧的默认文件夹中) | 内容 |
|---|---|
| `settings.js` | 插件设置 |
| `accounts.json` 和 `accounts` 文件夹 | 为快速切换而保存的 Claude 账号，**包含登录信息** |
| `cli-registry` | 正在运行的 Claude 进程的临时列表。**无需处理**，会自动重新生成 |

## 解决方法

请在更新后的版本中修改设置或保存账号**之前**操作。复制会覆盖新文件夹中的内容(见"需要了解")。

### 1. 停止插件

关闭 IDE 中的插件标签页，或退出 IDE。如果你使用浏览器版本，请运行 `swttch stop`。

### 2. 把文件复制到 `CCG_HOME` 指向的文件夹

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

对于你本来就没有的文件(例如从未保存过账号)，出现"找不到"的提示是正常的。

### 3. 重新启动插件

设置和已保存的账号都回来了。可以用 `swttch account` 查看账号列表。

### 4. 删除旧的副本(可选)

确认一切恢复后，可以删除 `~/.claude-code-gui` 中的 `settings.js`、`accounts.json` 和 `accounts` 文件夹。账号文件里有登录信息，删除的唯一理由是减少多余的副本。现在已经没有任何地方需要这些旧副本了。

## 需要了解

- **复制会覆盖。** 如果更新后你已经修改过设置或保存过账号，这些内容在新文件夹里，复制会把它们替换成旧内容。这种情况下请只复制缺少的文件。如果只丢了一个账号，也可以用 `claude` 重新登录，再运行 `swttch account save`
- 你不需要改动 `CCG_HOME` 的设置。变化的只是读取数据的位置
- 用上面的命令(`cp -p`)复制时，文件的仅所有者可访问的权限会保留。请不要放宽 `accounts.json` 和 `accounts` 文件夹的权限
- 你的提示词、项目和上传的文件从未受到影响，它们本来就遵循 `CCG_HOME`

## 相关链接

### 本仓库中的文档

- [提示词库，提示词保存在哪里](../../features/064-prompt_library/en.md) — 说明了 `CCG_HOME` 会移动整个数据文件夹(英文)
- [附加任意类型的文件，副本保存在哪里](../../features/085-attach_any_file_type/en.md) — 上传文件的副本同样遵循 `CCG_HOME`(英文)
