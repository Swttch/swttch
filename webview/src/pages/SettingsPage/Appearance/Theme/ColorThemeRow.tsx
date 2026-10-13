import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, ThemeMode } from '@/types/settings';
import { isJetBrains } from '@/config/environment';
import { useTranslation } from '@/i18n';
import { useDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

/** The value standing for "this project says nothing; follow the global one". */
const NOT_SET_VALUE = '__NOT_SET__';

/** Light, dark, or whatever the host is using. */
export function ColorThemeRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { updateSetting, scope, resetToGlobal } = useSettings();
  const { displaySettings, isInherited, resetFor } = useDisplaySettings();

  const themeValue = (displaySettings[SettingKey.THEME] as ThemeMode | undefined) ?? ThemeMode.SYSTEM;
  const inherited = isInherited(SettingKey.THEME);
  // Offered only while the project has its own value to take back; see LogLevelRow.
  const hasOwnValue = scope === 'project' && !inherited;

  const themeOptions: SelectOption[] = [
    ...(hasOwnValue
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
      isInherited={inherited}
      onResetToGlobal={resetFor(SettingKey.THEME)}
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
          inherited ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      />
    </SettingRow>
  );
}
