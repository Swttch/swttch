# Claude가 일하는 동안 스피너에 보이는 단어를 고를 수 있습니다

> 언어: [English](./en.md) · **한국어**

## 제보된 내용

[#548](https://github.com/Swttch/swttch/issues/548)에서 한 사용자가 알려주셨습니다. 턴이 진행되는 동안 Claude의 답변 아래에 "Deliberating...", "Perusing..." 같은 글자가 도는데, 이 단어가 언제나 내장 목록에서만 나온다는 내용입니다. 그분은 `~/.claude/settings.json`의 `spinnerVerbs`를 "Processing" 하나만 보이도록 설정해 두었고, 터미널에서는 그대로 동작했습니다. 이 앱은 그 설정을 무시하고 있었습니다.

이제 채팅이 Claude Code와 같은 방식으로 `spinnerVerbs`를 따릅니다. 파일을 열지 않고도 바꿀 수 있도록 **설정 > Appearance > Chat**에 행도 생겼습니다.

## `spinnerVerbs`란

`spinnerVerbs`는 Claude Code 자체의 설정이고, [공식 설정 문서](https://code.claude.com/docs/ko/settings-reference#spinnerverbs)에 설명이 있습니다. 턴이 진행되는 동안 스피너는 "Accomplishing", "Architecting", "Baking" 같은 단어를 돌아가며 보여줍니다. 이 설정은 그 순환에 사용자의 단어를 더하거나, 내장 목록을 사용자의 단어로 바꿉니다.

`settings.json`에는 `mode`와 `verbs` 목록을 가진 객체로 저장됩니다.

```json
{
  "spinnerVerbs": {
    "mode": "replace",
    "verbs": ["Processing"]
  }
}
```

Claude Code 자체의 설정이므로, 여기서 정한 값은 터미널에서도 그대로 적용되고, 터미널에서 이미 정해 둔 값은 여기에도 나타납니다.

## 채팅 스피너

Claude가 일하는 동안 답변 아래 한 줄에 단어 하나가 "..."와 함께 보입니다.

![Claude가 일하는 채팅의 작은 일부를 잘라낸 사진. 파란 별표 뒤에 회색 글씨로 "Brewing..."이 적혀 있습니다.](./assets/chat-spinner.png)

*설정에서 가져온 단어가 보이는 스피너 줄입니다. 이 목록에는 "Brewing"과 "Processing"이 들어 있고 모드가 Replace라서, 이 두 단어만 나옵니다.*

단어는 턴이 시작되고 몇 초 뒤에 바뀌고, 턴이 이어지는 동안 몇 초마다 다시 바뀝니다. 다음 단어는 목록에서 무작위로 고르고, 목록에 단어가 하나뿐이 아니라면 방금 보인 단어와 같은 단어는 고르지 않습니다.

## 설정 행

**설정 > Appearance**를 열고 **Chat** 섹션으로 내려가면 `spinnerVerbs` 행이 있습니다. 행 이름 옆에는 Claude Code 설정을 뜻하는 주황색 **C** 배지가 붙어 있고, 누르면 Claude 공식 문서로 이동합니다.

![User Settings (Global) 탭의 Appearance 설정 페이지를 Chat 섹션까지 내린 화면. "Hide tool calls" 아래에 C 배지가 붙은 "spinnerVerbs" 행이 있습니다. 설명은 "While a turn is in progress, the spinner shows a rotating verb such as "Accomplishing", "Architecting", or "Baking". Use this key to add your own verbs to that rotation or replace the built-in list with yours."입니다. 그 아래 Mode 스위치는 Append가 선택돼 있고 "Claude Code adds your verbs to the built-in set"라는 문장이 붙어 있습니다. Verbs 목록의 맨 위에는 "Type a verb and press Enter"라는 안내가 보이는 빈 입력창이 있고, 그 아래에 "Brewing"과 "Processing"이 각각 x 버튼과 함께 있습니다.](./assets/settings-append.png)

*단어 두 개를 추가한 행입니다. 맨 위의 빈 입력창에 다음 단어를 적습니다.*

이름 아래 설명은 Claude의 공식 문장이고, 인터페이스 언어에 맞춰 표시됩니다.

### Mode

| 모드 | 스피너에 보이는 것 | 스위치 아래 문장 |
| --- | --- | --- |
| **Append** (추가) | 내장 단어에 사용자의 단어를 더한 것. 행이 처음 열릴 때의 선택입니다. | "Claude Code adds your verbs to the built-in set" |
| **Replace** (교체) | 사용자의 단어만. | "Claude Code shows only your verbs" |

![같은 행에서 Replace를 선택한 화면. 스위치 아래 문장이 "Claude Code shows only your verbs"로 바뀌었습니다.](./assets/settings-replace.png)

*Replace를 선택한 화면입니다. 스위치 아래 문장이 선택에 따라 바뀝니다.*

내장 목록의 성격에서 두 가지가 따라 나옵니다. 내장 단어가 여든 개 가까이라서, **Append**에서는 사용자의 단어 하나가 여러 번 바뀌는 중에 한 번 나올까 말까 합니다. 내 단어만 보고 싶다면 **Replace**를 고르세요. 그리고 **Replace**에 목록이 비어 있으면 아무 일도 일어나지 않습니다. Claude Code가 그때 내장 단어를 그대로 쓰기 때문에, 앱도 같게 동작합니다.

### Verbs

목록은 한 줄에 단어 하나입니다.

- **추가.** 맨 위의 빈 입력창에 단어를 적고 **Enter**를 누르거나 다른 곳을 클릭합니다. 입력창은 비워진 채 포커스를 유지하므로 다음 단어를 바로 이어서 적을 수 있습니다. 새 단어는 입력창 바로 아래에 붙습니다.
- **수정.** 단어를 클릭해서 고치고 **Enter**를 누르거나 다른 곳을 클릭합니다.
- **삭제.** 줄 끝의 **x**를 누르거나, 그 단어의 입력창을 비우고 다른 곳을 클릭합니다.
- 빈 항목과 단어 앞뒤의 공백은 버려집니다.

모든 변경은 하는 즉시 저장되고 저장 버튼은 없습니다. 마지막 단어를 지우면 `spinnerVerbs`가 파일에서 통째로 사라집니다. 빈 목록은 어차피 아무 일도 하지 않기 때문입니다.

한글, 일본어, 중국어를 입력기로 입력하는 경우, 글자를 적은 직후의 첫 **Enter**는 다른 곳에서처럼 마지막 글자의 조합만 끝냅니다. 단어를 추가하려면 **Enter**를 한 번 더 누르세요.

단어는 입력한 그대로 보입니다. 사용자의 단어는 번역되지 않고, 내장 단어는 인터페이스 언어에 맞춰 표시됩니다.

## 전역 설정과 프로젝트 설정

이 행은 설정 페이지 위쪽의 **User Settings (Global)**, **Project Settings (Local)** 탭을 다른 행과 똑같이 따릅니다. 두 탭의 관계는 [프로젝트 탭이 실제로 적용되는 설정을 보여줍니다](../089-project_tab_shows_inherited_settings/ko.md)에 정리돼 있습니다.

| 탭 | 보고 바꾸는 것 |
| --- | --- |
| **User Settings (Global)** | 사용자의 파일 `~/.claude/settings.json`. 자기 값을 정하지 않은 모든 프로젝트에 적용됩니다. |
| **Project Settings (Local)** | 프로젝트의 `.claude/settings.json`. 이 설정이 이미 `.claude/settings.local.json`에 있다면 그 파일. |

![Project Settings (Local) 탭의 같은 Appearance 페이지. "spinnerVerbs" 옆에 작은 G 배지가 있습니다. Mode는 Replace이고 목록에는 전역 탭에서 정한 "Brewing"과 "Processing"이 보입니다.](./assets/project-tab-inherits.png)

*프로젝트가 `spinnerVerbs`를 정하지 않은 프로젝트 탭입니다. **G** 배지는 전역 값이 쓰이고 있다는 뜻이고, 행은 그 값을 보여줍니다.*

- `spinnerVerbs`에 대해 아무 말도 하지 않는 프로젝트는 전역 값을 쓰고, 그 탭은 **G** 배지와 함께 그 값을 보여줍니다.
- 프로젝트 탭에서 행을 바꾸면 그 설정이 프로젝트에 저장됩니다. 행에는 **P** 배지가 붙고, 배지에 마우스를 올리면 **Reset to global**이 나옵니다.
- 프로젝트의 목록은 전역 목록을 **대체**합니다. 두 목록이 합쳐지지 않습니다.
- 전역 탭에서는, 프로젝트가 자기 값을 정해 둔 경우 행이 흐려지고 **P** 배지가 붙습니다. 거기서 바꿔도 그 프로젝트에는 효과가 없기 때문입니다.

## 파일을 직접 고칠 때

Claude Code가 읽는 어느 설정 파일에든 `spinnerVerbs`를 직접 적을 수 있습니다. 설정 화면과 채팅 스피너는 파일을 따라가고, 턴이 진행되는 중에도 마찬가지입니다. 스피너는 다음 단어가 나올 때 바뀐 내용을 받아들이며, 길어야 몇 초 안입니다.

직접 적은 값이 완벽하지 않아도 앱은 견딥니다.

- `verbs`가 목록이 아니면 설정이 없는 것으로 봅니다.
- `verbs` 안의 항목 중 글자가 아닌 것은 건너뜁니다.
- `"replace"`가 아닌 `mode`는 `"append"`로 읽습니다.
- 파일 전체를 JSON으로 읽을 수 없으면 앱은 실패하지 않고 빈 파일로 취급합니다. 파일을 고치면 설정이 돌아옵니다.

## 이 기능이 하지 않는 것

- 바꾸는 것은 단어뿐입니다. 스피너의 아이콘과 바뀌는 간격은 설정이 아닙니다.
- 일부 스피너가 줄 아래에 보여주는 팁은 건드리지 않습니다. 그것은 Claude Code의 별도 설정인 `spinnerTipsEnabled`입니다.
- 앱은 단어가 "동사"인지 검사하지 않습니다. 입력한 것은 무엇이든 보여줍니다.

## 내 단어가 보이지 않을 때

- **모드가 Append인가요?** 그렇다면 내 단어가 여든 개 가까운 내장 단어와 경쟁합니다. **Replace**를 고르세요.
- **프로젝트가 자기 목록을 정해 두었나요?** 전역 탭에서 행이 흐려지고 **P** 배지가 붙어 있습니다. 프로젝트의 목록이 우선하므로, 프로젝트 탭에서 바꾸거나 **Reset to global**을 쓰세요.
- **맞는 파일을 고쳤나요?** 전역 탭은 `~/.claude/settings.json`을 읽습니다. `CLAUDE_CONFIG_DIR`을 설정했다면 그 폴더를 읽습니다.
- **파일이 올바른 JSON인가요?** 읽을 수 없는 파일은 빈 파일로 취급하므로, 그 안의 설정은 적용되지 않습니다.
