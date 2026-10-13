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
  /**
   * What a row should draw. On the project tab that is the merged value: a key the
   * project leaves out is inherited from global, and drawing the project's own
   * object instead shows an inherited key as unset (#547).
   */
  const displayedPermissions = scope === 'project' ? mergedPermissions : permissions;
  /** Whether [key] on the project tab comes from global because the project has none. */
  const isPermissionInherited = (key: keyof PermissionsConfig) =>
    scope === 'project' && permissions[key] === undefined;

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

  /**
   * The action behind the reset link of a row whose project value overrides the
   * global one. Undefined when there is nothing to take back.
   */
  const resetPermissionFor = (key: keyof PermissionsConfig) =>
    scope === 'project' && !isPermissionInherited(key)
      ? () => void deletePermissionsKey(key)
      : undefined;

  return {
    permissions,
    mergedPermissions,
    displayedPermissions,
    isPermissionInherited,
    resetPermissionFor,
    savePermissionsKey,
    deletePermissionsKey,
    scope,
  };
}
