import { readClaudeSettings, saveClaudeSetting } from './claude-settings';
import { readSettingsFile, saveSettingToFile } from './settings';

/**
 * Where a settings key belongs is decided by ONE source of truth: the official
 * Claude Code settings schema (https://www.schemastore.org/claude-code-settings.json,
 * documented at https://code.claude.com/docs/en/settings).
 *
 *   in the schema  → native Claude settings (`~/.claude/settings.json`), so the
 *                    CLI actually reads it and the GUI is just an editor for it
 *   not in it      → our app settings (`~/.claude-code-gui/settings.js`), so we
 *                    never pollute the native file with keys the CLI ignores
 *
 * Earlier versions got several keys wrong in BOTH directions, so this module
 * moves each one to its correct store on startup.
 */

/**
 * GUI-only keys that leaked into the native Claude settings file even though they
 * are NOT in the official schema. They belong in the app settings.
 *
 * NOT included: `preferFastMode` → `fastMode` is a legitimate native key (the CLI
 * reads it from settings.json), so it is renamed in place, not migrated here.
 */
export const MIGRATED_GUI_KEYS = [
  'uiLanguage',
  'useCtrlEnterToSend',
  'focusInputOnEditorContext',
  'autoResumeOnLimit',
  // Effort slider's top step. A GUI-side flag bundle, absent from the schema.
  'ultracode',
] as const;

/**
 * Keys that ARE in the official schema but which we wrongly stored in the app
 * settings. They must go back to the native file so the CLI reads them again.
 *
 * - `language`: Claude's response language. Storing it app-side left it with no
 *   CLI-transfer path at all, so the setting silently did nothing.
 * - `env`: environment variables for Claude sessions — minus the one exception
 *   below.
 */
export const RECLAIMED_NATIVE_KEYS = ['language', 'env'] as const;

/**
 * The one env var that must NOT move to the native file: it decides WHERE that
 * file lives, so storing it inside the file would be circular (you would have to
 * already know the directory in order to read the directory setting). It stays
 * in the app settings, which live at a fixed path.
 */
export const CONFIG_DIR_ENV_KEY = 'CLAUDE_CONFIG_DIR';

/**
 * App-settings keys whose official counterpart has a DIFFERENT name. The value is
 * carried over to the official key in the native file and the old key is cleared.
 *
 * `respectGitignoreForContext` was our own name for a `.gitignore` toggle; the
 * official key is `respectGitignore`. Unifying onto the official name means the
 * CLI honours the same value the GUI shows.
 */
export const RENAMED_TO_NATIVE_KEYS: Record<string, string> = {
  respectGitignoreForContext: 'respectGitignore',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asEnvRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * Copy a value into its destination store, and only after a CONFIRMED success
 * clear it from the source. A failed copy leaves the source untouched, so the
 * value is never lost and the next startup retries.
 */
async function moveValue(params: {
  key: string;
  value: unknown;
  copy: () => Promise<{ status: 'ok' | 'error'; error?: string }>;
  clear: () => Promise<{ status: 'ok' | 'error'; error?: string }>;
  direction: string;
}): Promise<void> {
  const { key, copy, clear, direction } = params;
  const copyResult = await copy();
  if (copyResult.status !== 'ok') {
    console.error(
      '[node-backend]',
      `settings migration: failed to copy "${key}" ${direction}, keeping the original:`,
      copyResult.error,
    );
    return;
  }
  const clearResult = await clear();
  if (clearResult.status !== 'ok') {
    console.error(
      '[node-backend]',
      `settings migration: copied "${key}" ${direction} but failed to clear the original:`,
      clearResult.error,
    );
  }
}

/** Native → app: GUI-only keys that do not belong in the native file. */
async function moveGuiKeysOutOfNative(native: Record<string, unknown>): Promise<void> {
  for (const key of MIGRATED_GUI_KEYS) {
    if (!(key in native)) continue;
    const value = native[key];
    await moveValue({
      key,
      value,
      copy: () => saveSettingToFile(key, value),
      clear: () => saveClaudeSetting(key, null),
      direction: 'to app settings',
    });
  }
}

/**
 * App → native: `env`, minus CLAUDE_CONFIG_DIR.
 *
 * Existing native vars win over app vars of the same name — the native file is
 * the destination store, so a value already there is the more authoritative one.
 */
async function reclaimEnvIntoNative(
  native: Record<string, unknown>,
  app: Record<string, unknown>,
): Promise<void> {
  const appEnv = asEnvRecord(app.env);
  const movable = Object.fromEntries(
    Object.entries(appEnv).filter(([name]) => name !== CONFIG_DIR_ENV_KEY),
  );
  if (Object.keys(movable).length === 0) return;

  const nativeEnv = asEnvRecord(native.env);
  const mergedNativeEnv = { ...movable, ...nativeEnv };
  const remainingAppEnv = Object.fromEntries(
    Object.entries(appEnv).filter(([name]) => name === CONFIG_DIR_ENV_KEY),
  );

  await moveValue({
    key: 'env',
    value: mergedNativeEnv,
    copy: () => saveClaudeSetting('env', mergedNativeEnv),
    clear: () => saveSettingToFile('env', remainingAppEnv),
    direction: 'to native settings',
  });
}

/** App → native: official-schema keys we wrongly kept app-side. */
async function reclaimNativeKeys(
  native: Record<string, unknown>,
  app: Record<string, unknown>,
): Promise<void> {
  for (const key of RECLAIMED_NATIVE_KEYS) {
    if (key === 'env') {
      await reclaimEnvIntoNative(native, app);
      continue;
    }
    // null/undefined means "unset" in the app store — there is no value to move.
    const value = app[key];
    if (value === null || value === undefined) continue;

    await moveValue({
      key,
      value,
      copy: () => saveClaudeSetting(key, value),
      clear: () => saveSettingToFile(key, null),
      direction: 'to native settings',
    });
  }
}

/**
 * Rename + move: a legacy key (in either store) whose value belongs under a
 * different, official name in the native file.
 *
 * An official value that already exists always wins; the legacy key is still
 * cleared so the stale name stops lingering.
 */
async function migrateRenamedKeys(
  native: Record<string, unknown>,
  app: Record<string, unknown>,
): Promise<void> {
  for (const [legacyKey, officialKey] of Object.entries(RENAMED_TO_NATIVE_KEYS)) {
    const inApp = legacyKey in app && app[legacyKey] !== null && app[legacyKey] !== undefined;
    const inNative = legacyKey in native;
    if (!inApp && !inNative) continue;

    // Prefer the app value: it is where the current version writes the setting.
    const value = inApp ? app[legacyKey] : native[legacyKey];
    const officialAlreadySet = officialKey in native;

    if (!officialAlreadySet) {
      const copyResult = await saveClaudeSetting(officialKey, value);
      if (copyResult.status !== 'ok') {
        console.error(
          '[node-backend]',
          `settings migration: failed to copy "${legacyKey}" to "${officialKey}", keeping the original:`,
          copyResult.error,
        );
        continue;
      }
    }

    // Clear the legacy name from wherever it was found.
    if (inApp) {
      const clearResult = await saveSettingToFile(legacyKey, null);
      if (clearResult.status !== 'ok') {
        console.error(
          '[node-backend]',
          `settings migration: failed to clear app key "${legacyKey}":`,
          clearResult.error,
        );
      }
    }
    if (inNative) {
      const clearResult = await saveClaudeSetting(legacyKey, null);
      if (clearResult.status !== 'ok') {
        console.error(
          '[node-backend]',
          `settings migration: failed to clear native key "${legacyKey}":`,
          clearResult.error,
        );
      }
    }
  }
}

/**
 * One-time, idempotent migration run once at backend startup.
 *
 * Idempotency: "needs migration" is derived purely from where a key currently
 * sits. After a successful move the key is gone from the source, so the next run
 * finds nothing and does nothing.
 *
 * Defensive: any failure is logged and swallowed so a migration error can never
 * block backend startup. Keys outside the three sets are never touched.
 */
export async function migrateSettingsToCorrectStore(): Promise<void> {
  try {
    // Merged view of settings.json + settings.local.json, so `key in native`
    // detects a key living in either file.
    const native = await readClaudeSettings();
    const app = await readSettingsFile();

    await moveGuiKeysOutOfNative(native);
    await reclaimNativeKeys(native, app);
    await migrateRenamedKeys(native, app);
  } catch (err) {
    console.error('[node-backend]', 'settings migration failed (non-fatal):', err);
  }
}
