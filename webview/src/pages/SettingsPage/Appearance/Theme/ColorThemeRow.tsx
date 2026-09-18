import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, ThemeMode } from '@/types/settings';
import { isJetBrains } from '@/config/environment';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';

/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

/** Light, dark, or whatever the host is using. */
export function ColorThemeRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();

  const rawTheme = scopeSettings[SettingKey.THEME] as ThemeMode | undefined;
  const isThemeNotSet = rawTheme === undefined && scope === 'project';
  const themeValue = isThemeNotSet ? NOT_SET_VALUE : (rawTheme ?? ThemeMode.SYSTEM);

  const themeOptions: SelectOption[] = [
    ...(scope === 'project'
      ? [{ value: NOT_SET_VALUE, label: t('appearance.theme.colorTheme.notSet'), italic: true }]
      : []),
    {
      // In JetBrains mode this option is "System (IDE)", and picking it takes
      // the IDE's actual colors, not merely its light/dark bit — see the
      // `ide-theme-sync` effect in SettingsContext. The label is the only
      // control for that: there is no separate sync toggle.
      value: ThemeMode.SYSTEM,
      label: isJetBrains()
        ? t('appearance.theme.colorTheme.systemIde')
        : t('appearance.theme.colorTheme.systemOs'),
    },
    { value: ThemeMode.LIGHT, label: t('appearance.theme.colorTheme.light') },
    { value: ThemeMode.DARK, label: t('appearance.theme.colorTheme.dark') },
  ];

  return (
    <SettingRow
      label={t('appearance.theme.colorTheme.label')}
      description={t('appearance.theme.colorTheme.description')}
      isOverridden={isOverridden(SettingKey.THEME)}
    >
      <Select
        value={themeValue}
        options={themeOptions}
        ariaLabel={t('appearance.theme.colorTheme.label')}
        onChange={(value) => {
          if (value === NOT_SET_VALUE) {
            resetToGlobal(SettingKey.THEME);
            return;
          }
          updateSetting(SettingKey.THEME, value as ThemeMode);
        }}
        className={`bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
          isThemeNotSet ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
