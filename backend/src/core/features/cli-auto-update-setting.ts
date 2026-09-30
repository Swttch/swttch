import { readdir } from 'fs/promises';
import { join } from 'path';
import { getClaudeConfigDir } from './claudeConfigDir';
import { readJsonFileSafe, deepMergeSettings } from './claude-settings';
import { asEnvValue } from './settings-env';
import { displayPath } from './env-var-origin';
import { userClaudeJsonPath } from './env-sources';
import { updateJsonFile, type JsonUpdateResult } from './atomic-json';
import {
  CliAutoUpdateLockKind,
  CliUpdateChannel,
  type CliAutoUpdateLock,
  type NonessentialTrafficState,
  type CliAutoUpdateState,
} from '../../shared';

/**
 * Claude Code's own auto-update setting, as the About toggle shows and changes it.
 *
 * The toggle owns exactly one thing: `env.DISABLE_AUTOUPDATER` in the user settings file
 * (`<CLAUDE_CONFIG_DIR>/settings.json`). Off writes "1" there, on removes the key. That is
 * the switch Claude Code documents and the one it migrates its own legacy `autoUpdates: false`
 * into, so a terminal user who flips it by hand and a GUI user who flips it here end up with
 * the same file.
 *
 * Everything else that turns auto-updates off is read, never written, and reported as a lock
 * so the toggle can say where to go instead of pretending it can win.
 *
 * ── Rules, read from `claude` 2.1.284 (`claude doctor`'s `Auto-updates:` line) ────────────
 * In this order, the first match disables:
 *
 *   DISABLE_UPDATES                          truthy ("1", "true", "yes", "on", any case)
 *   DISABLE_AUTOUPDATER                      truthy (same test)
 *   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC any non-empty value
 *   `autoUpdates: false` in ~/.claude.json   unless installMethod is "native" and
 *                                            autoUpdatesProtectedForNative is true
 *
 * Each variable is read from the environment `claude` ends up with: the inherited one, then
 * the user settings `env` blocks, then the managed settings `env` block, each layer replacing
 * the one before. Measured with `claude doctor`: `DISABLE_AUTOUPDATER=1` exported in the shell
 * and `"0"` in settings.json reports `enabled`, so the file really does outrank the shell.
 *
 * The background update in ../cli-auto-update.ts still asks `claude doctor` itself. This
 * module exists so the toggle can answer instantly and name the file, and it is written to
 * the same rules so the two cannot tell the user different things.
 *
 * Project settings are not consulted. The CLI binary is shared by every project, and the
 * background check does not run inside one. That includes a `settings.local.json` beside the
 * user settings file: `claude` resolves `settings.local.json` against a project's `.claude/`
 * directory, never against the config directory, so it is not a user layer.
 */

/** The variable the toggle writes and removes. */
export const TOGGLE_VARIABLE = 'DISABLE_AUTOUPDATER';

const MANAGED_SETTINGS_DIR: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '/Library/Application Support/ClaudeCode',
  win32: 'C:\\Program Files\\ClaudeCode',
};

function managedSettingsDir(platform: NodeJS.Platform = process.platform): string {
  return MANAGED_SETTINGS_DIR[platform] ?? '/etc/claude-code';
}

/** The CLI's truthy test for a boolean variable. */
function isTruthy(value: string | undefined): boolean {
  return value !== undefined && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** One place that can set variables, weakest first in a list. */
interface EnvLayer {
  kind: CliAutoUpdateLockKind;
  /** Absolute path of the file, or null for the inherited environment. */
  path: string | null;
  env: Record<string, string | undefined>;
}

/** The `env` block of a parsed settings object, as environment values. */
function envBlockOf(settings: Record<string, unknown>): Record<string, string> {
  const block = settings.env;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(block as Record<string, unknown>)) {
    const asValue = asEnvValue(value);
    if (asValue !== null) out[name] = asValue;
  }
  return out;
}

/** The layer that has the final say on [name], or null when nothing sets it. */
function decidingLayer(layers: EnvLayer[], name: string): { layer: EnvLayer; value: string } | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const value = layers[i].env[name];
    if (value !== undefined) return { layer: layers[i], value };
  }
  return null;
}

export interface GlobalConfig {
  autoUpdates?: unknown;
  installMethod?: unknown;
  autoUpdatesProtectedForNative?: unknown;
}

/** What turns auto-updates off, in the CLI's order, or null when nothing does. */
export function findDisabler(layers: EnvLayer[], config: GlobalConfig): CliAutoUpdateLock | null {
  const checks: Array<{ name: string; disables: (value: string) => boolean }> = [
    { name: 'DISABLE_UPDATES', disables: isTruthy },
    { name: 'DISABLE_AUTOUPDATER', disables: isTruthy },
    { name: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', disables: (value) => value !== '' },
  ];
  for (const { name, disables } of checks) {
    const found = decidingLayer(layers, name);
    if (found && disables(found.value)) {
      return {
        kind: found.layer.kind,
        variable: name,
        path: found.layer.path === null ? null : displayPath(found.layer.path),
      };
    }
  }
  if (
    config.autoUpdates === false &&
    (config.installMethod !== 'native' || config.autoUpdatesProtectedForNative !== true)
  ) {
    return { kind: CliAutoUpdateLockKind.GLOBAL_CONFIG, variable: null, path: displayPath(userClaudeJsonPath()) };
  }
  return null;
}

/**
 * `autoUpdatesChannel` as `claude` resolves it: managed settings over user settings, LATEST
 * when neither names a channel the CLI accepts.
 */
export function resolveChannel(user: Record<string, unknown>, managed: Record<string, unknown>): CliUpdateChannel {
  const channels = Object.values(CliUpdateChannel) as string[];
  for (const value of [managed.autoUpdatesChannel, user.autoUpdatesChannel]) {
    if (typeof value === 'string' && channels.includes(value)) return value as CliUpdateChannel;
  }
  return CliUpdateChannel.LATEST;
}

/** Where to read from. Every field has a default; tests point them at a temporary directory. */
export interface CliAutoUpdateSources {
  configDir?: string;
  claudeJsonPath?: string;
  managedDir?: string;
  env?: NodeJS.ProcessEnv;
}

function userSettingsPath(configDir: string): string {
  return join(configDir, 'settings.json');
}

/** Managed settings: the base file, then `managed-settings.d/*.json` in name order. */
async function readManagedSettings(dir: string): Promise<Record<string, unknown>> {
  let merged = await readJsonFileSafe(join(dir, 'managed-settings.json'));
  const dropInDir = join(dir, 'managed-settings.d');
  let entries: string[] = [];
  try {
    entries = (await readdir(dropInDir)).filter((entry) => entry.endsWith('.json')).sort();
  } catch {
    // No drop-in directory is the common case.
  }
  for (const entry of entries) {
    merged = deepMergeSettings(merged, await readJsonFileSafe(join(dropInDir, entry)));
  }
  return merged;
}

/**
 * The effective auto-update value and what, besides the toggle, keeps it off.
 *
 * `lock` is computed as if the toggle's own `DISABLE_AUTOUPDATER` in settings.json were
 * already gone: if something is still left disabling, turning the toggle on could not work,
 * and that something is what the user has to be told about.
 */
export async function readCliAutoUpdateState(sources: CliAutoUpdateSources = {}): Promise<CliAutoUpdateState> {
  const configDir = sources.configDir ?? getClaudeConfigDir();
  const settingsPath = userSettingsPath(configDir);
  const managedDir = sources.managedDir ?? managedSettingsDir();
  const managedPath = join(managedDir, 'managed-settings.json');

  const [user, managed, config] = await Promise.all([
    readJsonFileSafe(settingsPath),
    readManagedSettings(managedDir),
    readJsonFileSafe(sources.claudeJsonPath ?? userClaudeJsonPath()),
  ]);

  const userEnv = envBlockOf(user);
  const layers = (userLayerEnv: Record<string, string>): EnvLayer[] => [
    { kind: CliAutoUpdateLockKind.ENVIRONMENT, path: null, env: sources.env ?? process.env },
    { kind: CliAutoUpdateLockKind.USER_SETTINGS, path: settingsPath, env: userLayerEnv },
    { kind: CliAutoUpdateLockKind.MANAGED_SETTINGS, path: managedPath, env: envBlockOf(managed) },
  ];

  const withoutToggle = { ...userEnv };
  delete withoutToggle[TOGGLE_VARIABLE];
  return {
    enabled: findDisabler(layers(userEnv), config) === null,
    lock: findDisabler(layers(withoutToggle), config),
    settingsPath: displayPath(settingsPath),
    channel: resolveChannel(user, managed),
  };
}

/**
 * Turn auto-updates on or off in the user settings file: off writes `DISABLE_AUTOUPDATER`
 * "1", on removes it.
 */
export function saveCliAutoUpdate(enabled: boolean, configDir: string = getClaudeConfigDir()): Promise<JsonUpdateResult> {
  return saveUserEnvVariable(TOGGLE_VARIABLE, enabled ? null : '1', configDir);
}

// ─── Nonessential traffic ─────────────────────────────────────────────────────────────────

/**
 * Claude Code's "essential traffic only" switch. Any non-empty value turns off everything the
 * CLI does not need to answer a prompt, auto-updates among them.
 */
export const NONESSENTIAL_TRAFFIC_VARIABLE = 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC';

/**
 * Whether nonessential traffic is off, and whether the Privacy toggle can change that.
 *
 * Only managed settings are out of reach. The user settings file outranks the inherited
 * environment, so a value exported in a shell profile is overridden from here without a
 * terminal: see {@link saveNonessentialTraffic}.
 */
export async function readNonessentialTrafficState(sources: CliAutoUpdateSources = {}): Promise<NonessentialTrafficState> {
  const configDir = sources.configDir ?? getClaudeConfigDir();
  const settingsPath = userSettingsPath(configDir);
  const managedDir = sources.managedDir ?? managedSettingsDir();
  const managedPath = join(managedDir, 'managed-settings.json');
  const [user, managed] = await Promise.all([readJsonFileSafe(settingsPath), readManagedSettings(managedDir)]);

  const layers: EnvLayer[] = [
    { kind: CliAutoUpdateLockKind.ENVIRONMENT, path: null, env: sources.env ?? process.env },
    { kind: CliAutoUpdateLockKind.USER_SETTINGS, path: settingsPath, env: envBlockOf(user) },
    { kind: CliAutoUpdateLockKind.MANAGED_SETTINGS, path: managedPath, env: envBlockOf(managed) },
  ];
  const found = decidingLayer(layers, NONESSENTIAL_TRAFFIC_VARIABLE);
  const managedValue = envBlockOf(managed)[NONESSENTIAL_TRAFFIC_VARIABLE];
  return {
    disabled: found !== null && found.value !== '',
    lock: managedValue === undefined
      ? null
      : { kind: CliAutoUpdateLockKind.MANAGED_SETTINGS, variable: NONESSENTIAL_TRAFFIC_VARIABLE, path: displayPath(managedPath) },
    settingsPath: displayPath(settingsPath),
  };
}

/**
 * Turn nonessential traffic off ("1") or back on in the user settings file.
 *
 * Turning it back on removes the key, unless the inherited environment sets the variable too.
 * Then the key is written as "", which `claude` applies over the environment and reads as
 * unset, so the switch works for a value the user put in a shell profile as well.
 */
export function saveNonessentialTraffic(
  disabled: boolean,
  sources: Pick<CliAutoUpdateSources, 'configDir' | 'env'> = {},
): Promise<JsonUpdateResult> {
  const inherited = (sources.env ?? process.env)[NONESSENTIAL_TRAFFIC_VARIABLE];
  const value = disabled ? '1' : inherited ? '' : null;
  return saveUserEnvVariable(NONESSENTIAL_TRAFFIC_VARIABLE, value, sources.configDir ?? getClaudeConfigDir());
}

// ─── Writing ──────────────────────────────────────────────────────────────────────────────

/**
 * Set one variable in the `env` block of the user settings file, or remove it for null.
 *
 * Only that variable is touched; every other variable and every other key of the file is
 * written back as it was read. An `env` left empty by a removal is removed with it, so turning
 * a switch off and on again leaves a file that never had `env` as it was. A file that exists
 * but cannot be read, or whose `env` is not an object, is left alone and reported, never
 * replaced.
 */
async function saveUserEnvVariable(name: string, value: string | null, configDir: string): Promise<JsonUpdateResult> {
  const path = userSettingsPath(configDir);
  // An object rather than a `let`: TypeScript does not see assignments made inside the
  // callback, and would narrow a plain variable to `null` for the check below.
  const refusal: { reason: string | null } = { reason: null };
  const result = await updateJsonFile(path, (current) => {
    const env = current.env;
    if (env !== undefined && (env === null || typeof env !== 'object' || Array.isArray(env))) {
      refusal.reason = `refusing to edit ${path}: "env" is not an object`;
      return null;
    }
    const block = { ...((env as Record<string, unknown> | undefined) ?? {}) };
    if (value === null) {
      if (!(name in block)) return null;
      delete block[name];
    } else {
      if (block[name] === value) return null;
      block[name] = value;
    }
    if (Object.keys(block).length === 0) {
      delete current.env;
    } else {
      current.env = block;
    }
    return current;
  });
  if (refusal.reason) return { status: 'error', error: refusal.reason };
  return result;
}
