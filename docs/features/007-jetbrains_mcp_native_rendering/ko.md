# JetBrains IDE MCP 도구 네이티브 렌더링

> Languages: [English](./en.md) · **한국어**
>
> 관련: [PR #147](https://github.com/Swttch/swttch/pull/147) · [#41](https://github.com/Swttch/swttch/issues/41)

## 새로워진 점

JetBrains IDE(2025.2+)에는 **내장 MCP 서버**가 들어 있고, Claude Code가 그 도구들을 IDE 런처 이름(`mcp__idea__…`, `mcp__pycharm__…`, `mcp__webstorm__…` 등)으로 자동 등록합니다. 지금까지는 이런 호출이 일반 MCP 렌더러로 떨어져 **raw JSON 덩어리**로 보였습니다.

이제는 내장 `Bash` / `Edit` / `Read` 카드에 준하는 **네이티브 수준의 전용 채팅 카드**로 렌더되고, **권한 다이얼로그도 사람이 읽기 좋게** 표시됩니다. Claude가 IDE의 도구를 부릴 때, 채팅 안에서 IDE 품질의 UI를 그대로 보게 됩니다.

여기 있는 모든 것은 **공개된 도구 계약(도구 이름·입력 스키마·JSON 결과)** 만으로 구현됩니다 — `claude …` CLI 사용자가 보는 것과 동일한 표면입니다. 공식 SDK나 미문서화 프로토콜에 의존하지 않습니다.

## 도구별 전용 카드

JetBrains의 모든 도구 계열 — 파일/에디터, 코드/심볼, 인스펙션, 실행/디버그, 터미널, VCS, 데이터베이스 — 이 각각 전용 카드로 뜹니다. JSON 덩어리 대신, 그 호출이 실제로 무엇을 대상으로 하는지를 간결하고 읽기 쉬운 형태로 보여줍니다.

![열린 파일 목록 카드](../../img/screenshot-jbmcp-open-files.png)

![파일 내 검색 카드(매치 행)](../../img/screenshot-jbmcp-search-files.png)

![프로젝트 의존성 카드](../../img/screenshot-jbmcp-project-dependencies.png)

![파일 인스펙트(문제점) 카드](../../img/screenshot-jbmcp-inspect-file.png)

## `file:line` 링크로 IDE에서 바로 열기

결과 행은 클릭 가능한 `경로`(또는 `경로:줄`) 링크입니다. 클릭하면 IDE에서 해당 파일이 **그 줄 위치로** 열립니다.

![file:line 링크 클릭 시 IDE에서 정확한 줄로 이동](../../img/screenshot-jbmcp-file-line-navigation.gif)

## 사람이 읽기 좋은 권한 다이얼로그

도구가 승인을 필요로 할 때, 프롬프트가 `Allow mcp__idea__create_new_file?` 대신 **"Allow IntelliJ IDEA: Create new file?"** 처럼 자연스러운 문구로 표시됩니다. "이 세션 동안 모두 허용" 옵션도 같은 방식으로 인간화됩니다.

![새 파일 생성에 대한 인간화된 권한 다이얼로그](../../img/screenshot-jbmcp-permission-humanized.png)

## 거부 = 에러가 아니라 하나의 결정

도구를 거부하면, 카드가 그것을 빨간 에러가 아니라 음소거된 **"declined"** 노트로 렌더합니다 — 거부는 도구 실패가 아니라 사용자의 결정이기 때문입니다. 이 구분은 **세션을 다시 로드해도 유지**됩니다.

![거부한 도구는 중립적인 declined 노트로 렌더됨](../../img/screenshot-jbmcp-declined.gif)

## 프로젝트 확인 칩

모든 카드는 그 도구가 **어느 프로젝트**를 대상으로 하는지 확인해줍니다. 현재 세션 프로젝트일 때는 간결한 **"current project"** 칩(호버 시 전체 경로)을 보여주고, 다른 프로젝트를 대상으로 하거나 지정되지 않았을 때는 전체 경로와 함께 노란 **"different project"** 경고를 띄웁니다. 도구가 엉뚱한 프로젝트를 조용히 건드리지 못하게 하기 위함입니다.

![현재 프로젝트 칩](../../img/screenshot-jbmcp-project-chip-current.png)

![다른 프로젝트 경고 칩](../../img/screenshot-jbmcp-project-chip-different.png)

## 정직한 상태 점

카드는 전송 계층 오류뿐 아니라 **payload 수준의 실제 실패에서도 빨갛게** 바뀝니다 — 컴파일되지 않은 빌드(`isSuccess:false`), 0이 아닌 종료 코드로 끝난 명령, 적용되지 않은 중단점 등. 그래서 상태 점이 "실제로 무슨 일이 일어났는지"를 정직하게 알려줍니다.

![0이 아닌 종료 코드에서 실행 카드가 빨갛게 바뀜](../../img/screenshot-jbmcp-status-exit1.png)

## `apply_patch` diff 등

`apply_patch`는 파일별 전체 diff로 렌더되고, 입력이 전부 공개되어 도구가 하려는 일이 승인 앞에서 숨겨지지 않습니다.

![apply_patch가 파일별 diff로 렌더됨](../../img/screenshot-jbmcp-apply-patch.gif)

## 모든 JetBrains IDE에서 동작

동일한 렌더러가 `idea` / `pycharm` / `webstorm` / `goland` / `phpstorm` / `rubymine` / … 에 바인딩됩니다 — 도구 세트가 IDE 간에 동일하므로, 어디서 쓰든 카드가 같은 모습·같은 동작을 보입니다.

최신 IDE 빌드는 같은 동작에 대해 더 새로운 도구 이름(예: `search_in_files_by_text`, `find_files_by_glob`, `get_file_text_by_path`, `replace_text_in_file`)도 함께 제공하는데, 이것들도 커버되어 현재 IDE 버전에서도 전용 카드가 계속 뜹니다.

## 참고

- **켜는 법:** IDE 내장 MCP 서버는 아직 Claude Code에 기본으로 연결돼 있지 않아서, 보통 Claude에게 IDE 도구를 쓰라고 요청해야 합니다(예: "JetBrains 도구로 프로젝트를 검색해줘"). 네이티브 `/ide` 통합은 [#41](https://github.com/Swttch/swttch/issues/41)에서 추적 중입니다.
- **디버거 도구**(`xdebug_…` 계열)는 **IntelliJ IDEA Ultimate**에서만 사용할 수 있습니다.
- 아직 전용 카드가 없는 IDE 도구는 **브랜드가 적용된 일반(generic)** 카드로 폴백되어, 그래도 JetBrains 도구임을 알아볼 수 있게 표시됩니다.
