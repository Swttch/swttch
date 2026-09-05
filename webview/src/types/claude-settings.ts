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
  effortLevel: string | null; // CLI effort level — values sourced from ModelInfo.supportedEffortLevels; null = auto
  ultracode?: boolean | null; // official key: xhigh effort plus standing dynamic-workflow orchestration; null = off
  disableWorkflows?: boolean; // CLI-owned: when true, the Workflows feature (and ultracode) is unavailable
  language?: string | null; // official key: Claude's preferred response language (e.g. 'korean')
  respectGitignore?: boolean; // official key: honour .gitignore when resolving file context
  /**
   * Official key: snapshot edited files so a code rewind can restore them.
   * Defaults to `true` in Claude's own schema, so an absent value reads as ON —
   * writing `?? false` here would show a terminal user's working setup as off.
   *
   * The CLI only honours this by itself in its interactive REPL. We spawn it
   * headless, where the same feature is gated on an env var instead, so the
   * backend reads this key to decide whether to inject it (issue #356).
   */
  fileCheckpointingEnabled?: boolean;
  env?: Record<string, string>; // official key: environment variables for Claude sessions
  alwaysThinkingEnabled: boolean; // extended thinking always on
  fastMode: boolean; // official Claude settings key: fast output mode (Opus models only). CLI reads it from settings.json directly
  fileSuggestion?: FileSuggestionConfig | null; // custom command that builds the @ file-mention index (null/absent = built-in)
  permissions?: PermissionsConfig;
  [key: string]: unknown; // extensible for future settings
}

export const DEFAULT_CLAUDE_SETTINGS: ClaudeSettingsState = {
  model: null,
  effortLevel: null,
  alwaysThinkingEnabled: true,
  fastMode: false,
};
