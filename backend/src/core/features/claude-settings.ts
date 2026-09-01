import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, watch } from 'fs';
import { join, dirname } from 'path';
import { getClaudeConfigDir } from './claudeConfigDir';

const claudeSettingsFile = () => join(getClaudeConfigDir(), 'settings.json');
const claudeSettingsLocalFile = () => join(getClaudeConfigDir(), 'settings.local.json');

/**
 * Keys that must never be copied from a settings file.
 *
 * `JSON.parse` turns a literal `"__proto__"` into an own property, and assigning
 * it swaps the prototype of the merged object: the key stays invisible to
 * `Object.keys` while `'X' in settings` and `settings.X` start answering for it.
 * Code that asks whether a setting exists (settings-migration does) would be
 * answering about an attacker-supplied prototype instead of the file.
 */
const UNSAFE_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Merge `override` onto `base`, recursing into plain objects so that a single
 * key in the higher-priority file does not discard its siblings.
 *
 * Two behaviours below are decisions, not accidents. Both were reviewed and
 * kept deliberately, so changing either is a product decision rather than a
 * bug fix:
 *
 * - **Arrays replace; they are never concatenated.** A file that spells out
 *   `permissions.allow` is stating the list it wants, not appending to whatever
 *   a weaker layer happened to hold — and there would be no way to express
 *   "drop the inherited entry" if the lists were merged. Only the same-named
 *   array is replaced; sibling keys such as `permissions.deny` survive.
 * - **`null` is a value, not a deletion.** `{"k": null}` sets `k` to null and
 *   keeps the key. Removing a setting means removing the key from the file.
 */
export function deepMergeSettings(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (UNSAFE_MERGE_KEYS.has(key)) continue;
    const baseVal = base[key];
    const overVal = override[key];
    if (
      overVal !== null &&
      typeof overVal === 'object' &&
      !Array.isArray(overVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMergeSettings(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else {
      result[key] = overVal;
    }
  }
  return result;
}

/**
 * Read a JSON file safely, returning {} if the file doesn't exist or fails to parse.
 *
 * Valid JSON is not the same thing as a settings object: `null`, `[1,2,3]` and
 * `"text"` all parse. Returning them as-is put a caller in the position of
 * merging a non-object — `Object.keys(null)` throws and takes the other file's
 * settings down with it, and spreading an array or string leaks index keys ("0",
 * "1", …) into the merged settings. Anything that is not a plain object is
 * treated as an unusable file, exactly like a parse failure.
 */
export async function readJsonFileSafe(filePath: string): Promise<Record<string, unknown>> {
  try {
    if (!existsSync(filePath)) return {};
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Read ~/.claude/settings.json and settings.local.json, merge them.
 * settings.local.json takes priority over settings.json.
 * Returns empty object if files don't exist.
 *
 * Merged deeply, matching `readProjectClaudeSettings` at the project level. A
 * shallow merge replaces a nested block wholesale, so a single key under `env`
 * in settings.local.json would drop every variable settings.json defines —
 * which is exactly the layering `${VAR}` expansion depends on (#364).
 */
export async function readClaudeSettings(): Promise<Record<string, unknown>> {
  try {
    const base = await readJsonFileSafe(claudeSettingsFile());
    const local = await readJsonFileSafe(claudeSettingsLocalFile());
    return deepMergeSettings(base, local);
  } catch (err) {
    console.error('[node-backend]', 'Failed to read Claude settings:', err);
    return {};
  }
}

/**
 * Write a key-value to a JSON file, preserving other keys.
 * If value is null/undefined, delete the key.
 */
async function writeKeyToJsonFile(filePath: string, key: string, value: unknown): Promise<void> {
  const current = await readJsonFileSafe(filePath);
  if (value === null || value === undefined) {
    delete current[key];
  } else {
    current[key] = value;
  }
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
}

/**
 * Remove a key from a JSON file if it exists there.
 * No-op if file doesn't exist or key is absent.
 */
async function removeKeyFromJsonFile(filePath: string, key: string): Promise<void> {
  const current = await readJsonFileSafe(filePath);
  if (!(key in current)) return;
  delete current[key];
  await writeFile(filePath, JSON.stringify(current, null, 2) + '\n', 'utf-8');
}

/**
 * Save a global Claude setting.
 * Writes to whichever file (settings.json or settings.local.json) the key lives in.
 * Deletion removes the key from both files.
 */
export async function saveClaudeSetting(
  key: string,
  value: unknown,
): Promise<{ status: 'ok' | 'error'; error?: string }> {
  try {
    await mkdir(getClaudeConfigDir(), { recursive: true });

    if (value === null || value === undefined) {
      await removeKeyFromJsonFile(claudeSettingsFile(), key);
      await removeKeyFromJsonFile(claudeSettingsLocalFile(), key);
      return { status: 'ok' };
    }

    // Write to the file where the key currently lives (local takes priority)
    const localSettings = await readJsonFileSafe(claudeSettingsLocalFile());
    if (key in localSettings) {
      await writeKeyToJsonFile(claudeSettingsLocalFile(), key, value);
    } else {
      await writeKeyToJsonFile(claudeSettingsFile(), key, value);
    }
    return { status: 'ok' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'Failed to save Claude setting:', err);
    return { status: 'error', error: msg };
  }
}

/**
 * Read project-level Claude settings from {projectPath}/.claude/settings.json
 * and {projectPath}/.claude/settings.local.json, merging local over base.
 */
export async function readProjectClaudeSettings(projectPath: string): Promise<Record<string, unknown>> {
  try {
    const base = await readJsonFileSafe(join(projectPath, '.claude', 'settings.json'));
    const local = await readJsonFileSafe(join(projectPath, '.claude', 'settings.local.json'));
    return deepMergeSettings(base, local);
  } catch (err) {
    console.error('[node-backend]', 'Failed to read project Claude settings:', err);
    return {};
  }
}

/**
 * Read merged Claude settings: global → project
 */
export async function readMergedClaudeSettings(projectPath?: string): Promise<{ settings: Record<string, unknown>; overrides: string[] }> {
  const globalSettings = await readClaudeSettings();
  if (!projectPath) {
    return { settings: globalSettings, overrides: [] };
  }
  const projectSettings = await readProjectClaudeSettings(projectPath);
  const overrides = Object.keys(projectSettings);
  return {
    settings: deepMergeSettings(globalSettings, projectSettings),
    overrides,
  };
}

/**
 * Save a Claude setting to the specified scope.
 */
export async function saveClaudeSettingToScope(
  key: string,
  value: unknown,
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<{ status: 'ok' | 'error'; error?: string }> {
  if (scope === 'project') {
    if (!projectPath) return { status: 'error', error: 'projectPath required for project scope' };
    try {
      const baseFile = join(projectPath, '.claude', 'settings.json');
      const localFile = join(projectPath, '.claude', 'settings.local.json');
      await mkdir(join(projectPath, '.claude'), { recursive: true });

      if (value === null || value === undefined) {
        await removeKeyFromJsonFile(baseFile, key);
        await removeKeyFromJsonFile(localFile, key);
        return { status: 'ok' };
      }

      // Write to the file where the key currently lives (local takes priority)
      const localSettings = await readJsonFileSafe(localFile);
      if (key in localSettings) {
        await writeKeyToJsonFile(localFile, key, value);
      } else {
        await writeKeyToJsonFile(baseFile, key, value);
      }
      return { status: 'ok' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: msg };
    }
  }
  return saveClaudeSetting(key, value);
}

// ─── API Key Detection ─────────────────────────────────────────────────────

// API 키 패턴 — env 값의 키 이름이 이 패턴에 매칭되면 API 키로 간주
const API_KEY_PATTERNS = [
  /^ANTHROPIC_API_KEY$/i,
  /^CLAUDE_API_KEY$/i,
  /^ANTHROPIC_AUTH_TOKEN$/i,
  /API_KEY$/i,
  /API_TOKEN$/i,
  /AUTH_TOKEN$/i,
];

// OAuth *token* env keys that the Claude CLI consults BEFORE the keychain. When these are
// inherited from a parent process (e.g. Claude Desktop spawning Claude Code, IDE-integrated
// terminals, or stale env in the user's shell), the CLI uses them as-is and never triggers
// its keychain-based refresh_token flow — so once the inherited token EXPIRES, every call
// returns 401 indefinitely. Stripping them lets the CLI fall back to its refreshable keychain
// auth.
//
// ANTHROPIC_API_KEY is intentionally NOT in this list. An API key does not expire and has no
// refresh flow, so it never causes the 401 loop above — the only reason the OAuth tokens are
// stripped. Stripping it only broke users who authenticate by exporting ANTHROPIC_API_KEY
// (shell env / Windows `setx`) rather than pinning it in settings.json: the `claude` CLI
// honors that env var directly, so the GUI must too (CLI parity). See marketplace review
// #140950 — the plugin showed "Not logged in" / prompts failed on Windows precisely because
// this strip removed the user's env-provided API key before spawning the CLI.
const STRIPPABLE_AUTH_ENV_KEYS = [
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
] as const;

/**
 * Decide which auth-related env keys should be stripped from the env passed to a spawned
 * Claude CLI child, given the merged Claude settings (global + project).
 *
 * Rationale: when the backend Node process inherits OAuth creds from its parent
 * (Claude Desktop, IDE, etc.), passing them through to the CLI bypasses the CLI's
 * refresh flow and pins it to a stale token. We strip them so the CLI falls back to
 * its keychain-based auth (which can refresh).
 *
 * Exception: if the user explicitly placed one of these keys in their Claude settings
 * (`env`), that's an intentional override (e.g. dev/staging API key) and we preserve it.
 */
export async function getStrippableAuthEnvKeys(workingDir?: string): Promise<string[]> {
  const { settings } = await readMergedClaudeSettings(workingDir);
  const env = settings.env;
  const explicit =
    env && typeof env === 'object' && !Array.isArray(env)
      ? new Set(Object.keys(env as Record<string, unknown>))
      : new Set<string>();
  return STRIPPABLE_AUTH_ENV_KEYS.filter((key) => !explicit.has(key));
}

/**
 * Read env from Claude settings and return API key names found.
 * Checks both ~/.claude/settings.json and settings.local.json.
 */
export async function getEnvApiKeys(): Promise<string[]> {
  const settings = await readClaudeSettings();
  const env = settings.env as Record<string, string> | undefined;
  if (!env || typeof env !== 'object' || Array.isArray(env)) return [];

  return Object.keys(env).filter((key) =>
    API_KEY_PATTERNS.some((pattern) => pattern.test(key)),
  );
}

// ─── File Watcher ──────────────────────────────────────────────────────────

let watcherInstance: ReturnType<typeof watch> | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 300;

/**
 * Watch ~/.claude/settings.json for external changes
 * Calls onFileChange callback when file is modified
 *
 * Usage:
 *   watchClaudeSettingsFile((settings) => {
 *     connections.broadcastToAll('CLAUDE_SETTINGS_CHANGED', { settings });
 *   });
 */
export function watchClaudeSettingsFile(onFileChange: (settings: Record<string, unknown>) => void): void {
  // Prevent duplicate watchers
  if (watcherInstance) {
    console.log('[node-backend]', 'Claude settings file watcher already started');
    return;
  }

  try {
    const settingsDir = getClaudeConfigDir();

    watcherInstance = watch(settingsDir, async (eventType, filename) => {
      // Only watch settings.json file
      if (filename !== 'settings.json') {
        return;
      }

      // Debounce multiple rapid file changes (fs.watch can trigger multiple times)
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        try {
          const settings = await readClaudeSettings();
          console.log('[node-backend]', 'Claude settings file changed, broadcasting:', settings);
          onFileChange(settings);
        } catch (err) {
          console.error('[node-backend]', 'Error reading Claude settings after file change:', err);
        }
      }, DEBOUNCE_MS);
    });

    console.log('[node-backend]', `Watching ${claudeSettingsFile()} for changes`);
  } catch (err) {
    console.error('[node-backend]', 'Failed to start Claude settings file watcher:', err);
  }
}

/**
 * Stop watching Claude settings file
 */
export function stopWatchingClaudeSettingsFile(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (watcherInstance) {
    watcherInstance.close();
    watcherInstance = null;
    console.log('[node-backend]', 'Claude settings file watcher stopped');
  }
}
