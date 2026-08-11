import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { SettingSection, SettingRow } from '../common';
import { APP_NAME } from '@/config/app';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useTranslation } from '@/i18n';
import { CliUpdateControl } from './CliUpdateControl';

export function AboutSettings() {
  const { t } = useTranslation('settings');
  const { pluginVersion, cliVersion, refresh, isLoading } = useVersionInfo();

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">
        {t('about.heading')}
      </h2>

      <SettingSection title={t('about.versionInfo.title')}>
        <SettingRow label={t('about.versionInfo.pluginVersion')}>
          <span className="text-sm text-text-secondary">{pluginVersion}</span>
        </SettingRow>

        <SettingRow label={t('about.versionInfo.cliVersion', { appName: APP_NAME })}>
          <div className="flex items-center gap-2">
            <CliUpdateControl />
            <span className="text-sm text-text-secondary">{cliVersion ?? t('about.versionInfo.notDetected')}</span>
            <button
              onClick={refresh}
              disabled={isLoading}
              aria-label={t('about.versionInfo.refreshVersion')}
              title={t('about.versionInfo.refresh')}
              className="text-text-tertiary hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title={t('about.links.title')}>
        <SettingRow label={t('about.links.documentation')}>
          <a
            href="https://github.com/Swttch/swttch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-link hover:text-text-link hover:underline"
          >
            {t('about.links.viewOnGithub')}
          </a>
        </SettingRow>

        <SettingRow label={t('about.links.reportIssue')}>
          <a
            href="https://github.com/Swttch/swttch/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-link hover:text-text-link hover:underline"
          >
            {t('about.links.openIssue')}
          </a>
        </SettingRow>
      </SettingSection>
    </div>
  );
}
