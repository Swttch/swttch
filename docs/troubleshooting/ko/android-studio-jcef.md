# Android Studio 에서 채팅 화면이 안 뜹니다 (JCEF)

🌐 [English](../en/android-studio-jcef.md) | **한국어** | [日本語](../ja/android-studio-jcef.md) | [中文](../zh/android-studio-jcef.md) | [Español](../es/android-studio-jcef.md) | [Deutsch](../de/android-studio-jcef.md) | [Français](../fr/android-studio-jcef.md)

_최종 업데이트: 2026-08-22_

이 플러그인의 채팅 UI 는 **JCEF**(Chromium Embedded Framework) 위에서 그려집니다. Android Studio 는 다른 JetBrains IDE 들과 달리 JCEF 를 기본으로 담고 있지 않아서, 채팅 대신 안내 패널이 나오는 일이 생깁니다.

해결 방법이 **Android Studio 버전에 따라 완전히 다릅니다.** 먼저 본인 버전을 확인해주세요 (**Help → About**).

| 사용 중인 버전 | 보셔야 할 곳 |
|---|---|
| **2026.2 이상** (Rabbit) | [2026.2 이상: 플러그인을 설치하세요](#20262-이상-플러그인을-설치하세요) |
| **2026.1.3 ~ 2026.1.x** | [2026.1: 런타임을 바꾸세요](#20261-런타임을-바꾸세요) |
| **2026.1.2 이하** | [2026.1.2 이하: 되는 조합이 없습니다](#202612-이하-되는-조합이-없습니다) |

---

## 2026.2 이상: 플러그인을 설치하세요

### 증상

채팅을 열면 안내 패널이 나오거나, 예전 버전의 플러그인에서는 예외가 발생합니다. `idea.log` 에 이런 내용이 남습니다.

```
java.lang.NoClassDefFoundError: com/intellij/ui/jcef/JBCefJSQuery
```

로그 앞부분에는 이런 줄도 있습니다.

```
plugin com.intellij.modules.jcef is not resolved
```

### 원인

**2026.2 부터 JCEF 가 IDE 본체에서 별도 플러그인으로 분리되었습니다.** 없어진 게 아니라 자리를 옮긴 것입니다.

JetBrains 자사 IDE 들은 이 플러그인을 기본으로 함께 담지만, **Android Studio 는 담지 않습니다.** 그래서 `com.intellij.ui.jcef` 클래스들이 IDE 어디에도 없는 상태가 됩니다.

여기서 중요한 점은 **런타임을 바꿔도 해결되지 않는다**는 것입니다. JetBrains Runtime 이 제공하는 것은 `org.cef.*` 뿐이고, 플랫폼 코드인 `com.intellij.ui.jcef` 는 IDE 쪽에 있어야 하기 때문입니다. JCEF 가 포함된 런타임으로 부팅해봐도 결과는 똑같습니다.

### 해결 방법

1. **Settings → Plugins → Marketplace** 를 엽니다
2. **Web Browser (JCEF)** 를 검색합니다 (제작사가 **JetBrains** 인 것)
3. 설치하고 IDE 를 재시작합니다

재시작하면 채팅이 정상적으로 뜹니다. 런타임은 기본 그대로 두셔도 됩니다.

> 마켓플레이스 페이지: [Web Browser (JCEF)](https://plugins.jetbrains.com/plugin/31360)

### 확인된 조합

| Android Studio | 기본 상태 | Web Browser (JCEF) 설치 후 |
|---|---|---|
| **2026.2.1 Canary 2** (AI-262.9437) | 안내 패널 (구버전 플러그인은 예외 발생) | **정상 동작** — 런타임 교체 불필요 |

---

## 2026.1: 런타임을 바꾸세요

### 증상

채팅 UI 대신 안내 패널이 나옵니다.

### 원인

Android Studio 에 기본으로 들어있는 JetBrains Runtime(JBR)에 JCEF 가 포함되어 있지 않습니다. 2026.1 대에서는 JCEF 가 아직 IDE 본체에 들어있으므로, **JCEF 가 포함된 런타임으로 바꾸면 해결됩니다.**

### 해결 방법

1. Android Studio 가 **2026.1.3 이상**인지 확인해주세요 (2026.1.2 이하는 아래 항목을 보세요)
2. Find Action 을 엽니다. `Cmd+Shift+A` (macOS) 또는 `Ctrl+Shift+A` (Windows/Linux)
3. **Choose Boot Java Runtime for the IDE…** 를 실행합니다
4. 목록에서 이름에 **JCEF** 가 들어간 런타임을 고릅니다
5. 설치가 끝나면 IDE 를 재시작합니다

플러그인 안내 패널의 버튼을 누르셔도 같은 대화상자가 열립니다.

---

## 2026.1.2 이하: 되는 조합이 없습니다

### 증상

런타임을 바꾼 뒤 다음 중 하나가 일어납니다.

- Android Studio 가 아예 실행되지 않습니다
- 실행은 되지만 플러그인 창이 완전히 비어 있습니다. 안내 패널도, 에러 메시지도 없습니다

창이 비어 있는 경우 `idea.log` 에 이런 내용이 남습니다.

```
java.lang.NoSuchMethodError:
'boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()'
	at com.intellij.ui.jcef.JBCefApp.<init>(JBCefApp.java:142)
```

### 원인

- 2026.1.2 이하는 Java 21 위에서 동작하고, 자체 `JCefAppConfig` 를 함께 담고 있습니다
- JCEF 가 포함된 **JBR 21** 을 고르면 런타임 쪽 모듈이 그것을 가려버리는데, JBR 21 의 `JCefAppConfig` 에는 플랫폼이 호출하는 `isRemoteEnabled()` 메서드가 없습니다. 그래서 브라우저 생성이 실패하고 창이 빈 채로 남습니다
- **JBR 25** 에는 그 메서드가 있지만, 2026.1.2 이하는 Java 25 로는 부팅되지 않습니다. Java 24 에서 Security Manager 가 제거되었는데 이 빌드들은 여전히 그것을 켜려고 하기 때문입니다

Android Studio **2026.1.3** 이 기본 런타임을 Java 21 에서 Java 25 로 옮기면서 이 문제가 풀렸습니다.

### 해결 방법

Android Studio 를 **2026.1.3 이상**으로 업데이트해주세요.

### 확인된 조합

| Android Studio | 기본 JBR | JCEF 포함 JBR 21 | JCEF 포함 JBR 25 |
|---|---|---|---|
| 2026.1.1 Patch 2 | Java 21 — 안내 패널만 | 빈 창 | 부팅 실패 |
| 2026.1.2 | Java 21 — 안내 패널만 | 빈 창 | 부팅 실패 |
| **2026.1.3** | **Java 25** | — | **정상 동작** |

---

## 런타임을 바꾼 뒤 IDE 가 실행되지 않는다면

Android Studio 설정 폴더에서 `studio.jdk` 파일을 지우면 기본 런타임으로 되돌아갑니다.

- **macOS**: `~/Library/Application Support/Google/AndroidStudio<버전>/studio.jdk`
- **Linux**: `~/.config/Google/AndroidStudio<버전>/studio.jdk`
- **Windows**: `%APPDATA%\Google\AndroidStudio<버전>\studio.jdk`

## 관련 링크

### 이 저장소의 이슈

- [#321 — Exception with Android Studio Rabbit 2026.2](https://github.com/Swttch/swttch/issues/321)
- [#295 — Blank chat window on Android Studio 2026.1.2 and earlier](https://github.com/Swttch/swttch/issues/295)
- [#34 — Plugin not working in Android Studio (JCEF not bundled with default JBR)](https://github.com/Swttch/swttch/issues/34)

### 이 저장소의 PR

- [#327 — Keep the chat panel loadable on an IDE without JCEF](https://github.com/Swttch/swttch/pull/327)
- [#296 — Explain the JCEF runtime mismatch instead of leaving a blank panel](https://github.com/Swttch/swttch/pull/296)
- [#83 — fix: detect out-of-process JCEF via CefApp, not a system property](https://github.com/Swttch/swttch/pull/83)
- [#65 — fix: defer JBCefBrowser creation to avoid JCEF StartupTest race](https://github.com/Swttch/swttch/pull/65)

### 외부 참고

- [Web Browser (JCEF) 마켓플레이스 플러그인](https://plugins.jetbrains.com/plugin/31360) — Android Studio 에 JCEF 를 추가하는 JetBrains 의 플러그인
- [JetBrains 공지: Experimental JCEF Web Browser API support for Android Studio](https://platform.jetbrains.com/t/experimental-jcef-web-browser-api-support-for-android-studio/4117)
