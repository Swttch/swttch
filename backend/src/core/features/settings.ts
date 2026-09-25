import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { atomicWriteFile, updateJsonFile, refusedWriteMessage } from './atomic-json';
import { normalizeSettingValue } from './path-settings';
import {
  DiffSurface,
  BrowserDiffPresentation,
  DIFF_SURFACES,
  BROWSER_DIFF_PRESENTATIONS,
  COMPOSER_SEND_SHORTCUTS,
  COMPOSER_NEWLINE_SHORTCUTS,
  FOLLOW_UP_BEHAVIORS,
} from '../../shared';

// ─── Settings helpers ────────────────────────────────────────────────────────

const SETTINGS_FILE = join(homedir(), '.claude-code-gui', 'settings.js');

// ─── Scope policy: project-local by default ──────────────────────────────────
//
// Every setting MUST be overridable per project. A setting that can be set
// locally is the better decision, so treat project scope as the default and do
// not ask whether a new key "should" support it — it should.
//
// Global-only is the rare exception, allowed solely when project scope is
// genuinely impossible. Two real cases so far, both structural rather than a
// matter of taste:
//   - CLAUDE_CONFIG_DIR (#123): it decides WHERE the settings file lives, so
//     resolving it from that file would be circular.
//   - nodePath: it decides which node LAUNCHES this backend, so the backend
//     cannot be the one to resolve it (ProjectSettingsReader is the narrow
//     read-only escape hatch the IDE uses instead).
//
// One further exception exists on product grounds rather than structural ones:
//   - dockLayout: the header dock is a toolbar the user navigates by muscle
//     memory, so the icons must not move when they switch projects. Nothing
//     prevents resolving it per project — the editor simply always writes to
//     global scope. A value placed in a project file by hand still wins, exactly
//     as it does for the two keys above.
//
// Note what is NOT a reason: "the Settings UI greys it out on the Project tab"
// is a symptom, not a justification. #239 removed exactly that greying for five
// keys after finding nothing about them required global scope. When a key looks
// global-only, state the structural reason it cannot be resolved per project;
// if no such reason exists, make it project-scoped.
//
// If a new key does look like an exception, the agent decides and proposes it
// with that reasoning — it is not a question to hand back to the user.

const DEFAULT_SETTINGS: Record<string, unknown> = {
  cliPath: null,
  nodePath: null,
  theme: 'system',
  fontSize: 13,
  zoomLevel: 1,
  lineHeight: 1.6,
  autoScrollThreshold: 80,
  softWrap: false,
  debugMode: false,
  logLevel: 'info',
  terminalApp: null,
  openFilesWith: null,
  openFilesWithCustom: null,
  hostMode: 'editor-tab',
  openSettingsAs: 'overlay',
  chatPagination: true,
  hideToolCalls: false,
  includeNestedSessions: false,
  uiDirection: 'ltr',
  // GUI-only keys migrated out of the native ~/.claude/settings.json (not part of
  // Claude Code's official settings schema). See settings-migration.ts.
  uiLanguage: null,
  voice: {},
  useCtrlEnterToSend: false,
  composerSendShortcut: null,
  composerSendShortcutCustom: null,
  composerNewlineShortcut: null,
  composerNewlineShortcutCustom: null,
  composerFollowUpBehavior: null,
  notificationBanner: null,
  notificationSound: null,
  notificationSoundVolume: 5,
  focusInputOnEditorContext: true,
  autoResumeOnLimit: false,
  attachEditorContext: true,
  autoOpenDiffOnPermission: true,
  diffSurface: DiffSurface.IDE,
  browserDiffPresentation: BrowserDiffPresentation.NEW_TAB,
  // Whether switching the model (dropdown or the rotate shortcut) also writes the
  // native `model` default, matching the CLI's single global default. GUI-only:
  // the CLI has no per-session override to gate. See issue #354.
  syncModelToDefault: true,
  // Header dock arrangement: `order` is the row order in the ⋮ menu (and, once
  // filtered to `visible`, the dock's icon order too); `visible` names which of
  // those items are pulled out into the dock. Both empty means "not configured
  // yet", which the webview normalizes into "declaration order, none visible" —
  // so a fresh install shows only the overflow (⋮) button.
  dockLayout: { order: [], visible: [] },
  // Only CLAUDE_CONFIG_DIR lives here: it decides where the native settings file
  // is, so it cannot be stored inside that file. Every other variable belongs to
  // the native `env` key. See settings-migration.ts.
  env: {},
  // ── Legacy keys kept ONLY so the migration can clear them ───────────────────
  // They moved to the native file (language, respectGitignore, ultracode).
  // Removing them from this map would make validateSetting reject the write that
  // empties them, stranding the old value here forever. Drop them once the
  // migration retires.
  language: null,
  respectGitignoreForContext: false,
  ultracode: null,
  // Unlike the two above, this one did not go native — it was replaced by our own
  // `diffSurface`, which names the surface instead of asking a yes/no about the
  // IDE. null is the default so a value here always means "not migrated yet".
  showDiffInIde: null,
};

const COMMENT_MAP: Record<string, string> = {
  cliPath: 'Claude CLI 실행 파일 경로 (null이면 자동 감지)',
  nodePath: 'Node.js 실행 파일 경로 (null이면 자동 감지, 변경 시 재시작 필요)',
  theme: '테마: "system" | "light" | "dark" ("system"은 JetBrains 모드에서 IDE 테마의 색상까지 따라간다)',
  fontSize: '글꼴 크기 (8~32)',
  zoomLevel: 'UI 배율(0.5~3). Ctrl/Cmd +,- 와 Ctrl/Cmd + 휠로 조절. 글꼴 크기와 별개로 아이콘·여백까지 함께 확대',
  lineHeight: '채팅 메시지 줄 간격(line-height 배수, 0.5~10)',
  autoScrollThreshold: '자동 스크롤 임계점(px). 메시지 끝에서 이 거리 안에 있을 때만 스트림을 따라 내려간다',
  softWrap: '긴 줄을 코드 블록 너비에 맞춰 접는다(diff, 도구 입출력 등). false면 가로 스크롤',
  debugMode: '디버그 모드 활성화',
  logLevel: '로그 레벨: "debug" | "info" | "warn" | "error"',
  terminalApp: '터미널 프로그램 (null이면 OS 기본 터미널)',
  openFilesWith: '파일을 열 프로그램 (null이면 OS 기본, "$custom"이면 openFilesWithCustom 사용)',
  openFilesWithCustom: '사용자 지정 파일 열기 프로그램: { path, arguments } (arguments의 %TARGET_PATH%가 파일 경로로 치환)',
  hostMode: '채팅을 띄우는 자리: "editor-tab" | "tool-window"',
  openSettingsAs: '설정 화면을 여는 방식: "overlay" | "new-tab"',
  chatPagination: '채팅 기록을 페이지 단위로 로드(스크롤 시 이전 메시지 추가). false면 전체를 한 번에 로드',
  hideToolCalls: '명령 실행·조회처럼 과정에 해당하는 도구 카드를 채팅에서 숨긴다(CLI의 focus view와 같은 자리). 파일 변경(Edit/Write)과 질문·계획처럼 사용자를 향한 것은 계속 보인다',
  includeNestedSessions: '세션 목록에 하위 작업 디렉터리의 세션까지 포함. false면 현재 디렉터리의 세션만',
  uiDirection: 'UI 미러링(레이아웃 방향): "ltr" | "rtl"',
  uiLanguage: 'GUI 인터페이스 표시 언어(예: "korean"). null이면 영어. Claude 응답 언어(language)와 무관',
  voice: '음성 입력 설정 중 공식 스키마에 없는 것들. speechLanguage: 말하는 언어의 BCP-47 코드(예: "ko"), 공식 language가 비었을 때만 쓰인다(VS Code 확장의 accessibility.voice.speechLanguage와 같은 자리). silenceTimeout: 말이 없을 때 녹음이 기다리는 초(1~15, 기본 15). 서비스가 15초 침묵이면 스스로 끊으므로 그 이상은 의미가 없다. enabled/mode/autoSubmit은 공식 키라 네이티브 settings.json에 있다',
  useCtrlEnterToSend: '[레거시] true면 Ctrl/Cmd+Enter로 전송하고 Enter는 줄바꿈. false면 Enter로 전송. composerSendShortcut/composerNewlineShortcut이 비었을 때만 쓰인다',
  composerSendShortcut: '프롬프트를 보내는 키: "enter" | "modEnter"(Ctrl/Cmd+Enter) | "custom". null이면 useCtrlEnterToSend를 따른다',
  composerSendShortcutCustom: 'composerSendShortcut이 "custom"일 때 쓰는 조합(저장형, 예: "Meta+Enter")',
  composerNewlineShortcut: '줄을 바꾸는 키: "shiftEnter" | "enter" | "custom". null이면 useCtrlEnterToSend를 따른다',
  composerNewlineShortcutCustom: 'composerNewlineShortcut이 "custom"일 때 쓰는 조합(저장형, 예: "Shift+Enter")',
  composerFollowUpBehavior: '턴이 도는 중에 보낸 메시지의 처리: "queue"(턴이 끝날 때까지 대기) | "steer"(현재 턴을 중단하고 이 메시지로 새 턴 시작). null이면 queue',
  notificationBanner: '세션이 턴을 마치거나 확인을 기다릴 때, 그 세션을 보고 있지 않으면 화면에 알림 배너를 띄울지. null은 아직 묻지 않았다는 뜻이며, 첫 알림에서 운영체제 권한을 요청하고 그 결과가 여기 기록된다. 알림음은 이 설정과 무관하게 울린다(알림음은 별도 설정)',
  notificationSound: '세션이 턴을 마치거나 확인을 기다릴 때 낼 소리의 id(LIST_SYSTEM_SOUNDS가 돌려주는 값, 예: "Glass"). null이면 소리를 내지 않는다. 배너와 무관하게 실행된다. 값은 소리를 낼 때마다 여기서 읽으므로 설정을 바꾸면 그 다음 턴부터 바로 적용된다',
  notificationSoundVolume: '알림음의 음량(1~10, 미설정 시 5). 한 눈금의 절대 크기는 운영체제마다 다르다 — 맥은 1이 원음이고 10이 원음의 10배(afplay 게인), 윈도우와 리눅스는 증폭이 안 되므로 10이 원음이고 1이 그 10분의 1이다',
  focusInputOnEditorContext: 'true면 Alt+K로 파일 경로 삽입 후 채팅 입력창으로 포커스 이동',
  autoResumeOnLimit: '사용량 리밋 리셋 시 자동 재개(후원자 전용). 기본 off. 리밋 배너의 기본 동작을 seed',
  attachEditorContext: '세션 시작 시 에디터 컨텍스트 칩을 활성 상태로 둘지. false면 칩은 뜨되 비활성으로 시작(세션 중 클릭 변경은 저장되지 않음)',
  autoOpenDiffOnPermission: '파일 편집 권한을 물을 때 diff를 저절로 열지. false면 승인 패널만 뜨고, 프롬프트의 파일명을 눌렀을 때만 diff가 열린다(변경 내용은 어느 쪽이든 보관되므로 나중에 눌러도 볼 수 있다)',
  diffSurface: '파일 편집 권한을 물을 때 변경 내용을 어디에 그릴지: "ide"(IDE 자체 diff 뷰어) | "built-in"(우리 diff 페이지). IDE 없이 실행 중이면 항상 "built-in"으로 동작한다',
  browserDiffPresentation: '브라우저에서 우리 diff 페이지를 어떻게 띄울지: "new-tab"(새 브라우저 탭) | "overlay"(현재 세션 위 모달). IDE에서는 에디터 탭으로 뜨므로 이 값과 무관하다',
  ultracode: '[레거시] 네이티브 settings.json으로 이관됨(CLI가 읽는 공식 키). 마이그레이션이 비우는 용도로만 남김',
  syncModelToDefault: '모델을 바꾸면(드롭다운·순환 단축키) 현재 세션뿐 아니라 CLI 기본 모델(네이티브 model 설정)도 함께 갱신. true가 CLI의 원래 동작과 동일',
  dockLayout: '상단바 우측 도크 배치: { order, visible } — order는 더보기(⋮) 메뉴 전체 항목의 순서, visible은 그 중 도크에 노출할 항목 id 집합. 둘 다 비면 미설정(전부 숨김)',
  env: 'CLAUDE_CONFIG_DIR 전용. 다른 환경 변수는 네이티브 settings.json의 env에 둔다',
  showDiffInIde: '[레거시] diffSurface로 대체됨. 마이그레이션이 값을 옮기고 비우는 용도로만 남김',
  language: '[레거시] 네이티브 settings.json으로 이관됨. 마이그레이션이 비우는 용도로만 남김',
  respectGitignoreForContext: '[레거시] 네이티브 respectGitignore로 이관됨. 마이그레이션이 비우는 용도로만 남김',
};

function generateSettingsContent(settings: Record<string, unknown>): string {
  const lines: string[] = ['export default {'];
  const keys = Object.keys(DEFAULT_SETTINGS);
  for (const key of keys) {
    const value = key in settings ? settings[key] : DEFAULT_SETTINGS[key];
    const comment = COMMENT_MAP[key];
    if (comment) {
      lines.push(`  // ${comment}`);
    }
    const serialized = value === null ? 'null' : JSON.stringify(value);
    lines.push(`  ${key}: ${serialized},`);
  }
  lines.push('};');
  return lines.join('\n') + '\n';
}

/**
 * Strip `//` line comments and block comments from the settings JS source, but
 * NEVER when the marker sits inside a string literal. A value such as
 * "//wsl.localhost/..." (a WSL UNC path a user may enter for cliPath/nodePath)
 * must survive intact — otherwise JSON.parse throws and the whole settings
 * object silently falls back to defaults, dropping the user's saved hostMode
 * down to "editor-tab" (regression #7).
 */
function stripJsComments(src: string): string {
  let out = '';
  let inString = false;
  let quote = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        // preserve the escaped character verbatim
        i++;
        if (i < src.length) out += src[i];
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      // line comment → drop to end of line, keep the newline
      while (i < src.length && src[i] !== '\n') i++;
      if (i < src.length) out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      // block comment → drop through the closing marker
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++; // skip '*'; the loop's i++ skips '/'
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * What a read of the global settings file found.
 *
 * `unreadable` exists so the read half of a read-modify-write can tell "the user
 * has no value for this" apart from "we could not read the user's values". The
 * two look identical once the failure has been replaced by DEFAULT_SETTINGS, and
 * saving one key on top of that substitution writes the defaults over everything
 * the user had set. That is the same defect issue #386 fixed for JSON files; the
 * project-scope branch of {@link saveSettingToScope} already cites it.
 */
type SettingsReadForUpdate =
  | { status: 'ok'; settings: Record<string, unknown> }
  | { status: 'unreadable'; reason: string };

/**
 * Read and parse `~/.claude-code-gui/settings.js`, reporting a failure instead of
 * substituting defaults.
 *
 * An ABSENT file is created with defaults and reported as `ok`, because there is
 * nothing to lose by writing it — the same rule `readJsonForUpdate` states for an
 * empty file.
 */
async function readSettingsFileForUpdate(): Promise<SettingsReadForUpdate> {
  try {
    if (!existsSync(SETTINGS_FILE)) {
      // Create with defaults
      await mkdir(join(homedir(), '.claude-code-gui'), { recursive: true });
      await atomicWriteFile(SETTINGS_FILE, generateSettingsContent(DEFAULT_SETTINGS));
      return { status: 'ok', settings: { ...DEFAULT_SETTINGS } };
    }

    const raw = await readFile(SETTINGS_FILE, 'utf-8');

    // Strip comments in a string-literal-aware way so a value like
    // "//wsl.localhost/..." (WSL UNC path) is never mistaken for a comment (#7).
    let stripped = stripJsComments(raw);

    // Remove `export default` prefix and trailing semicolon
    stripped = stripped.replace(/^\s*export\s+default\s*/, '').replace(/;\s*$/, '').trim();

    // Add quotes to unquoted keys: word chars followed by colon
    stripped = stripped.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');

    // Remove trailing commas before closing braces/brackets
    stripped = stripped.replace(/,\s*([\]}])/g, '$1');

    const parsed: unknown = JSON.parse(stripped);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      // Parsing is not the same as having read a settings object: `null`, a list
      // and a bare string all parse, and none of them is something to save a key
      // onto.
      return { status: 'unreadable', reason: 'settings.js did not contain an object' };
    }

    // Merge with defaults so missing keys get default values
    return { status: 'ok', settings: { ...DEFAULT_SETTINGS, ...parsed } };
  } catch (err) {
    return { status: 'unreadable', reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read the effective global settings, substituting defaults when the file cannot
 * be read.
 *
 * Substituting is right for a READER — a screen has to render something — and
 * destructive as the read half of a read-modify-write. Writers therefore use
 * {@link readSettingsFileForUpdate} instead and refuse.
 */
export async function readSettingsFile(): Promise<Record<string, unknown>> {
  const read = await readSettingsFileForUpdate();
  if (read.status === 'unreadable') {
    console.error('[node-backend]', 'Failed to read settings file, using defaults:', read.reason);
    return { ...DEFAULT_SETTINGS };
  }
  return read.settings;
}

export interface SaveResult {
  status: 'ok' | 'error';
  error?: string;
}

function validateSetting(key: string, value: unknown): string | null {
  if (!(key in DEFAULT_SETTINGS)) {
    return `Unknown settings key: ${key}`;
  }
  switch (key) {
    case 'theme':
      if (!['system', 'light', 'dark'].includes(value as string)) {
        return 'theme must be one of "system", "light", "dark"';
      }
      break;
    case 'fontSize': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 8 || n > 32) {
        return 'fontSize must be an integer between 8 and 32';
      }
      break;
    }
    case 'zoomLevel': {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0.5 || n > 3) {
        return 'zoomLevel must be a number between 0.5 and 3';
      }
      break;
    }
    case 'lineHeight': {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0.5 || n > 10) {
        return 'lineHeight must be a number between 0.5 and 10';
      }
      break;
    }
    case 'autoScrollThreshold': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        return 'autoScrollThreshold must be a positive integer';
      }
      break;
    }
    case 'debugMode':
      if (typeof value !== 'boolean') {
        return `${key} must be a boolean`;
      }
      break;
    case 'logLevel':
      if (!['debug', 'info', 'warn', 'error'].includes(value as string)) {
        return 'logLevel must be one of "debug", "info", "warn", "error"';
      }
      break;
    case 'cliPath':
      if (value !== null && typeof value !== 'string') {
        return 'cliPath must be a string or null';
      }
      break;
    case 'nodePath':
      if (value !== null && typeof value !== 'string') {
        return 'nodePath must be a string or null';
      }
      break;
    case 'terminalApp':
      if (value !== null && typeof value !== 'string') {
        return 'terminalApp must be a string or null';
      }
      break;
    case 'openFilesWith':
      if (value !== null && typeof value !== 'string') {
        return 'openFilesWith must be a string or null';
      }
      break;
    case 'openFilesWithCustom': {
      if (value !== null) {
        if (typeof value !== 'object' || Array.isArray(value)) {
          return 'openFilesWithCustom must be an object or null';
        }
        const custom = value as Record<string, unknown>;
        if (typeof custom.path !== 'string' || typeof custom.arguments !== 'string') {
          return 'openFilesWithCustom must have string "path" and "arguments"';
        }
      }
      break;
    }
    case 'hostMode':
      if (!['editor-tab', 'tool-window'].includes(value as string)) {
        return 'hostMode must be one of "editor-tab", "tool-window"';
      }
      break;
    case 'openSettingsAs':
      if (!['overlay', 'new-tab'].includes(value as string)) {
        return 'openSettingsAs must be one of "overlay", "new-tab"';
      }
      break;
    // Null is a real value here, not a missing one: it says "the user has never
    // chosen", which hands the answer to the legacy useCtrlEnterToSend. Rejecting
    // it would make clearing the choice impossible.
    case 'composerSendShortcut':
      if (value !== null && !COMPOSER_SEND_SHORTCUTS.includes(value as string)) {
        return `composerSendShortcut must be null or one of ${COMPOSER_SEND_SHORTCUTS.map((s) => `"${s}"`).join(', ')}`;
      }
      break;
    case 'composerNewlineShortcut':
      if (value !== null && !COMPOSER_NEWLINE_SHORTCUTS.includes(value as string)) {
        return `composerNewlineShortcut must be null or one of ${COMPOSER_NEWLINE_SHORTCUTS.map((s) => `"${s}"`).join(', ')}`;
      }
      break;
    // The recorded combination in stored form ('Meta+Enter'). Not parsed here:
    // the webview writes what its own parser produced, and a backend that
    // re-validated the grammar would be a second place to keep that grammar.
    case 'composerSendShortcutCustom':
    case 'composerNewlineShortcutCustom':
      if (value !== null && typeof value !== 'string') {
        return `${key} must be a string or null`;
      }
      break;
    case 'composerFollowUpBehavior':
      if (value !== null && !FOLLOW_UP_BEHAVIORS.includes(value as string)) {
        return `composerFollowUpBehavior must be null or one of ${FOLLOW_UP_BEHAVIORS.map((s) => `"${s}"`).join(', ')}`;
      }
      break;
    case 'diffSurface':
      if (!DIFF_SURFACES.includes(value as string)) {
        return `diffSurface must be one of ${DIFF_SURFACES.map((s) => `"${s}"`).join(', ')}`;
      }
      break;
    case 'browserDiffPresentation':
      if (!BROWSER_DIFF_PRESENTATIONS.includes(value as string)) {
        return `browserDiffPresentation must be one of ${BROWSER_DIFF_PRESENTATIONS.map((p) => `"${p}"`).join(', ')}`;
      }
      break;
    case 'autoOpenDiffOnPermission':
    // null means "never asked" — the first notification requests OS permission
    // and writes the answer here, so null has to survive a round trip rather
    // than being rejected as "not a boolean".
    case 'notificationBanner':
      if (value !== null && typeof value !== 'boolean') {
        return 'notificationBanner must be a boolean or null';
      }
      break;
    case 'chatPagination':
    case 'hideToolCalls':
    case 'includeNestedSessions':
    case 'softWrap':
      if (typeof value !== 'boolean') {
        return `${key} must be a boolean`;
      }
      break;
    case 'uiDirection':
      if (!['ltr', 'rtl'].includes(value as string)) {
        return 'uiDirection must be one of "ltr", "rtl"';
      }
      break;
    case 'uiLanguage':
      if (value !== null && typeof value !== 'string') {
        return 'uiLanguage must be a string or null';
      }
      break;
    // The id of an OS sound as reported by LIST_SYSTEM_SOUNDS, or null for
    // silence. The set of valid ids is per-machine (macOS aiff, Windows wav,
    // Linux ogg), so it cannot be enumerated here; an id that no longer exists
    // surfaces at play time as "Unknown sound id" rather than blocking the save.
    case 'notificationSound':
      if (value !== null && typeof value !== 'string') {
        return 'notificationSound must be a string or null';
      }
      break;
    // How loud, on a 1-10 scale. Out-of-range values are rejected here rather
    // than clamped, so a typo in the settings file is told about instead of
    // silently becoming something else. Zero is not a step: silencing the
    // notification is what choosing no sound is for.
    case 'notificationSoundVolume':
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 10
      ) {
        return 'notificationSoundVolume must be an integer between 1 and 10';
      }
      break;
    case 'voice': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return 'voice must be an object';
      }
      const voice = value as Record<string, unknown>;
      if (
        'speechLanguage' in voice &&
        voice.speechLanguage !== null &&
        typeof voice.speechLanguage !== 'string'
      ) {
        return 'voice.speechLanguage must be a string or null';
      }
      if ('shortcut' in voice && voice.shortcut !== null) {
        // Stored as "Alt+D" / "Ctrl+Shift+K": modifiers then the key. At least
        // one of Ctrl/Alt/Meta is required — a bare letter would swallow that
        // character in the composer.
        const shortcut = voice.shortcut;
        const valid =
          typeof shortcut === 'string' &&
          /^(?:(?:Ctrl|Alt|Shift|Meta)\+)*(?:Ctrl|Alt|Meta)\+(?:(?:Ctrl|Alt|Shift|Meta)\+)*[^+]+$/.test(shortcut);
        if (!valid) {
          return 'voice.shortcut must combine Ctrl, Alt or Meta with a key (e.g. "Alt+D")';
        }
      }
      if ('silenceTimeout' in voice) {
        const seconds = voice.silenceTimeout;
        // 15 is where the service stops listening on its own, so a longer wait
        // could never elapse — and for the same reason there is no 0 meaning
        // "never stop", which we would be unable to honour.
        if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > 15) {
          return 'voice.silenceTimeout must be an integer between 1 and 15';
        }
      }
      break;
    }
    // Legacy: kept so the migration can clear it (null) after moving the value
    // to the native file.
    case 'language':
      if (value !== null && typeof value !== 'string') {
        return 'language must be a string or null';
      }
      break;
    case 'useCtrlEnterToSend':
    case 'focusInputOnEditorContext':
    case 'autoResumeOnLimit':
    case 'attachEditorContext':
    case 'syncModelToDefault':
      if (typeof value !== 'boolean') {
        return `${key} must be a boolean`;
      }
      break;
    // Legacy: null clears it once the value has moved to `diffSurface`. Rejecting
    // null would leave the old key in the file forever, and the migration would
    // retry the same failing write on every startup.
    case 'showDiffInIde':
      if (value !== null && typeof value !== 'boolean') {
        return 'showDiffInIde must be a boolean or null';
      }
      break;
    // null = off/cleared, mirroring how the effort slider clears the top step.
    case 'ultracode':
      if (value !== null && typeof value !== 'boolean') {
        return 'ultracode must be a boolean or null';
      }
      break;
    // Legacy: null clears it once the value has moved to native respectGitignore.
    case 'respectGitignoreForContext':
      if (value !== null && typeof value !== 'boolean') {
        return 'respectGitignoreForContext must be a boolean or null';
      }
      break;
    // Shape-only validation, on purpose. The item ids live in the webview's dock
    // registry; mirroring the list here would mean editing two files to add one
    // icon, and the webview already drops ids it no longer knows (and any id in
    // `visible` that `order` does not also contain) when it normalizes the
    // layout. So an unrecognized or inconsistent id is stored but harmless.
    case 'dockLayout': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return 'dockLayout must be an object with "order" and "visible" arrays';
      }
      const layout = value as Record<string, unknown>;
      if (!Array.isArray(layout.order) || !Array.isArray(layout.visible)) {
        return 'dockLayout.order and dockLayout.visible must both be arrays';
      }
      if (layout.order.some((entry) => typeof entry !== 'string') || layout.visible.some((entry) => typeof entry !== 'string')) {
        return 'dockLayout entries must be strings';
      }
      // A duplicate would leave two rows claiming the same position in `order`
      // and make the drag reorder ambiguous about which copy moved.
      if (new Set(layout.order as string[]).size !== layout.order.length) {
        return 'dockLayout.order entries must be unique';
      }
      break;
    }
    case 'env': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return 'env must be an object of string values';
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v !== 'string') {
          return `env.${k} must be a string`;
        }
      }
      break;
    }
  }
  return null;
}

/** Coerce an unknown settings value into a string-keyed env record (or {}). */
function asEnvRecord(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return {};
}

/**
 * Read project-level app settings.
 * Project settings use JSON format: {projectPath}/.claude-code-gui/settings.json
 */
export async function readProjectSettings(projectPath: string): Promise<Record<string, unknown>> {
  const filePath = join(projectPath, '.claude-code-gui', 'settings.json');
  try {
    if (!existsSync(filePath)) return {};
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error('[node-backend]', 'Failed to read project settings:', err);
    return {};
  }
}

/**
 * Read merged settings: DEFAULT → global → project
 */
export async function readMergedSettings(projectPath?: string): Promise<{ settings: Record<string, unknown>; overrides: string[] }> {
  const globalSettings = await readSettingsFile();
  if (!projectPath) {
    return { settings: globalSettings, overrides: [] };
  }
  const projectSettings = await readProjectSettings(projectPath);
  const overrides = Object.keys(projectSettings);
  const merged: Record<string, unknown> = { ...globalSettings, ...projectSettings };
  // env is the one nested key we merge by sub-key (Claude's own order: global env,
  // then project env overriding individual keys) rather than replacing wholesale —
  // otherwise a project that sets one var would wipe the user's global vars.
  merged.env = { ...asEnvRecord(globalSettings.env), ...asEnvRecord(projectSettings.env) };
  return { settings: merged, overrides };
}

/**
 * Resolve the effective CLAUDE_CONFIG_DIR override declared in the plugin settings
 * `env` map (project takes priority over global). Returns null when unset, so callers
 * can fall back to process.env / the default ~/.claude.
 */
export async function resolveClaudeConfigDirOverride(projectPath?: string): Promise<string | null> {
  const { settings } = await readMergedSettings(projectPath);
  const value = asEnvRecord(settings.env).CLAUDE_CONFIG_DIR;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Set or remove a single variable inside the `env` map at the given scope, preserving
 * the other variables. Passing value === null removes the variable.
 */
export async function saveEnvVarToScope(
  name: string,
  value: string | null,
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<SaveResult> {
  if (scope === 'project' && !projectPath) {
    return { status: 'error', error: 'projectPath required for project scope' };
  }

  const source = scope === 'project'
    ? await readProjectSettings(projectPath as string)
    : await readSettingsFile();
  const currentEnv = { ...asEnvRecord(source.env) };

  if (value === null) {
    delete currentEnv[name];
  } else {
    currentEnv[name] = value;
  }

  return saveSettingToScope('env', currentEnv, scope, projectPath);
}

/**
 * Save a setting to the specified scope.
 * For project scope, saves to {projectPath}/.claude-code-gui/settings.json
 *
 * At project scope, `value === null` removes the key rather than storing a null —
 * the same convention {@link saveEnvVarToScope} uses for env vars. That is what
 * "reset to the global value" means here: a stored null would keep the key in the
 * file, so it would still count as a project override and still win the merge,
 * and the global value would never come back (issue #344).
 */
export async function saveSettingToScope(
  key: string,
  value: unknown,
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<SaveResult> {
  if (scope === 'project') {
    if (!projectPath) return { status: 'error', error: 'projectPath required for project scope' };
    // A removal still has to name a real key, but the value-shape checks do not
    // apply to it — validateSetting('theme', null) would reject, which would make
    // resetting a key to the global value fail for every typed setting.
    if (!(key in DEFAULT_SETTINGS)) return { status: 'error', error: `Unknown settings key: ${key}` };
    // Trimming before validation keeps the stored value and the validated value the
    // same one. A path that trims down to nothing becomes null, which at project
    // scope means "remove the override" — the right outcome for a field the user
    // blanked out with spaces.
    const normalized = normalizeSettingValue(key, value);
    if (normalized !== null) {
      const validationError = validateSetting(key, normalized);
      if (validationError) return { status: 'error', error: validationError };
    }

    try {
      const filePath = join(projectPath, '.claude-code-gui', 'settings.json');
      await mkdir(join(projectPath, '.claude-code-gui'), { recursive: true });
      // "start fresh" on a parse failure used to be the behaviour here, and that
      // is exactly what wipes a file: the one key being saved becomes the whole
      // file (issue #386). updateJsonFile aborts on a file it cannot read.
      const result = await updateJsonFile(filePath, (current) => {
        if (normalized === null) {
          delete current[key];
        } else {
          current[key] = normalized;
        }
        return current;
      });
      return result.status === 'ok' ? { status: 'ok' } : { status: 'error', error: result.error };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: msg };
    }
  }
  // global scope: use existing saveSettingToFile
  return saveSettingToFile(key, value);
}

/**
 * Serializes global settings writes. Concurrent updateSetting calls used to
 * interleave their read-modify-write of settings.js — a shorter new write left
 * a tail of the previous content, corrupting the file. Chaining guarantees one
 * read-modify-write completes before the next begins.
 */
let settingsWriteChain: Promise<unknown> = Promise.resolve();

export function saveSettingToFile(key: string, value: unknown): Promise<SaveResult> {
  const run = settingsWriteChain.then(() => doSaveSettingToFile(key, value));
  // Keep the chain alive even if a write fails.
  settingsWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function doSaveSettingToFile(key: string, value: unknown): Promise<SaveResult> {
  const normalized = normalizeSettingValue(key, value);
  const validationError = validateSetting(key, normalized);
  if (validationError) {
    return { status: 'error', error: validationError };
  }

  try {
    // Not readSettingsFile(): that answers an unreadable file with
    // DEFAULT_SETTINGS, and writing the whole object back would then replace
    // every value the user had set with a default. Saving one key must never be
    // able to clear the rest (issue #386).
    const read = await readSettingsFileForUpdate();
    if (read.status === 'unreadable') {
      const error = refusedWriteMessage(SETTINGS_FILE, read.reason);
      console.error('[node-backend]', `${error} — ${key} was not saved`);
      return { status: 'error', error };
    }
    const current = read.settings;
    current[key] = normalized;
    await mkdir(join(homedir(), '.claude-code-gui'), { recursive: true });
    await atomicWriteFile(SETTINGS_FILE, generateSettingsContent(current));
    return { status: 'ok' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'Failed to save setting:', err);
    return { status: 'error', error: msg };
  }
}
