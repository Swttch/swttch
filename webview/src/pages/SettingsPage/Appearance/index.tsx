import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import {
  SettingKey,
  ThemeMode,
  LINE_HEIGHT_DEFAULT,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
} from '@/types/settings';
import { isJetBrains } from '@/config/environment';
import { useTranslation } from '@/i18n';
import {
  AUTO_SCROLL_THRESHOLD_DEFAULT,
  AUTO_SCROLL_THRESHOLD_MIN,
  AUTO_SCROLL_THRESHOLD_MAX,
  clampAutoScrollThreshold,
} from '@/utils/autoScroll';

const NOT_SET_VALUE = '__NOT_SET__';

export function AppearanceSettings() {
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting, scope, resetToGlobal } = useSettings();

  const rawTheme = scopeSettings[SettingKey.THEME] as ThemeMode | undefined;
  const isThemeNotSet = rawTheme === undefined && scope === 'project';
  const themeValue = isThemeNotSet ? NOT_SET_VALUE : (rawTheme ?? ThemeMode.SYSTEM);

  const rawFontSize = scopeSettings[SettingKey.FONT_SIZE] as number | undefined;
  const isFontSizeNotSet = rawFontSize === undefined && scope === 'project';

  const rawLineHeight = scopeSettings[SettingKey.LINE_HEIGHT] as number | undefined;
  const isLineHeightNotSet = rawLineHeight === undefined && scope === 'project';

  const rawAutoScrollThreshold = scopeSettings[SettingKey.AUTO_SCROLL_THRESHOLD] as number | undefined;
  const isAutoScrollThresholdNotSet = rawAutoScrollThreshold === undefined && scope === 'project';

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
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">
        {t('appearance.title')}
      </h2>

      <SettingSection title={t('appearance.theme.sectionTitle')}>
        <SettingRow
          label={t('appearance.theme.colorTheme.label')}
          description={t('appearance.theme.colorTheme.description')}
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

        <SettingRow
          label={t('appearance.theme.fontSize.label')}
          description={t('appearance.theme.fontSize.description')}
        >
          <input
            type="number"
            min="8"
            max="32"
            value={isFontSizeNotSet ? '' : (rawFontSize ?? 13)}
            placeholder={isFontSizeNotSet ? t('appearance.theme.fontSize.notSetPlaceholder') : undefined}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                if (scope === 'project') {
                  resetToGlobal(SettingKey.FONT_SIZE);
                }
                return;
              }
              updateSetting(SettingKey.FONT_SIZE, parseInt(value, 10));
            }}
            className={`w-20 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
              isFontSizeNotSet ? 'text-text-tertiary italic' : 'text-text-primary'
            }`}
          />
        </SettingRow>

        <SettingRow
          label={t('appearance.theme.lineSpacing.label')}
          description={t('appearance.theme.lineSpacing.description')}
        >
          <input
            type="number"
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={LINE_HEIGHT_STEP}
            value={isLineHeightNotSet ? '' : (rawLineHeight ?? LINE_HEIGHT_DEFAULT)}
            placeholder={isLineHeightNotSet ? t('appearance.theme.lineSpacing.notSetPlaceholder') : undefined}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                if (scope === 'project') {
                  resetToGlobal(SettingKey.LINE_HEIGHT);
                }
                return;
              }
              const parsed = parseFloat(value);
              if (!Number.isFinite(parsed)) return;
              updateSetting(SettingKey.LINE_HEIGHT, parsed);
            }}
            className={`w-20 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
              isLineHeightNotSet ? 'text-text-tertiary italic' : 'text-text-primary'
            }`}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title={t('appearance.scrolling.sectionTitle')}>
        <SettingRow
          label={t('appearance.scrolling.autoScrollThreshold.label')}
          description={t('appearance.scrolling.autoScrollThreshold.description', { value: AUTO_SCROLL_THRESHOLD_DEFAULT })}
        >
          <input
            type="number"
            min={AUTO_SCROLL_THRESHOLD_MIN}
            max={AUTO_SCROLL_THRESHOLD_MAX}
            step="1"
            value={isAutoScrollThresholdNotSet ? '' : (rawAutoScrollThreshold ?? AUTO_SCROLL_THRESHOLD_DEFAULT)}
            placeholder={isAutoScrollThresholdNotSet ? t('appearance.scrolling.autoScrollThreshold.notSetPlaceholder') : undefined}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                if (scope === 'project') {
                  resetToGlobal(SettingKey.AUTO_SCROLL_THRESHOLD);
                }
                return;
              }
              const parsed = parseInt(value, 10);
              if (!Number.isInteger(parsed)) return;
              updateSetting(SettingKey.AUTO_SCROLL_THRESHOLD, clampAutoScrollThreshold(parsed));
            }}
            className={`w-24 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm ${
              isAutoScrollThresholdNotSet ? 'text-text-tertiary italic' : 'text-text-primary'
            }`}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
