# 리와인드는 감춰진 CLI 플래그로, 포크는 트랜스크립트 복사로 구현한다

> 마지막 갱신: 2026-09-05
> 수정 이력은 이 파일을 고쳐 적지 말고 `git log -- docs/principle-exceptions/356-rewind-and-fork-hidden-cli-flags.md`로 확인한다.

- 관련 이슈: [#356](https://github.com/Swttch/swttch/issues/356)

## 무엇을 쓰는가

이슈 #356이 요청한 세 기능은 아래 명령으로 구현한다.

| 기능 | 수단 |
|---|---|
| Rewind code to here | `claude --resume <sid> --rewind-files <user message uuid>` |
| Fork conversation from here | 원본 트랜스크립트를 포크 지점까지 **줄 단위로 복사**해 새 세션 파일 생성 |
| Fork conversation and rewind code | 위 둘의 조합 |

포크도 처음에는 `--resume-session-at <entry uuid> --fork-session`으로 만들었다가 바꿨다. 이유는 아래 「포크는 트랜스크립트를 직접 쓴다」에 있다.

코드 되감기가 성립하려면 세션을 spawn할 때 파일 체크포인팅이 켜져 있어야 한다.

수단마다 공개 정도가 다르므로 나누어 적는다.

| 수단 | 공개 정도 |
|---|---|
| `fileCheckpointingEnabled` 설정 | **공식.** SchemaStore의 `claude-code-settings.json`에 있고 기본값이 `true`이며 [공식 문서](https://code.claude.com/docs/en/checkpointing)가 있다 |
| `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` | **공식.** 위 스키마의 description이 명시한다 |
| `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` | 미문서 |
| `--rewind-files` | `hideHelp()`로 감춰져 있다 |
| 세션 트랜스크립트 파일(JSONL) | 문서화된 포맷이 아니다. 포크가 여기에 쓴다 |

**체크포인팅 기능 자체는 공식이다.** 예외로 기록하는 대상은 감춰진 플래그 하나, SDK용 환경변수 하나, 그리고 포크가 트랜스크립트에 쓴다는 사실이다.

## 어떤 원칙을 위반하는가

`CLAUDE.md`의 **★ 핵심 원칙** 중 **2번 「공식 지원 비의존」**이다. "미문서화 내부 프로토콜에 의존하지 않는다"에 걸린다.

다만 위반의 성격은 [#363](./363-mcp-status-control-request.md)과 다르다. 그 예외가 쓴 `control_request{subtype:"mcp_status"}`는 **프로그램끼리 주고받는 내부 프로토콜**이었다.

이번에 쓰는 것은 **CLI 자신의 명령행 인자**다. 사람이 터미널에서 그대로 칠 수 있고, CLI가 인자를 검증하며, 실패하면 사람이 읽을 에러 메시지를 낸다.

```
Error: --rewind-files requires --resume
Error: --rewind-files is a standalone operation and cannot be used with a prompt
No message found with message.uuid of: msg_011Ceji...
```

그럼에도 원칙 위반으로 기록하는 이유는, `CLAUDE.md`가 안정성의 기준으로 삼은 것이 "**사용자가 터미널에서 직접 쓰는 공식 명령의 출력 계약**"이기 때문이다. `--help`에 나오지 않는 플래그는 그 기준에 완전히 부합하지 않는다.

## 어느 기준으로 예외가 되는가

[README](./README.md)의 세 기준 중 **첫 번째(다른 대안이 없어 불가피한 경우)**에 해당한다.

### `/rewind`는 우리 경로에서 실행할 수 없다

CLI가 같은 기능을 슬래시 커맨드로도 제공한다. 커맨드 정의는 다음과 같다.

```js
{ name: "rewind", aliases: ["checkpoint", "undo"],
  description: "Restore the code and/or conversation to a previous point",
  type: "local", supportsNonInteractive: false }
```

`supportsNonInteractive: false`이고, 커맨드가 하는 일은 `open_message_selector` 이벤트를 내는 것뿐이다. 대화형 REPL의 선택 화면을 여는 커맨드이므로, 화면이 없는 우리 경로에서는 성립하지 않는다.

헤드리스 세션의 `system/init`이 주는 슬래시 커맨드 목록도 실측 결과 0개였다. 커맨드를 텍스트로 보낼 경로 자체가 없다.

### 남는 대안은 CLI 없이 우리가 트랜스크립트를 쓰는 것이다

플래그를 쓰지 않으면 우리가 세션 JSONL을 직접 다뤄야 한다. 되감기에는 그런 방법조차 없다 (백업 사본의 위치와 형식을 통째로 재현해야 한다). 포크에는 있고, **실제로 포크는 그 길을 택했다.** 아래 「포크는 트랜스크립트를 직접 쓴다」를 참조.

## 참고: 공식 확장도 같은 수단을 쓴다

공식 VSCode 확장 2.1.257의 `extension.js`를 조사한 결과는 다음과 같다.

| 문자열 | 출현 |
|---|---|
| `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` | 3회 |
| `resumeSessionAt` | 5회 |
| `forkSession` | 5회 |
| `fileCheckpointingEnabled` | 1회 (확장이 설정 스키마도 번들한다) |

이것은 **정당화의 근거가 아니라 위험도의 참고 자료**다. 원칙 3번이 "참고 대상의 내부 구현 수단은 모방하지 않는다"고 못박고 있으므로, "공식 확장이 쓰니까 괜찮다"는 논리는 쓰지 않는다.

다만 1st-party 클라이언트가 같은 인터페이스에 의존한다면 그 인터페이스가 예고 없이 사라질 확률은 그만큼 낮다고 볼 수 있다.

## 포크는 트랜스크립트를 직접 쓴다 (2026-09-05 추가)

이 문서의 첫 판은 "JSONL 직접 조작은 더 깊은 위반이므로 하지 않는다"고 적었다. **그 결정을 뒤집었다.**

### 왜 CLI에 맡길 수 없었나

CLI는 `--resume-session-at X --fork-session --session-id Y`로 정확히 우리가 원하는 파일을 만든다. 다만 **첫 메시지와 함께서만** 만든다. 세션과 그 첫 메시지를 한 번에 만드는 것이 CLI의 설계다.

세 가지로 확인했다.

| 시도 | CLI의 답 |
|---|---|
| 빈 프롬프트 | `Error: Input contained only whitespace` |
| `--input-format stream-json` + stdin 즉시 닫기 | `SessionStart:fork` 훅만 실행, 파일 없음, exit 0 |
| 대화형 재개 + stdin 닫기 | `Provide a prompt to continue the conversation` |

즉 CLI로 포크하려면 **사용자가 쓰지 않은 메시지를 주입해야 한다.**

### 주입 방식을 실제로 만들어보고 버렸다

`<system-reminder>`로 감싼 씨앗 메시지를 주입하는 방식을 구현해 동작까지 확인했다. 화면에는 안 보인다(`parseUserContent`가 걷어낸다). 그런데 대가가 셋이었다.

- 포크 한 번에 **API 왕복 한 번과 약 10초**가 든다
- **모델의 응답이 대화에 남는다.** "아무것도 출력하지 마라"고 조여도 `（침묵）` 같은 한 줄을 낸다. 사용자가 시작하지도 않은 대화에 남의 말이 한 줄 들어간다
- 실패 지점이 늘어난다 (CLI 실행·타임아웃·응답 파싱)

복사 방식은 **206ms**에 끝나고 대화가 원본 그대로 깨끗하다.

### 위반의 크기를 어떻게 재는가

첫 판이 이 방법을 "더 깊은 위반"이라 부른 근거는 "엔트리 구조와 `parentUuid` 체인과 보조 엔트리의 의미를 전부 재현해야 한다"였다. **그 전제가 틀렸다.**

실제로 하는 일은 **줄 단위 복사**다. 엔트리 안을 들여다보는 것은 자를 지점을 찾기 위한 `uuid`와 `type` 두 필드뿐이고, 나머지는 이해하지 못하는 엔트리도 이해하는 엔트리와 똑같이 그대로 옮긴다. 구조를 재현하는 것이 아니라 **바이트를 옮기는 것**이다.

그리고 결과물이 CLI 자신이 만드는 것과 같은 모양이다. CLI의 포크도 원본 엔트리를 uuid까지 그대로 복사하며, 우리가 만든 파일을 CLI가 `--resume`으로 정상적으로 이어받는 것을 실측했다.

포맷이 바뀌어 이 복사가 깨진다면, 그때는 CLI 자신의 `--resume`도 같이 깨질 종류의 변화다.

### 좁혀둔 것

- 쓰기는 **새 파일에만** 한다. 원본은 열어서 읽기만 한다
- temp 파일에 쓰고 rename한다. 반쯤 쓰인 트랜스크립트를 누가 읽는 일이 없다(같은 디렉토리의 형제 파일 — rename은 파일시스템 안에서만 원자적이다)
- 포크 이후는 전부 CLI 소관이다. 그 세션을 재개하고 보내고 되감는 것 모두 평소 경로다

### 사용자 판단

2026-09-05 대화에서 개발자(@yhk1038)가 주입 방식을 직접 확인한 뒤 "총체적 난국"이라 판정하고, 복사 방식으로 전환할 것을 지시했다.

같은 대화에서 개발자가 그 전까지는 **복사 방식을 "가장 피하고 싶은 방법"**이라고 분명히 했다는 사실도 함께 남긴다. 뒤집힌 것은 방법의 선호가 아니라, 대안이 실제로 어떤 대가를 치르는지 눈으로 본 결과다.

## 위반의 범위를 어떻게 좁혔는가

### 코드 되감기는 내부 프로토콜 대신 CLI 플래그를 쓴다

공식 확장은 코드 되감기에 `control_request{subtype:"rewind_files"}`를 쓴다. CLI 바이너리에도 그 subtype이 존재하므로 우리도 쓸 수 있다.

**쓰지 않는다.** 원칙 2번이 실제로 겨냥하는 것이 그런 내부 프로토콜이고, 같은 일을 하는 명령행 인자가 있기 때문이다. 이 지점에서 우리는 참고 대상보다 원칙에 가깝게 간다.

### 체크포인팅 설정은 공식 키를 우리 설정 UI에 노출한다

`fileCheckpointingEnabled`는 공식 네이티브 설정이므로, 우리 설정 페이지에도 그 설정이 있어야 한다. 원칙 1번(CLI 동등성)이 요구하는 바다.

우리 고유의 새 키를 발명하지 않고, `ClaudeSettingsState`에 공식 키를 그대로 추가해 설정 페이지에서 켜고 끈다.

spawn 시점에는 그 설정값을 읽어 `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING`을 주입할지 결정한다. 터미널에서 설정을 끈 사용자는 GUI에서도 꺼지고, 아무것도 건드리지 않은 사용자는 기본값 `true`에 따라 터미널과 똑같이 되감을 수 있다.

### 지금 우리 spawn이 만들고 있는 차이

CLI의 판정 함수가 실행 모드를 갈라 본다.

```js
function Uj() {                       // 체크포인팅이 켜져 있나
  if (R4()) return false;
  if (F8()) return _eO();             // SDK/헤드리스 모드면 이쪽
  return r1("fileCheckpointingEnabled", true).value   // REPL은 설정 기본값 true
         && !env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING;
}
function _eO() { return __(env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING) && ...; }
```

터미널에서 `claude`를 그냥 친 사용자는 아무것도 설정하지 않아도 코드를 되감을 수 있다.

우리는 `-p --output-format stream-json`으로 spawn하므로 SDK 분기로 빠지고, 환경변수가 없으면 백업이 아예 쌓이지 않는다.

즉 **"CLI에서 되는 것이 GUI에서 안 되는" 상태를 우리 spawn 인자가 만들고 있었다.** 환경변수 주입은 원칙 1번을 어기는 것이 아니라 지키는 쪽이다.

### 폴백이 없다는 사실을 숨기지 않는다

[#363](./363-mcp-status-control-request.md)은 공식 경로를 폴백으로 살려두는 조건에서 채택됐다. **이 예외에는 그 폴백이 없다.** 위에 적은 대로 대안 경로가 존재하지 않기 때문이다.

그러므로 플래그가 사라지면 되감기는 느려지는 것이 아니라 **없어진다.** (포크는 플래그를 쓰지 않으므로 해당하지 않는다.)

대신 조용히 실패하지 않게 만든다. 명령이 실패하면 CLI가 낸 에러 문구를 사용자에게 그대로 보여주고, 되감을 백업이 없는 메시지에서는 메뉴 항목을 처음부터 비활성으로 그린다. 판정 근거는 세션 JSONL의 `file-history-snapshot` 엔트리다.

## 이 예외가 정당하지 않게 되는 조건

- **문서화된 공식 경로가 생기는 경우.** 같은 일을 하는 플래그나 명령이 `--help`에 나오게 되면 그쪽으로 옮긴다.
- **`--rewind-files`가 사라지는 경우.** 되감기를 살려두려고 백업 사본을 우리가 직접 복원하는 쪽으로 넘어가지 않는다. 되감기 메뉴를 감추고 이슈를 다시 연다.
- **CLI가 빈 브랜치를 만들 수 있게 되는 경우.** 프롬프트 없이 `--fork-session`이 세션 파일을 만들어주면 포크는 즉시 그 경로로 돌아간다. 복사를 유지할 이유가 사라진다.
- **`/rewind`가 비대화형을 지원하게 되는 경우.** `supportsNonInteractive`가 `true`로 바뀌면 이 예외의 근거인 「대안 없음」이 사라진다.

## 사용자 판단

2026-09-05 대화에서 개발자(@yhk1038)가 세 가지 선택지(예외로 기록하고 채택 / 기록 없이 채택 / 채택하지 않고 보류)를 받아 **「예외로 기록하고 채택」**을 직접 선택했다.

같은 대화에서 개발자가 "`fileCheckpointingEnabled`가 클로드코드 공식 네이티브 설정이면 우리에게도 설정으로 존재해야 한다"고 지시했다. 위 「체크포인팅 설정은 공식 키를 우리 설정 UI에 노출한다」가 그 지시를 반영한 것이다.
