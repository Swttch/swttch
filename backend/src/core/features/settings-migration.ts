import { readClaudeSettings, saveClaudeSetting } from './claude-settings';
import { saveSettingToFile } from './settings';

/**
 * GUI-only keys that historically leaked into the native Claude settings file
 * (`~/.claude/settings.json` / `settings.local.json`) even though they are NOT
 * part of Claude Code's official settings schema
 * (https://code.claude.com/docs/en/settings). They belong in the app settings
 * (`~/.claude-code-gui/settings.js`) instead.
 *
 * `language` (Claude's response language) is included: it is stored only and has
 * no CLI-transfer path in this codebase (the CLI does not read a top-level
 * `language` key from settings.json), so keeping it native has no effect.
 *
 * NOT included: `preferFastMode` → `fastMode` is a legitimate native key (the CLI
 * reads it from settings.json), so it is renamed in place, not migrated here.
 */
export const MIGRATED_GUI_KEYS = [
  'uiLanguage',
  'language',
  'useCtrlEnterToSend',
  'focusInputOnEditorContext',
  'respectGitignoreForContext',
  'autoResumeOnLimit',
] as const;

/**
 * One-time, idempotent migration run once at backend startup.
 *
 * For each {@link MIGRATED_GUI_KEYS} key still present in the native Claude
 * settings, copy its value into the app settings (global scope) and then delete
 * it from the native files. Keys that are absent (already migrated or never set)
 * are skipped, which makes re-running a no-op.
 *
 * Idempotency: the source of truth for "needs migration" is the presence of the
 * key in the native files. After a successful copy+delete the key is gone from
 * native, so the next run finds nothing and does nothing. A copy that fails
 * leaves the native key in place (never deleted), so the value is never lost and
 * the next run retries.
 *
 * Defensive: any failure is logged and swallowed so a migration error can never
 * block backend startup. Other native keys (model, permissions, env, …) are
 * never touched.
 */
export async function migrateGuiKeysFromClaudeSettings(): Promise<void> {
  try {
    // Merged view of settings.json + settings.local.json; `key in claude`
    // therefore detects a key living in either file.
    const claude = await readClaudeSettings();
    const present = MIGRATED_GUI_KEYS.filter((key) => key in claude);
    if (present.length === 0) return;

    for (const key of present) {
      const value = claude[key];
      // Copy into the global app settings first. saveSettingToFile validates the
      // value and performs an atomic (temp-file + rename) write.
      const copyResult = await saveSettingToFile(key, value);
      if (copyResult.status !== 'ok') {
        console.error(
          '[node-backend]',
          `settings migration: failed to copy "${key}" to app settings, keeping native value:`,
          copyResult.error,
        );
        continue;
      }
      // Only after a confirmed copy: remove the key from BOTH native files
      // (saveClaudeSetting(null) deletes from settings.json and settings.local.json).
      const deleteResult = await saveClaudeSetting(key, null);
      if (deleteResult.status !== 'ok') {
        console.error(
          '[node-backend]',
          `settings migration: copied "${key}" but failed to remove native value:`,
          deleteResult.error,
        );
      }
    }
  } catch (err) {
    console.error('[node-backend]', 'settings migration failed (non-fatal):', err);
  }
}
