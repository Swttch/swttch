# JetBrains IDE가 Wayland로 실행되면 붙여넣기가 안 됩니다

🌐 [English](../en/wayland-clipboard.md) | **한국어** | [日本語](../ja/wayland-clipboard.md) | [中文](../zh/wayland-clipboard.md) | [Español](../es/wayland-clipboard.md) | [Deutsch](../de/wayland-clipboard.md) | [Français](../fr/wayland-clipboard.md)

_최종 업데이트: 2026-08-22_

## 증상

플러그인 채팅 입력창에 붙여넣기가 아무 반응 없이 실패합니다.

에러 메시지도 뜨지 않아요.

특징이 하나 있습니다.

플러그인 **안에서** 복사한 텍스트는 잘 붙여넣어지는데, 브라우저·터미널·IDE 에디터 등 **바깥에서** 복사한 것만 실패합니다.

같은 IDE의 코드 에디터나 검색창에는 정상적으로 붙여넣어져요.

텍스트뿐 아니라 **스크린샷 같은 이미지도 마찬가지**입니다.

## 해당 환경

Linux, Wayland 세션, KDE Plasma 데스크탑을 쓰실 때 나타납니다.

지금까지 Fedora 44, Ubuntu 26.04, CachyOS 에서 확인됐어요.

GNOME 으로 바꾸면 증상이 사라진다는 보고가 있습니다.

## 원인

JetBrains Runtime 의 Wayland 지원(Project Wakefield)과 JCEF 사이에 클립보드가 연결되지 않아서, IDE 와 JCEF 가 서로 다른 클립보드를 보게 되는 것으로 보입니다.

플러그인 UI 는 JCEF 위에서 그려지기 때문에 여기에 걸립니다.

JCEF 를 쓰는 다른 JetBrains 플러그인들에서도 같은 증상이 보고돼 있습니다.

클립보드가 플러그인까지 오기 전 단계에서 끊기기 때문에, 플러그인 코드만으로 고칠 방법을 아직 찾지 못했습니다.

## 해결 방법

`Help → Edit Custom VM Options` 를 열고 아래 줄을 추가한 뒤 IDE 를 재시작해주세요.

```
-Dawt.toolkit.name=XToolkit
```

이미 `-Dawt.toolkit.name=` 으로 시작하는 줄이 있다면 (`auto` 나 `WLToolkit` 등) 그 줄을 위 내용으로 바꿔주시면 됩니다.

이 방법은 세 분이 서로 다른 배포판에서 각각 효과를 확인해주셨어요.

## 주의할 점

이 설정은 IDE 를 XWayland 로 되돌립니다.

그래서 **125%, 150% 같은 분수 배율을 쓰신다면 화면이 흐릿해 보일 수 있어요.**

임시 우회책이지 진짜 해결책은 아닙니다.

흐릿한 게 더 불편하시면 설정을 되돌리셔도 됩니다.

## 언제 없어지나요

JetBrains 의 네이티브 Wayland 지원이 안정화되면 필요 없어집니다.

관련 티켓 [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) 이 아직 열려 있어요.

여기에 투표해주시면 우선순위를 올리는 데 도움이 됩니다.

## 관련 링크

### 이 저장소의 이슈

- [#278 — Cannot paste external text into chat input on Fedora KDE (Wayland)](https://github.com/Swttch/swttch/issues/278)
- [#262 — no paste function at linux fedora](https://github.com/Swttch/swttch/issues/262)

### JetBrains 티켓

- [IJPL-215310](https://youtrack.jetbrains.com/issue/IJPL-215310) — JCEF 클립보드 문제. **아직 열려 있으며, 투표할 수 있습니다**
- [JBR-10222](https://youtrack.jetbrains.com/issue/JBR-10222) — KDE 문제로 보아 "Third-Party problem" 으로 닫혔습니다
- [JBR-5857](https://youtrack.jetbrains.com/issue/JBR-5857) — Wayland 클립보드 지원. 2024년에 Fixed 로 표시되었습니다
- [JBR-10504](https://youtrack.jetbrains.com/issue/JBR-10504) — Arch/Hyprland 에서 JCEF 프리뷰의 복사가 안 되는 문제
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — 네이티브 Wayland 지원 자체가 아직 진행 중입니다
- [PY-76704](https://youtrack.jetbrains.com/issue/PY-76704) — Continue 플러그인에 대한 최초 보고. JBR-5857 의 중복으로 닫혔습니다

### 다른 플러그인의 같은 증상

- [cline/cline#8877](https://github.com/cline/cline/issues/8877) — 열려 있음
- [cline/cline#8383](https://github.com/cline/cline/issues/8383) — 플러그인 쪽에서 고칠 수 없다는 메인테이너의 [코멘트](https://github.com/cline/cline/issues/8383#issuecomment-4173099236)가 있습니다
- [Kilo-Org/kilocode#8998](https://github.com/Kilo-Org/kilocode/issues/8998) — Fedora 43/44, Arch, Kubuntu 26.04 등에서 보고되었습니다
- [continuedev/continue#2567](https://github.com/continuedev/continue/issues/2567)

### 외부 참고

- [KDE bug 490577](https://bugs.kde.org/show_bug.cgi?id=490577) — JetBrains 가 JBR-10222 를 닫으며 원인으로 지목한 KDE 버그입니다. 다만 이 버그는 Plasma 6.2.0 에서 이미 고쳐졌고, 제보자들은 그보다 높은 버전을 쓰고 있습니다
