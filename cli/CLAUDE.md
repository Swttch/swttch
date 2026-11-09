# cli/ — `ccg` Standalone Launcher

이 패키지는 JetBrains 플러그인과 **동일한 백엔드 런타임을 Standalone 모드로** 실행해주는 터미널 CLI입니다. 사용자는 `curl | bash` 한 줄로 설치한 뒤 `ccg` 명령으로 호출합니다.

> **Standalone 모드란?** IDE 외부에서 Node.js 백엔드를 spawn하고 일반 브라우저로 접속하는 실행 모드. JetBrains 모드와 같은 `backend.mjs`를 사용하지만 클라이언트가 JCEF가 아닌 브라우저. 루트 [../CLAUDE.md](../CLAUDE.md)의 "실행 모드 용어" 참조.

## 목적

- JetBrains 외부에서 **Standalone 모드**로 동일한 WebView UX 제공
- 플러그인과 분리된 별도 배포 채널 — npm 의존성 없이 **GitHub Releases만으로 완결**
- 플러그인과 standalone이 같은 머신에서 충돌 없이 공존 (같은 19836 포트 공유)

## 패키지 경계 (중요)

`cli/`는 **독립 패키지**입니다. 다음 원칙을 지킵니다:

| 원칙 | 의미 |
|------|------|
| **단방향 의존** | `cli/`는 `backend/`, `webview/`의 빌드 산출물(`backend.mjs`, `webview/dist/`)만 소비. 소스 코드는 import 안 함. |
| **런타임 독립** | `cli/` 내부 코드는 순수 Bash. Node/Python 의존 금지. (실행 대상인 backend는 당연히 node 필요) 예외: 윈도우 네이티브(PowerShell/CMD)용 런처는 bash가 없는 환경이라 `cli/win/`에 PowerShell로 따로 둔다. bash `ccg`와 같은 명령·옵션·메시지를 유지한다. |
| **빌드 독립** | `cli/run-tests.sh`만으로 cli 단위 테스트가 돌아야 함. 다른 패키지 빌드 산출물을 요구하지 않음. |
| **버전 동조** | `cli` 자체 버전은 두지 않음. 항상 GitHub Releases tag = plugin = backend = ccg. |

## 아키텍처

```
사용자 머신
├── ~/.claude-code-gui/
│   ├── bin/ccg              ← PATH에 추가됨 (디스패처만)
│   ├── commands/            ← 서브커맨드 모듈 (단일 <name>.sh 또는 <name>/index.sh)
│   ├── lib/                 ← 공유 도메인 로직 (단일 <name>.sh 또는 <name>/index.sh)
│   ├── locales/{en,ko}.sh
│   ├── uninstall.sh
│   ├── .ccg-version         ← 설치된 버전 stamp
│   └── runtimes/<ver>/      ← 런타임 캐시 (backend.mjs + webview/)
│       ├── backend.mjs
│       └── webview/
└── ~/.zshrc (or .bashrc / fish)
    └── # claude-code-gui (ccg) ↓  ... ↑  ← 멱등 마커
```

설치 후 `ccg run` 실행 시 흐름:

```
ccg run
 │
 ├─[lib/port]    GET http://127.0.0.1:19836/version
 │
 ├─ 응답 X       → [lib/runtime] 캐시 확인 → 없으면 다운로드 → [lib/spawn] → 브라우저 open
 ├─ 우리 백엔드  → [lib/version] semver 비교
 │                  ├─ latest  → "이미 실행 중" + 브라우저 open
 │                  └─ outdated → 사용자 프롬프트 → y면 kill → 새로 spawn
 └─ Foreign      → 에러 + 종료
```

## 파일 책임 분리

**모든 파일은 100줄 이하**다. 한 파일이 넘으면 `<name>/index.sh`(진입 겸 배럴) + 형제 파일로 폴더화한다. `index.sh`가 메인 함수를 정의하고 형제를 `source`한다 (React `index.tsx`/`index.ts` 정신).

### 진입 / 설치

| 파일 | 책임 | 외부 의존 |
|------|------|----------|
| `bin/ccg` | 경로 해석, lib·commands 의존순 로드, 로케일 초기화, `ccg_main` 디스패처 | lib/*, commands/* |
| `install.sh` | 사전체크, 자산 다운로드, PATH 추가 (install_util 활용) | curl, tar |
| `uninstall.sh` | 디렉토리 제거, PATH 라인 제거 (install_util 활용, fallback 인라인) | — |
| `run-tests.sh` | bats 진입점 (cli 독립 실행용) | bats-core (submodule) |
| `locales/{en,ko}.sh` | 로케일별 메시지 (en = default + fallback) | — |

### commands/ — 서브커맨드별 모듈

| 모듈 | 책임 |
|------|------|
| `commands/run/` | `cmd_run` 오케스트레이션(`index.sh`) + `decide_action` 순수 결정(`decide-action.sh`) |
| `commands/list/` | `cmd_list`·인자 파싱·도움말(`index.sh`) + 트리 렌더링(`format.sh`) |
| `commands/stop/` | `cmd_stop`(`index.sh`) + 인자 파싱(`args.sh`) + 종료 모드 분기(`modes.sh`) + 트리 kill(`kill-tree.sh`) + 확인·단일 kill(`kill.sh`) |
| `commands/doctor.sh` | `cmd_doctor` 환경 진단 |
| `commands/version.sh` | `cmd_version` + `ccg_self_version` |
| `commands/update.sh` | `cmd_update` 런타임 강제 갱신 |
| `commands/self-update.sh` | `cmd_self_update` cli 자체 갱신 |
| `commands/uninstall.sh` | `cmd_uninstall` |
| `commands/help.sh` | `cmd_help` 상위 도움말 |

### lib/ — 공유 도메인 로직 (2개 이상 command가 사용)

| 모듈 | 책임 | 외부 의존 |
|------|------|----------|
| `lib/i18n/` | `t <key> [args...]` 번역·로케일 감지 | locales/* |
| `lib/version.sh` | semver 비교, `/version` JSON 파싱, GitHub Releases latest 조회 | curl |
| `lib/port/` | 점유·우리/foreign 판별(`status`), listen PID 조회(`discover`), kill seam(`kill`), pid→port lsof(`lsof`), 트리 포트·확증(`tree`) | curl, lsof/netstat |
| `lib/proc/` | ps 스냅샷·생존 확인(`index`), command/ppid 조회(`accessors`), 자손·자식 순회(`descendants`) | ps |
| `lib/backend-detect/` | 명령 형태 판별(`predicates`), 백엔드 루트 탐색·승격(`roots`), 트리 멤버십(`membership`), prod/dev·출처 분류(`classify`) | — |
| `lib/browser.sh` | URL 인코딩, WebView URL 생성, 브라우저 열기 | open/xdg-open |
| `lib/spawn/` | 런타임 확보 후 spawn(`index`), foreground 실행·Ctrl+C 트랩(`foreground`) | node |
| `lib/runtime.sh` | tgz 다운로드, 캐시 관리, 풀기 | curl, tar |
| `lib/install_util.sh` | 셸 rc 감지, 멱등 마커로 PATH 추가/제거 | grep, awk |

**의존 그래프**: `bin/ccg` → `commands/*` → `lib/*` → 시스템 도구. lib 로드 순서: i18n → version → port → proc → backend-detect → browser → runtime → spawn. 사이클 금지.

## 명령 인터페이스

```
ccg [run]          # 기본. 포트체크 → 버전비교 → spawn(foreground) → 브라우저 open
                   #   변형: -b|--bind <addr> / -p|--port <n>
ccg list           # 백엔드+자손 프로세스 트리 표시 (PID, 실제 listen 포트, 출처/종류 라벨, /version 확증)
ccg update         # 런타임을 latest로 강제 갱신 (실행 중이면 graceful kill 후 교체)
ccg stop           # 백엔드 트리 종료 (자손 포함, SIGTERM → 3초 → SIGKILL)
                   #   변형: <pid> / --port <p> / --all / --force / --no-tree
ccg version        # 설치된 ccg / 캐시된 런타임 / 실행 중 백엔드 버전 표시
ccg doctor         # 환경 진단 (node 경로, PATH, 캐시, 포트, 백엔드 프로세스 수)
ccg self-update    # cli 자체 업데이트 (install.sh 재실행). -y/--yes: 덮어쓰기 질문 생략
ccg uninstall      # 제거
```

`run`의 두 옵션은 순수 파싱(`commands/run/args.sh` — `_parse_run_bind`/`_parse_run_port`)으로 분리되어 있고, 파싱 결과는 각각 다른 경로로 흐른다.

- **`-b|--bind <addr>`** (기본 `127.0.0.1`): 값을 `CCG_BIND` 환경변수로 backend에 전달해 listen host를 정한다(`spawn/foreground.sh`). 비-loopback 주소는 LAN 노출을 뜻하므로 ① spawn 전에 보안 경고를 출력하고 ② backend는 이 경우에만 Origin 검증을 strict same-origin(Origin host == 요청 Host 헤더)으로 완화한다(`backend/src/ws/ws-server.ts`). 기본 loopback에서는 기존 allowlist만 허용 — DNS-rebinding 차단 유지.
- **`-p|--port <n>`** (기본 `19836`): 지정 시 `CCG_PORT` 셸 변수를 덮어써 **run 전체**(port_status·`/version` 확증·graceful kill·브라우저 URL)가 그 포트를 따라가고, spawn 시 `PORT` 환경변수로 backend에 전달한다. 미지정이면 기존 `CCG_PORT`(env로 이미 주입됐을 수 있음)를 존중한다.

`list`/`stop`은 단일 19836 포트가 아니라 **`backend.mjs`(prod)·`server.ts`(dev) 프로세스 트리**를 기준으로 동작한다. dev watch 백엔드는 `pnpm dev`/`--watch` 조상을 루트로 승격해 종료해야 watch가 되살리지 못한다.

**라이프사이클**: 모든 spawn은 **foreground**. 사용자가 Ctrl+C로 종료 가능, 로그가 터미널에 그대로 흐름. `trap SIGINT SIGTERM`로 자식 정리.

## 버저닝 모델

**ccg = 런타임 = 플러그인 = GitHub Releases tag** (완전 통일).

| 출처 | 값 | 비교 기준 |
|------|----|---------| 
| 설치된 ccg | `~/.claude-code-gui/.ccg-version` 파일 | install.sh가 작성 |
| 캐시된 런타임 | `runtimes/<ver>/` 디렉토리명 | — |
| 실행 중 백엔드 | `GET /version` JSON 응답 | semver 비교 |
| 최신 | `gh api /repos/.../releases/latest` → `tag_name` | `v` 접두어 제거 후 비교 |

semver 비교는 `lib/version.sh::compare_semver a b` — 결과: `-1`/`0`/`1`.

## i18n 규칙

**코드 vs 출력 구분**:
- **코드**: 변수명, 함수명, 주석, 에러 stack — 영어 (프로젝트 공식 공용언어)
- **사용자 출력**: 모두 `t <key> [args...]` 경유 — 절대 출력 함수에 raw 문자열 박지 않음

```bash
# 잘못된 예
echo "Already running v$ver"

# 올바른 예
t running_already "$ver"
```

**로케일 감지 순서** (`lib/i18n/`::`detect_locale`):
1. `CCG_LANG` env (명시적 override)
2. `LC_ALL` → `LC_MESSAGES` → `LANG` 의 `<ko>_<KR>.UTF-8` 형식에서 앞 2글자
3. fallback: `en`

**키 네이밍**: snake_case, flat. 카테고리는 prefix로 구분 (`err_*`, `update_*`, `doctor_*`, `version_*`, `install_*`).

**fallback 정책**: 특정 로케일에 키가 없으면 → `en`에서 lookup → 그것도 없으면 `<<key>>` sentinel 출력 (개발 중 누락 감지용).

**구현 형태** (bash 3.2 호환):
```bash
# locales/en.sh
MSG_en_running_already="Already running v%s on port 19836..."

# locales/ko.sh
MSG_ko_running_already="이미 v%s가 19836 포트에서 실행 중입니다..."

# lib/i18n/ :: t()
local var="MSG_${CCG_ACTIVE_LOCALE}_${key}"
local template="${!var:-}"  # indirect expansion
printf "$template" "$@"
```

## TDD 규칙

이 패키지는 **모든 lib/*, commands/*, bin/ccg가 TDD로 개발**됩니다.

### 사이클

```
1. test/<module>.bats에 RED 테스트 작성
2. ./cli/run-tests.sh test/<module>.bats → 실패 확인
3. 해당 모듈(lib/<name> 또는 commands/<name>) 최소 구현
4. 다시 실행 → GREEN
5. 리팩토링 → GREEN 유지
```

### 테스트 작성 가이드

- 각 함수마다 ≥ 1개 happy path + ≥ 1개 edge case 테스트
- 외부 명령(`curl`, `lsof`, `node`, `tar`)은 **PATH 앞에 mock 디렉토리 inject**해서 모킹:
  ```bash
  setup() {
    export MOCK_BIN="$BATS_TEST_TMPDIR/bin"
    mkdir -p "$MOCK_BIN"
    PATH="$MOCK_BIN:$PATH"
  }
  ```
- `cli/test/helpers/`에 공통 mock 헬퍼 둠 (`mock_curl_response`, `mock_lsof`, etc.)

### 절대 금지

- **테스트 없이 lib/* 또는 commands/* 함수 추가** — bin/ccg의 orchestration 로직조차 테스트 가능한 작은 함수로 분해 필요
- **테스트가 RED 한번 거치지 않고 바로 GREEN** — 그건 테스트가 아무것도 안 검증한다는 의미

## 빌드/배포

### 자산

GitHub Releases의 각 태그에 다음 두 개를 첨부:

| 자산 | 내용 | 소비자 |
|------|------|--------|
| `claude-code-gui-standalone-v<ver>.tgz` | `backend.mjs` + `webview/` (Standalone 모드 런타임) | `ccg`가 첫 실행 시 다운로드 |
| `ccg-cli-v<ver>.tar.gz` | `cli/bin/` + `cli/commands/` + `cli/lib/` + `cli/locales/` + `cli/uninstall.sh` (test, README, CLAUDE.md 제외) | `install.sh`가 설치 시 다운로드 |

### 빌드 커맨드

```bash
./scripts/build.sh standalone-tgz   # backend + webview → claude-code-gui-standalone-v<ver>.tgz
./scripts/build.sh ccg-cli-tgz      # cli/ 패키징 → ccg-cli-v<ver>.tar.gz
./scripts/build.sh cli-test         # bats 테스트 실행
```

### 릴리즈 흐름

`/deploy` 스킬이 8단계 중 자산 첨부 단계에서 위 두 tgz를 `gh release upload`로 첨부. 기존 JetBrains 마켓플레이스 zip은 그대로.

## 알려진 제약

| 제약 | 이유 |
|------|------|
| **bash 3.2+ 호환** | macOS 기본 bash가 3.2이므로 `declare -A`(associative array) 미사용. i18n은 variable-prefix 패턴(`MSG_<lang>_<key>` + indirect expansion `${!var}`)으로 구현. |
| **node ≥ 18 필요** | backend.mjs가 ES2022 + native fetch 사용 |
| **Windows 미지원 (v1)** | bash 의존. WSL 또는 git-bash는 best-effort. PowerShell 포트는 향후 별도 작업. |
| **POSIX 도구 의존** | `curl`, `tar`, `lsof`(unix)/`netstat`(win-WSL) 존재 가정. doctor가 진단. |

## 보안 / 신뢰 모델

- 모든 다운로드는 GitHub Releases HTTPS만 신뢰. 별도 checksum 검증 없음 (결정사항).
- `install.sh`는 **rc 파일을 수정**합니다 — 멱등 마커(`# claude-code-gui (ccg) ↓ ... ↑`)로 안전하게 처리. 마커 안의 라인만 추가/제거.
- `~/.claude-code-gui/` 외 다른 경로에는 절대 쓰지 않음 (예외: rc 파일).

## JetBrains 플러그인과의 관계 (사용자 안내 필수)

ccg가 갱신하는 것은 **터미널 실행용 백엔드 런타임뿐**입니다. JetBrains IDE에 설치된 플러그인 자체는 마켓플레이스를 통해 별도로 업데이트해야 합니다. 모든 업데이트 프롬프트에 이 caution을 표시 (i18n 키: `caution_marketplace`).

플러그인과 ccg가 같은 머신에서 19836을 공유하므로, **누가 먼저 띄웠든 같은 백엔드를 본다**. `/version` 응답이 일치하면 그대로 재사용, 버전이 다르면 사용자에게 교체 여부 확인.

## 디버깅 팁

- **백엔드 stdout/stderr**: foreground 모드이므로 터미널에 그대로 흐름. 별도 로그 파일 없음.
- **i18n 누락 키**: 키 자체가 출력됨 (`>>>> running_already <<<<` 식으로 wrap하면 더 잘 보임 — `lib/i18n/`에서 처리)
- **모킹 디버깅**: bats 테스트 실행 시 `--show-output-of-passing-tests` 플래그로 stdout 확인
- **`ccg doctor`**: 첫 진단 도구. 환경 문제 대부분 여기서 잡힘.

## 미해결 / Out of Scope

- Windows native 지원 — PowerShell 포트 별도 작업
- 자동 업데이트 (백그라운드 체크) — 명시적 `ccg update` 사용자 의도 존중
- 멀티 포트 — `ccg run`은 기본 19836에 spawn하되 `-p|--port <n>`로 오버라이드할 수 있다(그 run 전체가 해당 포트로 동작). 다만 동시에 여러 인스턴스를 조율하지는 않는다. `ccg list`/`stop`은 prod 19836 외에 dev·JetBrains의 임의 포트 트리도 탐지·종료한다.
- 로그 파일 옵션 — foreground 만으로 충분. 필요시 사용자가 `ccg | tee log.txt`.
