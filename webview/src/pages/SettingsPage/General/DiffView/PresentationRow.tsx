import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { useResolvedDiffSurface } from '@/hooks/useIdeDiffAvailable';
import { useDiffOverlayAllowed } from '@/hooks/useDiffOverlayAllowed';
import { SettingKey, DiffSurface, BrowserDiffPresentation } from '@/types/settings';
import { useTranslation } from '@/i18n';

/**
 * How our own diff page appears: a tab of its own, or a modal over the chat.
 *
 * Only meaningful for the built-in surface, and only where an overlay has room
 * to be drawn — in an IDE that means a chat living in an editor tab, not a
 * sidebar. Shown disabled rather than hidden so the option does not appear and
 * vanish as the rows around it change.
 */
export function PresentationRow() {
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting } = useSettings();

  const surface = useResolvedDiffSurface();
  // Whether an overlay is even possible here. Same rule the code that opens the
  // review applies, so the setting cannot offer something that will be ignored.
  const overlayAllowed = useDiffOverlayAllowed();
  const presentation =
    (scopeSettings[SettingKey.BROWSER_DIFF_PRESENTATION] as BrowserDiffPresentation | undefined) ??
    BrowserDiffPresentation.NEW_TAB;

  const presentationOptions: SelectOption[] = [
    { value: BrowserDiffPresentation.NEW_TAB, label: t('diffView.presentation.newTab') },
    { value: BrowserDiffPresentation.OVERLAY, label: t('diffView.presentation.overlay') },
  ];

  return (
    <SettingRow
      label={t('diffView.presentation.label')}
      description={
        surface !== DiffSurface.BUILT_IN
          ? t('diffView.presentation.builtInOnly')
          : overlayAllowed
            ? t('diffView.presentation.description')
            : t('diffView.presentation.sidebarOnlyNewTab')
      }
    >
      <Select
        value={overlayAllowed ? presentation : BrowserDiffPresentation.NEW_TAB}
        options={presentationOptions}
        disabled={surface !== DiffSurface.BUILT_IN || !overlayAllowed}
        ariaLabel={t('diffView.presentation.label')}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        onChange={(value) =>
          updateSetting(SettingKey.BROWSER_DIFF_PRESENTATION, value as BrowserDiffPresentation)
        }
      />
    </SettingRow>
  );
}
