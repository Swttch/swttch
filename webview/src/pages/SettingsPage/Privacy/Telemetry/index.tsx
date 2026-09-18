import { SettingSection } from '../../common';
import { SendUsageStatisticsRow } from './SendUsageStatisticsRow';
import { ReceiveAnnouncementsRow } from './ReceiveAnnouncementsRow';
import { useTranslation } from '@/i18n';

/** What leaves this machine, and what arrives on it. */
export function TelemetrySection() {
  const { t } = useTranslation('settings');

  return (
    <SettingSection title={t('privacy.telemetry.sectionTitle')}>
      <SendUsageStatisticsRow />
      <ReceiveAnnouncementsRow />
    </SettingSection>
  );
}
