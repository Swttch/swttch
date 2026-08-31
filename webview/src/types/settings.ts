import { AUTO_SCROLL_THRESHOLD_DEFAULT } from '@/utils/autoScroll';
import { ZOOM_DEFAULT } from '@/utils/zoom';
import { DiffSurface, BrowserDiffPresentation } from '@/shared';

/**
 * Chat message line-height (unitless multiplier). Matches the CSS default in
 * streaming.css (`.streaming-message` etc.) so turning the setting off/absent
 * renders exactly as before. Kept in sync with the backend validator range.
 */
export const LINE_HEIGHT_DEFAULT = 1.6;
export const LINE_HEIGHT_MIN = 0.5;
export const LINE_HEIGHT_MAX = 10;
export const LINE_HEIGHT_STEP = 0.1;

/**
 * 설정 키 정의 - Kotlin SettingsManager와 동기화 (settings.js 파일 기반)
 */
export enum SettingKey {
  // CLI
  CLI_PATH = 'cliPath',
  NODE_PATH = 'nodePath',

  // Appearance. In JetBrains mode, THEME=SYSTEM ("System (IDE)") also re-points
  // the color tokens at the colors the IDE's applied theme resolves to, so the
  // chat renders flush with the IDE surface (issue #267); LIGHT/DARK keep our
  // own palette. In browser mode SYSTEM is "System (OS)" and only follows
  // prefers-color-scheme, since no IDE colors are injected there.
  THEME = 'theme',
  FONT_SIZE = 'fontSize',
  // Whole-interface scale driven by CmdOrCtrl +/- and CmdOrCtrl + wheel.
  // Independent of FONT_SIZE: effective text size is fontSize × zoomLevel.
  ZOOM_LEVEL = 'zoomLevel',
  LINE_HEIGHT = 'lineHeight',
  AUTO_SCROLL_THRESHOLD = 'autoScrollThreshold',
  // Fold long lines to the width of the code block instead of scrolling them
  // sideways — diffs, tool input/output, and the other monospace blocks that
  // render with `whitespace-pre`. Off by default so the existing horizontal
  // scroll stays the default reading mode (issue #179).
  SOFT_WRAP = 'softWrap',

  // Advanced
  DEBUG_MODE = 'debugMode',
  LOG_LEVEL = 'logLevel',

  // Terminal
  TERMINAL_APP = 'terminalApp',

  // Which program opens clicked file references (browser env; null = OS default,
  // '$custom' = use the custom editor below)
  OPEN_FILES_WITH = 'openFilesWith',

  // Custom "open files with" program: { path, arguments }
  OPEN_FILES_WITH_CUSTOM = 'openFilesWithCustom',

  // Host
  HOST_MODE = 'hostMode',

  // Settings screen open mode
  OPEN_SETTINGS_AS = 'openSettingsAs',

  // Chat history paging
  CHAT_PAGINATION = 'chatPagination',

  // List sessions from directories nested under the one being browsed, not just
  // that directory itself. Off by default: it widens what the session dropdown
  // shows, which should be the user's choice rather than a surprise.
  INCLUDE_NESTED_SESSIONS = 'includeNestedSessions',

  // UI mirroring (RTL/LTR layout direction)
  UI_DIRECTION = 'uiDirection',

  // ── GUI-only keys migrated out of the native ~/.claude/settings.json ────────
  // (not part of Claude Code's official settings schema; see backend
  //  settings-migration.ts). They now live in ~/.claude-code-gui/settings.js.

  // GUI interface display language (e.g. 'korean'); null → English. This is our
  // own i18n, unrelated to Claude's response language (a native key).
  UI_LANGUAGE = 'uiLanguage',

  // Voice input settings that the official schema does NOT define — currently
  // just `speechLanguage`, the BCP-47 code of the language being spoken.
  //
  // Claude Code treats its own `language` key as the dictation language too, so
  // that one is authoritative and lives in the native file. This is the fallback
  // consulted only when it is empty — precisely the role the docs give VS Code's
  // `accessibility.voice.speechLanguage`, which is why the name matches.
  //
  // `voice.enabled` / `mode` / `autoSubmit` ARE official and are read from and
  // written to the native settings instead; see useClaudeSettings.
  VOICE = 'voice',

  // When true, Ctrl/Cmd+Enter sends and plain Enter inserts a newline.
  USE_CTRL_ENTER_TO_SEND = 'useCtrlEnterToSend',

  // When true, move focus to the chat input after inserting a file path (Alt+K).
  FOCUS_INPUT_ON_EDITOR_CONTEXT = 'focusInputOnEditorContext',

  // Auto-resume on usage-limit reset (sponsor-only); seeds the limit banner default.
  AUTO_RESUME_ON_LIMIT = 'autoResumeOnLimit',

  // Seeds the editor-context chip's state at the START of a session (/clear, reset,
  // new session). Like the model or permission mode, it is a starting value only:
  // clicking the chip mid-session changes that session alone and is never written
  // back here. Anything other than an explicit `false` counts as enabled, so a
  // missing or unreadable value leaves the feature on rather than silently off.
  ATTACH_EDITOR_CONTEXT = 'attachEditorContext',

  // Whether the review opens by itself when the permission prompt goes up, or
  // waits for the user to click the file name in that prompt. Only about the
  // UNPROMPTED open: the click always works, and the change is always stored for
  // it to show. False leaves the prompt on its own, which is what people who
  // read the prompt rather than the diff asked for (#349).
  AUTO_OPEN_DIFF_ON_PERMISSION = 'autoOpenDiffOnPermission',

  // Where a proposed file edit is shown for review while the permission prompt
  // is up, so the user can see WHAT they are approving instead of just the file
  // name. See {@link DiffSurface} for what each value means.
  DIFF_SURFACE = 'diffSurface',

  // How the built-in diff appears in a browser. Browser-only: an IDE shows it in
  // an editor tab, which is not one of these. See {@link BrowserDiffPresentation}.
  BROWSER_DIFF_PRESENTATION = 'browserDiffPresentation',

  // [Legacy] Superseded by DIFF_SURFACE, which says WHERE to draw the diff rather
  // than only whether the IDE may. Kept so the migration can read the old value
  // (false meant "not in the IDE" = BUILT_IN) and then clear it.
  SHOW_DIFF_IN_IDE = 'showDiffInIde',

  // Header dock arrangement: which overflow-menu items show as icons next to the
  // ⋮ button, and in what order. Global-only by product decision (the dock is
  // navigated by muscle memory, so it must not shift between projects).
  DOCK_LAYOUT = 'dockLayout',

  // Whether switching the model (dropdown or the rotate shortcut) also writes
  // the native `model` default (~/.claude/settings.json), matching how the CLI's
  // `/model` has always worked (one global default, no per-session override).
  // This ON/OFF switch is itself GUI-only — the CLI has no such toggle, since it
  // has no concept of a session-only model change to gate. See issue #354.
  SYNC_MODEL_TO_DEFAULT = 'syncModelToDefault',
}

/**
 * Items that can live in the header dock. The value is what gets persisted in
 * {@link SettingKey.DOCK_LAYOUT}, so renaming one strands the user's arrangement
 * for that item (normalizeDockLayout drops ids it does not recognize and appends
 * the new one to `hidden`).
 *
 * Declaration order is the fallback order: an item missing from a saved layout —
 * a newly shipped one, most often — is appended to `hidden` in this order, so it
 * is reachable from the ⋮ menu rather than invisible forever.
 */
export enum DockItemId {
  TOKEN_BATTERY = 'tokenBattery',
  SCHEDULED_MESSAGES = 'scheduledMessages',
  BACKGROUND_TASKS = 'backgroundTasks',
  TUNNEL = 'tunnel',
  SETTINGS = 'settings',
  NEW_TAB = 'newTab',
  // Accounts are NOT a dock item: the switcher is a picker (a list of saved
  // accounts), not a single action, and always sits as its own icon to the
  // right of ⋮ instead. A layout saved with the old 'accountSwitcher' id simply
  // drops it — normalizeDockLayout discards ids it does not recognize.
}

/**
 * Header dock arrangement, as a single ordered list plus which of those items
 * are currently pulled out into the dock.
 *
 * `order` is the ONE sequence of every dock item — both the row order in the ⋮
 * menu and, filtered down to `visible`, the icon order in the dock itself. There
 * is no separate "dock order": an item's position among other docked items is
 * simply its position in `order` with the hidden ones skipped. Two lists to
 * reorder would mean deciding which one a drag updates; one list removes the
 * question.
 *
 * `visible` is a boolean set of "docked or not" over the SAME ids, independent of
 * where they sit in `order`. Toggling it therefore never touches order.
 *
 * Both arrays empty means "not configured yet" — a fresh install, which
 * normalizes to every known item in declaration order, none of them visible
 * (only ⋮ shows).
 */
export interface DockLayout {
  order: DockItemId[];
  visible: DockItemId[];
}

/**
 * Page size sent when chat pagination is OFF: request the whole active chain in
 * one shot so the backend returns everything (hasMore=false → no "load older"
 * UI). Shared by every session-load path so they resolve the setting identically.
 */
export const NO_PAGINATION_LIMIT = 1_000_000;

/**
 * How the Settings screen opens from the gear button:
 * - overlay: a modal over the current session (keeps a running session mounted)
 * - new-tab: a dedicated editor tab / browser tab (the legacy openSettings path)
 */
export enum OpenSettingsMode {
  OVERLAY = 'overlay',
  NEW_TAB = 'new-tab',
}

// Defined in shared/ because the backend decides on them too (whether to ask the
// IDE for a diff at all), and re-exported here so callers reach every setting
// value through this module the way they do for the enums declared above.
export { DiffSurface, BrowserDiffPresentation };

/**
 * 채팅을 띄우는 자리(호스트) - Kotlin HostMode / 백엔드 hostMode 와 동기화.
 */
export enum HostMode {
  EDITOR_TAB = 'editor-tab',
  TOOL_WINDOW = 'tool-window',
}

/**
 * 테마 모드 Enum - 기존 types/index.ts의 'light' | 'dark' 타입을 대체
 */
export enum ThemeMode {
  SYSTEM = 'system',
  LIGHT = 'light',
  DARK = 'dark',
}

/**
 * UI 미러링(레이아웃 방향) Enum. 'auto'(로케일 자동연동) 확장 여지를 위해
 * boolean이 아닌 문자열 값을 사용한다.
 */
export enum UiDirection {
  LTR = 'ltr',
  RTL = 'rtl',
}

/**
 * 로그 레벨 Enum
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/** Sentinel {@link SettingKey.OPEN_FILES_WITH} value selecting the custom editor. */
export const OPEN_FILES_WITH_CUSTOM_VALUE = '$custom';

/** A user-configured custom editor: executable/app path + argument template. */
export interface OpenFileWithCustom {
  path: string;
  arguments: string;
}

/**
 * How long recording waits through silence before stopping itself, in seconds.
 *
 * 15 is both the default and the ceiling because the service stops listening
 * after that much silence regardless — a longer wait could never elapse, and
 * "never stop" is not on offer for the same reason: recording would end at 15
 * seconds anyway, so the option would promise something we cannot deliver.
 *
 * This is NOT the length of a recording. A recording may run up to
 * {@link VOICE_TOTAL_DURATION_MAX}; this only bounds the quiet at the end.
 */
export const VOICE_SILENCE_TIMEOUT_DEFAULT = 15;
export const VOICE_SILENCE_TIMEOUT_MIN = 1;
export const VOICE_SILENCE_TIMEOUT_MAX = 15;

/**
 * The longest a single recording runs, in seconds, per Claude Code's
 * documented dictation behaviour. Speaking continuously for two minutes is
 * fine; it is only the silence that is capped above.
 */
export const VOICE_TOTAL_DURATION_MAX = 120;

/**
 * Default keystroke for starting and stopping voice input.
 *
 * Alt (Option) rather than Cmd/Ctrl because those are crowded: Cmd+D bookmarks
 * the page in every browser, and Ctrl+D is end-of-input in a terminal and
 * delete-line in several editors. Alt+D collides with far less.
 */
export const VOICE_SHORTCUT_DEFAULT = 'Alt+D';

/**
 * Bring a typed silence timeout into the 1..15 second range.
 *
 * There is no "never stop" option: the service itself stops listening after 15
 * seconds of silence, so we could not honour one — recording would end anyway
 * and the setting would be a promise we cannot keep.
 */
export function clampVoiceSilenceTimeout(seconds: number): number {
  if (!Number.isFinite(seconds)) return VOICE_SILENCE_TIMEOUT_DEFAULT;
  return Math.min(Math.max(Math.round(seconds), VOICE_SILENCE_TIMEOUT_MIN), VOICE_SILENCE_TIMEOUT_MAX);
}

/**
 * Voice input settings that are ours rather than Claude Code's.
 *
 * `speechLanguage` is the fallback for the dictation language, consulted only
 * when the official `language` is empty — the role the docs assign to VS Code's
 * `accessibility.voice.speechLanguage`.
 */
export interface VoiceSettings {
  /** BCP-47 code of the language being spoken, e.g. 'ko'. */
  speechLanguage?: string | null;
  /** Seconds of silence before recording stops, 1..15. */
  silenceTimeout?: number;
  /** Keystroke that toggles recording, e.g. 'Alt+D'. */
  shortcut?: string | null;
}

/**
 * 설정 상태 인터페이스
 */
export interface SettingsState {
  [SettingKey.CLI_PATH]: string | null;
  [SettingKey.NODE_PATH]: string | null;
  [SettingKey.THEME]: ThemeMode;
  [SettingKey.FONT_SIZE]: number;
  [SettingKey.ZOOM_LEVEL]: number;
  [SettingKey.LINE_HEIGHT]: number;
  [SettingKey.AUTO_SCROLL_THRESHOLD]: number;
  [SettingKey.SOFT_WRAP]: boolean;
  [SettingKey.DEBUG_MODE]: boolean;
  [SettingKey.LOG_LEVEL]: LogLevel;
  [SettingKey.TERMINAL_APP]: string | null;
  [SettingKey.OPEN_FILES_WITH]: string | null;
  [SettingKey.OPEN_FILES_WITH_CUSTOM]: OpenFileWithCustom | null;
  [SettingKey.HOST_MODE]: HostMode;
  [SettingKey.OPEN_SETTINGS_AS]: OpenSettingsMode;
  [SettingKey.CHAT_PAGINATION]: boolean;
  [SettingKey.INCLUDE_NESTED_SESSIONS]: boolean;
  [SettingKey.UI_DIRECTION]: UiDirection;
  [SettingKey.UI_LANGUAGE]: string | null;
  [SettingKey.VOICE]: VoiceSettings;
  [SettingKey.USE_CTRL_ENTER_TO_SEND]: boolean;
  [SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT]: boolean;
  [SettingKey.AUTO_RESUME_ON_LIMIT]: boolean;
  [SettingKey.ATTACH_EDITOR_CONTEXT]: boolean;
  [SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION]: boolean;
  [SettingKey.DIFF_SURFACE]: DiffSurface;
  [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation;
  [SettingKey.SHOW_DIFF_IN_IDE]: boolean | null;
  [SettingKey.DOCK_LAYOUT]: DockLayout;
  [SettingKey.SYNC_MODEL_TO_DEFAULT]: boolean;
}

/**
 * 설정 기본값
 */
export const DEFAULT_SETTINGS: SettingsState = {
  [SettingKey.CLI_PATH]: null,
  [SettingKey.NODE_PATH]: null,
  [SettingKey.THEME]: ThemeMode.SYSTEM,
  [SettingKey.FONT_SIZE]: 13,
  [SettingKey.ZOOM_LEVEL]: ZOOM_DEFAULT,
  [SettingKey.LINE_HEIGHT]: LINE_HEIGHT_DEFAULT,
  [SettingKey.AUTO_SCROLL_THRESHOLD]: AUTO_SCROLL_THRESHOLD_DEFAULT,
  [SettingKey.SOFT_WRAP]: false,
  [SettingKey.DEBUG_MODE]: false,
  [SettingKey.LOG_LEVEL]: LogLevel.INFO,
  [SettingKey.TERMINAL_APP]: null,
  [SettingKey.OPEN_FILES_WITH]: null,
  [SettingKey.OPEN_FILES_WITH_CUSTOM]: null,
  [SettingKey.HOST_MODE]: HostMode.EDITOR_TAB,
  [SettingKey.OPEN_SETTINGS_AS]: OpenSettingsMode.OVERLAY,
  [SettingKey.CHAT_PAGINATION]: true,
  [SettingKey.INCLUDE_NESTED_SESSIONS]: false,
  [SettingKey.UI_DIRECTION]: UiDirection.LTR,
  [SettingKey.UI_LANGUAGE]: null,
  [SettingKey.VOICE]: {},
  [SettingKey.USE_CTRL_ENTER_TO_SEND]: false,
  [SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT]: true,
  [SettingKey.AUTO_RESUME_ON_LIMIT]: false,
  [SettingKey.ATTACH_EDITOR_CONTEXT]: true,
  [SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION]: true,
  [SettingKey.DIFF_SURFACE]: DiffSurface.IDE,
  [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation.NEW_TAB,
  [SettingKey.SHOW_DIFF_IN_IDE]: null,
  [SettingKey.DOCK_LAYOUT]: { order: [], visible: [] },
  [SettingKey.SYNC_MODEL_TO_DEFAULT]: true,
};
