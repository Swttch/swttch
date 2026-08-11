# 계정 모달의 사용량 상세 분석

> Languages: [English](./en.md) · **한국어**
>
> 관련: [#148](https://github.com/Swttch/swttch/issues/148)

## 새로운 점

`/usage`를 입력하면 그대로 CLI로 전송되어, 사용량 텍스트가 채팅 답변으로 되돌아올
뿐이었습니다 — 기대와 다른 동작이었죠(이슈 #148). 이제 `/usage`는 팔레트의
"Account & usage…"를 선택한 것과 똑같이 **Account & Usage 모달**을 엽니다. 커서
확장과 동일한 동작입니다.

또한 모달에 **"Contributing to usage"** 섹션이 추가되었습니다. `claude -p "/usage"`가
내놓는 상세 분석을 평문이 아니라 UI로 렌더링합니다.

## 화면에서 보이는 것

기존 세션 / 주간 한도 막대 아래에, 기간별(**Last 24h** / **Last 7d**, 탭으로 전환)로
다음을 보여줍니다:

- 해당 기간의 **요청 / 세션 수**
- **인사이트 문장** — 예: "97% of your usage came from subagent-heavy sessions",
  "66% of your usage was at >150k context"
- **상위 분류** — 상위 skills, subagents, plugins, MCP servers와 각각의 사용 비중

새로고침 버튼으로 최신 데이터를 가져오며, CLI 출력 형식이 바뀌더라도 원본 텍스트로
안전하게 대체됩니다.

## 동작 방식

- `/usage`를 단독으로 입력하거나 `/usage …`처럼 공백 뒤에 내용이 이어져도 CLI로 가지
  않고 모달을 엽니다. 공백 없는 `/usageX`는 별개 단어로 보아 일반 메시지로 전송됩니다.
- 상세 분석은 공식 명령 `claude --no-session-persistence -p "/usage"` 실행 결과에서
  옵니다 — 터미널 사용자가 얻는 것과 동일합니다. SDK나 미문서화 프로토콜에 의존하지
  않으며, 원본 텍스트는 UI에서 파싱합니다.
- 이 분석은 **활성 계정**을 따라갑니다. 같은 프로젝트 디렉토리 안에서 계정만 전환해도
  새로 갱신됩니다.
- `/usage`는 그 자체로 사용량을 소비하므로 결과를 짧게 캐시하며, 새로고침 버튼은 캐시를
  우회해 최신 데이터를 강제로 가져옵니다.
