import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, LogLevel } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

/** How much the app writes to its log. */
export function LogLevelRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting, scope, resetToGlobal } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const value = (displaySettings[SettingKey.LOG_LEVEL] as LogLevel | undefined) ?? LogLevel.INFO;
  const inherited = isInherited(SettingKey.LOG_LEVEL);
  // "Not set" is how a project takes its own value back, so it is offered only
  // while there is one to take back. Without one the dropdown shows the value
  // the project inherits, and choosing a value stores it in the project.
  const hasOwnValue = scope === 'project' && !inherited;

  const options: SelectOption[] = [
    ...(hasOwnValue
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
      isInherited={inherited}
      onResetToGlobal={resetFor(SettingKey.LOG_LEVEL)}
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
          inherited ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
