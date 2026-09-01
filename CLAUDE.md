# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

JetBrains IDE용 Claude Code GUI 플러그인. Cursor의 Claude Code 확장과 동일한 UX를 JetBrains 환경에서 제공하는 것이 목표.

## ★ 핵심 원칙 — CLI 동등성 & 공식 지원 비의존 (최우선, 위반 금지)

이 프로젝트의 존재 이유는 **JetBrains 공식 Claude Code 플러그인이 Cursor 공식 확장보다 조잡한데 업데이트가 없어서, 우리가 직접 더 나은 것을 만든다**는 것이다. 따라서 다음을 **모든 기능 설계의 기준선**으로 삼는다. (신규 기여자·에이전트는 기능 작업 전에 반드시 숙지할 것.)

1. **CLI 동등성**: "기존 사용자가 CLI(`claude ...`)에서 할 수 있는 것은 GUI로도 할 수 있어야 한다." 기능을 설계할 때 **"이걸 CLI 사용자는 무슨 명령으로 하나?"를 먼저 묻고**, 그 공식 명령을 기준 인터페이스로 삼는다.

2. **공식 지원 비의존**: Claude의 **공식 SDK 라이브러리나 미문서화 내부 프로토콜에 의존하지 않는다.** 의존하면 "CLI에선 되는데 정책상·미출시로 GUI만 막히는" 종속이 생기고, 그 순간 이 프로젝트의 존재 이유가 무너진다. 공식 지원에 기댈 거였으면 애초에 시작할 이유가 없었다.

3. **참고 대상은 UX만 모방한다**: Cursor 등 참고 대상에서 따라야 할 것은 **화면·기능(UX)**이지, 그것을 만드는 **내부 구현 수단**이 아니다. 예: Cursor가 MCP 상태 조회에 미문서화 `control_request{subtype:"mcp_status"}` 내부 프로토콜을 쓰더라도, 우리는 그 화면을 공식 `claude mcp list` 명령으로 구현한다.

4. **우리가 직접 제어하는 통신은 우리 자산이다**: 우리가 stdin/stdout으로 claude를 직접 제어하는 것(`control_request`의 interrupt/set_model 등, `backend/src/core/claude-process.ts`)은 "공식 SDK 라이브러리 의존"이 **아니라 우리가 구현한 통신**이다. 그 완성도를 높이는 것은 옳다 — 단, 미문서화 subtype에 **의존하지 말고 보조 최적화로만 쓰며, 공식 CLI 명령 폴백을 항상 1순위로 보장**한다.

> 안정성 판단 기준: **사용자가 터미널에서 직접 쓰는 공식 명령의 출력 계약**(예: `claude mcp list`의 텍스트 출력) > **프로그램 간 미문서화 내부 프로토콜**. 후자가 더 "구조화"돼 있어 편해 보여도, 안정성과 우리 철학 양면에서 전자가 우선이다.

### 기록된 예외

원칙은 원칙이지 거부할 수 없는 법칙이 아니다. 다른 대안이 없는 특수한 경우에 한해 위반할 수 있고, 그때는 **사용자의 직접적인 판단을 득하고 그 판단의 근거를 문서로 남긴다.** 절차는 [docs/principle-exceptions/README.md](./docs/principle-exceptions/README.md)에 있다.

지금까지 기록된 예외는 다음과 같다.

- [MCP 서버 목록 조회에 미문서화 `control_request{subtype:"mcp_status"}`를 쓴다](./docs/principle-exceptions/363-mcp-status-control-request.md) — 위 2번·3번 위반. 공식 `claude mcp list` 경로를 폴백으로 항상 살려두는 조건으로 채택했다 ([#363](https://github.com/Swttch/swttch/issues/363))

## 아키텍처

3개 레이어로 구성:

1. **Node.js Backend (유일한 백엔드)** - Claude Code CLI 실행, 세션/설정/파일 I/O, WebSocket 서버
2. **WebView UI** - 채팅/세션/diff 카드 UI, Cursor UX 동일 구현 (WebSocket으로 Node.js와 통신)
3. **Bridge (환경별 어댑터)** - BrowserBridge(브라우저) / KotlinBridge(JetBrains IDE 네이티브 API)

## 구현 기준

구현 선택지가 갈릴 때는 Cursor UX를 1차 기준으로 삼음. 우선순위: Cursor UX > JetBrains 관행

## 기술 제약

- WebView는 JCEF 사용 (Swing UI 사용 금지, 권한 다이얼로그 예외)
- 에이전트 런타임은 IDE 외부 프로세스로 분리
- 이벤트 기반, 스트리밍 우선 설계

## 단일 백엔드 아키텍처

WebView는 클라이언트 실행환경에 관계없이 항상 Node.js 백엔드와 WebSocket으로 통신한다.

| 클라이언트 환경 | 부트스트랩 | 백엔드 | Bridge |
|----------------|-----------|--------|--------|
| 브라우저 | Vite dev server | Node.js WebSocket 서버 | BrowserBridge (no-op 등) |
| JetBrains IDE | Kotlin이 Node.js spawn → localhost:PORT | Node.js WebSocket 서버 | KotlinBridge (IDE API) |

**두 환경 모두 실제 제품이 동작하는 환경이다.** 브라우저 환경은 개발 전용이 아니며, 독립 배포 대상이다.

### 실행 모드 용어

| 용어 | 의미 |
|------|------|
| **JetBrains 모드** | IDE가 Node.js 백엔드를 spawn하고 JCEF WebView로 접속. `JETBRAINS_MODE=true` 환경변수로 활성화. |
| **Standalone 모드** | IDE 외부에서 Node.js 백엔드를 실행하고 일반 브라우저로 접속. `JETBRAINS_MODE` 미설정 시 자동 적용. 부트스트랩 경로 2가지: ① 개발용 Vite dev server, ② 사용자 머신의 `ccg` 명령(터미널 런처). |

배포 산출물 이름도 이 용어를 따른다 — `claude-code-gui-standalone-v<ver>.tgz`는 standalone 모드용 backend + webview 런타임. JetBrains 모드 산출물은 마켓플레이스 zip(`swttch-<ver>.zip`, `settings.gradle.kts`의 `rootProject.name`에서 파생).

> **standalone tgz 파일명은 바꾸지 말 것.** `claude-code-gui-standalone-v<ver>.tgz`는 `scripts/build.sh`가 만들고 `cli/lib/runtime.sh`가 릴리즈에서 같은 이름으로 내려받는다. 이미 사용자 머신에 설치된 `ccg`가 이 이름을 하드코딩해 들고 있으므로, 이름을 바꾸면 기존 사용자의 런타임 다운로드가 깨진다.

### 핵심 원칙

- **유일한 백엔드는 Node.js**: 비즈니스 로직(세션, 설정, Claude CLI, 파일 I/O)은 모두 Node.js에서 처리
- **Bridge는 ORM 어댑터**: 환경별로 반드시 달라야 하는 기능(에디터 탭, diff viewer 등)만 Bridge 인터페이스로 추상화
- **Kotlin은 Node.js 뒤에 있는 구현체**: WebView는 Kotlin과 직접 통신하지 않음. Node.js가 IDE 네이티브 기능이 필요할 때 Bridge(Kotlin)를 호출

### ★ Bridge는 환경↔백엔드의 유일한 양방향 경로 (위반 금지)

Bridge는 실행 환경과 Node 백엔드 사이를 **양쪽 포맷을 노멀라이즈해 중개**하는 장치다. MCP가 그렇듯, 양측은 서로를 직접 알지 못하고 오직 Bridge를 통해서만 대화한다.

**방향은 Bridge의 정의에 들어가지 않는다. 들어오는 것도 나가는 것도 전부 Bridge를 지난다.**

| 방향 | 규칙 |
|------|------|
| 환경 → 백엔드 | 환경(제트브레인 등)이 백엔드에 무언가를 전달하는 **유일한 경로는 Bridge**다 |
| 백엔드 → 환경 | 백엔드가 환경을 제어하는 **유일한 방법은 Bridge**다 |

#### 모든 Bridge는 동일한 기능을 구현한다

`Bridge` 인터페이스에 선언된 기능은 **모든 구현체가 빠짐없이 달성**해야 한다. `BrowserBridge`가 "IDE가 없으니 우린 못 한다"로 빠지는 것은 원칙 위반이다. 그 환경에서 그 기능을 **어떤 수단으로 달성할지**를 찾는 것이 Bridge 구현의 일이다.

- 제트브레인: IDE가 이미 아는 것(VFS 이벤트 등)을 **받아서 번역·전달**한다
- 터미널(standalone): 중개할 호스트가 없으므로 **그 환경에서 가능한 수단으로 직접 달성**한다

두 번째를 "Bridge가 스스로 일한다"고 오해하지 말 것. 같은 계약을 각 환경의 방식으로 이행하는 것이며, 이것이 백엔드가 **어느 환경에 붙어 있는지 몰라도 되게** 만드는 장치다.

> **이 원칙이 만들어진 배경**: #359에서 파일 변경 감지를 제트브레인 경로에만 직접 배선하고 Bridge 인터페이스에 올리지 않았다. 그 결과 **standalone 사용자에게는 기능이 통째로 없었고**, 브라우저에서 검수하기 전까지 아무도 몰랐다. 인터페이스에 올렸다면 `BrowserBridge`가 구현하지 않은 채로 넘어갈 수 없었다 — 인터페이스는 빠진 자리를 드러내주는 장치인데 그것을 쓰지 않은 것이다.

**진짜 no-op만 no-op으로 둔다.** "에디터 탭 열기"처럼 그 개념 자체가 IDE 안에만 존재하는 것은 브라우저에서 no-op이 맞다. 반면 "파일이 바뀐 걸 안다"처럼 **어느 환경에서나 의미가 성립하는 기능은 no-op으로 둘 수 없다.** 판별 질문: *"이 기능이 없으면 그 환경 사용자가 손해를 보는가?"* 그렇다면 no-op이 아니라 미구현이다.

### 코드 중복 금지

Node.js가 유일한 백엔드이므로, 비즈니스 로직의 듀얼 구현이 불필요하다. Kotlin에 비즈니스 로직을 구현하지 않는다.

## 원본 데이터 보존 원칙

Claude Code CLI가 생성하는 원본 자료구조(JSONL 엔트리, 세션 메타데이터 등)는 **각 엔트리의 구조를 편집 없이 WebView 끝단까지 유지**해야 한다.

> **이 원칙이 만들어진 배경**: 백엔드가 "지금 UI엔 이만큼만 필요하니까"라며 Claude Code가 스트리밍해주는 쓸만한 필드들을 골라내 **필요한 만큼만 편집해 전달하는 경향이 반복**되었다. 그 결과 나중에 원본 구조를 다시 파악하고 신뢰하는 데 비용이 들었다. 따라서 이 원칙의 핵심은 **"데이터 구조를 백엔드에서 편집하지 말고 프론트로 그대로 보내라"**이다. 강제성을 가지고 앞으로도 유지한다.

### 규칙

1. **키/값 리네이밍 금지**: 원본 필드명을 중간 계층에서 다른 이름으로 바꾸지 않는다. (예: `title` → ~~`firstPrompt`~~, `createdAt` → ~~`created`~~)
2. **엔트리 구조 편집 금지**: 중간 전달 계층(Node.js 백엔드)이 개별 엔트리의 구조를 편집하거나 필드를 골라내 누락시키지 않는다. "지금 필요 없으니까"라는 이유로 원본에서 일부 필드만 추려 보내는 편집이 이 원칙이 겨냥하는 대상이다.
3. **정보 손실 금지**: 현재 UI에서 쓰지 않는 필드라도 전달 경로에서 제거하지 않는다. 향후 활용 가능성을 보존한다.
4. **데이터 형변환은 허용**: 언어 간 타입 매핑(예: JSON → Kotlin data class → JSON)은 허용하되, 이 과정에서 키 이름이나 구조가 변하면 안 된다.

### 범위 분할(페이지네이션·뷰) 예외

성능을 위해 데이터를 **한 번에 다 보내지 않고 범위를 나눠 전달(페이지네이션)하거나, 현재 대화 체인만 추려 전달(active-chain 필터)**하는 것은 허용한다. 이 원칙이 금지하는 것은 *구조의 편집·왜곡*이지 *양(범위)의 분할*이 아니기 때문이다. 단, 아래를 모두 만족해야 한다.

1. **엔트리 단위 구조는 그대로**: 나눠 보내더라도 전달되는 각 엔트리는 원본 구조를 편집 없이 유지한다(위 규칙 1~4는 개별 엔트리에 그대로 적용된다). 범위를 자르는 것과 엔트리 속을 편집하는 것은 다르다.
2. **누락 없는 완전 접근 보장**: 부분 전달은 "지금 안 보낸다"이지 "영원히 못 본다"가 아니다. 프론트가 요청하면 나머지 범위를 누락 없이 받을 수 있어야 한다(예: "이전 메시지 더 보기"로 전체 히스토리에 도달 가능, 페이지네이션 오프 시 전체 로드).
3. **판단 기준**: "구조는 그대로 두되, 누락 없이 접근 가능하게 충분히 전달"이면 타협은 정당하다. 반대로 "이 필드/엔트리는 안 쓰니 아예 구조에서 빼서 보낸다"는 여전히 위반이다.

### 이유

- 프로젝트가 아직 Claude Code의 원본 데이터를 전부 활용하지 못하고 있다. 중간 계층이 정보를 편집하면, 나중에 원본 구조를 다시 파악하는 데 불필요한 비용이 든다.
- **어느 계층에서든 데이터를 보면 "Claude Code 원본이 어떻게 생겼는지"를 알 수 있어야 하고, 그 내용을 신뢰할 수 있어야 한다.**

### 적용 범위

| 계층 | 역할 | 해도 되는 것 | 하면 안 되는 것 |
|------|------|-------------|---------------|
| Node.js 백엔드 (dev-bridge) | 원본 전달 | 타입 변환, 직렬화, 범위 분할(페이지네이션)·현재 대화 뷰 추림 — 단 엔트리 구조 보존 + 완전 접근 보장 | 필드 리네이밍, 엔트리 구조 편집, 접근 불가능한 누락 |
| WebView (React) | 최종 소비 | 필터링, 정렬, 표시용 가공 | — |

## 일관된 작명 원칙 (Consistent Naming)

같은 목적과 같은 행동을 가리키는 이름은, 계층과 언어에 관계없이 **동일한 단어**를 일관되게 사용한다.

### 규칙

1. **하나의 행동에는 하나의 단어.** 메서드명, IPC 메시지 타입, 변수명, RPC 핸들러명 등 모든 곳에서 같은 동작이면 같은 verb를 쓴다. 파이프라인을 따라가며 읽을 때 단어가 바뀌면 다른 동작으로 오해한다. (예: ~~`create()` → `NEW_SESSION`~~ → `create()` → `CREATE_SESSION`)
2. **다른 행동에는 다른 단어.** "현재 탭에서 세션 초기화"와 "새 에디터 탭 열기"처럼 의미가 다른 동작이 같은 이름을 공유하면 안 된다.
3. **verb는 명확한 동사를 사용한다.** CRUD 동사(`create`, `get`, `update`, `delete`) 또는 명확한 행위 동사(`load`, `clear`, `open`, `stop`)를 쓴다. `new`, `change` 같은 모호한 단어는 피한다.

### IPC 메시지 타입은 `MessageType` enum으로 (단일 소스)

webview↔backend(및 Node↔Kotlin) 사이를 오가는 모든 IPC 메시지 `type`은 plain 문자열 리터럴 대신 `MessageType` enum을 사용한다.

- **정의 위치**: `webview/src/shared/message-type.ts` ↔ `backend/src/shared/message-type.ts` (미러 디렉토리, 1:1 동기화 필수 — `shared/CLAUDE.md` 참조). webview는 `@/shared`, backend는 `../shared`(경로 깊이에 맞게)에서 import.
- **멤버명 = 문자열 값**: `MessageType.GET_ACCOUNT === 'GET_ACCOUNT'`. 와이어 포맷과 코드가 동일하게 읽히고 grep된다. 이것이 위 "하나의 행동에는 하나의 단어" 원칙을 IPC 경계에서 강제하는 장치다.
- **금지**: `send('GET_ACCOUNT')` 같은 plain 문자열. 반드시 `send(MessageType.GET_ACCOUNT)`.
- **새 메시지 타입 추가 시**: enum에 멤버를 추가하고 **각 값의 의미를 영어 주석**으로 남긴다(방향: inbound webview→backend / outbound backend→webview / Node↔Kotlin / 로깅 채널). 양쪽 shared에 동일 반영.
- **적용 범위**: `bridge.request`/`send`/`subscribe`/`waitFor`, backend 라우팅 `switch...case`, `connections.sendTo`/`broadcast`, JSON-RPC `method`, 로깅 채널(`LOG_BATCH`) 등 메시지 `type`이 쓰이는 모든 곳. 단, 메시지 봉투(`type`)가 아닌 `payload` 내부 하위 분류(예: CLI_EVENT payload의 `CLI_ERROR`)는 대상이 아니다.

## 사용자 데이터 디렉토리 (`~/.claude-code-gui`) — 개명 금지

사용자 데이터는 `~/.claude-code-gui`(환경변수 `CCG_HOME`으로 재정의 가능)에 저장된다. 제품이 **Swttch로 리브랜딩된 뒤에도 이 경로는 그대로 유지한다.**

여기에는 계정 자격증명(`accounts.json`, `accounts/`, 권한 `600`), 전역 설정(`settings.js`), 후원 라이선스, 예약 메시지, CLI 프로세스 레지스트리, cloudflared 설치본(`bin/`)이 들어있다. **우리 파일이 아니라 사용자 자산이다.**

- 리브랜딩을 이유로 `~/.swttch` 등으로 옮기지 않는다. 경로가 바뀌면 전 사용자가 로그인·설정·후원 라이선스를 잃는다.
- 숨김 디렉토리라 사용자 눈에 띄지 않으므로, 이름을 통일해서 얻는 이득이 없다. "여기가 어디지?" 하는 혼란은 README·마켓플레이스 문서에서 해소한다.
- 언젠가 옮겨야 한다면 리브랜딩 작업에 섞지 말고 **별도 PR**로 다룬다. 그때도 이동이 아니라 **복사 후 양쪽 병행 읽기**로 시작하고, 구 경로 폴백을 여러 버전에 걸쳐 유지하며, 마이그레이션 실패 시 조용히 구 경로로 계속 동작해야 한다.
- `CCG_HOME`은 `cli/install.sh`에 공개 문서화된 계약이다. 이미 커스텀 경로를 쓰는 사용자가 있을 수 있다.

같은 이유로 **`ccg` 명령어 이름과 `CCG_*` 환경변수 29종도 개명하지 않는다.** `ccg`는 사용자가 직접 타이핑하고 PATH에 등록해 쓰는 이름이라, 바꾸면 이미 설치된 사용자의 명령이 사라진다. `CCG_*`도 공개된 계약이므로 리브랜딩을 이유로 건드리지 않는다.

## 상태 머신

Idle → Streaming → Waiting Permission → Has Diff → Error

## UI 용어 정의

| 용어 | 설명 |
|------|------|
| **상단바** | 채팅 화면 상단의 새 탭 버튼과 세션 드롭다운 토글 버튼을 포함하는 영역 요소 |
| **세션 드롭다운 토글 버튼** | 상단바 좌측에 현재 세션의 제목을 표시하는 드롭다운 토글 버튼 |
| **세션 드롭다운** | 세션 드롭다운 토글 버튼을 클릭해 열리는 드롭다운 메뉴 |
| **새 탭 버튼** | 상단바 우측에 있는 플러스 버튼. 클릭 시 IDE에서 새로운 Claude Code 에디터 탭을 열음 |
| **초기화된 세션** | 아직 첫 번째 메시지도 시작하지 않아서 세션이 생성되지 않은 상태 |
| **인풋배너** | 채팅 인풋 바로 위에 뜨는 안내 줄(범용 컴포넌트 `InputBanner`). 화면 최상단의 상단배너(`BannerArea`)와 구분된다. 좌측 문구 + 우측 액션 + 가장 우측 X 닫기로 구성. 텔레메트리 동의 안내 등에 재사용 |

## 빌드 명령어

모든 빌드는 `bash ./scripts/build.sh <command>` 를 통해 실행한다. 직접 `cd`, `pnpm`, `./gradlew` 명령을 조합하지 않는다.

> **중요**: `bash ./scripts/build.sh -h` 로 전체 명령 목록을 확인할 수 있다.

### 주요 명령

| 명령 | 용도 |
|------|------|
| `bash ./scripts/build.sh be-build` | 백엔드 빌드 |
| `bash ./scripts/build.sh wv-build` | 웹뷰 빌드 |
| `bash ./scripts/build.sh build` | 플러그인 빌드 |
| `bash ./scripts/build.sh full-build` | 전체 빌드 (be + wv + plugin) |
| `bash ./scripts/build.sh dist` | 배포용 빌드 (be + wv + buildPlugin) |
| `bash ./scripts/build.sh run-ide` | IDE 테스트 실행 |
| `bash ./scripts/build.sh clear-cache` | 빌드 캐시/결과물 초기화 |
| `bash ./scripts/build.sh wv-lint` | WebView TypeScript 체크 |
| `bash ./scripts/build.sh wv-test` | WebView 테스트 |
| `bash ./scripts/build.sh all` | 전체 빌드 + IDE 실행 |

### 에이전트 행동 지침

1. **빌드/테스트 시**: 반드시 `bash ./scripts/build.sh` 사용
2. **cd 금지**: 스크립트가 내부적으로 `pnpm -C`, `gradlew -p` 로 경로 처리
3. **새 명령 필요 시**: `scripts/build.sh`에 case 추가 제안
4. **모든 셸 명령어는 `bash` 를 앞에 붙여서 실행**: 예) `bash ./scripts/build.sh build`, `bash -c "ls -la"` 등

## 로컬 스킬

프로젝트 로컬 스킬은 `.claude/skills/` 에 위치한다. oh-my-claudecode 스킬이 아닌 **프로젝트 로컬 스킬**을 우선 사용한다.

> **구조 규칙**: 각 스킬은 반드시 `.claude/skills/<이름>/SKILL.md` 형태(폴더 + SKILL.md)여야 하며, SKILL.md 상단에 `name`·`description` YAML frontmatter가 있어야 자연어 요청 시 자동 트리거된다. 평면 `.claude/skills/<이름>.md` 파일은 Claude Code가 스킬로 인식하지 못한다.

| 스킬 | 파일 경로 | 트리거 키워드 |
|------|-----------|--------------|
| `/cc-gui-reporter` | `.claude/skills/cc-gui-reporter/SKILL.md` | "마켓플레이스 확인", "리뷰/댓글/대댓글 확인", "미응답", "미해결 버그", "현황", "리포트", "report", "triage" |
| `/deploy` | `.claude/skills/deploy/SKILL.md` | "배포", "deploy", "릴리즈", "release", "publish", "마켓플레이스 발행" |
| `/build` | `.claude/skills/build/SKILL.md` | "빌드", "build", "컴파일", "compile" |
| `/precheck` | `.claude/skills/precheck/SKILL.md` | "프리체크", "precheck", "배포 전 검수" |
| `/release-monitor` | `.claude/skills/release-monitor/SKILL.md` | "릴리즈 모니터링", "release-monitor", "마켓플레이스 모니터링", "approval 확인" |

`/cc-gui-reporter`의 데이터 수집은 `./ignore/cc-gui-report.sh` 가 담당한다 (사용자가 직접 실행 가능, 읽기 전용. git 비추적 — `ignore/` 폴더).

## JetBrains SDK API 사용 주의사항

JetBrains Marketplace 배포 시 **Plugin Verifier**가 API 사용을 자동 검증한다.

- **Deprecated API** 사용 → 경고(warning)
- **Internal API** 사용 → 오류(error), 배포 거부 가능
- `EnvironmentUtil` 등 internal/deprecated 가능성이 있는 클래스 주의
- `@ApiStatus.Internal`, `impl` 패키지 내 클래스는 절대 사용 금지
- 배포 전 `bash ./scripts/build.sh dist`로 빌드 후 Plugin Verifier 결과 반드시 확인

## JetBrains Marketplace 승인 가이드라인 (v1.3, 2026-03-31)

배포 시 아래 기준을 모두 충족해야 한다. 위반 시 승인 지연 또는 거부될 수 있다.

### 1. 플러그인 콘텐츠

| 항목 | 요구사항 |
|------|---------|
| **로고** | 기본 IntelliJ 템플릿 로고 사용 금지. JetBrains 제품 로고와 유사 금지. **40x40px SVG** 필수 |
| **이름** | 고유해야 함. 최대 30자. Latin 문자/숫자/기호만 허용. "Plugin", "IntelliJ", "JetBrains" 등 JetBrains 제품명 포함 금지. "A"나 "."로 시작하여 검색 순위 조작 금지. "Support", "Integration" 단독 사용 지양 |
| **벤더** | 벤더 웹사이트와 이메일이 유효해야 함. 사칭/허위 표시 금지 |
| **설명** | 영어 필수(1차 언어). 올바른 포맷/맞춤법/문법. 미디어 정상 표시 필수 |
| **변경 노트** | 플레이스홀더 텍스트("Add change notes here") 금지. 관련 정보만 포함 |
| **링크** | 모든 외부 링크 유효 필수. 플러그인/저자와 관련된 링크만 허용 |
| **자산** | JetBrains 브랜드 자산 침해 금지. 저작권/상표권 침해 금지 |

### 2. 플러그인 기능

| 항목 | 요구사항 |
|------|---------|
| **호환성** | 최소 1개 JetBrains 제품과 호환. 정의된 호환 제품/버전에서 설치 가능해야 함 |
| **Plugin Verifier** | 업로드마다 바이너리 호환성 검증 필수. **Internal API 사용 위반 금지** |
| **보안** | 보안 취약점이나 개인정보 문제 없어야 함 |
| **성능** | JetBrains 제품 성능에 심각한 악영향 금지 |
| **간섭 금지** | JetBrains 제품 기능(라이선싱, 구독, 트라이얼, 업그레이드 플로우 포함) 수정/숨김/가로채기/간섭 금지 |
| **데이터 수집** | 개인/통계/텔레메트리 데이터 처리 시 **명시적 사용자 동의 필수**. 플러그인 비활성 시 데이터 전송 금지 |
| **검색 조작 금지** | 메타데이터/마케팅 자산으로 검색 결과 조작이나 Marketplace 기능 방해 금지 |

### 3. 법적 요구사항

- Developer Agreement 동의 필수
- 모든 플러그인에 Developer EULA 필수
- 오픈소스 라이선스 플러그인은 **소스 코드 링크 필수**
- 개인정보 수집 시 **Privacy Policy 필수**
- EEA 소비자 보호법 관련 trader/non-trader 지위 선언 필수

### 에이전트 체크리스트 (배포 전 확인)

배포(`/deploy`) 실행 전 아래 항목을 점검한다:

- [ ] 로고: 40x40px SVG, JetBrains 로고와 비유사
- [ ] 이름: 30자 이내, JetBrains 제품명 미포함
- [ ] 설명: 영어 우선, 깨진 링크/이미지 없음
- [ ] 변경 노트: 플레이스홀더 아닌 실제 변경사항 기재
- [ ] 모든 외부 링크 유효
- [ ] Plugin Verifier 통과 (Internal API 위반 0건)
- [ ] 개인정보 수집 시 Privacy Policy 링크 존재
- [ ] 소스 코드 링크 존재 (오픈소스)

## 로깅 시스템

[logging.md](./logging.md) 참조.

## 작업 플랜

작업을 시작하기 전에 `ignore/plan.md`를 반드시 읽고, 에이전트 지시문을 따를 것. 대화 중 "플랜 파일"이라 하면 이 파일을 의미한다. 사용자가 다음 작업을 물어본다면 이 플랜 파일을 기반으로 먼저 답변할 것.
