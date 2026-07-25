# `@` 파일 멘션이 서브모듈 파일을 찾고, `fileSuggestion` 설정을 존중합니다

> 언어: [English](./en.md) · **한국어**
>
> 관련: [#201](https://github.com/yhk1038/claude-code-gui-jetbrains/issues/201), [#223](https://github.com/yhk1038/claude-code-gui-jetbrains/pull/223)

## 새로워진 점

채팅 입력창의 `@` 파일 멘션 선택기가 두 가지로 개선되었습니다.

1. **git 서브모듈 내부의 파일이 이제 목록에 뜹니다.** 저장소가 git 서브모듈로
   코드를 가져다 쓰는 경우, `@`를 입력하고 서브모듈 안의 파일(예:
   `Assets/GameFramework/Editor/Foo.asmdef`)을 검색하면 이전에는 아무것도 찾지
   못했습니다. 선택기가 서브모듈의 최상위 폴더만 볼 뿐, 그 안에 추적되는 파일들은
   보지 못했기 때문입니다. 이제 그 파일들도 다른 파일처럼 목록에 나옵니다.

2. **CLI의 `fileSuggestion` 설정을 존중합니다.** Claude Code는 `settings.json`의
   `fileSuggestion` 명령으로 `@` 파일 인덱스를 만드는 방식을 사용자가 직접
   지정할 수 있게 합니다. 그동안 GUI는 이 설정을 무시했지만, 이제 CLI와
   똑같이 그 명령을 실행합니다. `claude`에서 동작하던 설정이 여기서도
   동작합니다.

## 화면에서 보이는 것

- **서브모듈 파일이 그냥 `@` 목록에 나옵니다** — 별도 설정이 필요 없습니다.
- **사용자 지정 명령**은 **설정 → General → `fileSuggestion`** 에서 지정할 수
  있습니다. 셸 명령(예: `git ls-files --recurse-submodules`)을 입력하면 그 명령이
  `@` 인덱스를 만들고, 비워 두면 내장 인덱스를 사용합니다. 이 값은
  `settings.json`의 `fileSuggestion` 설정과 동일하므로, 여기서 편집하든 파일에서
  편집하든 됩니다. User/Project 두 범위 모두 지원합니다.

## 동작 방식

두 경로 모두 이 프로젝트의 **CLI 동등성** 원칙을 지킵니다 — CLI 사용자가
`settings.json`으로 할 수 있는 것은 GUI로도 할 수 있고, 미문서화 내부
프로토콜에 의존하지 않습니다.

- **내장 인덱스(기본).** 파일 목록은 `git ls-files`로 만듭니다.
  `git ls-files --recurse-submodules`는 `--others`와 함께 쓸 수 없어(git이
  "unsupported mode"로 거부합니다) 백엔드가 명령을 두 번 실행합니다 — 하나는
  서브모듈까지 재귀하는 추적 파일용, 하나는 무시되지 않은 미추적 파일용 — 그리고
  둘을 병합합니다. `.gitignore`는 그대로 존중하므로 빌드 산출물이나
  `node_modules`는 목록에 들어오지 않습니다.

- **`fileSuggestion` 명령.** 설정되어 있으면 백엔드가 인덱스 생성을 그 명령에
  맡깁니다. 명령은 현재 검색어를 `{"query":"…"}` JSON으로 표준입력(stdin)에서
  받고, 파일 경로를 줄 단위로 표준출력(stdout)에 출력합니다(CLI와 동일하게 최대
  15개). 명령은 `CLAUDE_PROJECT_DIR`가 설정된 셸에서 실행되며, 이는 CLI의 훅과
  동일한 환경입니다. 명령이 어떤 이유로든 실패하면 선택기는 조용히 내장
  인덱스로 폴백하므로 절대 멈추지 않습니다.
