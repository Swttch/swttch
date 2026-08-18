# PRD — JetBrains Claude Code GUI (Cursor-동일 UX)

## 0. 문서 목적

본 문서는 **Cursor의 Claude Code 확장 UI/UX와 거의 동일한 경험**을 JetBrains IDE에서 제공하기 위한 **제품 요구사항 문서(PRD)**이다.

본 PRD에서 **명확히 정의되지 않았거나 구현 선택지가 여러 개인 항목**은, 원칙적으로 **Cursor의 Claude Code 확장이 실제로 보여주는 동작**을 1차 기준으로 삼는다.

* 원칙: *동작·UX·구조가 충돌할 경우, Cursor UX > JetBrains 관행 순으로 우선*

---

## 1. 제품 목표

### 1.1 1차 목표 (MVP)

* Cursor의 Claude Code 확장과 **시각적·상호작용적 UX가 거의 동일**할 것
* 터미널 없이 **IDE 내부에서 에이전트 런타임을 완결적으로 사용**할 수 있을 것

### 1.2 비목표 (1차 범위 제외)

* Cursor 대비 UX 개선/차별화
* JetBrains 특화 기능의 적극적 활용(Advanced diff UX 등)
* 멀티 IDE 간 상태 동기화

---

## 2. 핵심 사용자 시나리오

1. 사용자는 단축키 또는 메뉴로 Claude 패널을 연다
2. 채팅 입력창에 요청을 입력한다
3. 에이전트는 응답을 **스트리밍**으로 출력한다
4. 에이전트가 파일 수정/명령 실행을 제안하면 **허용/거절**을 선택한다
5. 변경 제안은 diff 형태로 검토 후 적용/되돌리기 할 수 있다
6. 세션은 자동 저장되며, 언제든 재개 가능하다

---

## 3. 전체 아키텍처 개요

### 3.1 레이어 분리 원칙

본 제품은 다음 3개의 독립 레이어로 구성한다.

1. **IDE Plugin (Kotlin/JVM)**

* IDE API 접근 및 제어
* WebView 호스팅 및 브리지
* 보안/권한/파일 시스템 연동

2. **WebView UI (JCEF, Web App)**

* Cursor와 동일한 UI/UX 구현
* 채팅, 세션, diff 카드, 입력 UX

3. **AI Bridge (별도 프로세스)**

* Claude Code 등 에이전트 실행
* 스트리밍 파싱
* 상태 머신(plan/execute/verify)

> 레이어 간 통신 및 책임 분리는 각 레이어가 독립적으로 교체 가능하도록 설계한다.

---

## 4. UI / UX 요구사항 (Cursor-동일)

### 4.1 ToolWindow (메인 패널)

#### 구성

* 세션 리스트 영역
* 메인 대화 스트림 영역
* 하단 입력 컴포저

#### 요구사항

* 모든 메시지는 **스트리밍 렌더링**
* Markdown + Code Block 렌더링
* Tool-call / Plan / Result는 카드 UI로 표현

> 구체적인 레이아웃, 컴포넌트 분리는 Cursor의 화면 구성을 기준으로 한다.

---

### 4.2 입력 컴포저

* 멀티라인 입력
* Enter / Shift+Enter
* 히스토리 탐색
* Slash command 지원 (`/init`, `/review` 등)
* 컨텍스트 첨부 UI(@file, selection)

---

### 4.3 Diff / 변경 제안 UX

* 에이전트가 파일 변경을 제안하면:

    * 패널 내 diff 카드 표시
    * 파일별 변경 요약 제공
* 사용자는 다음 중 선택 가능:

    * Open Diff (IDE diff viewer)
    * Apply
    * Reject

> Patch 표시 방식, 카드 UI는 Cursor의 diff UX를 따른다.

---

## 5. 컨텍스트 수집 규칙

### 5.1 컨텍스트 타입

* Selection
* Active File
* Open Files
* Explicit File (@file)

### 5.2 우선순위

1. 명시적 첨부(@file, 드래그)
2. 선택 영역
3. 활성 파일

> 자동 컨텍스트 주입 여부, 범위 제한 정책은 Cursor 동작을 따른다.

---

## 6. 권한 및 보안 정책

### 6.1 권한 종류

* 파일 쓰기
* 파일 삭제
* 명령 실행
* 네트워크 접근

### 6.2 UX 원칙

* 기본: **항상 사용자 승인 필요**
* 승인 요청은 Tool-call 카드로 표시
* 고위험 작업은 IDE 네이티브 다이얼로그 사용

> 권한 기억(scope) 정책은 Claude Code CLI가 제공하는 권한 범위를 1차 기준으로 한다.

---

## 7. 이벤트 / 메시지 프로토콜

### 7.1 기본 원칙

* 이벤트 기반
* 스트리밍 우선
* 모든 요청은 request_id로 추적 가능

> 이벤트 타입, payload 구조는 Claude Code CLI가 스트리밍하는 원본 구조와 호환되도록 설계한다.

---

## 8. 세션 및 상태 관리

### 8.1 세션

* 프로젝트 단위 세션 저장
* 자동 저장
* 세션 재개 가능

### 8.2 상태 머신

* Idle
* Streaming
* Waiting Permission
* Has Diff
* Error

> 상태 전환 규칙은 Cursor Claude Code의 실제 동작을 기준으로 한다.

---

## 9. Diff / Patch 적용 정책

* Patch 단위로 변경 제안 관리
* Apply 시 IDE 파일 시스템에 반영
* Reject 시 변경 폐기
* Undo 가능해야 함

> Patch 포맷(unified diff vs file edits)은 Claude Code CLI가 제안하는 편집 형식을 따른다.

---

## 10. 기술 제약 및 결정 원칙

* WebView는 JCEF 사용
* Swing 기반 UI는 사용하지 않음(예외: 권한 다이얼로그)
* 에이전트 런타임은 IDE 외부 프로세스로 분리

---

## 11. 마일스톤

### M1 — 기본 대화

* ToolWindow + WebView
* 스트리밍 응답

### M2 — 컨텍스트

* Selection / File 첨부
* 세션 저장

### M3 — 변경 제안

* Diff 카드
* Apply / Reject

### M4 — 에이전트 완성도

* Permission flow
* Stop / Retry / Continue

---

## 12. 미정 항목 처리 원칙 (중요)

본 PRD에서 명시되지 않은 다음 항목들은:

* IPC 방식
* Bridge 내부 구조
* WebView 상태 관리 방식
* 에러/리커버리 전략

👉 **Cursor의 실제 동작과 Claude Code CLI의 공식 인터페이스를 1차 기준으로 삼아 결정**한다.

---

## 13. 성공 기준

* Cursor Claude Code 사용자에게 UX 설명 없이 사용 가능
* 터미널 사용 없이 동일한 작업 완료 가능
* 에이전트 작업 중 IDE 멈춤/크래시 없음

---

## 14. 향후 확장 (범위 외)

* JetBrains diff UX 적극 활용
* 멀티 에이전트
* 원격 런타임
* 팀 세션 공유
