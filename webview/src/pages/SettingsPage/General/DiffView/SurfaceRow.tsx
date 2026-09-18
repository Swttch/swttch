import { SettingRow } from '../../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { useResolvedDiffSurface } from '@/hooks/useIdeDiffAvailable';
import { SettingKey, DiffSurface } from '@/types/settings';
import { useTranslation } from '@/i18n';

/** Which viewer draws a proposed edit: the IDE's own, or our diff page. */
export function SurfaceRow() {
  const { t } = useTranslation('settings');
  const { updateSetting, ideAttached } = useSettings();

  // What will actually happen, not what is stored: with no IDE hosting the
  // backend there is nothing to open a diff in, so the built-in surface is the
  // answer whatever the saved preference says. Showing the stored value instead
  // would leave a setting that claims the IDE while the built-in page opens.
  const surface = useResolvedDiffSurface();

  const surfaceOptions: SelectOption[] = [
    { value: DiffSurface.IDE, label: t('diffView.surface.ide') },
    { value: DiffSurface.BUILT_IN, label: t('diffView.surface.builtIn') },
  ];

  return (
    <SettingRow
      label={t('diffView.surface.label')}
      description={ideAttached ? t('diffView.surface.description') : t('diffView.surface.noIde')}
    >
      <Select
        value={surface}
        options={surfaceOptions}
        // Nothing to choose between without an IDE: the built-in surface is the
        // only one that can draw anything here. The stored preference is left
        // untouched and comes back the moment an IDE hosts the backend.
        disabled={!ideAttached}
        ariaLabel={t('diffView.surface.label')}
        className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
        onChange={(value) => updateSetting(SettingKey.DIFF_SURFACE, value as DiffSurface)}
      />
    </SettingRow>
  );
}
