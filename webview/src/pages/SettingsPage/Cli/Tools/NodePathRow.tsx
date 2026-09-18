import { SettingRow } from '../../common';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { useDetectedPath } from './useDetectedPath';

/** Which Node runs the backend. Takes effect on the next start, not this one. */
export function NodePathRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { settings, updateSetting } = useSettings();
  const detected = useDetectedPath(MessageType.GET_DETECTED_NODE_PATH);

  const value = settings[SettingKey.NODE_PATH] || '';

  return (
    <SettingRow
      label={t('cli.nodePath.label')}
      description={t('cli.nodePath.description')}
      isOverridden={isOverridden(SettingKey.NODE_PATH)}
    >
      <div className="flex flex-col items-end gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => updateSetting(SettingKey.NODE_PATH, e.target.value || null)}
          placeholder={t('cli.nodePath.placeholder')}
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
