import { AUTO_SCROLL_THRESHOLD_DEFAULT } from '@/utils/autoScroll';
import { ZOOM_DEFAULT } from '@/utils/zoom';
import {
  DiffSurface,
  BrowserDiffPresentation,
  ComposerSendShortcut,
  ComposerNewlineShortcut,
  FollowUpBehavior,
  ContextBadgeDisplay,
} from '@/shared';

/** The desktop app's Transcript view modes. The setting is one of them or `classic` (the chat UI released before them); empty means Normal. */
export type TranscriptViewMode = 'normal' | 'thinking' | 'verbose';
export const TRANSCRIPT_VIEW_MODES: readonly TranscriptViewMode[] = ['normal', 'thinking', 'verbose'];

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

  // Hide the cards for tools that only look or run, the way the CLI's focus
  // view does. File changes and anything addressed to the user stay; the list
  // is in hideToolCalls.ts.
  HIDE_TOOL_CALLS = 'hideToolCalls',

  // How the chat is drawn: null keeps the released chat UI ("classic"); 'normal' | 'thinking' |
  // 'verbose' are the desktop app's Transcript view modes and all three move the user
  // bubble to the right and drop its collapse and sticky behaviour.
  TRANSCRIPT_VIEW_MODE = 'transcriptViewMode',

  // The view the user picked from the header menu for one session, by session id. A session
  // that has no entry here follows TRANSCRIPT_VIEW_MODE. The value 'classic' stands for the
  // released chat UI, since a map value cannot be told apart from a missing entry as null.
  TRANSCRIPT_VIEW_MODE_BY_SESSION = 'transcriptViewModeBySession',

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
  //
  // Superseded by COMPOSER_SEND_SHORTCUT / COMPOSER_NEWLINE_SHORTCUT, which say
  // the same thing with more room. Still read, because it is what every user who
  // set it before those keys existed has in their file — see
  // resolveComposerShortcuts().
  USE_CTRL_ENTER_TO_SEND = 'useCtrlEnterToSend',

  // Which keystroke sends the prompt, and which one inserts a line break.
  //
  // Two settings rather than one, because moving "send" onto a modifier leaves an
  // open question the one-setting form answered by guessing: what plain Enter now
  // does. The custom keys hold the recorded combination in stored form
  // ('Meta+Enter'); they are read only when the mode beside them is 'custom'.
  //
  // Null means the user has never chosen, in which case USE_CTRL_ENTER_TO_SEND
  // decides. Defaulting them to a concrete mode instead would overwrite that
  // older answer with our own on the first read.
  COMPOSER_SEND_SHORTCUT = 'composerSendShortcut',
  COMPOSER_SEND_SHORTCUT_CUSTOM = 'composerSendShortcutCustom',
  COMPOSER_NEWLINE_SHORTCUT = 'composerNewlineShortcut',
  COMPOSER_NEWLINE_SHORTCUT_CUSTOM = 'composerNewlineShortcutCustom',

  // What a message sent while a turn is running does: wait for the turn, or
  // end it and be answered instead. Null until chosen, which reads as waiting.
  COMPOSER_FOLLOW_UP_BEHAVIOR = 'composerFollowUpBehavior',

  // What the context badge under the chat input writes next to its ring: the
  // percentage, the token count, or nothing. See {@link ContextBadgeDisplay}.
  CONTEXT_BADGE_DISPLAY = 'contextBadgeDisplay',

  // Whether a desktop notification may put a banner on screen when a session
  // ends its turn or stops to ask something while the user is looking
  // elsewhere. The notification sound is NOT covered by this: it announces that
  // the turn ended and rings wherever the user is, so it has its own key below.
  //
  // null is not "off" — it is "never asked". The first notification asks, since
  // raising a banner from an unapproved bundle IS the OS permission prompt, and
  // the answer is written back here. Until then it reads as on, because that is
  // what happens next.
  NOTIFICATION_BANNER = 'notificationBanner',

  // Which OS sound a session makes when it ends a turn or stops to ask
  // something. Holds a `SystemSound.id` as reported by LIST_SYSTEM_SOUNDS, or
  // null for silence, which is the default.
  //
  // The backend reads this key itself every time it plays the sound; no screen
  // sends the name along with the request. It used to live in localStorage and
  // be read once per screen at mount, which is how the chat screen kept ringing
  // the old sound after the settings overlay — drawn on top of it, so it never
  // unmounted — wrote a new one.
  NOTIFICATION_SOUND = 'notificationSound',

  // How loud the notification sound plays, on a 1-10 scale, 5 by default.
  //
  // A step is not the same loudness on every OS and cannot be: macOS is the
  // only one whose player amplifies past the recording, so there 1 is the file
  // as recorded and 10 is ten times that, while Windows and Linux run from a
  // tenth of the recording up to the recording itself.
  //
  // Read by the backend at playback time, like the sound name above.
  NOTIFICATION_SOUND_VOLUME = 'notificationSoundVolume',

  // When true, move focus to the chat input after inserting a file path (Alt+K).
  FOCUS_INPUT_ON_EDITOR_CONTEXT = 'focusInputOnEditorContext',

  // Auto-resume on usage-limit reset (sponsor-only); seeds the limit banner default.
  AUTO_RESUME_ON_LIMIT = 'autoResumeOnLimit',
  /** Sponsor-only: reflect what the Claude desktop app records about its sessions in the session lists. */
  DESKTOP_SESSION_SYNC = 'desktopSessionSync',

  // Whether every session starts with "Allow all command in this session" already
  // on (sponsor-only). A session can still turn it off for itself. Written to
  // global scope only, and a value the project file supplies is ignored: that
  // file lives in the repository, so honouring it would let a cloned repo switch
  // off the CLI's own risk warnings. See the scope policy in backend settings.ts.
  ALLOW_ALL_COMMANDS_BY_DEFAULT = 'allowAllCommandsByDefault',

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

  // Whether the first send of a new session also asks the CLI for a session title,
  // as the CLI does by itself in the terminal. The CLI records the title in the
  // transcript (an `ai-title` entry), so every Claude Code client lists the session
  // under it. GUI-only: the CLI has no switch for this. See issue #562.
  GENERATE_SESSION_TITLES = 'generateSessionTitles',

  // Whether a session with neither a name nor a generated title is listed under the
  // latest message sent in it, the way Claude Code's own clients list it. Off, it is
  // listed under its summary or first message. See issue #562.
  SESSION_TITLE_FROM_LAST_PROMPT = 'sessionTitleFromLastPrompt',
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
  ASSETS = 'assets',
  /** The "By the way" (`/btw`) window. A newly shipped item, so it lands in the ⋮ menu until it is pulled out. */
  SIDE_QUESTION = 'sideQuestion',
  /** The session rail (environment, context, outputs). A newly shipped item, so it lands in the ⋮ menu until it is pulled out. */
  SESSION_RAIL = 'sessionRail',
  NEW_TAB = 'newTab',
  /** The Browser pane (#593). A newly shipped item, so it lands in the ⋮ menu until it is pulled out. */
  BROWSER = 'browser',
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
export { DiffSurface, BrowserDiffPresentation, ContextBadgeDisplay };

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
  /** The language replies are read aloud in, e.g. 'ko'. Null: the language of each reply, found from its text. */
  readAloudLanguage?: string | null;
  /** The voice replies are read aloud in, e.g. 'buttery'. Null: the voice chosen in the Claude account (the desktop app). */
  readAloudVoice?: string | null;
  /** How fast replies are read aloud, 0.7..1.5. Null: the speed chosen in the Claude account. */
  readAloudSpeed?: number | null;
}

/**
 * The languages the speech service reads in, and the voices it names for each, with the names it gives them in that
 * language. This is the list the Claude desktop app shows in its voice settings; it comes from the service's own
 * configuration, read once from a signed-in claude.ai session on 2026-11-09, and is not something this app can ask
 * for. A voice name is shown as the service writes it, in the language it belongs to.
 */
export const READ_ALOUD_LANGUAGES: ReadonlyArray<{ code: string; voices: ReadonlyArray<{ id: string; name: string; previewUrl: string }> }> = [
  { code: 'en', voices: [{ id: 'buttery', name: 'Buttery', previewUrl: 'https://assets.claude.ai/voice/selection/buttery-v8.mp3' }, { id: 'airy', name: 'Airy', previewUrl: 'https://assets.claude.ai/voice/selection/airy-v8.mp3' }, { id: 'mellow', name: 'Mellow', previewUrl: 'https://assets.claude.ai/voice/selection/mellow-v8.mp3' }, { id: 'glassy', name: 'Glassy', previewUrl: 'https://assets.claude.ai/voice/selection/glassy-v8.mp3' }, { id: 'rounded', name: 'Rounded', previewUrl: 'https://assets.claude.ai/voice/selection/rounded-v8.mp3' }] },
  { code: 'en-IN', voices: [{ id: 'buttery', name: 'Buttery', previewUrl: 'https://assets.claude.ai/voice/selection/buttery-v8.mp3' }, { id: 'airy', name: 'Airy', previewUrl: 'https://assets.claude.ai/voice/selection/airy-v8.mp3' }, { id: 'mellow', name: 'Mellow', previewUrl: 'https://assets.claude.ai/voice/selection/mellow-v8.mp3' }, { id: 'glassy', name: 'Glassy', previewUrl: 'https://assets.claude.ai/voice/selection/glassy-v8.mp3' }, { id: 'rounded', name: 'Rounded', previewUrl: 'https://assets.claude.ai/voice/selection/rounded-v8.mp3' }] },
  { code: 'en-GB', voices: [{ id: 'buttery', name: 'Buttery', previewUrl: 'https://assets.claude.ai/voice/selection/buttery-v8.mp3' }, { id: 'airy', name: 'Airy', previewUrl: 'https://assets.claude.ai/voice/selection/airy-v8.mp3' }, { id: 'mellow', name: 'Mellow', previewUrl: 'https://assets.claude.ai/voice/selection/mellow-v8.mp3' }, { id: 'glassy', name: 'Glassy', previewUrl: 'https://assets.claude.ai/voice/selection/glassy-v8.mp3' }, { id: 'rounded', name: 'Rounded', previewUrl: 'https://assets.claude.ai/voice/selection/rounded-v8.mp3' }] },
  { code: 'zh-CN', voices: [{ id: 'zh-CN-rouhe', name: '柔和', previewUrl: 'https://assets.claude.ai/voice/selection/zh-CN-rouhe-v6.mp3' }, { id: 'zh-CN-mingkuai', name: '明快', previewUrl: 'https://assets.claude.ai/voice/selection/zh-CN-mingkuai-v5.mp3' }] },
  { code: 'yue', voices: [{ id: 'yue-seonhau', name: '醇厚', previewUrl: 'https://assets.claude.ai/voice/selection/yue-seonhau-v7.mp3' }, { id: 'yue-mingloeng', name: '明亮', previewUrl: 'https://assets.claude.ai/voice/selection/yue-mingloeng-v6.mp3' }] },
  { code: 'fr', voices: [{ id: 'fr-douce', name: 'Douce', previewUrl: 'https://assets.claude.ai/voice/selection/fr-douce-v6.mp3' }, { id: 'fr-claire', name: 'Claire', previewUrl: 'https://assets.claude.ai/voice/selection/fr-claire-v5.mp3' }] },
  { code: 'fr-CA', voices: [{ id: 'fr-CA-douce', name: 'Douce', previewUrl: 'https://assets.claude.ai/voice/selection/fr-CA-douce-v6.mp3' }, { id: 'fr-CA-claire', name: 'Claire', previewUrl: 'https://assets.claude.ai/voice/selection/fr-CA-claire-v5.mp3' }] },
  { code: 'de', voices: [{ id: 'de-hell', name: 'Hell', previewUrl: 'https://assets.claude.ai/voice/selection/de-hell-v5.mp3' }, { id: 'de-sanft', name: 'Sanft', previewUrl: 'https://assets.claude.ai/voice/selection/de-sanft-v6.mp3' }] },
  { code: 'de-AT', voices: [{ id: 'de-AT-hell', name: 'Hell', previewUrl: 'https://assets.claude.ai/voice/selection/de-AT-hell-v5.mp3' }, { id: 'de-AT-sanft', name: 'Sanft', previewUrl: 'https://assets.claude.ai/voice/selection/de-AT-sanft-v6.mp3' }] },
  { code: 'hi', voices: [{ id: 'hi-shant', name: 'शांत', previewUrl: 'https://assets.claude.ai/voice/selection/hi-shant-v6.mp3' }, { id: 'hi-ujjwal', name: 'उज्ज्वल', previewUrl: 'https://assets.claude.ai/voice/selection/hi-ujjwal-v5.mp3' }] },
  { code: 'id', voices: [{ id: 'id-lembut', name: 'Lembut', previewUrl: 'https://assets.claude.ai/voice/selection/id-lembut-v6.mp3' }, { id: 'id-ringan', name: 'Ringan', previewUrl: 'https://assets.claude.ai/voice/selection/id-ringan-v5.mp3' }] },
  { code: 'it', voices: [{ id: 'it-dolce', name: 'Dolce', previewUrl: 'https://assets.claude.ai/voice/selection/it-dolce-v6.mp3' }, { id: 'it-chiara', name: 'Chiara', previewUrl: 'https://assets.claude.ai/voice/selection/it-chiara-v2.mp3' }] },
  { code: 'ja', voices: [{ id: 'ja-maroyaka', name: 'まろやか', previewUrl: 'https://assets.claude.ai/voice/selection/ja-maroyaka-v6.mp3' }, { id: 'ja-akarui', name: '明るい', previewUrl: 'https://assets.claude.ai/voice/selection/ja-akarui-v5.mp3' }] },
  { code: 'ko', voices: [{ id: 'ko-balgeun', name: '밝은', previewUrl: 'https://assets.claude.ai/voice/selection/ko-balgeun-v5.mp3' }, { id: 'ko-chabunhan', name: '차분한', previewUrl: 'https://assets.claude.ai/voice/selection/ko-chabunhan-v6.mp3' }] },
  { code: 'pt', voices: [{ id: 'pt-BR-clara', name: 'Clara', previewUrl: 'https://assets.claude.ai/voice/selection/pt-BR-clara-v5.mp3' }, { id: 'pt-BR-suave', name: 'Suave', previewUrl: 'https://assets.claude.ai/voice/selection/pt-BR-suave-v6.mp3' }] },
  { code: 'pt-BR', voices: [{ id: 'pt-BR-clara', name: 'Clara', previewUrl: 'https://assets.claude.ai/voice/selection/pt-BR-clara-v5.mp3' }, { id: 'pt-BR-suave', name: 'Suave', previewUrl: 'https://assets.claude.ai/voice/selection/pt-BR-suave-v6.mp3' }] },
  { code: 'pt-PT', voices: [{ id: 'pt-PT-clara', name: 'Clara', previewUrl: 'https://assets.claude.ai/voice/selection/pt-PT-clara-v6.mp3' }, { id: 'pt-PT-suave', name: 'Suave', previewUrl: 'https://assets.claude.ai/voice/selection/pt-PT-suave-v7.mp3' }] },
  { code: 'ru', voices: [{ id: 'ru-zvonkiy', name: 'Звонкий', previewUrl: 'https://assets.claude.ai/voice/selection/ru-zvonkiy-v5.mp3' }, { id: 'ru-myagkiy', name: 'Мягкий', previewUrl: 'https://assets.claude.ai/voice/selection/ru-myagkiy-v6.mp3' }] },
  { code: 'es', voices: [{ id: 'es-suave', name: 'Suave', previewUrl: 'https://assets.claude.ai/voice/selection/es-suave-v6.mp3' }, { id: 'es-clara', name: 'Clara', previewUrl: 'https://assets.claude.ai/voice/selection/es-clara-v5.mp3' }] },
  { code: 'es-419', voices: [{ id: 'es-419-clara', name: 'Clara', previewUrl: 'https://assets.claude.ai/voice/selection/es-419-clara-v5.mp3' }, { id: 'es-419-suave', name: 'Suave', previewUrl: 'https://assets.claude.ai/voice/selection/es-419-suave-v6.mp3' }] },
  { code: 'tr', voices: [{ id: 'tr-yumusak', name: 'Yumuşak', previewUrl: 'https://assets.claude.ai/voice/selection/tr-yumusak-v6.mp3' }, { id: 'tr-parlak', name: 'Parlak', previewUrl: 'https://assets.claude.ai/voice/selection/tr-parlak-v5.mp3' }] },
  { code: 'uk', voices: [{ id: 'uk-yaskravyi', name: 'Яскравий', previewUrl: 'https://assets.claude.ai/voice/selection/uk-yaskravyi-v5.mp3' }, { id: 'uk-lahidnyi', name: 'Лагідний', previewUrl: 'https://assets.claude.ai/voice/selection/uk-lahidnyi-v7.mp3' }] },
];

/** The voices to offer for a language: its own, else the ones the service names for English. */
export function readAloudVoicesFor(language: string): ReadonlyArray<{ id: string; name: string; previewUrl: string }> {
  const code = language.replace(/_/g, '-');
  const exact = READ_ALOUD_LANGUAGES.find((entry) => entry.code.toLowerCase() === code.toLowerCase());
  const primary = code.split('-')[0].toLowerCase();
  const near = exact ?? READ_ALOUD_LANGUAGES.find((entry) => entry.code.toLowerCase() === primary);
  return (near ?? READ_ALOUD_LANGUAGES[0]).voices;
}

/** The speeds the desktop app offers, with the playback speed each stands for. */
export const READ_ALOUD_SPEEDS = [
  { id: 'slow', value: 0.8 },
  { id: 'normal', value: 1 },
  { id: 'fast', value: 1.2 },
] as const;

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
  [SettingKey.HIDE_TOOL_CALLS]: boolean;
  [SettingKey.TRANSCRIPT_VIEW_MODE]: TranscriptViewMode | 'classic' | null;
  [SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION]: Record<string, TranscriptViewMode | 'classic'>;
  [SettingKey.INCLUDE_NESTED_SESSIONS]: boolean;
  [SettingKey.UI_DIRECTION]: UiDirection;
  [SettingKey.UI_LANGUAGE]: string | null;
  [SettingKey.VOICE]: VoiceSettings;
  [SettingKey.USE_CTRL_ENTER_TO_SEND]: boolean;
  [SettingKey.COMPOSER_SEND_SHORTCUT]: ComposerSendShortcut | null;
  [SettingKey.COMPOSER_SEND_SHORTCUT_CUSTOM]: string | null;
  [SettingKey.COMPOSER_NEWLINE_SHORTCUT]: ComposerNewlineShortcut | null;
  [SettingKey.COMPOSER_NEWLINE_SHORTCUT_CUSTOM]: string | null;
  [SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR]: FollowUpBehavior | null;
  [SettingKey.CONTEXT_BADGE_DISPLAY]: ContextBadgeDisplay;
  [SettingKey.NOTIFICATION_BANNER]: boolean | null;
  [SettingKey.NOTIFICATION_SOUND]: string | null;
  [SettingKey.NOTIFICATION_SOUND_VOLUME]: number;
  [SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT]: boolean;
  [SettingKey.AUTO_RESUME_ON_LIMIT]: boolean;
  [SettingKey.DESKTOP_SESSION_SYNC]: boolean;
  [SettingKey.ALLOW_ALL_COMMANDS_BY_DEFAULT]: boolean;
  [SettingKey.ATTACH_EDITOR_CONTEXT]: boolean;
  [SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION]: boolean;
  [SettingKey.DIFF_SURFACE]: DiffSurface;
  [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation;
  [SettingKey.SHOW_DIFF_IN_IDE]: boolean | null;
  [SettingKey.DOCK_LAYOUT]: DockLayout;
  [SettingKey.SYNC_MODEL_TO_DEFAULT]: boolean;
  [SettingKey.GENERATE_SESSION_TITLES]: boolean;
  [SettingKey.SESSION_TITLE_FROM_LAST_PROMPT]: boolean;
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
  [SettingKey.HIDE_TOOL_CALLS]: false,
  [SettingKey.TRANSCRIPT_VIEW_MODE]: 'normal',
  [SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION]: {},
  [SettingKey.INCLUDE_NESTED_SESSIONS]: false,
  [SettingKey.UI_DIRECTION]: UiDirection.LTR,
  [SettingKey.UI_LANGUAGE]: null,
  [SettingKey.VOICE]: {},
  [SettingKey.USE_CTRL_ENTER_TO_SEND]: false,
  [SettingKey.COMPOSER_SEND_SHORTCUT]: null,
  [SettingKey.COMPOSER_SEND_SHORTCUT_CUSTOM]: null,
  [SettingKey.COMPOSER_NEWLINE_SHORTCUT]: null,
  [SettingKey.COMPOSER_NEWLINE_SHORTCUT_CUSTOM]: null,
  [SettingKey.COMPOSER_FOLLOW_UP_BEHAVIOR]: null,
  [SettingKey.CONTEXT_BADGE_DISPLAY]: ContextBadgeDisplay.PERCENT,
  [SettingKey.NOTIFICATION_BANNER]: null,
  [SettingKey.NOTIFICATION_SOUND]: null,
  [SettingKey.NOTIFICATION_SOUND_VOLUME]: 5,
  [SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT]: true,
  [SettingKey.AUTO_RESUME_ON_LIMIT]: false,
  [SettingKey.DESKTOP_SESSION_SYNC]: false,
  [SettingKey.ALLOW_ALL_COMMANDS_BY_DEFAULT]: false,
  [SettingKey.ATTACH_EDITOR_CONTEXT]: true,
  [SettingKey.AUTO_OPEN_DIFF_ON_PERMISSION]: true,
  [SettingKey.DIFF_SURFACE]: DiffSurface.IDE,
  [SettingKey.BROWSER_DIFF_PRESENTATION]: BrowserDiffPresentation.NEW_TAB,
  [SettingKey.SHOW_DIFF_IN_IDE]: null,
  [SettingKey.DOCK_LAYOUT]: { order: [], visible: [] },
  [SettingKey.SYNC_MODEL_TO_DEFAULT]: true,
  [SettingKey.GENERATE_SESSION_TITLES]: true,
  [SettingKey.SESSION_TITLE_FROM_LAST_PROMPT]: true,
};
