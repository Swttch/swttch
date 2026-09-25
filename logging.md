# 로깅 시스템

백엔드와 WebView의 모든 `console.*` 출력을 파일에 기록한다.

## 구조

| 구성 요소 | 파일 | 역할 |
|----------|------|------|
| `FileLogger` | `backend/src/logging/file-logger.ts` | 파일 쓰기, 로테이션(50MB), 용량 관리(512MB / 40개) |
| `log-level` | `backend/src/logging/log-level.ts` | 기록할 레벨 판정. `CCG_LOG_LEVEL`로 조정 |
| `LogWebSocketServer` | `backend/src/logging/log-ws.ts` | `/logs` 전용 WebSocket, WebView 로그 수신 |
| `Logger` | `backend/src/logging/logger.ts` | 파사드. console 인터셉트 + 레벨 필터 + FileLogger + LogWS 통합 |
| `LogForwarder` | `webview/src/api/logging/LogForwarder.ts` | WebView console.* 캡처 → 레벨 필터 → 백엔드 배치 전송 |

## 로그 파일 위치

`CCG_HOME`이 설정돼 있으면 `$CCG_HOME/logs/`, 없으면 아래 경로다.

```
~/.claude-code-gui/logs/
  server-84213.log                       ← 활성 로그 (파일명의 숫자는 백엔드 프로세스의 pid)
  server-84213-20260313T153000123Z.log.gz ← 아카이브 (gzip 압축됨)
```

### 프로세스마다 파일이 하나씩인 이유

한 머신에서 백엔드가 여럿 돈다. `ccg` standalone 런타임, 워크트리 dev 서버, JetBrains 플러그인이 spawn한 백엔드가 **전부 같은 로그 디렉토리**를 쓴다.

예전에는 셋이 `server.log` 하나에 함께 append했고, 그래서 두 가지가 깨졌다 ([#477](https://github.com/Swttch/swttch/issues/477)).

1. **크기 상한이 안 지켜졌다.** `currentSize`는 각 프로세스의 메모리에만 있어서 남이 쓴 양을 모른다. 셋이 30MB씩 쓰면 파일은 90MB인데 아무도 50MB를 넘겼다고 판단하지 않는다.
2. **아카이브가 무한히 커졌다.** 로테이션은 남들이 열어둔 파일의 이름을 바꾼다. 남의 파일 핸들은 rename을 따라가므로 그 프로세스들은 계속 **아카이브**에 append하는데, 아카이브는 로테이션 대상이 아니라 상한이 없다. 실제로 50MB 상한 아래에서 148MB 파일이 관측됐다.

파일명에 pid를 넣으면 둘 다 사라진다. 각자 자기 파일만 쓰므로 자기 바이트 수가 곧 진실이고, rename이 남의 파일을 건드리지 않는다.

## 로그 형식

```
{ISO timestamp} {LEVEL} [{source}][{sessionId?}] {message}
```

예시:
```
2026-03-13T14:30:22.123Z ERROR [node-backend] WebSocket server listening on port 3456
2026-03-13T14:31:00.345Z LOG [webview][abc123] SessionDropdown rendered
```

## WebSocket 채널

| 경로 | 용도 |
|------|------|
| `/ws` | 채팅/스트리밍 (기존) |
| `/logs` | 로그 전용 (WebView → 백엔드 로그 전송 + 실시간 로그 브로드캐스트) |

## 규칙

- **회전과 압축은 직접 만들지 않는다**: `rotating-file-stream`(스스로를 "a logrotate alternative"라 소개한다, 의존성 0개, MIT)에 맡긴다. 아래에 이유가 있다.

### 회전은 왜 남의 것을 쓰나

크기를 지켜보다 이름을 바꾸고, 새 파일을 열고, 그 사이 들어온 줄을 흘리지 않고, 다 된 것을 gzip하는 일은 **이미 풀린 문제이고 이 제품에 고유한 구석이 하나도 없다.**

직접 만들었던 대가를 [#477](https://github.com/Swttch/swttch/issues/477)에서 치렀다. 회전 중 버퍼에 쌓인 줄을 새 파일에 그대로 쏟아부어서, 갓 열린 파일이 이미 상한을 넘은 채 남고 다시 회전을 걸어줄 것이 없었다. 순수하게 회전 로직 내부의 버그였고, 라이브러리였다면 애초에 없었을 종류다.

### 그래도 우리 몫으로 남는 것

라이브러리가 알 수 없는 것들이라 넘길 수 없다.

| 우리가 하는 것 | 왜 라이브러리가 못 하나 |
|---|---|
| 파일명에 pid를 넣는 것 | 백엔드가 한 머신에서 여러 개 돈다는 건 우리 배포 구조의 사실이지 스트림의 문제가 아니다 |
| `CCG_HOME` 해석 | 우리 제품의 계약이다 |
| 디렉토리 전체 정리 | 라이브러리의 `maxFiles`/`maxSize`는 **자기가 만든 파일만** 센다. 다른 프로세스가 남긴 것, 구버전이 남긴 것은 안 본다. 그래서 그 두 옵션은 **일부러 쓰지 않는다** |
| 백엔드 시작 시 정리 | 위와 같다 |
| 아카이브 확장자 `.gz` | 라이브러리는 generator가 준 이름을 그대로 쓰고 `.gz`를 붙이지 않는다. **이름과 내용이 어긋나면 사용자가 열 수 없는 파일이 되므로** 테스트가 gzip 매직 넘버까지 확인한다 |

### `logrotate` 자체는 왜 안 쓰나

명령줄 도구 쪽은 셋 다 막혀 있다. **다시 검토하기 전에 이 셋이 해결됐는지부터 보면 된다.**

1. **권한이 없다.** `logrotate`와 macOS의 `newsyslog` 모두 설정이 root 소유 경로(`/etc/logrotate.d`, `/etc/newsyslog.d`)에 있다. 실제로 써보면 `Permission denied`다. 에디터 플러그인이 sudo를 요구할 수는 없다.
2. **사용자 기계에 없다.** `logrotate`는 리눅스 도구다. macOS에는 `newsyslog`가, Windows에는 아무것도 없다. 세 OS를 지원하므로 OS마다 다른 설정을 만들어야 하고, 그것은 일관성을 얻는 게 아니라 잃는 쪽이다.
3. **바깥에서 파일을 옮기는 방식이 이 파일이 겪은 바로 그 문제를 다시 만든다.** 프로세스가 열어둔 파일을 밖에서 rename하면 그 프로세스는 이름이 바뀐 파일에 계속 쓴다. `logrotate`의 표준 해법은 `postrotate`에서 SIGHUP을 보내 파일을 다시 열게 하는 것인데, **우리 백엔드의 SIGHUP은 종료 신호다**(`backend/src/server.ts`). 로그를 돌릴 때마다 백엔드가 죽는다. 대안인 `copytruncate`는 복사와 자르기 사이에 쓰인 줄을 잃는다.
- **console 인터셉트는 원본 함수를 반드시 유지**: JetBrains 모드에서 Kotlin이 stderr를 읽으므로, 원본 `console.error` 등이 stderr로 출력되어야 함
- **DEBUG 줄은 `console.debug`가 아니라 `logDebug()`로 쓴다**: Node에서 `console.debug`는 stdout으로 나가는데, 백엔드 stdout은 PORT 핸드셰이크 채널이고 Kotlin이 그 줄을 `[Node.js stdout]`으로 IDE 로그에 옮겨 적는다. `logDebug()`는 DEBUG가 꺼져 있으면 **아무것도 호출하지 않으므로** stderr에도, 로그 파일에도, IDE 로그에도 남지 않는다
- **비싼 메시지는 만들기 전에 `isDebugEnabled()`로 묻는다**: 스트리밍 이벤트 전문을 문자열로 조립해놓고 필터가 버리면, 버려질 문자열을 토큰마다 만든 셈이 된다
- **같은 줄을 Kotlin에서 다시 로깅하지 않는다**: IDE는 우리가 stderr에 출력한 것을 이미 `STDERR - ...`로 idea.log에 적는다. `NodeProcessManager`가 같은 줄을 `logger.info`로 또 적으면 모든 줄이 두 벌이 된다 (#477에서 제보된 중복). 클래스가 붙은 사본이 필요한 사람을 위해 `logger.debug`로 남겨뒀다
- **재진입 방지**: Logger 내부에서 console을 호출하면 무한 재귀가 발생하므로 `isIntercepting` 플래그로 차단
- **로테이션 중 로그 유실 방지**: `isRotating` + `rotationBuffer` 메커니즘 사용
- **Graceful shutdown**: `stream.end()` + `finish` 이벤트 대기 (5초 타임아웃)
- **초기화 순서**: `initLogger()` → `interceptConsole()` → 서버 시작 → `setLogWs()` (LogWS 미설정 구간에서는 파일 기록만)

## 로그 레벨

| 레벨 | 기본 기록 여부 | 쓰는 곳 |
|------|---------------|---------|
| `error` `warn` | 기록 | 실패와 경고 |
| `log` `info` | 기록 | 일반 진행 상황 |
| `debug` | **기록 안 함** | 토큰 단위 추적 (`RAW stdout`, `JSON event type`, `[Bridge] Received message`) |

`debug`가 기본적으로 빠지는 이유는 **양** 때문이다. 스트리밍 한 턴은 토큰마다 한 줄을 만들고, 레벨 필터가 없던 시절 그것이 초당 9,146바이트를 디스크에 썼다. 프롬프트와 응답 전문이 평문으로 남던 것도 같은 줄들이다.

**켜는 법**

| 대상 | 방법 |
|------|------|
| 백엔드 | `CCG_LOG_LEVEL=debug` 환경변수 |
| 웹뷰 | 브라우저 콘솔에서 `ccgLogs.setLevel('debug')` (세션 한정, 영속 안 됨) |

웹뷰 쪽이 영속되지 않는 것은 의도다. JetBrains 웹뷰는 실행마다 origin이 바뀌어서 `localStorage`가 매번 빈 채로 시작한다.

레벨 필터는 **양쪽에 다 있다.** 웹뷰가 보내기 전에 한 번 거르고, 백엔드가 받아서 또 거른다. 캐시된 구버전 웹뷰가 붙더라도 디스크에 무엇이 남을지는 백엔드가 정하기 때문이다.

## 로테이션

회전과 압축은 `rotating-file-stream`이 하고, 나머지는 우리가 한다.

- **기준**: 활성 로그(`server-{pid}.log`)가 50MB 초과 시
- **아카이브 파일명**: `server-{pid}-{timestamp}.log.gz` (timestamp: ISO 8601에서 `:`, `.` 제거). 같은 초에 두 번 회전하면 뒤쪽에 `-2`가 붙는다
- **압축**: gzip. `logrotate`의 `compress`에 해당한다. 로그는 평문이라 10배 넘게 줄어들고, 같은 512MB 안에 훨씬 긴 기간이 들어간다
- **보관 한도**: `logs/` 폴더 총합 512MB **그리고** 파일 40개. 둘 중 하나라도 넘으면 **수정 시각이 오래된 것부터** 삭제
- **정리 시점**: 로테이션 직후, 그리고 **백엔드가 시작될 때마다**. 시작 시점에도 도는 이유는 토큰 로그가 빠진 뒤로 활성 파일이 50MB에 영영 닿지 않을 수 있고, 그러면 로테이션에만 매달린 정리는 영영 돌지 않기 때문이다
- **파일 개수 상한이 따로 있는 이유**: 프로세스마다 파일이 하나씩이라 백엔드가 재시작될 때마다 새 파일이 생긴다. 하나하나는 1KB도 안 돼서 총량 상한으로는 영원히 안 걸린다
- **삭제 순서가 이름순이 아니라 수정 시각순인 이유**: 파일명에 pid가 들어가므로 이름순은 프로세스 번호순이고, 그것은 나이와 아무 관계가 없다
- **자기 활성 파일은 삭제 후보가 아니다.** 다른 프로세스의 활성 파일은 후보가 되지만, 수정 시각이 최근이라 맨 뒤로 밀린다
- **회전 중 유실 방지**: 라이브러리가 처리한다. 예전에 우리가 직접 하던 부분이고, 정확히 거기서 버그가 났다

## 초기화 흐름

### 백엔드 (`server.ts`)

```
main() {
  initLogger()           // 1. FileLogger 즉시 초기화
  logger.init()          // 2. 로그 디렉토리 생성 + WriteStream 열기
  logger.interceptConsole()  // 3. 여기서부터 모든 console.* 캡처
  // ... 서버 시작 ...
  logger.setLogWs(logWs)    // 4. LogWS 참조 설정 (이후 WS 브로드캐스트 시작)
}
```

### WebView (`main.tsx`)

```
initLogForwarder()       // 앱 렌더링 전에 초기화
// ... React 렌더링 ...
// SessionContext에서 currentSessionId 변경 시 getLogForwarder().setSessionId() 호출
```
