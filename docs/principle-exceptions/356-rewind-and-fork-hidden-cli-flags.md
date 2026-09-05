# 리와인드와 포크를 감춰진 CLI 플래그로 구현한다

> 마지막 갱신: 2026-09-05
> 수정 이력은 이 파일을 고쳐 적지 말고 `git log -- docs/principle-exceptions/356-rewind-and-fork-hidden-cli-flags.md`로 확인한다.

- 관련 이슈: [#356](https://github.com/Swttch/swttch/issues/356)

## 무엇을 쓰는가

이슈 #356이 요청한 세 기능은 아래 명령으로 구현한다.

| 기능 | 명령 |
|---|---|
| Fork conversation from here | `claude --resume <sid> --resume-session-at <entry uuid> --fork-session` |
| Rewind code to here | `claude --resume <sid> --rewind-files <user message uuid>` |
| Fork conversation and rewind code | 위 두 명령의 조합 |

코드 되감기가 성립하려면 세션을 spawn할 때 파일 체크포인팅이 켜져 있어야 한다.

수단마다 공개 정도가 다르므로 나누어 적는다.

| 수단 | 공개 정도 |
|---|---|
| `fileCheckpointingEnabled` 설정 | **공식.** SchemaStore의 `claude-code-settings.json`에 있고 기본값이 `true`이며 [공식 문서](https://code.claude.com/docs/en/checkpointing)가 있다 |
| `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` | **공식.** 위 스키마의 description이 명시한다 |
| `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` | 미문서 |
| `--resume-session-at`, `--fork-session` | `--fork-session`만 `--help`에 있고 `--resume-session-at`은 `hideHelp()`로 감춰져 있다 |
| `--rewind-files` | `hideHelp()`로 감춰져 있다 |

**체크포인팅 기능 자체는 공식이다.** 예외로 기록하는 대상은 감춰진 플래그 두 개와 SDK용 환경변수 하나다.

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

### 남는 대안은 더 깊은 위반이다

플래그를 쓰지 않고 포크를 구현하려면, 우리가 CLI의 세션 JSONL을 직접 읽어 잘라내고 새 파일로 써야 한다.

그것은 명령행 인터페이스가 아니라 **CLI의 내부 저장 포맷에 의존하는 것**이다. 엔트리 구조, `parentUuid` 체인, `attachment`와 `file-history-snapshot` 같은 보조 엔트리의 의미를 전부 우리가 재현해야 하고, 포맷이 바뀌면 사용자의 세션 파일이 우리 손에 망가진다.

원칙 2번이 막으려는 것을 더 크게 어기는 길이므로 채택하지 않았다.

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

그러므로 플래그가 사라지면 기능은 느려지는 것이 아니라 **없어진다.**

대신 조용히 실패하지 않게 만든다. 명령이 실패하면 CLI가 낸 에러 문구를 사용자에게 그대로 보여주고, 되감을 백업이 없는 메시지에서는 메뉴 항목을 처음부터 비활성으로 그린다. 판정 근거는 세션 JSONL의 `file-history-snapshot` 엔트리다.

## 이 예외가 정당하지 않게 되는 조건

- **문서화된 공식 경로가 생기는 경우.** 같은 일을 하는 플래그나 명령이 `--help`에 나오게 되면 그쪽으로 옮긴다.
- **플래그가 사라지는 경우.** 기능을 살려두려고 세션 JSONL을 직접 쓰는 쪽으로 넘어가지 않는다. 메뉴를 감추고 이슈를 다시 연다.
- **`/rewind`가 비대화형을 지원하게 되는 경우.** `supportsNonInteractive`가 `true`로 바뀌면 이 예외의 근거인 「대안 없음」이 사라진다.

## 사용자 판단

2026-09-05 대화에서 개발자(@yhk1038)가 세 가지 선택지(예외로 기록하고 채택 / 기록 없이 채택 / 채택하지 않고 보류)를 받아 **「예외로 기록하고 채택」**을 직접 선택했다.

같은 대화에서 개발자가 "`fileCheckpointingEnabled`가 클로드코드 공식 네이티브 설정이면 우리에게도 설정으로 존재해야 한다"고 지시했다. 위 「체크포인팅 설정은 공식 키를 우리 설정 UI에 노출한다」가 그 지시를 반영한 것이다.
