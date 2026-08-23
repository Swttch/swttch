import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, LogLevel } from '@/types/settings';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

const NOT_SET_VALUE = '__NOT_SET__';

export function AdvancedSettings() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();

  const rawDebugMode = scopeSettings[SettingKey.DEBUG_MODE] as boolean | undefined;
  const isDebugNotSet = rawDebugMode === undefined && scope === 'project';

  const rawLogLevel = scopeSettings[SettingKey.LOG_LEVEL] as LogLevel | undefined;
  const isLogLevelNotSet = rawLogLevel === undefined && scope === 'project';
  const logLevelValue = isLogLevelNotSet ? NOT_SET_VALUE : (rawLogLevel ?? LogLevel.INFO);

  const logLevelOptions: SelectOption[] = [
    ...(scope === 'project'
      ? [{ value: NOT_SET_VALUE, label: t('advanced.debugging.logLevel.notSet'), italic: true }]
      : []),
    { value: LogLevel.DEBUG, label: t('advanced.debugging.logLevel.debug') },
    { value: LogLevel.INFO, label: t('advanced.debugging.logLevel.info') },
    { value: LogLevel.WARN, label: t('advanced.debugging.logLevel.warning') },
    { value: LogLevel.ERROR, label: t('advanced.debugging.logLevel.error') },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('advanced.title')}</h2>

      <SettingSection title={t('advanced.debugging.sectionTitle')}>
        <SettingRow
          label={t('advanced.debugging.debugMode.label')}
          description={t('advanced.debugging.debugMode.description')}
          isOverridden={isOverridden(SettingKey.DEBUG_MODE)}
        >
          {isDebugNotSet ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary italic">{t('advanced.debugging.debugMode.notSet')}</span>
              <ToggleSwitch
                checked={false}
                onChange={(checked) => updateSetting(SettingKey.DEBUG_MODE, checked)}
                disabled={false}
              />
            </div>
          ) : (
            <ToggleSwitch
              checked={rawDebugMode ?? false}
              onChange={(checked) => updateSetting(SettingKey.DEBUG_MODE, checked)}
            />
          )}
        </SettingRow>

        <SettingRow
          label={t('advanced.debugging.logLevel.label')}
          description={t('advanced.debugging.logLevel.description')}
          isOverridden={isOverridden(SettingKey.LOG_LEVEL)}
        >
          <Select
            value={logLevelValue}
            options={logLevelOptions}
            ariaLabel={t('advanced.debugging.logLevel.label')}
            onChange={(value) => {
              if (value === NOT_SET_VALUE) {
                resetToGlobal(SettingKey.LOG_LEVEL);
                return;
              }
              updateSetting(SettingKey.LOG_LEVEL, value as LogLevel);
            }}
            className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
              isLogLevelNotSet ? 'text-text-tertiary' : 'text-text-primary'
            }`}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
