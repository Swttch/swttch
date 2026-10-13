import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useTranslation } from '@/i18n';
import { usePermissionsConfig } from '../usePermissionsConfig';

/** Whether bypass mode may be entered at all. */
export function BypassModeRow() {
  const { t } = useTranslation('settings');
  const {
    displayedPermissions,
    isPermissionInherited,
    resetPermissionFor,
    savePermissionsKey,
    deletePermissionsKey,
  } = usePermissionsConfig();

  const bypassDisabled = displayedPermissions.disableBypassPermissionsMode === 'disable';

  return (
    <SettingRow
      label={t('permissions.bypassMode.label')}
      description={t('permissions.bypassMode.description')}
      isInherited={isPermissionInherited('disableBypassPermissionsMode')}
      onResetToGlobal={resetPermissionFor('disableBypassPermissionsMode')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/settings#permissions"
        />
      }
    >
      <ToggleSwitch
        checked={bypassDisabled}
        onChange={(checked) => {
          // Turning it off deletes the key rather than writing the opposite:
          // absent is how this project goes back to inheriting.
          if (checked) {
            return savePermissionsKey('disableBypassPermissionsMode', 'disable');
          }
          return deletePermissionsKey('disableBypassPermissionsMode');
        }}
        ariaLabel={t('permissions.bypassMode.label')}
      />
    </SettingRow>
  );
}
