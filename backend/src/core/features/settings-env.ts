/**
 * The `env` block of Claude Code's settings files, resolved the way `claude` resolves it.
 *
 * A variable written into `~/.claude/settings.json` is not an environment variable. Nothing
 * on the machine exports it; `claude` reads that file itself and applies the block before it
 * talks to anything. So anything here that answers "what is the effective value of X" has to
 * read the block too, or it answers for a different machine than the one `claude` is on.
 *
 * This module returns the merged view instead of writing it into `process.env`. The process
 * environment is one slot shared by the whole backend, and a project-scoped value written
 * there is visible to every other project until something overwrites it. A returned value has
 * no such reach: it belongs to the call that asked.
 *
 * The child processes we spawn do not need this. `claude` reads the files itself, and `ccb`
 * has read them since @swttch/extend-kit 0.7.1 — both by the same rules as below, which is
 * the point of writing the rules down in both places.
 *
 * ── Rules, measured against `claude` 2.1.261 ──────────────────────────────────────────────
 * Six shapes of value were written into a project's settings.json and read back out of the
 * environment its child process received:
 *
 *   "PLAIN":  "value"            → value               (passed through)
 *   "BRACE":  "pre-${HOME}-post" → pre-${HOME}-post    (NOT expanded)
 *   "FALL":   "${UNSET:-fb}"     → ${UNSET:-fb}        (NOT expanded)
 *   "EMPTY":  ""                 → empty, still set    (not a deletion)
 *   "NUMBER": 1234               → "1234"              (stringified)
 *   "BOOL":   true               → "true"              (stringified)
 *
 * And with the same name exported in the shell AND written into settings.json, the value the
 * child received was the settings one — so the file outranks the inherited environment.
 */

import { readMergedClaudeSettings } from './claude-settings';

/**
 * Names never taken from a settings file.
 *
 * `CLAUDE_CONFIG_DIR` decides WHERE the settings files are. Resolving it from one of them
 * would mean the file's location depends on a value only readable after the file is found.
 * It is settled before any of this runs, from the plugin's own settings, and projected onto
 * `process.env` by `Claude.applyConfigDir` — see the note there.
 */
export const SETTINGS_ENV_EXCLUDED = new Set(['CLAUDE_CONFIG_DIR']);

/**
 * One settings value as an environment value, or null when it cannot be one.
 *
 * Objects, arrays and null are dropped. `claude`'s handling of those was NOT measured, and
 * every alternative is worse than dropping: `String({})` is the literal "[object Object]",
 * a value nobody meant to set.
 */
export function asEnvValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}

/**
 * Every variable the settings files set for [workingDir], global merged under project.
 *
 * Deliberately not filtered by name. An allow-list of eight proxy names is what this replaces:
 * it dropped a proxy set only in settings.json (#181), then dropped the same proxy written in
 * lower case (#432), and each fix added one more name. A block read whole needs no next fix.
 */
export async function readSettingsEnv(workingDir?: string): Promise<Record<string, string>> {
  const { settings } = await readMergedClaudeSettings(workingDir);
  const block = settings.env;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return {};

  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(block as Record<string, unknown>)) {
    if (SETTINGS_ENV_EXCLUDED.has(name)) continue;
    const asValue = asEnvValue(value);
    if (asValue !== null) resolved[name] = asValue;
  }
  return resolved;
}

/**
 * The environment as it effectively is for [workingDir]: what this process holds, with the
 * settings block laid over the top.
 *
 * The settings block wins because `claude` was measured to let it win. The user edits that
 * file for `claude`, so agreeing with `claude` is what makes one file mean one thing.
 *
 * `base` is a parameter so a test can state an environment instead of mutating the process,
 * and so a caller with a specific environment in hand (a child's, say) can ask about that one.
 */
export async function resolveEnv(
  workingDir?: string,
  base: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<NodeJS.ProcessEnv> {
  const settingsEnv = await readSettingsEnv(workingDir);
  const merged: NodeJS.ProcessEnv = { ...base };

  // On Windows, `HTTPS_PROXY` and `https_proxy` are one variable, so an inherited value under
  // one spelling must not survive a settings value written under the other — the settings one
  // would be layered in beside it, both spellings would be present, and a reader that checks
  // the upper-case form first would report the value the user replaced.
  //
  // Only on Windows. Everywhere else the two spellings really are two variables, and dropping
  // one because the other was set would discard a value the user meant. The predecessor of
  // this module learned the same thing the hard way: interleaving deletes and writes over both
  // spellings left Windows users with no proxy at all while macOS and Linux were fine.
  if (platform === 'win32') {
    const settingsNames = new Set(Object.keys(settingsEnv).map((name) => name.toLowerCase()));
    for (const name of Object.keys(merged)) {
      if (settingsNames.has(name.toLowerCase())) delete merged[name];
    }
  }

  return { ...merged, ...settingsEnv };
}
