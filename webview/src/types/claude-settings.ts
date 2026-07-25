/**
 * Claude Code settings that sync with ~/.claude/settings.json
 *
 * Structure:
 * 1. .claude/settings.json (project - not yet implemented)
 * 2. ~/.claude-code-gui/settings.js (app)
 * 3. ~/.claude/settings.json (user)
 *
 * Priority: #1 > #2 > #3 (later will merge)
 */

export interface PermissionsConfig {
  defaultMode?: string;
  disableBypassPermissionsMode?: string;
  /** Admin policy: when "disable", auto mode is unavailable regardless of model support. */
  disableAutoMode?: string;
  allow?: string[];
  deny?: string[];
  ask?: string[];
  additionalDirectories?: string[];
}

/**
 * `fileSuggestion` overrides how the `@` file-mention index is built: the given
 * command receives `{"query":...}` on stdin and prints file paths. Mirrors the
 * Claude CLI settings.json contract so a setting works identically in both.
 */
export interface FileSuggestionConfig {
  type: 'command';
  command: string;
}

export interface ClaudeSettingsState {
  model: string | null; // full model ID like 'claude-opus-4-6' or null for default
  language: string | null; // Claude's preferred response language (e.g., "korean", "japanese")
  uiLanguage: string | null; // GUI-only: language for the app interface, independent of `language` (Claude's response language)
  effortLevel: string | null; // CLI effort level — values sourced from ModelInfo.supportedEffortLevels; null = auto
  ultracode?: boolean | null; // xhigh effort + standing workflow orchestration; the slider's top step (null = off/cleared)
  disableWorkflows?: boolean; // CLI-owned: when true, the Workflows feature (and ultracode) is unavailable
  alwaysThinkingEnabled: boolean; // extended thinking always on
  preferFastMode: boolean; // fast output mode (Opus models only)
  useCtrlEnterToSend: boolean; // when true, Ctrl/Cmd+Enter sends; plain Enter inserts a newline
  focusInputOnEditorContext: boolean; // when true, move focus to chat input after inserting file path via Alt+K
  respectGitignoreForContext: boolean; // when true, exclude body of .gitignore'd files from editor context (path only)
  fileSuggestion?: FileSuggestionConfig | null; // custom command that builds the @ file-mention index (null/absent = built-in)
  permissions?: PermissionsConfig;
  [key: string]: unknown; // extensible for future settings
}

export const DEFAULT_CLAUDE_SETTINGS: ClaudeSettingsState = {
  model: null,
  language: null,
  uiLanguage: null,
  effortLevel: null,
  alwaysThinkingEnabled: true,
  preferFastMode: false,
  useCtrlEnterToSend: false,
  focusInputOnEditorContext: true,
  respectGitignoreForContext: false,
};
