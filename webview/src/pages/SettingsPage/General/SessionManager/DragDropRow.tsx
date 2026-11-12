import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useSettings } from '@/contexts/SettingsContext';
import { SponsorGate, SponsorGateSurface } from '@/shared';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';

/**
 * Whether a session in the session list can be dragged onto another to put it under that one.
 *
 * Sponsor-only. The gate is asked before turning it ON and never before turning it off, so that a person whose
 * sponsorship ended can still switch it off.
 */
export function DragDropRow() {
  const { t } = useTranslation('settings');
  const { settings, updateSetting } = useSettings();

  return (
    <SettingRow
      label={t('general.sessionManager.dragDrop.label')}
      description={t('general.sessionManager.dragDrop.description')}
      badge={<SettingBadge variant={SettingBadgeVariant.Sponsor} />}
    >
      <ToggleSwitch
        checked={settings[SettingKey.SESSION_LIST_DRAG_DROP]}
        ariaLabel={t('general.sessionManager.dragDrop.label')}
        onChange={async (checked) => {
          if (checked && !(await ensureSponsor(SponsorGate.SessionListDragDrop, SponsorGateSurface.SettingsToggle))) {
            return;
          }
          updateSetting(SettingKey.SESSION_LIST_DRAG_DROP, checked);
        }}
      />
    </SettingRow>
  );
}
