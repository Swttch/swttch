import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import type { PermissionsConfig } from '@/types/claude-settings';

/**
 * Reading and writing single keys inside Claude's `permissions` object.
 *
 * Both rows on this page edit one object rather than a key each, so each write
 * has to spread what is already there. Doing that per row is how one of them
 * ends up dropping the other's value, which is why it is written once here.
 *
 * Deleting is a separate operation from writing a falsey value: an absent key
 * means "inherit", and storing `false` instead would pin the project to a
 * decision the user was trying to take back.
 */
export function usePermissionsConfig() {
  const { settings, scopeSettings, updateSetting, scope } = useClaudeSettings();

  /** What this scope stores, which is what the rows edit. */
  const permissions = (scopeSettings.permissions ?? {}) as PermissionsConfig;
  /** What is actually in effect once scopes are merged, which decides behaviour. */
  const mergedPermissions = (settings.permissions ?? {}) as PermissionsConfig;

  const savePermissionsKey = async (key: keyof PermissionsConfig, value: unknown) => {
    const current = (scopeSettings.permissions ?? {}) as Record<string, unknown>;
    await updateSetting('permissions', { ...current, [key]: value } as PermissionsConfig);
  };

  const deletePermissionsKey = async (key: keyof PermissionsConfig) => {
    const current = (scopeSettings.permissions ?? {}) as Record<string, unknown>;
    const updated = { ...current };
    delete updated[key];
    await updateSetting('permissions', updated as PermissionsConfig);
  };

  return { permissions, mergedPermissions, savePermissionsKey, deletePermissionsKey, scope };
}
