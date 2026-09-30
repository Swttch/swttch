/**
 * Shared types for Claude Code's own auto-update setting, shown in Settings → About.
 *
 * NOTE: This file is mirrored 1:1 in `webview/src/shared/cli-auto-update.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */

/**
 * Claude Code's `autoUpdatesChannel` setting: which release line updates follow.
 * Unset means LATEST. The CLI also accepts RC, which the About screen shows only when set.
 */
export enum CliUpdateChannel {
  /** Every release as soon as it is published. */
  LATEST = 'latest',
  /** Releases that have been out for a while without problems. */
  STABLE = 'stable',
  /** Release candidates. */
  RC = 'rc',
}

/** The kind of place that keeps auto-updates off where the About toggle cannot reach. */
export enum CliAutoUpdateLockKind {
  /** The environment the backend inherited: a shell profile, `launchctl`, the IDE launcher. */
  ENVIRONMENT = 'environment',
  /** The `env` block of a user settings file, under a name or in a file the toggle does not write. */
  USER_SETTINGS = 'user-settings',
  /** The `env` block of Claude Code's managed settings, which an administrator controls. */
  MANAGED_SETTINGS = 'managed-settings',
  /** `autoUpdates: false` in Claude Code's global config (`~/.claude.json`). */
  GLOBAL_CONFIG = 'global-config',
}

/** Where auto-updates are turned off, when the toggle cannot turn them back on. */
export interface CliAutoUpdateLock {
  kind: CliAutoUpdateLockKind;
  /** The variable that turns them off, or null for {@link CliAutoUpdateLockKind.GLOBAL_CONFIG}. */
  variable: string | null;
  /** The file that sets it, with the home directory written as `~`, or null for the environment. */
  path: string | null;
}

/** Result of GET_CLI_AUTO_UPDATE. */
export interface CliAutoUpdateState {
  /** Whether Claude Code would update itself, by the rules the CLI applies. */
  enabled: boolean;
  /**
   * What would keep auto-updates off even after the toggle removed its own
   * `DISABLE_AUTOUPDATER`. Null when the toggle alone decides the value.
   */
  lock: CliAutoUpdateLock | null;
  /** The user settings file the toggle writes, with the home directory written as `~`. */
  settingsPath: string;
  /** `autoUpdatesChannel` from the user and managed settings, LATEST when unset. */
  channel: CliUpdateChannel;
}

/**
 * Result of GET_NONESSENTIAL_TRAFFIC: Claude Code's `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
 * shown in Settings → Privacy. Turning it on also turns auto-updates off.
 */
export interface NonessentialTrafficState {
  /** Whether Claude Code is limited to essential traffic, by the rules the CLI applies. */
  disabled: boolean;
  /** Managed settings that set it, which the toggle cannot override. Null otherwise. */
  lock: CliAutoUpdateLock | null;
  /** The user settings file the toggle writes, with the home directory written as `~`. */
  settingsPath: string;
}
