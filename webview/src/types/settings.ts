import { AUTO_SCROLL_THRESHOLD_DEFAULT } from '@/utils/autoScroll';
import { ZOOM_DEFAULT } from '@/utils/zoom';

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

  // Appearance
  THEME = 'theme',
  // Opt-in (JetBrains mode only): re-point the color tokens at the colors the
  // IDE's currently applied theme resolves to, so the chat renders flush with
  // the IDE surface (issue #267). Off by default — the user keeps our own
  // palette until they ask for the IDE's. Has no effect in browser mode, where
  // no IDE colors are injected.
  SYNC_IDE_THEME = 'syncIdeTheme',
  FONT_SIZE = 'fontSize',
  // Whole-interface scale driven by CmdOrCtrl +/- and CmdOrCtrl + wheel.
  // Independent of FONT_SIZE: effective text size is fontSize × zoomLevel.
  ZOOM_LEVEL = 'zoomLevel',
  LINE_HEIGHT = 'lineHeight',
  AUTO_SCROLL_THRESHOLD = 'autoScrollThreshold',

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

  // UI mirroring (RTL/LTR layout direction)
  UI_DIRECTION = 'uiDirection',

  // ── GUI-only keys migrated out of the native ~/.claude/settings.json ────────
  // (not part of Claude Code's official settings schema; see backend
  //  settings-migration.ts). They now live in ~/.claude-code-gui/settings.js.

  // GUI interface display language (e.g. 'korean'); null → English. This is our
  // own i18n, unrelated to Claude's response language (a native key).
  UI_LANGUAGE = 'uiLanguage',

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

  // Effort slider's top step (xhigh + workflows). null = off/cleared. Paired with
  // the native `effortLevel`, but absent from the official schema, so it lives here.
  ULTRACODE = 'ultracode',

  // Header dock arrangement: which overflow-menu items show as icons next to the
  // ⋮ button, and in what order. Global-only by product decision (the dock is
  // navigated by muscle memory, so it must not shift between projects).
  DOCK_LAYOUT = 'dockLayout',
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
 * 설정 상태 인터페이스
 */
export interface SettingsState {
  [SettingKey.CLI_PATH]: string | null;
  [SettingKey.NODE_PATH]: string | null;
  [SettingKey.THEME]: ThemeMode;
  [SettingKey.SYNC_IDE_THEME]: boolean;
  [SettingKey.FONT_SIZE]: number;
  [SettingKey.ZOOM_LEVEL]: number;
  [SettingKey.LINE_HEIGHT]: number;
  [SettingKey.AUTO_SCROLL_THRESHOLD]: number;
  [SettingKey.DEBUG_MODE]: boolean;
  [SettingKey.LOG_LEVEL]: LogLevel;
  [SettingKey.TERMINAL_APP]: string | null;
  [SettingKey.OPEN_FILES_WITH]: string | null;
  [SettingKey.OPEN_FILES_WITH_CUSTOM]: OpenFileWithCustom | null;
  [SettingKey.HOST_MODE]: HostMode;
  [SettingKey.OPEN_SETTINGS_AS]: OpenSettingsMode;
  [SettingKey.CHAT_PAGINATION]: boolean;
  [SettingKey.UI_DIRECTION]: UiDirection;
  [SettingKey.UI_LANGUAGE]: string | null;
  [SettingKey.USE_CTRL_ENTER_TO_SEND]: boolean;
  [SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT]: boolean;
  [SettingKey.AUTO_RESUME_ON_LIMIT]: boolean;
  [SettingKey.ATTACH_EDITOR_CONTEXT]: boolean;
  [SettingKey.ULTRACODE]: boolean | null;
  [SettingKey.DOCK_LAYOUT]: DockLayout;
}

/**
 * 설정 기본값
 */
export const DEFAULT_SETTINGS: SettingsState = {
  [SettingKey.CLI_PATH]: null,
  [SettingKey.NODE_PATH]: null,
  [SettingKey.THEME]: ThemeMode.SYSTEM,
  [SettingKey.SYNC_IDE_THEME]: false,
  [SettingKey.FONT_SIZE]: 13,
  [SettingKey.ZOOM_LEVEL]: ZOOM_DEFAULT,
  [SettingKey.LINE_HEIGHT]: LINE_HEIGHT_DEFAULT,
  [SettingKey.AUTO_SCROLL_THRESHOLD]: AUTO_SCROLL_THRESHOLD_DEFAULT,
  [SettingKey.DEBUG_MODE]: false,
  [SettingKey.LOG_LEVEL]: LogLevel.INFO,
  [SettingKey.TERMINAL_APP]: null,
  [SettingKey.OPEN_FILES_WITH]: null,
  [SettingKey.OPEN_FILES_WITH_CUSTOM]: null,
  [SettingKey.HOST_MODE]: HostMode.EDITOR_TAB,
  [SettingKey.OPEN_SETTINGS_AS]: OpenSettingsMode.OVERLAY,
  [SettingKey.CHAT_PAGINATION]: true,
  [SettingKey.UI_DIRECTION]: UiDirection.LTR,
  [SettingKey.UI_LANGUAGE]: null,
  [SettingKey.USE_CTRL_ENTER_TO_SEND]: false,
  [SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT]: true,
  [SettingKey.AUTO_RESUME_ON_LIMIT]: false,
  [SettingKey.ATTACH_EDITOR_CONTEXT]: true,
  [SettingKey.ULTRACODE]: null,
  [SettingKey.DOCK_LAYOUT]: { order: [], visible: [] },
};
