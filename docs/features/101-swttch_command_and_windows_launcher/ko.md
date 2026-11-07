# `swttch`: macOS, Linux, Windows에서 쓰는 터미널 명령 하나

> 이슈: [#649](https://github.com/Swttch/swttch/issues/649)

Swttch는 IDE 없이도 쓸 수 있습니다. 터미널에서 명령 하나를 실행하면 JetBrains 플러그인과 같은 화면이 같은 백엔드를 달고 브라우저에서 열립니다. 이 문서는 그 명령인 `swttch`, 운영체제별 설치 방법(이제 **WSL이나 Git 없는 Windows 포함**), 멈추기·업데이트·제거, 문제가 생겼을 때의 대처를 다룹니다.

## 달라진 점

- **새 명령 이름 `swttch`.** 이 명령은 제품의 옛 이름(Claude Code with GUI)이 남은 `ccg`였습니다. `swttch browser`가 `ccg`가 하던 일을 합니다. `ccg`도 계속 동작하지만 **deprecated**(더는 권장하지 않음)입니다. 앞으로는 `swttch browser`를 쓰세요.
- **Windows를 직접 지원합니다.** PowerShell 한 줄로 Git도 bash도 WSL도 필요 없는 런처가 설치됩니다. 전에는 Windows 사용자가 WSL이나 Git Bash를 거쳐야 했고, Git Bash에서는 `ccg stop`이 백엔드를 끄지 못했습니다.
- **README에 멈추는 법과 업데이트하는 법**이 들어갔습니다. `Ctrl+C`로 안 끝날 때의 방법도 있습니다.

## 설치

**Node.js 18 이상**(백엔드가 그 위에서 돕니다)과, 플러그인과 마찬가지로 설치하고 로그인해 둔 `claude` 명령줄 도구가 필요합니다. 설치 스크립트는 Node.js가 없으면 알려 주고 구하는 방법을 보여 주지만, 대신 설치하지는 않습니다.

**macOS, Linux, WSL, Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.ps1 | iex
```

Node.js가 없으면 설치가 끝날 때 이런 경고가 나옵니다.

```
WARNING: Node.js 18 or newer was not found on PATH (ccg needs it to run the backend).
  If you already installed it, open a new terminal so PATH is refreshed.
  Otherwise install it from https://nodejs.org/ or run: winget install OpenJS.NodeJS.LTS
```

설치한 뒤에는 **새 터미널**을 열어야 새 명령이 `PATH`에 잡힙니다.

## 시작

```bash
cd /path/to/your/project
swttch browser
```

기본 브라우저에서 `http://localhost:19836/?workingDir=<현재 폴더>`가 열립니다. 그 뒤에서 일어나는 일은 이렇습니다.

1. 19836 포트를 쓰는 것이 없으면 GitHub Releases에서 최신 런타임을 내려받고(약 25MB, 한 번만), 백엔드를 터미널에서 띄운 다음 브라우저를 엽니다.
2. JetBrains 플러그인이나 다른 `swttch browser`가 이미 그 포트에 백엔드를 띄웠다면 브라우저만 엽니다. IDE와 터미널은 백엔드 하나를 함께 씁니다.
3. 떠 있는 백엔드가 최신 릴리즈보다 낮으면 `Update now? (y/N)`라고 묻습니다. JetBrains 플러그인 자체는 이것으로 **업데이트되지 않습니다**. 그것은 JetBrains Marketplace에서 따로 합니다.
4. 다른 프로그램이 19836 포트를 쓰고 있으면 `Port 19836 is in use by another process`라며 멈추고, 그 프로그램은 건드리지 않습니다.

옵션은 `-p, --port <번호>`(다른 포트 사용)와 `-b, --bind <주소>`(다른 주소로 열기)입니다. `0.0.0.0`을 주면 같은 네트워크의 다른 기기가 접속할 수 있는데, 백엔드에는 인증이 없으니 믿을 수 있는 네트워크에서만 쓰세요.

`swttch desktop`은 Swttch 데스크탑 앱을 위해 비워 둔 명령으로, `The Swttch desktop app is not available yet.`라고만 나옵니다. `swttch`만 치면 명령 목록만 나옵니다. 브라우저 런처와 데스크탑 앱은 대등하기 때문입니다.

## 멈추기

`swttch browser`를 실행 중인 터미널에서 `Ctrl+C`를 누릅니다. 안 끝나면 다른 터미널을 열어 다음을 실행합니다.

```bash
swttch stop                  # 포트 19836의 백엔드와 그 자식 프로세스
swttch stop --all --force    # IDE가 띄운 것까지 모든 백엔드. 종료 전에 한 번 물어봅니다
swttch list                  # 먼저 무엇이 떠 있는지 보기 (PID, 포트, 누가 띄웠는지)
```

```
claude-code-gui backend processes:
● PID 13924  port 19836 ✔  [prod/standalone]
    node.exe "C:/Users/me/.claude-code-gui/runtimes/0.35.3/backend.mjs"
```

`✔`는 그 포트의 프로세스가 실제로 Swttch 백엔드로 응답한다는 뜻입니다. `swttch stop <pid>`, `--port <번호>`, `--no-tree`(그 프로세스 하나만 끄기)도 있습니다.

Windows에서는 `Ctrl+C` 뒤에 `Terminate batch job (Y/N)?`(배치 작업을 끝내시겠습니까?)가 나올 수 있습니다. 런처가 `.cmd` 파일이라 윈도우가 묻는 것이니 `Y`를 누르세요. 또 Windows에는 백그라운드 Node.js에 부드럽게 종료를 요청할 방법이 없어서, `swttch stop`은 프로세스를 바로 끝냅니다.

## 업데이트

먼저 실행 중인 것을 멈추고 다음을 실행합니다.

```bash
swttch self-update    # 명령 자체 (설치 스크립트를 다시 실행)
swttch update         # 런타임 (백엔드와 웹 화면)
```

`swttch update`는 버전 번호가 같아도 런타임을 다시 받습니다. 릴리즈가 같은 번호로 고쳐져 올라온 경우를 위해서입니다.

## 제거

```bash
swttch uninstall
```

런처, 내려받은 런타임, `PATH` 항목을 지웁니다. **사용자 데이터는 남습니다.** 계정, 설정, 라이선스는 `~/.claude-code-gui`(Windows는 `%USERPROFILE%\.claude-code-gui`)에 있고 JetBrains 플러그인과 함께 쓰는 것이라, 지우면 모든 곳에서 로그아웃됩니다. 그것까지 지우고 싶다면 그 폴더를 직접 삭제하세요.

## 환경별 한눈에 보기

| 실행하는 곳 | 설치 | 참고 |
|---|---|---|
| macOS, Linux | `curl ... \| bash` | 백엔드를 찾는 데 `lsof`를 씁니다 |
| WSL | WSL 안에서 `curl ... \| bash` | Node.js가 WSL 자신의 `PATH`에 있어야 합니다. Windows에 깐 Node.js는 소용없습니다 |
| Git Bash | `curl ... \| bash` | `swttch list`와 `stop`이 동작합니다(Windows 프로세스를 읽습니다) |
| Windows PowerShell, CMD | `irm ... \| iex` | bash 없이 도는 네이티브 런처 |

## 한계

- `swttch desktop`은 아직 없습니다.
- Windows 런처에는 아직 계정 관리(`swttch account`)가 없습니다. 그것은 macOS, Linux, WSL, Git Bash 쪽을 쓰세요.
- 설치 스크립트는 Node.js나 `claude`를 대신 설치하지 않습니다.
- Windows에서의 종료는 백엔드를 바로 끝냅니다(위 설명).

## 문제 해결

**`swttch: command not found` / `'swttch' is not recognized`.** 새 터미널을 여세요. `PATH`는 터미널이 시작될 때만 읽힙니다. Windows에서는 `swttch doctor`(또는 `ccg doctor`)가 그 폴더가 `PATH`에 있는지 알려 줍니다.

**`Node.js is not installed or not on PATH`.** Node.js 18 이상을 설치하고 새 터미널을 여세요. WSL에서는 WSL 안에 설치(또는 `nvm` 등으로 불러오기)해야 합니다.

**`Port 19836 is in use by another process`.** Swttch가 아닌 무언가가 포트를 쥐고 있습니다. `swttch stop`은 그것을 끄지 않습니다. 찾아서(`lsof -i :19836`, Windows는 `netstat -ano | findstr :19836`) 닫고 다시 `swttch browser`를 실행하거나, `swttch browser -p 20000`처럼 다른 포트를 쓰세요.

**브라우저는 열리는데 연결할 수 없다고 나옵니다.** `swttch list`를 실행해 보세요. 포트 뒤에 `✔` 대신 `?`가 있으면, 그 자리에서 듣고 있는 것이 Swttch로 응답하지 않는다는 뜻입니다.

**`swttch update`가 포트가 사용 중이라고 합니다.** 같은 규칙입니다. Swttch 백엔드만 바꾸고 다른 사람의 프로그램은 건드리지 않습니다.

**Windows가 스크립트 실행이 막혀 있다고 합니다.** 런처가 PowerShell을 자신의 정책 설정으로 실행하므로 나오지 않아야 합니다. 나온다면 정확한 메시지와 함께 이슈로 알려 주세요.
