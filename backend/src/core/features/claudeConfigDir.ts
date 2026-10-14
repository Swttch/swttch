import { homedir } from 'os';
import { join } from 'path';

/**
 * Resolve the Claude Code CLI data directory.
 *
 * Mirrors the CLI's own resolution: `process.env.CLAUDE_CONFIG_DIR ?? ~/.claude`.
 * When a user points the CLI at a non-default location (e.g. `D:\Claude` on
 * Windows via the CLAUDE_CONFIG_DIR env var), every consumer that reads sessions,
 * projects, or global settings must follow it here too. See issue #117.
 */
export function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/**
 * Replace a leading `~` with the home directory, the way a shell does before it hands an
 * argument or an `export` value to a program (#538).
 *
 * A value typed into the settings screen never passes through a shell, so `~/.claude-work`
 * would otherwise reach the CLI as those literal characters. The CLI does not expand it and
 * derives its keychain item name (`Claude Code-credentials-<hash>`) from the string it was
 * given, so a literal `~` looks up a different item than the one a terminal login created
 * and the user appears signed out.
 *
 * That hash makes the exact characters matter: the home directory is concatenated, never
 * joined or normalised, so a trailing or doubled slash survives as a shell would keep it.
 * Only `~`, `~/…` (and `~\…` on Windows) are expanded; `~name` names another user's home
 * and is left alone. An empty home directory (`HOME=` makes `os.homedir()` answer "") would
 * turn `~/x` into `/x`, so the value stays as typed.
 */
export function expandHomeDir(value: string, home: string = homedir()): string {
  if (home === '') return value;
  if (value === '~') return home;
  const separatorFollows = value.startsWith('~/') || (process.platform === 'win32' && value.startsWith('~\\'));
  return separatorFollows ? home + value.slice(1) : value;
}
