# Android Studio 에서 채팅 화면이 안 뜹니다 (JCEF 런타임)

🌐 [English](../en/android-studio-jcef.md) | **한국어** | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_최종 업데이트: 2026-08-22_

## 증상

Android Studio 에서 플러그인을 열면 채팅 UI 대신 안내 패널이 나옵니다.

런타임을 바꾼 뒤에는 다음 중 하나가 일어날 수 있어요.

- Android Studio 가 아예 실행되지 않습니다
- 실행은 되지만 플러그인 창이 완전히 비어 있습니다. 안내 패널도, 에러 메시지도 없습니다

창이 비어 있는 경우 `idea.log` 에 이런 내용이 남습니다.

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

## 원인

Android Studio 에 기본으로 들어있는 JetBrains Runtime(JBR)에는 **JCEF**(Chromium Embedded Framework)가 포함되어 있지 않습니다.

이 플러그인의 UI 는 JCEF 위에서 그려지기 때문에, 기본 런타임에서는 채팅 화면 대신 안내 패널이 나옵니다.

여기까지는 JCEF 가 들어있는 런타임으로 바꾸면 해결됩니다.

다만 **Android Studio 2026.1.2 이하에서는 되는 조합이 아예 없습니다.**

- 2026.1.2 이하는 Java 21 위에서 동작하고, 자체 `JCefAppConfig` 를 함께 담고 있습니다
- JCEF 가 포함된 **JBR 21** 을 고르면 런타임 쪽 모듈이 그것을 가려버리는데, JBR 21 의 `JCefAppConfig` 에는 플랫폼이 호출하는 `isRemoteEnabled()` 메서드가 없습니다. 그래서 브라우저 생성이 실패하고 창이 빈 채로 남습니다
- **JBR 25** 에는 그 메서드가 있지만, 2026.1.2 이하는 Java 25 로는 부팅되지 않습니다. Java 24 에서 Security Manager 가 제거되었는데 이 빌드들은 여전히 그것을 켜려고 하기 때문입니다

Android Studio **2026.1.3** 이 기본 런타임을 Java 21 에서 Java 25 로 옮기면서 이 문제가 풀렸습니다.

## 확인된 조합

| Android Studio | 기본 JBR | JCEF 포함 JBR 21 | JCEF 포함 JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — 안내 패널만 | 빈 창 | 부팅 실패 |
| 2026.1.2 | Java 21 — 안내 패널만 | 빈 창 | 부팅 실패 |
| **2026.1.3** | **Java 25** | — | **정상 동작** |

## 해결 방법

1. Android Studio 를 **2026.1.3 이상**으로 업데이트해주세요
2. Find Action 을 엽니다. `Cmd+Shift+A` (macOS) 또는 `Ctrl+Shift+A` (Windows/Linux)
3. **Choose Boot Java Runtime for the IDE…** 를 실행합니다
4. 목록에서 이름에 **JCEF** 가 들어간 런타임을 고릅니다
5. 설치가 끝나면 IDE 를 재시작합니다

플러그인 안내 패널의 **Switch Runtime** 버튼을 누르셔도 같은 대화상자가 열립니다.

## 런타임을 바꾼 뒤 IDE 가 실행되지 않는다면

Android Studio 설정 폴더에서 `studio.jdk` 파일을 지우면 기본 런타임으로 되돌아갑니다.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<버전>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<버전>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<버전>\studio.jdk`

## 언제 없어지나요

JetBrains 가 2025년 4월에 [**Web Browser (JCEF)**](https://plugins.jetbrains.com/plugin/31360) 라는 실험적인 마켓플레이스 플러그인을 내놓았습니다.

Android Studio 2026.1 Nightly 이상에 JCEF 를 넣어주는 플러그인이에요.

이것이 안정화되면 위의 런타임 교체 자체가 필요 없어집니다.

## 관련 링크

### 이 저장소의 이슈

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### 이 저장소의 PR

- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### 외부 참고

- [Web Browser (JCEF) 마켓플레이스 플러그인](https://plugins.jetbrains.com/plugin/31360) — Android Studio 에 JCEF 를 추가하는 JetBrains 의 실험적 플러그인
