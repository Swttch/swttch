import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useTranslation } from '@/i18n';
import { usePermissionsConfig } from '../usePermissionsConfig';

/** Whether bypass mode may be entered at all. */
export function BypassModeRow() {
  const { t } = useTranslation('settings');
  const { permissions, savePermissionsKey, deletePermissionsKey, scope } = usePermissionsConfig();

  const bypassDisabled = permissions.disableBypassPermissionsMode === 'disable';
  const isNotSet = permissions.disableBypassPermissionsMode === undefined && scope === 'project';

  return (
    <SettingRow
      label={t('permissions.bypassMode.label')}
      description={t('permissions.bypassMode.description')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref="https://code.claude.com/docs/en/settings#permissions"
        />
      }
    >
      {isNotSet ? (
        // At project scope with nothing stored, the switch shows off and says
        // why beside it: off and "not set" look identical otherwise, and the
        // difference decides whether the global value applies.
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary italic">{t('permissions.notSet')}</span>
          <ToggleSwitch
            checked={false}
            onChange={() => savePermissionsKey('disableBypassPermissionsMode', 'disable')}
            ariaLabel={t('permissions.bypassMode.label')}
          />
        </div>
      ) : (
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
      )}
    </SettingRow>
  );
}
