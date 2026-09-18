import { TelemetrySection } from './Telemetry';
import { PRIVACY_POLICY_URL } from '@/config/app';
import { useTranslation } from '@/i18n';

/**
 * The Privacy page: a heading, the policy link beside it, and the sections
 * under both.
 */
export function PrivacySettings() {
  const { t } = useTranslation('settings');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-text-primary">{t('privacy.title')}</h2>
        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-text-link hover:underline"
        >
          {t('privacy.privacyPolicyLink')}
        </a>
      </div>

      <TelemetrySection />
    </div>
  );
}
