# 실행 중인 CLI의 effort 변경에 미문서화 `control_request{subtype:"apply_flag_settings"}`를 먼저 쓴다

> 마지막 갱신: 2026-10-06
> 수정 이력은 이 파일을 고쳐 적지 말고 `git log -- docs/principle-exceptions/474-effort-apply-flag-settings.md`로 확인한다.

- 관련 이슈: [#474](https://github.com/Swttch/swttch/issues/474) (`max`만 반영되던 문제. 이 문서는 같은 문제의 일반형을 다룬다)
- 관련 PR: [#527](https://github.com/Swttch/swttch/pull/527)

## 어떤 원칙을 위반하는가

`CLAUDE.md`의 **★ 핵심 원칙** 중 **2번 「공식 지원 비의존」**이다. "미문서화 내부 프로토콜에 의존하지 않는다."

**4번**이 허용하는 범위도 넘는다. 4번은 우리가 stdin으로 직접 제어하는 통신을 "보조 최적화로만 쓰며, 공식 CLI 명령 폴백을 항상 보장"하라고 한다. 여기서는 폴백을 보장하지만, 미문서화 요청을 먼저 쓰고 공식 명령을 그다음에 둔다. 순서가 바뀐 것이다.

원칙 문장은 고치지 않았고, 여기 예외로 남긴다.

## 무엇이 문제였나

effort 슬라이더가 값을 쓰는 곳은 `~/.claude/settings.json`의 `effortLevel`이다. 2026-10-06에 CLI 2.1.291로 직접 재 보니 문제가 둘이었다.

**첫째, 실행 중인 CLI에는 닿지 않는다.** 살아 있는 CLI 하나에 설정 파일의 값을 `low`, `high`, `xhigh` 순서로 바꿔 가며 메시지를 세 번 보냈더니, CLI가 대화 기록에 적은 값은 세 번 모두 `low`였다. CLI는 이 값을 시작할 때 한 번만 읽는다.

지금까지 실행 중인 세션에 닿는 effort 변경은 `max` 하나였다. `max`를 고르면 CLI를 다시 띄웠기 때문이다(#474). `low`부터 `xhigh`까지는 재시작이 없어서, 모델 패널에서 effort를 바꿔도 이미 대화 중인 CLI는 처음 값 그대로 답했다.

**둘째, 시작할 때도 읽히지 않는 모델이 있다.** `~/.claude/settings.json`에 `"effortLevel": "high"`가 있는데도 플러그인이 새로 띄운 Sonnet 5.5 세션은 모든 턴을 `medium`으로 실행했고, 그렇게 기록했다. CLI는 사용자 전역 설정의 `effortLevel`을 일부 모델만 받는 옛 값으로 다룬다. 같은 CLI에서 프로젝트·로컬 설정의 `effortLevel`과 모델별 `modelSettings.<모델>.effortLevel`은 읽혔고, `--effort` 플래그는 그 모두를 이겼다. 화면의 슬라이더는 `High`였고 실제 실행은 `medium`이었다.

그래서 슬라이더는 거짓을 보여주고 있었다. 설정 파일만으로는 고칠 수 없고, 시작할 때 값을 어떻게 넘기느냐까지 바뀌어야 한다.

## 선택지

세 가지를 같은 CLI로 재서 비교했다.

| 방법 | 실행 중인 CLI에 닿는가 | 대화 기록의 흔적 | 원칙 |
|---|---|---|---|
| 설정 파일만 | 아니오. 모델에 따라 시작할 때도 읽히지 않는다 | 없음 | 공식 |
| 설정 파일 + 바꿀 때마다 CLI 재시작 | 예, 재시작한 뒤 | 없음 | 공식. 대신 바꾼 뒤 첫 메시지가 느려지고 프롬프트 캐시를 잃는다 |
| 공식 `/effort <level>` 명령 | 예, 다음 턴부터. `max`와 `ultracode`도 된다 | 두 줄. 사용자 항목 `<command-name>/effort</command-name>`과 시스템 항목 `Set effort level to ... (this session only)` | 공식 |
| `apply_flag_settings` 제어 요청 | 예, 즉시. `max`와 `ultracode`도 된다 | 없음 | **미문서화. 예외** |

`apply_flag_settings`는 `{effortLevel, ultracode}`를 세션 한정 설정 층에 합쳐 넣는다. `ultracode`는 `false`와 `null` 둘 다 끄고, `effortLevel: null`은 덮어쓴 값을 지워 설정 파일의 값으로 되돌린다. 이 요청을 쓴 세션의 대화 기록에는 effort와 관련된 사용자·시스템 항목이 하나도 남지 않았다.

## 어느 기준으로 예외가 되는가

[README](./README.md)의 세 기준 중 **첫 번째(다른 대안이 없어 불가피한 경우)에는 해당하지 않는다.** 공식 `/effort` 명령과 재시작은 지금도 동작한다. "공식 경로만으로는 기능이 성립하지 않는다"가 아니다.

해당하는 것은 **두 번째와 세 번째**이고, README가 정한 대로 판단은 사람이 했다.

### 기준 3. 가장 근본적으로 정확한 방법이다

CLI는 이 요청을 실행 중인 세션의 레벨을 바꾸는 길로 직접 지목한다. CLI에 내장된 요청 설명에서 `update_settings`는 "the running session's level is not set here — send apply_flag_settings for that"이라고 적고, `apply_flag_settings`는 "Merges the provided settings into the flag settings layer, updating the active configuration"이라고 적는다.

슬라이더가 바꾸려는 것도 정확히 이 "실행 중인 세션의 레벨"이다. 공식 `/effort`도 같은 일을 하지만 "this session only"를 대화 한 줄로 알리는 방식이다.

### 기준 2. 이득 차이가 압도적인지

이득은 둘이다. 슬라이더를 움직일 때마다 대화에 `/effort high`와 `Set effort level to high ...` 두 줄이 쌓이지 않는다. 그리고 CLI를 다시 띄우지 않으니 프롬프트 캐시를 잃지 않는다.

이 둘이 "압도적"인지는 사람이 판단할 몫이고, 아래 「사용자 판단」에 적은 대로 개발자가 비교한 뒤 채택했다.

## 위반의 범위를 어떻게 좁혔는가

원칙 2번이 실제로 막으려는 것은 **종속**이다. "CLI에선 되는데 GUI만 막히는" 상태가 되는 것. 그래서 종속이 성립하지 않도록 다음을 강제했다.

- **쓰는 것은 `apply_flag_settings`의 두 키 `effortLevel`과 `ultracode`뿐이다.** `get_settings` 같은 다른 미문서화 요청은 쓰지 않는다. 방금 끝난 응답이 어떤 effort로 실행됐는지는 요청으로 묻지 않고, CLI가 대화 기록에 적은 `effort`와 `perTurnEffort`를 읽는다.
- **고른 값이 항상 먼저 저장된다.** 이후에 뜨는 CLI는 그 값을 `--effort`로 받는다. `--effort`는 `claude --help`에 문서화된 공식 플래그이고 터미널 사용자가 치는 것과 같으므로 이 부분에는 예외가 필요 없다. 시작할 때의 문제(둘째)는 이 플래그로 고쳤다. 단 `claude --help`에 `--effort`가 적힌 CLI에만 넘긴다. 2.0.22는 이 플래그를 `error: unknown option '--effort'`로 거부하고 종료해서 대화가 시작되지 않는다.
- **실패하면 자동으로 공식 `/effort`로 내려간다.** 8초 안에 응답이 없거나, 에러 응답이거나, 요청을 모르는 CLI이면 `/effort <level>`(`ultracode`는 `/effort ultracode on|off`)을 일반 메시지로 보낸다. 턴이 진행 중이면 CLI가 도중에 도착한 메시지를 버리므로 턴이 끝난 뒤 보낸다.
- **둘 다 닿지 않으면 다음 메시지에서 CLI를 다시 띄운다.** 그 세션의 기록된 레벨을 어떤 요청과도 같지 않은 값으로 바꿔 두고, 다시 뜬 CLI가 저장된 레벨을 `--effort`로 받는다. 느려질 뿐 틀리지는 않는다.
- **실행 중인 CLI가 없으면 아무것도 보내지 않는다.** 첫 메시지 전에는 저장된 값이 spawn 때 `--effort`로 넘어간다.
- **레벨 문자열은 `^[a-z]{2,16}$`만 받는다.** 폴백이 그 문자열을 명령에 쓰기 때문이다.

## 이 예외가 정당하지 않게 되는 조건

다음 중 하나라도 성립하면 이 예외는 철회하고 공식 경로로 되돌린다.

- `apply_flag_settings`가 사라졌을 때 effort 변경이 **없어지는** 경우. 느려지는 것은 허용, 없어지는 것은 불가다. 폴백 `/effort`와 재시작이 남아 있어야 한다.
- 공식 `/effort`가 대화 기록에 흔적을 남기지 않게 되거나, 흔적 없이 실행 중인 세션을 바꾸는 문서화된 공식 방법이 생기는 경우. 기준 2·3의 근거가 사라진다.
- 폴백 경로가 죽은 코드가 되는 경우.

마지막 조건에는 솔직하게 적어 둘 약점이 있다. 지금 CLI(2.1.291)는 `apply_flag_settings`를 받아들이므로, `/effort` 폴백은 이 요청을 모르는 CLI에서만 실제로 실행된다. `mcp_status` 예외([363](./363-mcp-status-control-request.md))와 달리 날마다 실행되는 폴백이 아니다. 대신 단위 테스트(`effort-runtime.test.ts`)가 그 경로와, 둘 다 실패했을 때의 재시작 표시를 지킨다.

## 사용자 판단

2026-10-06 대화에서 개발자(@yhk1038)가 세 선택지(내부 요청과 `/effort` 대체, 공식 `/effort`만, 설정 파일과 CLI 재시작)를 비교한 뒤 첫 번째를 직접 선택했다.
