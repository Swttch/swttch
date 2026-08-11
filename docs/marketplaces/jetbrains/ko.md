# Swttch (ex - Claude Code with GUI)

**Cursor와 VS Code에서 쓰던 그 Claude Code GUI를, 이제 JetBrains IDE에서.**

> **이름이 바뀌었습니다 — Claude Code with GUI는 이제 Swttch입니다.**
> 같은 개발자가 만드는 같은 제품입니다. Claude Code를 넘어 더 많은 프로바이더를 지원해 달라는
> 요청이 많았고, 그 요청을 진지하게 받아들여 이름을 바꿨습니다.

🌐 [English](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/en.md) | **한국어** | [日本語](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/ja.md) | [中文](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/zh.md) | [Español](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/es.md) | [Deutsch](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/de.md) | [Français](https://github.com/Swttch/swttch/blob/main/docs/marketplaces/jetbrains/fr.md)

> **이 플러그인은, 이 플러그인으로 만들어집니다.**
> JetBrains IDE에 띄운 바로 이 채팅 화면으로 직접 개발합니다.

## 왜 이 플러그인인가

- **익숙한 그대로** — Cursor·VS Code의 Claude Code와 똑같은 화면과 조작감. 새로 배울 것이 없습니다.
- **투명하고 안전하게** — Claude Code CLI를 그대로 실행합니다. 중간 프록시도, 몰래 읽는 자격증명도 없습니다.
- **빠른 개선** — 버그를 알려 주시면 평균 하루 안에 고치는 오픈소스입니다.

## 주요 기능

- **앤트로픽 공식 확장을 기준으로** — VS Code의 Claude Code는 제작사 Anthropic이 직접 만들고 유지보수하는 공식 확장입니다. 이 플러그인은 그 공식 확장을 기준으로 삼아, JetBrains에서 같은 경험을 제공합니다.
- **IDE에 녹아든 작업 흐름** — 선택한 코드를 바로 전달하고(`Alt+K`), 변경 사항을 IDE diff 뷰어에서 검토·적용하며, 파일과 터미널을 에디터에서 곧장 엽니다.
- **위치 사용자화** — 채팅 화면을 사이드바 툴 윈도우와 에디터 탭 중 원하는 곳에 배치해, 나만의 작업 환경을 구성합니다.
- **세션을 한눈에** — 왼쪽 패널에서 모든 대화를 훑어보고 클릭 한 번으로 엽니다.
- **외부 기기 원격 접속** — QR 코드로 폰·태블릿에서 바로 이어서 작업 (Cloudflare 터널).
- **Windows·WSL 모두 지원** — PowerShell, WSL 환경의 사용자도 지원합니다.
- **설정까지 GUI로** — 플러그인 설정은 물론 Claude Code의 `.claude`·`.claude.json` 설정 파일까지 GUI로 관리합니다. *(개발 중)*

## 요구 사항

- JetBrains IDE 2024.2 이상
- Claude Code CLI 1.0.0 이상 — 최신 버전 권장, 설치·인증 완료
- Node.js 18 이상

## 시작하기

1. `claude --version`으로 CLI 설치·인증 확인
2. 마켓플레이스에서 플러그인 설치
3. **Tools > Open Claude Code** 또는 `Ctrl+Shift+C`
4. Claude와 코딩 시작
