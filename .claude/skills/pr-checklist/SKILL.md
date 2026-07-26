---
name: pr-checklist
description: >-
  Pre-PR review checklist for the claude-code-gui-jetbrains project. Verifies a
  change is ready to open a pull request against main — rebased onto the latest
  main, feature docs written for feature PRs, no marketplace-forbidden Internal/
  Deprecated JetBrains APIs, all three test layers passing, the project's core
  principles (CLI equivalence, original-data preservation, consistent naming)
  respected, and the lessons learned during the work recorded to memory.
  Use before opening or updating a PR. Trigger on: PR 올리기 전, PR 전 검토,
  기여 전 체크, 피알 검토, pre-PR, PR 준비 됐어?, open a PR, ready for PR, PR checklist,
  contribution check.
---

> 이 문서는 한글로 작성되어 있으나, 사용자가 사용하는 언어에 맞게 읽고 번역하여 전달할 것.
> (This document is written in Korean; read it and translate to the user's language when relaying.)

# pr-checklist — PR 올리기 전 검토

기여 변경을 `main`에 PR로 올리기 전에 통과해야 할 항목을 순서대로 검증한다.
**규칙의 본문(왜/무엇)은 [CONTRIBUTING.md](../../../CONTRIBUTING.md)가 단일 소스**이며,
이 스킬은 그 규칙을 실제로 검증하는 **절차**다. 상세 근거는 [CLAUDE.md](../../../CLAUDE.md) 참조.

## 트리거

- 사용자가 "PR 올리기 전", "PR 전 검토", "기여 전 체크", "피알 검토", "PR 준비 됐어?" 등을 말할 때
- 브랜치 작업을 마치고 PR 생성/업데이트 직전

## 검증 절차

각 항목을 실제 명령으로 검증하고, 통과/실패를 근거와 함께 보고한다. 실패 항목은 고치도록 안내한다.

### 1. 최신 main 리베이스 (필수)

PR은 반드시 **main의 최신 커밋 위에 리베이스**된 상태여야 한다. 오래된 base에서 PR을 열지 않는다.

```bash
git fetch origin
git rebase origin/main
```

- 리베이스 후 충돌이 있으면 해결하고, 3레이어 빌드/테스트를 다시 돌린다.
- 이미 push한 브랜치라면 리베이스 후 force-push(`--force-with-lease`)가 필요함을 안내한다.

### 2. 기능 PR엔 기능 문서 (필수)

사용자 대면 기능은 `docs/features/NNN-feature_name/` 폴더에 언어별 문서(`en.md` / `ko.md` …)를
작성하고, `docs/features/CLAUDE.md` 색인에 한 줄 추가해야 한다. 포맷은 그 색인 문서를 따른다.

```bash
ls docs/features/          # 다음 번호(NNN) 확인
```

### 3. 마켓플레이스 금지 API 미사용 (필수)

JetBrains **Internal API**(`@ApiStatus.Internal`, `impl` 패키지 내 클래스)는 **사용 금지** —
Marketplace Plugin Verifier가 오류로 잡아 배포가 거부된다. **Deprecated API**도 지양(경고 발생).
네이티브 기능에 위험한 API가 필요하면 reflection 또는 public 대체 API로 우회한다.

```bash
# 정적 점검(로컬 스킬 precheck과 동일한 grep 계열)
grep -rn "@ApiStatus.Internal\|StartupManager\|PluginManagerConfigurable" src/main/kotlin --include="*.kt"
```

### 4. 3레이어 테스트 + lint + build 통과 (필수)

"테스트"는 별도 명시가 없으면 **WebView / Backend / Kotlin 3개 레이어 전부**를 의미한다.
모든 개발은 TDD(테스트 먼저 → 실패 확인 → 구현)를 따른다.

```bash
bash ./scripts/build.sh wv-test
bash ./scripts/build.sh wv-lint
bash ./scripts/build.sh be-lint
bash ./scripts/build.sh full-build
```

### 5. OS/환경별 동작 보장 (크로스 플랫폼) (필수)

OS와 맞닿을 확률이 조금이라도 있는 코드는 **Windows·macOS·Linux 모두에서** 안전하게 동작해야 한다.
특히 **Windows는 단일 환경이 아니다** — `cmd` / PowerShell / **WSL** / **WSL2**를 각각 별도 셸로 취급하고,
새 외부 명령은 이 전 환경 체크리스트로 점검한다. 비관적 관점에서 검토한다.

- **경로**: `/` 하드코딩 대신 `path.join()`. 경로 비교 시 대소문자 정규화(Windows/APFS insensitive vs Linux sensitive).
- **셸 명령**: Unix 전용 명령(`which`, `chmod`, `kill`, POSIX 파이프) 지양. **셸 토큰화 회피**가 이 프로젝트의 확립된 패턴.
- **환경 변수**: `HOME`(Unix) vs `USERPROFILE`/`HOMEDIR`(Windows). 단독 사용 금지.
- **줄바꿈**: `\n` 하드코딩 금지, Windows `\r\n` 고려. 임시 디렉토리는 `os.tmpdir()`, 실행 파일 확장자(`.sh` vs `.cmd`/`.bat`) 주의.
- **프로세스**: Unix 시그널(`SIGTERM`/`SIGKILL`)은 Windows 미지원 — 분기 필요.
- **WSL/WSL2**: `claude`/`node` 탐색 시 **PATH 비대칭** 주의. 로그인 셸(`bash -lic`)로 `.bashrc`를 상속해 PATH를 확보한다.

### 6. 프로젝트 고유 원칙 준수 (필수)

- **CLI 동등성 & 공식 SDK/내부 프로토콜 비의존**: 공식 `claude` CLI 명령을 기준선으로. 참고 앱은 UX만 모방.
- **원본 데이터 보존**: JSONL 엔트리 등 원본 구조를 편집·리네임 없이 WebView까지 전달(범위 분할은 허용).
- **일관 작명**: 같은 동작엔 같은 verb. IPC `type`은 `MessageType` enum(문자열 리터럴 금지).

### 7. PR 본문 / 커밋 메시지 (필수)

- **PR 본문은 영어**로 작성한다. (한국어 본문 금지)
- 커밋 메시지는 영어 + conventional 스타일(`fix:`, `feat:`, `refactor:`, `docs:`, `chore:` …), 첫 줄 72자 이내.
- PR 본문은 **무엇을**, **왜** 바꿨는지 명확히 설명한다.
- 이슈를 해결하는 변경이면 **종료 플래그 필수** — `Closes #N` / `Fixes #N`.
  `(#N)` 참조만으로는 이슈가 자동으로 닫히지 않는다. push 전에 빠졌으면 `git commit --amend`로 보강한다.

### 8. 학습 내용 메모리 기록 (필수, 에이전트 전용)

> 이 항목은 **에이전트의 작업 규율**이다. 외부 기여자에게 요구하는 절차가 아니므로
> CONTRIBUTING.md(공개 기여 가이드)에는 두지 않는다.

PR을 올리기 전, **이번 작업에서 기억해야 할 점이나 배운 점을 정리해 메모리에 기록한다.**
이 항목은 매 PR마다 빠짐없이 반복 실행한다.

**왜**: 같은 조사를 반복하지 않기 위해서다. 특히 "한 번 확인해두면 다음에 바로 쓸 수 있는 사실"
(공식 스키마·API 계약·플랫폼 함정·검증 방법)은 기록하지 않으면 다음 세션에서 처음부터 다시 파야 한다.

**무엇을 기록하나** — 아래에 해당하면 기록한다:
- **판정 근거와 그 확보 방법**: 무엇을 1차 근거로 삼았고 어떻게 받아왔는지(예: 스키마 원문 URL + 파싱 명령).
  특히 **틀린 정보원을 만났다면 그 사실 자체를 기록**한다 — 다음에 같은 함정에 빠지지 않게.
- **아키텍처 결정과 그 이유**: 왜 A가 아니라 B인지. 나중에 "왜 이렇게 했지?"가 나올 지점.
- **함정·역직관적 제약**: 순환 의존, 화이트리스트 때문에 순서를 바꿔야 하는 것, 플랫폼별 차이 등.
- **미해결로 남긴 것과 그 한계**: 무엇을 왜 못 했고, 어떤 조건에서 문제가 되는지.

**무엇을 기록하지 않나**: 코드·git 히스토리·CLAUDE.md를 보면 바로 아는 것(파일 구조, 이번에 고친 코드
자체), 이번 대화에서만 의미 있는 진행 상황.

**기록 방법**: 기존 메모리에 같은 주제가 있으면 **새 파일을 만들지 말고 그 파일을 갱신**한다
(중복 방지). 새로 만들 때만 `MEMORY.md` 색인에 한 줄 추가한다.

## 결과 보고

각 항목을 PASS / FAIL 테이블로 보고한다. FAIL이 하나라도 있으면 PR을 열지 말고 먼저 수정하도록 안내한다.
모든 항목 PASS면 "PR 준비 완료"로 마무리한다.
