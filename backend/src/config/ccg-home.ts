import { homedir } from 'os';
import { join } from 'path';

/**
 * The folder that holds everything the app keeps for the user: settings, saved accounts, the
 * license, logs, the prompt and project tables, uploads, and so on.
 *
 * `CCG_HOME` is the documented override (cli/install.sh). Without it the folder is
 * `~/.claude-code-gui`. Every store resolves its path through this one function, so setting
 * `CCG_HOME` moves all of them together and none is left behind in the default folder
 * (ccg-home.test.ts fails when a new store builds its own path from `homedir()`).
 *
 * Read on every call, not at import: the value may be set after the module loads (tests, a
 * launcher that exports it late).
 */
export function ccgHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CCG_HOME?.trim() || join(homedir(), '.claude-code-gui');
}

/**
 * The default folder, always, ignoring `CCG_HOME`. Only for a file the JetBrains plugin reads or
 * writes as well. The plugin does not know `CCG_HOME` (it keeps `settings.js` here, see
 * SettingsManager.kt), so a backend that moved its copy would leave the two sides on different
 * files. Move such a file only together with the plugin side.
 */
export function ideSharedDir(): string {
  return join(homedir(), '.claude-code-gui');
}
