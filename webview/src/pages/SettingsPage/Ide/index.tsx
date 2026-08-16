import { SettingSection, SettingRow } from '../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useSettings } from '@/contexts/SettingsContext';
import { useIdeDiffAvailable } from '@/hooks/useIdeDiffAvailable';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';

interface Props {
  className?: string;
}

/**
 * Settings that only mean anything when an IDE is hosting the backend.
 *
 * The section is ALWAYS listed, even with no IDE attached: the editor-context
 * options below have been settable from a browser since long before this
 * section existed, and hiding the section would take that away from standalone
 * users. Only the IDE-diff toggle — which has nothing to open without an IDE —
 * renders disabled, with a hint saying why.
 */
export const IdeSettings = (props: Props) => {
  const { className = '' } = props;
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting, ideAttached } = useSettings();

  // Seeds the editor-context chip at the start of a session (#237). Only an
  // explicit false disables it, so `!== false` rather than the `?? true` the
  // other toggles use — anything unreadable must leave the feature on.
  const attachEditorContext = scopeSettings[SettingKey.ATTACH_EDITOR_CONTEXT] !== false;
  const focusInputOnEditorContext = scopeSettings[SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT] ?? true;
  // With no IDE attached there is nothing to open a diff in, so the feature is
  // off in practice whatever the stored value says. Show it that way rather than
  // leaving a switched-on toggle the user cannot act on — the stored value is
  // untouched and comes back as soon as an IDE hosts the backend again. Shared
  // with the approval prompt's file link, which must offer a diff on exactly
  // the same terms.
  const showDiffInIde = useIdeDiffAvailable();

  return (
    <div className={className}>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.ide')}</h2>

      <SettingSection title={t('ide.sectionTitle')}>
        <SettingRow
          label={t('ide.attachEditorContext.label')}
          description={t('ide.attachEditorContext.description')}
        >
          <ToggleSwitch
            checked={attachEditorContext}
            onChange={(checked) => updateSetting(SettingKey.ATTACH_EDITOR_CONTEXT, checked)}
            ariaLabel={t('ide.attachEditorContext.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('ide.focusInputOnEditorContext.label')}
          description={t('ide.focusInputOnEditorContext.description')}
        >
          <ToggleSwitch
            checked={focusInputOnEditorContext}
            onChange={(checked) => updateSetting(SettingKey.FOCUS_INPUT_ON_EDITOR_CONTEXT, checked)}
            ariaLabel={t('ide.focusInputOnEditorContext.label')}
          />
        </SettingRow>

        <SettingRow
          label={t('ide.showDiffInIde.label')}
          description={
            ideAttached
              ? t('ide.showDiffInIde.description')
              : t('ide.showDiffInIde.unavailable')
          }
        >
          <ToggleSwitch
            checked={showDiffInIde}
            disabled={!ideAttached}
            onChange={(checked) => updateSetting(SettingKey.SHOW_DIFF_IN_IDE, checked)}
            ariaLabel={t('ide.showDiffInIde.label')}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};
