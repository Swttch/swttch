import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { useDetectedPath } from './useDetectedPath';

/** Which `claude` executable the backend spawns. Empty means "find it yourself". */
export function CliPathRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSetting } = useSettings();
  const detected = useDetectedPath(MessageType.GET_DETECTED_CLI_PATH);

  const value = settings[SettingKey.CLI_PATH] || '';

  return (
    <SettingRow
      label={t('cli.path.label')}
      description={t('cli.path.description')}
      isOverridden={isOverridden(SettingKey.CLI_PATH)}
    >
      <div className="flex flex-col items-end gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => updateSetting(SettingKey.CLI_PATH, e.target.value || null)}
          placeholder={t('cli.path.placeholder')}
          className="w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
        />
        {detected && !value && (
          <span className="text-xs text-text-tertiary truncate max-w-64" title={detected}>
            {detected}
          </span>
        )}
      </div>
    </SettingRow>
  );
}
