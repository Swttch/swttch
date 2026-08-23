import { SettingSection, SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { useResolvedDiffSurface } from '@/hooks/useIdeDiffAvailable';
import { SettingKey, DiffSurface, BrowserDiffPresentation } from '@/types/settings';
import { useTranslation } from '@/i18n';

/**
 * Where Claude's proposed file edits are shown for review, and how.
 *
 * Its own section rather than more rows under the app settings: reviewing a
 * proposed edit is a screen of its own with its own options, and more of them
 * are coming.
 *
 * Both rows are about the same moment — the permission prompt asking whether to
 * write a file — so they belong together even though one only applies inside an
 * IDE and the other only outside one.
 */
export function DiffViewSection() {
  const { t } = useTranslation('settings');
  const { scopeSettings, updateSetting, ideAttached } = useSettings();

  // What will actually happen, not what is stored: with no IDE hosting the
  // backend there is nothing to open a diff in, so the built-in surface is the
  // answer whatever the saved preference says. Showing the stored value instead
  // would leave a setting that claims the IDE while the built-in page opens.
  const surface = useResolvedDiffSurface();
  const presentation =
    (scopeSettings[SettingKey.BROWSER_DIFF_PRESENTATION] as BrowserDiffPresentation | undefined) ??
    BrowserDiffPresentation.NEW_TAB;

  const surfaceOptions: SelectOption[] = [
    { value: DiffSurface.IDE, label: t('diffView.surface.ide') },
    { value: DiffSurface.BUILT_IN, label: t('diffView.surface.builtIn') },
  ];

  const presentationOptions: SelectOption[] = [
    { value: BrowserDiffPresentation.NEW_TAB, label: t('diffView.presentation.newTab') },
    { value: BrowserDiffPresentation.OVERLAY, label: t('diffView.presentation.overlay') },
  ];

  return (
    <SettingSection title={t('diffView.sectionTitle')}>
      <SettingRow
        label={t('diffView.surface.label')}
        description={
          ideAttached ? t('diffView.surface.description') : t('diffView.surface.noIde')
        }
      >
        <Select
          value={surface}
          options={surfaceOptions}
          // Nothing to choose between without an IDE: the built-in surface is
          // the only one that can draw anything here. The stored preference is
          // left untouched and comes back the moment an IDE hosts the backend.
          disabled={!ideAttached}
          ariaLabel={t('diffView.surface.label')}
          className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
          onChange={(value) => updateSetting(SettingKey.DIFF_SURFACE, value as DiffSurface)}
        />
      </SettingRow>

      {/*
        Only meaningful for the built-in surface, and only in a browser: inside
        an IDE it opens as an editor tab, which is neither of these choices.
        Shown disabled rather than hidden so the option does not appear and
        vanish as the other row changes.
      */}
      <SettingRow
        label={t('diffView.presentation.label')}
        description={
          surface === DiffSurface.BUILT_IN
            ? t('diffView.presentation.description')
            : t('diffView.presentation.builtInOnly')
        }
      >
        <Select
          value={presentation}
          options={presentationOptions}
          disabled={surface !== DiffSurface.BUILT_IN}
          ariaLabel={t('diffView.presentation.label')}
          className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
          onChange={(value) =>
            updateSetting(SettingKey.BROWSER_DIFF_PRESENTATION, value as BrowserDiffPresentation)
          }
        />
      </SettingRow>
    </SettingSection>
  );
}
