# CCG_HOME을 지정했더니 업데이트 뒤에 설정과 저장한 계정이 초기화된 것처럼 보임

🌐 [English](../en/ccg-home-data-location.md) | **한국어** | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_최종 업데이트: 2026-11-10_

**환경변수 `CCG_HOME`을 직접 지정해 두신 분에게만 해당합니다.** 지정한 적이 없다면 아무것도 달라지지 않으니 여기까지만 읽으셔도 됩니다.

v0.36.1 이하에서는 세 종류의 데이터가 `CCG_HOME`을 무시하고, 다른 곳을 가리켜 두었어도 기본 폴더 `~/.claude-code-gui`에 남아 있었습니다. v0.36.1 다음 릴리즈부터는 플러그인의 다른 데이터처럼 이 세 종류도 `CCG_HOME`을 따릅니다. 그래서 플러그인이 `CCG_HOME`이 가리키는 폴더를 열어 보면 예전 파일이 없고, 기본값으로 시작합니다. **지워진 것은 없습니다.** 예전 파일은 기본 폴더에 그대로 있고, 아래처럼 복사해 오면 해결됩니다.

## 증상

- 업데이트한 뒤에 설정이 기본값으로 돌아가 있음(테마, 글자 크기 등)
- 이전에 저장해 둔 계정이 있는데 `swttch account`(또는 `ccg account`)가 저장된 계정이 없다고 나옴
- 저장한 계정을 보여 주는 다른 곳도 비어 있음

## 해당되는지 확인하는 방법

IDE나 플러그인을 시작하는 터미널에서 아래 명령을 실행합니다.

| 시스템 | 명령 | 이런 출력이면 해당 안 됨 |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | 비어 있거나, `~/.claude-code-gui`와 같은 폴더 |
| Windows (PowerShell) | `echo $env:CCG_HOME` | 비어 있거나, `%USERPROFILE%\.claude-code-gui`와 같은 폴더 |
| Windows (cmd) | `echo %CCG_HOME%` | 비어 있음(지정하지 않았다면 cmd는 `%CCG_HOME%`라는 글자를 그대로 출력함), 또는 `%USERPROFILE%\.claude-code-gui`와 같은 폴더 |

다른 폴더가 출력되면 해당됩니다.

## 무엇이 옮겨졌나

| 파일 또는 폴더(예전 기본 폴더 안) | 담고 있는 것 |
|---|---|
| `settings.js` | 플러그인 설정 |
| `accounts.json`과 `accounts` 폴더 | 빠른 전환용으로 저장해 둔 Claude 계정, **로그인 정보 포함** |
| `cli-registry` | 실행 중인 Claude 프로세스의 짧게 쓰이는 목록. **할 일 없음**, 저절로 다시 만들어집니다 |

## 해결 방법

업데이트한 버전에서 설정을 바꾸거나 계정을 저장하기 **전에** 하세요. 복사하면 새 폴더에 있던 내용이 덮어써집니다("알아 두세요" 참고).

### 1. 플러그인을 멈춥니다

IDE의 플러그인 탭을 닫거나 IDE를 종료합니다. 브라우저 버전을 쓴다면 `swttch stop`을 실행합니다.

### 2. `CCG_HOME`이 가리키는 폴더로 파일을 복사합니다

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

원래 없던 파일(예를 들어 계정을 저장한 적이 없는 경우)에 대해 "찾을 수 없다"는 메시지가 나와도 괜찮습니다.

### 3. 플러그인을 다시 시작합니다

설정과 저장한 계정이 돌아옵니다. `swttch account`로 계정 목록을 볼 수 있습니다.

### 4. 예전 사본을 지웁니다(선택)

모두 돌아온 것을 확인했다면 `~/.claude-code-gui`의 `settings.js`, `accounts.json`, `accounts` 폴더를 지워도 됩니다. 계정 파일에는 로그인 정보가 들어 있어서, 사본이 여기저기 남아 있는 것을 줄이려는 것이 지우는 유일한 이유입니다. 이제 예전 사본이 필요한 곳은 없습니다.

## 알아 두세요

- **복사는 덮어씁니다.** 업데이트한 뒤에 이미 설정을 바꾸었거나 계정을 저장했다면 그 내용은 새 폴더에 있고, 복사하면 예전 내용으로 바뀝니다. 그 경우에는 없는 파일만 골라서 복사하세요. 잃어버린 계정이 하나라면 `claude`로 다시 로그인한 뒤 `swttch account save`를 실행해도 됩니다
- `CCG_HOME`을 다르게 지정할 필요는 없습니다. 바뀐 것은 데이터를 읽는 위치뿐입니다
- 위 명령(`cp -p`)으로 복사하면 파일의 소유자 전용 권한이 그대로 유지됩니다. `accounts.json`과 `accounts` 폴더의 권한을 넓히지 마세요
- 프롬프트, 프로젝트, 올린 파일은 영향이 없었습니다. 이미 `CCG_HOME`을 따르고 있었습니다

## 관련 링크

### 이 저장소의 문서

- [프롬프트 라이브러리, 프롬프트가 저장되는 곳](../../features/064-prompt_library/ko.md) — `CCG_HOME`이 데이터 폴더 전체를 옮긴다고 설명합니다
- [모든 파일 형식 첨부, 사본이 저장되는 곳](../../features/085-attach_any_file_type/ko.md) — 올린 파일의 사본도 `CCG_HOME`을 따릅니다
