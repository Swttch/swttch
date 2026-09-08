# Linux 에서 채팅 탭이 완전히 비어서 열립니다

🌐 [English](../en/linux-jcef-blank-panel.md) | **한국어** | [日本語](../ja/linux-jcef-blank-panel.md) | [中文](../zh/linux-jcef-blank-panel.md) | [Español](../es/linux-jcef-blank-panel.md) | [Deutsch](../de/linux-jcef-blank-panel.md) | [Français](../fr/linux-jcef-blank-panel.md)

_최종 업데이트: 2026-09-08_

## 증상

채팅 탭은 열리는데 그 안이 통째로 비어 있습니다.

`Waiting for project indexing...` 이라는 문구가 잠깐 보였다가 사라지고, 그 자리에 아무것도 나타나지 않아요.

에러 메시지도 안내 패널도 뜨지 않고 그냥 빈 화면으로 남습니다.

## 먼저 확인해주세요

같은 IDE 에서 아무 `.md` 파일이나 열고 마크다운 미리보기를 켜보세요.

**마크다운 미리보기도 함께 비어 있다면 이 문서가 맞습니다.**

마크다운 미리보기는 이 플러그인이 아니라 IDE 가 직접 그리는 화면입니다. 두 화면이 동시에 비어 있다면 특정 플러그인이 아니라 IDE 의 내장 브라우저(JCEF)가 문제라는 뜻이에요.

이 확인 하나로 시간을 많이 아끼실 수 있습니다. 채팅 탭만 봐서는 플러그인 문제인지 JCEF 문제인지 겉으로 구분되지 않기 때문입니다.

## 해당 환경

Linux 에서 나타납니다.

Ubuntu 22.04 와 PhpStorm 2026.2.2 조합에서 확인됐고, NVIDIA 그래픽카드를 쓰는 Wayland 세션이었습니다.

제보해주신 분은 다른 Wayland 문제를 피하려고 JCEF 관련 레지스트리 값 몇 개를 기본값에서 바꿔둔 상태였어요.

아래 두 가지에 해당하면 겪으실 가능성이 높습니다.

- X11 이 아니라 **Wayland** 세션
- **NVIDIA** 독점 드라이버

## 원인

이 플러그인은 채팅 화면을 **JCEF**(Chromium Embedded Framework) 위에 그립니다. IDE 가 마크다운 미리보기나 내장 브라우저를 그릴 때 쓰는 것과 같은 구성 요소예요.

JCEF 는 GPU 를 거쳐 화면을 그립니다. 드라이버와 세션 조합에 따라 이 경로가 동작하지 않으면, 브라우저는 정상적으로 만들어지는데 화면이 한 번도 그려지지 않아서 패널이 빈 채로 남습니다.

저희는 아직 이 경우를 잡아내지 못하고 있습니다. JCEF 를 쓸 수 없을 때나 백엔드가 뜨지 못했을 때는 안내 패널로 바꿔 보여드리는데, JCEF 가 정상적으로 시작한 뒤 화면만 안 그려지는 것은 저희 쪽에서 성공으로 보입니다. 그래서 아무 메시지 없이 빈 탭만 남게 돼요.

## 해결 방법

아래 순서대로 시도해주세요. 제보된 사례는 1번에서 해결됐습니다.

### 1. JCEF 레지스트리 값을 기본값으로 되돌리기

`Help → Find Action` 을 열고 **Registry…** 를 실행한 뒤 `jcef` 로 검색해주세요.

아래 네 항목을 확인하시고, 기본값이 아닌 것이 있다면 되돌려주세요.

| 항목 | 기본값 |
|---|---|
| `ide.browser.jcef.gpu.disable` | `false` |
| `ide.browser.jcef.osr.enabled` | `true` |
| `ide.browser.jcef.markdownView.osr.enabled` | `true` |
| `ide.browser.jcef.sandbox.enable` | `true` |

값이 바뀐 항목은 굵게 표시되고, Registry 창에는 **Restore Defaults** 버튼이 있습니다.

바꾸신 뒤에는 IDE 를 재시작해주세요.

다른 Wayland 문제를 피하려고 켜두셨던 설정이 이 증상의 원인인 경우가 많습니다.

### 2. 세션을 X11 로 바꾸기

로그아웃하신 뒤 로그인 화면에서 Wayland 대신 **X11**(또는 "Xorg") 세션을 선택해주세요.

데스크탑은 Wayland 로 두고 싶으시다면 IDE 만 XWayland 로 옮기실 수 있습니다. `Help → Edit Custom VM Options` 를 열고 아래 줄을 추가한 뒤 재시작해주세요.

```
-Dawt.toolkit.name=XToolkit
```

이미 `-Dawt.toolkit.name=` 으로 시작하는 줄이 있다면 그 줄을 바꿔주시면 됩니다.

### 3. 1번과 2번으로 안 될 때만, GPU 가속 끄기

이건 1번과 반대 방향이라서, 1번을 먼저 해보시고 안 됐을 때만 시도해주세요.

**Registry…** 에서 `ide.browser.jcef.gpu.disable` 을 `true` 로 바꾸고 재시작하시면 됩니다.

내장 브라우저가 비어서 나오던 다른 사용자에게 JetBrains 가 바로 이 방법을 안내했고, 그분이 화면이 나오게 됐다고 확인해주셨어요 ([IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573)).

## 주의할 점

**레지스트리 값을 바꾸시기 전에 원래 값을 적어두세요.** 이 설정들은 이 플러그인뿐 아니라 IDE 의 내장 브라우저를 쓰는 모든 화면에 영향을 줍니다.

X11 이나 XWayland 로 옮기면 IDE 가 예전 디스플레이 경로로 돌아갑니다. 그래서 **125%, 150% 같은 소수 배율을 쓰시면 화면이 흐릿해 보일 수 있어요.** 임시 방편이니 언제든 되돌리셔도 됩니다.

GPU 가속을 끄면 JCEF 가 CPU 로 화면을 그리기 때문에, 무거운 페이지에서는 느려질 수 있습니다.

## 그래도 안 될 때

이런 경우 JetBrains 는 JCEF 상세 로그를 요청합니다.

`Help → Edit Custom VM Options` 에 아래 줄을 추가하고 재시작하신 뒤, 빈 탭을 재현하고 `~/jcef_<PID>.log` 파일을 받아주세요.

```
-Dide.browser.jcef.log.level=verbose
```

[이슈를 남겨주실 때](https://github.com/Swttch/swttch/issues/new/choose) 그 파일과 함께 배포판, 세션 종류(Wayland 인지 X11 인지), 그래픽 드라이버를 알려주시면 큰 도움이 됩니다.

## 언제 없어지나요

이 드라이버와 세션 조합에서 JCEF 가 안정적으로 화면을 그리게 되면 필요 없어집니다.

아래 티켓들은 아직 열려 있고, 투표해주시면 우선순위를 올리는 데 도움이 됩니다.

저희도 화면을 한 번도 그리지 못하는 브라우저를 감지해서, 빈 탭 대신 무슨 일이 일어났는지 화면에 말씀드릴 수 있을지 살펴보고 있습니다.

## 관련 링크

### 이 저장소의 이슈

- [#420 — Blank content of Claude Code tab](https://github.com/Swttch/swttch/issues/420)

### JetBrains 티켓

- [IJPL-191573](https://youtrack.jetbrains.com/issue/IJPL-191573) — Linux 에서 내장 브라우저가 비어서 나오는 문제. VA-API 오류가 원인으로 지목됐습니다. **아직 열려 있고 투표하실 수 있어요.** JetBrains 가 여기서 `ide.browser.jcef.gpu.disable` 을 안내했고 제보자가 효과를 확인했습니다
- [JBR-5969](https://youtrack.jetbrains.com/issue/JBR-5969) — Linux 의 NVIDIA 드라이버에서 GPU 가속이 JCEF 를 깨뜨리는 문제와, 그것을 확실히 끄는 방법을 달라는 요청. **아직 열려 있습니다**
- [JBR-3206](https://youtrack.jetbrains.com/issue/JBR-3206) — 네이티브 Wayland 지원 자체. 아직 진행 중입니다
- [IDEA-349995](https://youtrack.jetbrains.com/issue/IDEA-349995) — 같은 흰 화면 증상. 정보가 부족해 Incomplete 로 닫혔습니다

### 관련 문서

- [Wayland 클립보드](wayland-clipboard.md) — 채팅 입력창에 붙여넣기가 안 되는, 또 다른 Wayland 문제
