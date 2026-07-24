import { AUTO_SCROLL_THRESHOLD_DEFAULT } from '@/utils/autoScroll';

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
  FONT_SIZE = 'fontSize',
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
  [SettingKey.FONT_SIZE]: number;
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
}

/**
 * 설정 기본값
 */
export const DEFAULT_SETTINGS: SettingsState = {
  [SettingKey.CLI_PATH]: null,
  [SettingKey.NODE_PATH]: null,
  [SettingKey.THEME]: ThemeMode.SYSTEM,
  [SettingKey.FONT_SIZE]: 13,
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
};
