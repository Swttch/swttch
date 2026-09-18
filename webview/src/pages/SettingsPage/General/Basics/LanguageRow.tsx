import { SettingRow } from '../../common';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { useIsOverriddenByProject } from '@/utils/settingsScope';
import { CLAUDE_SETTINGS_DOC_HREF } from './docs';

/**
 * The language Claude answers in.
 *
 * Free text rather than a list, because it is free text in Claude's own
 * settings.json and the CLI accepts anything there. Clearing the field removes
 * the key at this scope rather than writing an empty string, so an upgrade
 * never leaves a blank language behind.
 */
export function LanguageRow() {
  const { t } = useTranslation('settings');
  const isOverridden = useIsOverriddenByProject();
  const { scopeSettings, updateSetting } = useClaudeSettings();

  const responseLanguage = (scopeSettings.language as string | undefined) ?? '';

  return (
    <SettingRow
      label={t('general.language.label')}
      description={t('general.language.description')}
      isOverridden={isOverridden('language')}
      badge={
        <SettingBadge
          variant={SettingBadgeVariant.ClaudeNative}
          docHref={CLAUDE_SETTINGS_DOC_HREF}
        />
      }
    >
      <input
        type="text"
        value={responseLanguage}
        onChange={(e) => void updateSetting('language', e.target.value || null)}
        placeholder={t('general.language.placeholder')}
        aria-label={t('general.language.label')}
        className="w-64 bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary"
      />
    </SettingRow>
  );
}
