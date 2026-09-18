import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, LogLevel } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

/** How much the app writes to its log. */
export function LogLevelRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();

  const raw = scopeSettings[SettingKey.LOG_LEVEL] as LogLevel | undefined;
  const isNotSet = raw === undefined && scope === 'project';
  const value = isNotSet ? NOT_SET_VALUE : (raw ?? LogLevel.INFO);

  const options: SelectOption[] = [
    ...(scope === 'project'
      ? [{ value: NOT_SET_VALUE, label: t('advanced.debugging.logLevel.notSet'), italic: true }]
      : []),
    { value: LogLevel.DEBUG, label: t('advanced.debugging.logLevel.debug') },
    { value: LogLevel.INFO, label: t('advanced.debugging.logLevel.info') },
    { value: LogLevel.WARN, label: t('advanced.debugging.logLevel.warning') },
    { value: LogLevel.ERROR, label: t('advanced.debugging.logLevel.error') },
  ];

  return (
    <SettingRow
      label={t('advanced.debugging.logLevel.label')}
      description={t('advanced.debugging.logLevel.description')}
      isOverridden={isOverridden(SettingKey.LOG_LEVEL)}
    >
      <Select
        value={value}
        options={options}
        ariaLabel={t('advanced.debugging.logLevel.label')}
        onChange={(next) => {
          if (next === NOT_SET_VALUE) {
            resetToGlobal(SettingKey.LOG_LEVEL);
            return;
          }
          updateSetting(SettingKey.LOG_LEVEL, next as LogLevel);
        }}
        className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          isNotSet ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
