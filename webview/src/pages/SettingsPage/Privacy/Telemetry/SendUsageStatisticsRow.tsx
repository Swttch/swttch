import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useTelemetryConsent, ConsentStatus, ConsentSource } from '@/hooks/useTelemetryConsent';
import { useTranslation } from '@/i18n';

/** Whether anonymous usage statistics are sent at all. */
export function SendUsageStatisticsRow() {
  const { t } = useTranslation('settings');
  const { status, accept, deny } = useTelemetryConsent();

  return (
    <SettingRow
      label={t('privacy.telemetry.sendUsageStatistics.label')}
      description={t('privacy.telemetry.sendUsageStatistics.description')}
    >
      <ToggleSwitch
        checked={status === ConsentStatus.ACCEPTED}
        onChange={(checked) => {
          // Recorded with where the answer came from, so a choice made here is
          // distinguishable from one made at the first-run prompt.
          if (checked) {
            void accept(ConsentSource.SETTINGS);
          } else {
            void deny(ConsentSource.SETTINGS);
          }
        }}
        ariaLabel={t('privacy.telemetry.sendUsageStatistics.label')}
      />
    </SettingRow>
  );
}
