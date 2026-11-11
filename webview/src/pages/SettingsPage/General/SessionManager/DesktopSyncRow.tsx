import { useState } from 'react';
import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { useSettings } from '@/contexts/SettingsContext';
import { SponsorGate, SponsorGateSurface } from '@/shared';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { SettingKey } from '@/types/settings';
import { useTranslation } from '@/i18n';
import { DesktopSyncDetails } from './DesktopSyncDetails';

/**
 * Whether what the Claude desktop app records about its sessions is reflected in the session lists and the rail.
 *
 * Sponsor-only. The gate is asked before turning it ON and never before turning it off: a person whose sponsorship
 * ended must still be able to switch it off.
 */
export function DesktopSyncRow() {
  const { t } = useTranslation('settings');
  const { settings, updateSetting } = useSettings();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <SettingRow
      label={t('general.sessionManager.desktopSync.label')}
      description={
        <>
          {t('general.sessionManager.desktopSync.description')}{' '}
          <button
            type="button"
            className="text-text-link hover:underline"
            onClick={() => setDetailsOpen(true)}
          >
            {t('general.sessionManager.desktopSync.learnMore')}
          </button>
        </>
      }
      badge={<SettingBadge variant={SettingBadgeVariant.Sponsor} />}
    >
      <ToggleSwitch
        checked={settings[SettingKey.DESKTOP_SESSION_SYNC]}
        ariaLabel={t('general.sessionManager.desktopSync.label')}
        onChange={async (checked) => {
          if (checked && !(await ensureSponsor(SponsorGate.DesktopSessionSync, SponsorGateSurface.SettingsToggle))) {
            return;
          }
          updateSetting(SettingKey.DESKTOP_SESSION_SYNC, checked);
        }}
      />
      {detailsOpen && <DesktopSyncDetails onClose={() => setDetailsOpen(false)} />}
    </SettingRow>
  );
}
