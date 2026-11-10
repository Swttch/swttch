import { SettingSection, SettingRow } from '../common';
import { APP_NAME, REPO_URL, ISSUES_URL } from '@/config/app';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useTranslation } from '@/i18n';
import { CliUpdateControl } from './CliUpdateControl';
import { CliAutoUpdateRow } from './CliAutoUpdateRow';
import { VersionLine } from './VersionLine';
import { DependenciesSection } from './Dependencies';

export function AboutSettings() {
  const { t } = useTranslation('settings');
  const { pluginVersion, cliVersion, clientInfo, osInfo, refresh, isLoading } = useVersionInfo();

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
          <VersionLine
            status={<CliUpdateControl />}
            version={cliVersion ?? t('about.versionInfo.notDetected')}
            onRefresh={() => void refresh()}
            refreshing={isLoading}
          />
        </SettingRow>

        <CliAutoUpdateRow />

        {/* Both rows exist so a bug report can be filled in without hunting through
            IDE menus — see issue #320. */}
        <SettingRow label={t('about.versionInfo.ide')}>
          <span className="text-sm text-text-secondary">
            {clientInfo ?? t('about.versionInfo.notDetected')}
          </span>
        </SettingRow>

        <SettingRow label={t('about.versionInfo.os')}>
          <span className="text-sm text-text-secondary">
            {osInfo ?? t('about.versionInfo.notDetected')}
          </span>
        </SettingRow>
      </SettingSection>

      <DependenciesSection />

      <SettingSection title={t('about.links.title')}>
        <SettingRow label={t('about.links.documentation')}>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-link hover:text-text-link hover:underline"
          >
            {t('about.links.viewOnGithub')}
          </a>
        </SettingRow>

        <SettingRow label={t('about.links.reportIssue')}>
          <a
            href={ISSUES_URL}
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
