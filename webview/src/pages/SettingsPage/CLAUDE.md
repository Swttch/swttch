# 설정 페이지 작성 원칙

`SettingsPage` 하위에 설정 항목을 추가/수정하는 모든 에이전트는 아래 원칙을 따른다.
**특별한 경우이거나 사용자의 별도 지시가 있는 경우에만** 예외를 둔다.

## 1. 사전 확인 — 레퍼런스를 먼저 본다

설정을 추가하기 **전에**, 같은 설정이 커서(Cursor)의 Claude Code 공식 확장에 이미 있는지 확인한다.

- 레퍼런스 위치: `~/.vscode/extensions/anthropic.claude-code-*` (또는 `~/.cursor/extensions/...`).
  설정 키는 `package.json` 의 `contributes.configuration`(예: `claudeCode.*`), UI 텍스트/동작은
  `webview/index.js`(minified)에서 확인. ([[cursor-claude-code-extension-bundle-reverse-engineering]] 참고)
- **대칭되는 기능이 있으면, 동작 방식·제목/설명 텍스트·값 타입을 가능한 한 그대로 가져온다.**
  레퍼런스와 100% 동일하게 만드는 것이 베스트이자 목표(goal)다. 자의적으로 다르게 만들지 않는다.
- 대칭 기능이 없을 때만 아래 원칙들로 넘어간다.

## 2. 레퍼런스에 없으면 — 간단·명료하게

레퍼런스에 대칭이 없는 새 설정은 가급적 **가장 간단한 형태**로 만든다.

- 설명 텍스트도 최대한 짧게. **모바일에서 봐도 한 문장으로 끊기는 수준**으로 — 간단하되 명료하게.
- 예: `CLAUDE_CONFIG_DIR` → 라벨 `CLAUDE_CONFIG_DIR`,
  설명 `Home directory for Claude's config. Same as the CLAUDE_CONFIG_DIR environment variable.`
- 장황한 다문장 설명(동작 범위 나열, 부연 등)을 피한다.

## 3. 새 설정은 General 에 추가한다

별도 지시가 없으면 새 설정 항목은 [General](./General/index.tsx) 섹션에 넣는다.
도메인이 명백히 다른 섹션(CLI, Appearance, Privacy 등)에 속할 때만 그쪽에 둔다 — 그것도
"애매하면 General" 을 기본값으로 삼는다.

## 4. 작명은 사용자의 워딩을 그대로 쓴다

라벨·키 이름을 자의적으로 변형하지 않는다. 사용자가 사용한 단어의 텍스트를 **그대로** 쓴다.

- 사용자가 `CLAUDE_CONFIG_DIR` 이라 부르면 라벨도 `CLAUDE_CONFIG_DIR`. ~~`Config Directory`~~ 로 멋대로 바꾸지 않는다.
- 환경변수·플래그·CLI 옵션 등 고유 식별자는 원형 그대로 노출한다.

## 4-1. 공식 문서에 번역이 있으면 그 문장을 그대로 쓴다

Claude Code 공식 문서가 그 설정의 설명을 해당 언어로 이미 번역해 두었다면, 설명과 값 설명을 우리가 새로 쓰지 않고 **공식 번역 문장 그대로** 가져온다. (`spinnerVerbs`, #548 에서 처음 적용)

- **어느 문장인가**: 설정 목록 표의 한 줄 요약이 아니라, 상세 항목의 **본문 첫 문단**(설명)과 `유형` 목록의 **값 설명 문장**이다.
- **키 이름과 값은 번역하지 않는다**: 공식 문서도 `spinnerVerbs`, `mode`, `verbs`, `"append"` 를 코드 표기 그대로 둔다. 4번 원칙대로 원형을 쓴다.
- **원문은 마크다운으로 받는다**: `https://code.claude.com/docs/<언어>/settings-reference.md` 를 내려받아 해당 문단을 그대로 옮긴다. 모델 요약을 거친 인용은 쓰지 않는다. 받은 파일은 새 빈 디렉토리에 두고 읽기만 한다.
- **공식 문서가 있는 언어**(2026-10-13 확인): `ko ja zh-CN zh-TW de fr es pt ru it id` 와 `en`. 우리 로케일 `zh` 는 `zh-CN` 에 해당한다.
- **공식 문서가 없는 언어**(`ar`, `fa` 등): 영어 공식 문장의 뜻을 따라 직접 쓰고, PR 본문에 어느 문장이 직접 쓴 것인지 적는다.
- **공식 문서에 그 설정 자체가 없을 때**만 2번 원칙(간단·명료)대로 직접 쓴다.

## 5. 항목 하나 때문에 섹션을 새로 만들지 않는다

`SettingSection`(제목 + 박스)은 **여러 관련 항목을 묶을 때만** 만든다.
인풋 하나를 추가하면서 `섹션 + 제목 + 설명 + 인풋` 한 세트를 통째로 만드는 것은
UI 오남용 안티패턴이다. 기존 섹션 안에 `SettingRow` 하나로 추가한다.

- 모범: [HostModeRow](./General/HostModeRow.tsx), [ClaudeConfigDirRow](./General/ClaudeConfigDirRow.tsx)
  — 둘 다 General 섹션 안의 단일 `SettingRow`.
- 안티패턴: 항목 하나마다 `<SettingSection title="...">` 를 새로 두르는 것.

## 6. 저장 버튼을 두지 않는다 — 입력이 곧 저장이다

특수한 경우를 제외하면 Save 버튼을 등장시키지 않는다. **입력 = 저장**이어야 한다.

- `Select` / `ToggleSwitch`: `onChange` 에서 즉시 저장.
- 자유 입력(`input`): `onBlur` 에서 저장 (포커스가 떠날 때). 값이 바뀌지 않았으면 저장을 건너뛴다.
- ~~별도 `Save` 버튼~~, ~~"Save to global / Save to project" 같은 보조 버튼~~ 은 두지 않는다.

## 컴포넌트 패턴

- 한 설정 항목은 별도 파일의 컴포넌트로 분리하고(예: `XxxRow.tsx`), 섹션 `index.tsx` 에서 조합한다.
- 공통 레이아웃은 [common](./common) 의 `SettingSection` / `SettingRow` 를 사용한다.
- 전역/지역(global/project) scope 는 `ScopeTabs` 가 `useSettings` 와 `useClaudeSettings`
  양쪽 scope 를 동기화하므로, 항목에서는 둘 중 하나의 `scope` 를 읽어 현재 탭에 맞춰 저장한다.
- 스타일은 Tailwind 클래스로만 한다. 인라인 `style={{}}` 금지.
- Props 선언, named export, 100줄 초과 시 폴더 분리 등은 프로젝트 루트 컨벤션을 따른다.

## blur 저장 예시 (ClaudeConfigDirRow)

```tsx
<SettingRow label="CLAUDE_CONFIG_DIR" description="...">
  <input
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onBlur={() => void commit()}   // 입력 = 저장, 별도 버튼 없음
    placeholder="Default (~/.claude)"
  />
</SettingRow>
```
