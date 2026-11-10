# CCG_HOME을 지정했더니 업데이트 뒤에 저장한 계정, 라이선스 등이 초기화된 것처럼 보임

🌐 [English](../en/ccg-home-data-location.md) | **한국어** | [日本語](../ja/ccg-home-data-location.md) | [中文](../zh/ccg-home-data-location.md) | [Español](../es/ccg-home-data-location.md) | [Deutsch](../de/ccg-home-data-location.md) | [Français](../fr/ccg-home-data-location.md)

_최종 업데이트: 2026-11-10_

**환경변수 `CCG_HOME`을 직접 지정해 두신 분에게만 해당합니다.** 지정한 적이 없다면 아무것도 달라지지 않으니 여기까지만 읽으셔도 됩니다.

v0.36.1 이하에서는 여러 종류의 데이터가 `CCG_HOME`을 무시하고, 다른 곳을 가리켜 두었어도 기본 폴더 `~/.claude-code-gui`에 남아 있었습니다. v0.36.1 다음 릴리즈부터는 이미 `CCG_HOME`을 따르던 프롬프트, 프로젝트, 올린 파일처럼 이 데이터도 `CCG_HOME`을 따릅니다. 그래서 플러그인이 `CCG_HOME`이 가리키는 폴더를 열어 보면 예전 파일이 없고, 처음부터 시작합니다. **지워진 것은 없습니다.** 예전 파일은 기본 폴더에 그대로 있고, 아래처럼 복사해 오면 해결됩니다.

## 증상

- 이전에 저장해 둔 계정이 있는데 `swttch account`(또는 `ccg account`)가 저장된 계정이 없다고 나옴
- 후원 기능이 꺼져 있음, 라이선스 키가 없는 것처럼 보임
- 익명 사용 데이터 전송에 대한 질문이 답한 적 없는 것처럼 다시 나타남
- 예약해 둔 메시지가 목록에서 사라짐

## 해당되는지 확인하는 방법

IDE나 플러그인을 시작하는 터미널에서 아래 명령을 실행합니다.

| 시스템 | 명령 | 이런 출력이면 해당 안 됨 |
|---|---|---|
| macOS · Linux (bash, zsh) | `echo "$CCG_HOME"` | 비어 있거나, `~/.claude-code-gui`와 같은 폴더 |
| Windows (PowerShell) | `echo $env:CCG_HOME` | 비어 있거나, `%USERPROFILE%\.claude-code-gui`와 같은 폴더 |
| Windows (cmd) | `echo %CCG_HOME%` | 비어 있음(지정하지 않았다면 cmd는 `%CCG_HOME%`라는 글자를 그대로 출력함), 또는 `%USERPROFILE%\.claude-code-gui`와 같은 폴더 |

다른 폴더가 출력되면 해당됩니다.

## 무엇이 옮겨졌나

| 파일 또는 폴더(예전 기본 폴더 안) | 담고 있는 것 | 할 일 |
|---|---|---|
| `accounts.json`과 `accounts` 폴더 | 빠른 전환용으로 저장해 둔 Claude 계정, **로그인 정보 포함** | 복사 |
| `license.json` | 후원 라이선스 키 | 복사 |
| `profile.json` | 익명 사용 데이터 전송에 대한 답, 이 설치의 무작위 식별자 | 복사 |
| `scheduled-messages.json` | 예약해 둔 메시지 | 복사 |
| `workflow-agents` 폴더 | 채팅을 다시 열었을 때 끝난 워크플로가 보여 주는 에이전트 이름 | 보존하고 싶으면 복사 |
| `account-pool-recovery` 폴더, `cli-registry` 폴더, `logs/lifecycle.log`, `bin` 폴더 | 짧게 쓰이는 메모, 실행 중인 Claude 프로세스 목록, 시작 기록, 내려받은 터널 도구 | 할 일 없음, 저절로 다시 만들어지거나 내려받아집니다 |

## 옮겨지지 않은 것

- **`settings.js`**(플러그인 설정)는 일부러 기본 폴더에 그대로 둡니다. IDE 플러그인이 같은 파일을 읽고 쓰는데 `CCG_HOME`을 모르기 때문에, 양쪽이 계속 이 파일을 써야 합니다. 이번 변경으로 설정이 초기화되지는 않습니다
- **`auth-secret`**(채팅 화면과 백엔드 사이 연결을 지키는 비밀 값)도 같은 이유로 그대로 남습니다. `swttch` 명령과 IDE 플러그인이 함께 씁니다
- 프롬프트, 프로젝트, 올린 파일, 보낸 파일, 사용량 숫자는 이미 `CCG_HOME`을 따르고 있어서 영향이 없습니다

## 해결 방법

업데이트한 버전에서 계정을 저장하거나, 라이선스를 입력하거나, 다른 것을 바꾸기 **전에** 하세요. 복사하면 새 폴더에 있던 내용이 덮어써집니다("알아 두세요" 참고).

### 1. 플러그인을 멈춥니다

IDE의 플러그인 탭을 닫거나 IDE를 종료합니다. 브라우저 버전을 쓴다면 `swttch stop`을 실행합니다.

### 2. `CCG_HOME`이 가리키는 폴더로 파일을 복사합니다

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

원래 없던 파일(예를 들어 메시지를 예약한 적이 없는 경우)은 그냥 건너뜁니다.

### 3. 플러그인을 다시 시작합니다

저장한 계정, 라이선스, 사용 데이터 답, 예약한 메시지가 돌아옵니다. `swttch account`로 계정 목록을 볼 수 있습니다.

### 4. 예전 사본을 지웁니다(선택)

모두 돌아온 것을 확인했다면 `~/.claude-code-gui`에서 복사한 파일들을 지워도 됩니다. 아직 그곳에서 쓰이는 `settings.js`와 `auth-secret`은 남겨 두세요. `accounts.json`, `accounts` 폴더, `license.json`에는 로그인 정보와 라이선스 키가 들어 있어서, 사본이 여기저기 남아 있는 것을 줄이려는 것이 지우는 유일한 이유입니다. 이제 예전 사본이 필요한 곳은 없습니다.

## 알아 두세요

- **복사는 덮어씁니다.** 업데이트한 뒤에 이미 계정을 저장했거나, 라이선스를 입력했거나, 사용 데이터 질문에 답했다면 그 내용은 새 폴더에 있고, 복사하면 예전 내용으로 바뀝니다. 그 경우에는 없는 항목만 골라서 복사하세요. 잃어버린 계정이 하나라면 `claude`로 다시 로그인한 뒤 `swttch account save`를 실행해도 됩니다. 잃어버린 라이선스 키는 다시 입력할 수 있습니다
- `CCG_HOME`을 다르게 지정할 필요는 없습니다. 바뀐 것은 데이터를 읽는 위치뿐입니다
- 위 명령(`cp -p`)으로 복사하면 파일의 소유자 전용 권한이 그대로 유지됩니다. `accounts.json`, `accounts` 폴더, `license.json`의 권한을 넓히지 마세요

## 관련 링크

### 이 저장소의 문서

- [프롬프트 라이브러리, 프롬프트가 저장되는 곳](../../features/064-prompt_library/ko.md) — `CCG_HOME`이 데이터 폴더 전체를 옮긴다고 설명합니다
- [모든 파일 형식 첨부, 사본이 저장되는 곳](../../features/085-attach_any_file_type/ko.md) — 올린 파일의 사본도 `CCG_HOME`을 따릅니다
