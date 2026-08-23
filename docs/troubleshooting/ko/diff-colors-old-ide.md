# 변경 내용 화면에 색이 없습니다

🌐 [English](../en/diff-colors-old-ide.md) | **한국어** | [日本語](../ja/diff-colors-old-ide.md) | [中文](../zh/diff-colors-old-ide.md) | [Español](../es/diff-colors-old-ide.md) | [Deutsch](../de/diff-colors-old-ide.md) | [Français](../fr/diff-colors-old-ide.md)

_최종 업데이트: 2026-08-24_

Claude 가 파일 수정을 제안하면 변경 내용을 보여드리는데, **2025.2 이하 IDE 에서는 그 화면에 색이 나오지 않습니다.** 아직 저희가 우회 방법을 넣지 못했고, 대신 IDE 를 올리시면 바로 해결됩니다.

## 증상

변경 내용 화면이 온통 같은 색으로 보입니다.

![색이 나오지 않는 변경 내용 화면 — 코드가 전부 흰색이고, 바뀐 줄에 배경색이 없습니다](../../img/screenshot-diff-colors-missing.png)

- 키워드·문자열·숫자가 구분되지 않고 전부 흰색(또는 검정)입니다
- **추가된 줄과 삭제된 줄의 배경색이 없습니다.** 어느 줄이 바뀐 건지 색으로 알 수 없습니다
- 줄 번호와 구분선도 흐릿하게 같은 톤입니다

정상이라면 이렇게 보입니다.

![정상적인 변경 내용 화면 — 문법 강조가 되어 있고, 추가된 줄이 초록 배경으로 표시됩니다](../../img/screenshot-diff-colors-ok.png)

글자와 줄 번호는 제대로 나오고, 승인·거부 같은 동작도 모두 정상입니다. **읽기가 어려울 뿐 기능이 망가진 것은 아닙니다.**

## 원인

이 화면은 IDE 안에 들어있는 **JCEF**(Chromium 기반 브라우저 엔진) 위에 그려집니다. 그리고 색을 정하는 데 `light-dark()` 라는 CSS 기능을 씁니다 — 밝은 테마와 어두운 테마의 색을 한 줄에 적어두고 지금 테마에 맞는 쪽을 고르는 기능입니다.

이 기능은 **Chromium 123 부터** 쓸 수 있습니다. 그런데 IDE 에 들어있는 Chromium 버전이 이렇습니다.

| IDE 버전 | Chromium | 색 |
|---|---|---|
| 2024.2 ~ 2025.2 | **122** | 안 나옴 |
| **2025.3 이상** | **137** | 정상 |

한 버전 차이로 갈립니다. 122 에서는 `light-dark()` 를 쓴 색 지정이 통째로 무시되고, 아무 색도 적용되지 않은 상태로 남습니다.

Chromium 122 는 2024년 3월 빌드입니다. IDE 를 오래 쓰셨다면 그 안의 브라우저 엔진도 그만큼 오래된 상태입니다.

## 해결 방법

**IDE 를 2025.3 이상으로 업데이트해주세요.** 가능하면 최신 버전을 권합니다.

- **Help → Check for Updates** 로 업데이트할 수 있습니다
- Toolbox 를 쓰신다면 Toolbox 에서 업데이트해주세요

업데이트 후 IDE 를 재시작하면 색이 바로 나옵니다. 플러그인 설정은 건드리지 않으셔도 됩니다.

현재 IDE 버전은 **Help → About** 에서 확인하실 수 있습니다.

### IDE 를 올릴 수 없다면

변경 내용은 **IDE 자체 diff 뷰어**로도 보실 수 있습니다. 그쪽은 IDE 가 직접 그리므로 이 문제가 없습니다.

**설정 → Diff 보기 → 편집 검토 위치** 에서 **IDE diff 뷰어** 를 고르시면 됩니다.

다만 이 경우 부분 승인(변경 조각별로 고르기)과 제안 내용 직접 수정은 쓰실 수 없습니다. 그 기능들은 저희 화면에서만 제공됩니다.

## 관련 링크

### 이 저장소의 PR

- [#342 — Make the proposed side of a review diff editable](https://github.com/Swttch/swttch/pull/342)

### 외부 참고

- [MDN: `light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) — 브라우저별 지원 현황
- [JetBrains Runtime](https://github.com/JetBrains/JetBrainsRuntime) — IDE 에 들어가는 런타임. JCEF 도 여기에 포함됩니다
