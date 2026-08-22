# Swttch (ex - Claude Code with GUI)

Cursor와 VS Code에서 사랑받는 Claude Code GUI를 이제 JetBrains IDE에서도 사용할 수 있습니다.

> **이름이 바뀌었습니다 — Claude Code with GUI는 이제 Swttch입니다.**
>
> 이 저장소는 `yhk1038/claude-code-gui-jetbrains`에서 `Swttch/swttch`로 옮겨졌습니다.
> 기존 링크와 `git clone` 주소는 계속 동작합니다.
>
> 같은 제품입니다. Claude Code를 넘어 더 많은 프로바이더를 지원하기 위해 이름을 바꿨습니다.

[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/30313?label=Marketplace)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
[![Downloads](https://img.shields.io/jetbrains/plugin/d/30313?label=Downloads)](https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui)
![JetBrains IDE](https://img.shields.io/badge/JetBrains%20IDE-2024.2%2B-000000?logo=jetbrains)
![Claude Code](https://img.shields.io/badge/Claude%20Code%20CLI-%3E%3D1.0.0-blueviolet)

🌐 [English](../README.md) | **한국어** | [日本語](README.ja.md) | [中文](README.zh.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Français](README.fr.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-chat.png" alt="Chat interface" width="800" />
</p>

## Highlights

- Cursor/VS Code의 Claude Code와 **동일한 UI/UX**를 JetBrains IDE에서 제공
- Claude Code CLI를 spawn하는 래퍼 — 공식 VS Code 확장과 동일한 방식
- **모든 소스코드를 처음부터 직접 설계 및 작성** — 다른 프로젝트의 복제품이 아님
- JetBrains IDE뿐 아니라 **브라우저/모바일에서도 독립 실행** 가능한 듀얼 환경 아키텍처
- 빠르게 진화하는 Claude Code 경험(Agent Team, Remote Control 등)을 GUI로 제공

> 현재 서비스 안정화에 많은 노력을 기울이고 있습니다. 버그를 제보해주시면 평균 1일 이내로 해결합니다. 많은 피드백 부탁드립니다.
>
> 이 프로젝트는 글로벌 개발자 커뮤니티와 함께 성장하고자 합니다. 최대한 많은 개발자의 협업을 위해 **영어를 공식 공용언어**로 채택합니다.

## 기능

### 스트리밍 채팅

- 실시간 Markdown 렌더링 및 구문 강조 (수식 랜더링 지원)
- Claude의 사고 과정(thinking)을 실시간으로 표시

### 도구 호출 카드

- 파일 읽기/쓰기, Bash 명령어, 검색 결과를 시각적 카드로 표시
- Cursor/VS Code와 일관된 UI

### 권한 관리

- 파일 및 Bash 작업 권한에 대한 네이티브 다이얼로그
- 설정에서 유연한 권한 정책 구성

### 다중 세션

- 탭으로 여러 대화를 동시에 관리
- 세션 드롭다운으로 빠르게 전환
- 전체 세션 히스토리 조회

### 파일 및 이미지 첨부

- 채팅에 파일과 이미지를 드래그 앤 드롭 또는 선택하여 첨부

### 슬래시 커맨드

- `/clear` — 세션 초기화
- `/compact` — 대화 컴팩트
- 그 외 기타 이용 가능한 커맨드를 동적으로 로딩

### 인터럽트

- 스트리밍 중 메시지 및 도구 실행을 즉시 중단

### 터널 및 잠들기 방지

- **외부에서 원격 접속 지원**
  - 외부에서 접속가능한 URL 생성 및 QR Code 제공
  - Cloudflare가 제공하는 [cloudflared](https://github.com/cloudflare/cloudflared)를 사용하여 로컬 서버를 터널링 (무료, 무제한)
  - 포트포워딩을 제공하는 Cloudflare 프록시 서버 이외의 제3자 통신 없음
  - 커뮤니티 자체 구현 버전이며, Claude의 Remote Control 네이티브 공식 기능과는 무관 (향후 지원 예정)

- **잠들기 방지**
  - macOS(caffeinate), Linux(systemd-inhibit), Windows(powercfg) 잠들기 방지

### 설정 양방향 동기화

- 플러그인 설정뿐 아니라 Claude Code 오리지널 설정(전역/로컬)도 설정 메뉴에서 직접 제어
- 향후 설정 파일 공식 스펙 전체를 GUI로 제어할 수 있도록 개선 예정
- MCP 서버, 스킬, 에이전트 등 `.claude`가 담당하는 영역을 GUI에서 관리할 수 있도록 지원 예정

### 브라우저/모바일 독립 실행

- JetBrains IDE 없이도 브라우저나 모바일에서 단독으로 사용 가능
- Node.js 백엔드가 WebSocket 서버를 제공하며, 브라우저가 클라이언트로 접속
- 개발 전용이 아닌 독립 배포 대상 — IDE 환경과 동일한 기능을 브라우저에서 제공

### 추가 기능

- **Open Claude in Terminal** — 커맨드 팔레트에서 IDE 터미널로 Claude 실행
- **세션 URL 라우팅** — IDE를 재시작해도 세션이 자동 복원
- **싱글 프로세스 멀티 프로젝트** — 하나의 백엔드 프로세스로 여러 프로젝트를 동시에 지원
- **설정** — CLI 경로, 테마, 글꼴 크기, 권한 정책, 로그 수준 구성

<details>
<summary>추가 스크린샷</summary>

**환영 화면**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-welcome.png" alt="Welcome screen" width="400" />

**설정 패널**

<img src="https://raw.githubusercontent.com/Swttch/swttch/main/docs/img/screenshot-settings.png" alt="Settings panel" width="400" />

</details>

## 요구 사항

- JetBrains IDE 2024.2 — 2025.3
- Claude Code CLI >= 1.0.0 (설치 및 인증 완료)
- Node.js >= 18

## 빠른 시작

1. `claude` CLI가 설치되고 인증되었는지 확인합니다 (`claude --version`).
2. JetBrains Marketplace에서 플러그인을 설치합니다.
3. **Tools > Open Claude Code**를 통해 패널을 열거나 `Ctrl+Shift+C`를 누릅니다.
4. Claude와 함께 코딩을 시작합니다.

**단축키**

- `Ctrl+Shift+C` — Claude Code 패널 열기
- `Cmd+N` / `Ctrl+N` (패널 포커스) — 새 세션 탭

## 문제 해결

자주 발생하는 문제들 중, 아직 저희가 직접 고치지 못했지만 알려진 해결 방법이 있는 것들을 **[docs/troubleshooting](troubleshooting/ko/README.md)** 에 증상·원인·해결 방법과 관련 이슈 링크와 함께 정리해두었습니다.

- [Wayland 클립보드](troubleshooting/ko/wayland-clipboard.md) — Linux · Wayland · KDE Plasma 에서 채팅 입력창에 붙여넣기가 안 될 때
- [Android Studio JCEF](troubleshooting/ko/android-studio-jcef.md) — Android Studio 에서 채팅 화면 대신 안내 패널이나 예외가 뜨거나, 창이 비어 있을 때

목록에 없는 문제라면 [이슈를 열어](https://github.com/Swttch/swttch/issues/new/choose) 알려주세요.

## 기여

모든 종류의 기여를 환영합니다 — 버그 리포트, 기능 제안, 코드, 문서, 번역 등.

- **시작하려면?** [CONTRIBUTING.md](../CONTRIBUTING.md)에서 설정 안내와 가이드라인을 확인하세요.
- **작업할 것을 찾고 있다면?** [`good first issue`](https://github.com/Swttch/swttch/labels/good%20first%20issue) 라벨이 붙은 이슈를 확인하세요.
- **큰 변경을 계획 중이라면?** 먼저 [이슈를 열어](https://github.com/Swttch/swttch/issues) 논의해 주세요.

## 라이선스

이 프로젝트는 [GNU Affero General Public License v3.0](../LICENSE) 하에 라이선스되었습니다.
