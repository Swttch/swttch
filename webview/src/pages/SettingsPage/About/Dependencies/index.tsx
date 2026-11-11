import { SettingSection, SettingRow } from '../../common';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useCloudflaredVersion } from '@/hooks/queries/useCloudflaredVersion';
import { useTranslation } from '@/i18n';
import { VersionLine } from '../VersionLine';
import { ExtendKitRow } from './ExtendKitRow';
import { SessionMcpRow } from './SessionMcpRow';

/**
 * The programs this app uses that are installed separately on the machine, each with the version
 * found there.
 *
 * The two packages of ours can be installed and updated from their rows. Node.js and cloudflared
 * are only reported: Node.js is whatever runs the backend, and cloudflared is installed by the
 * tunnel when it is first turned on.
 */
export function DependenciesSection() {
  const { t } = useTranslation('settings');
  const { nodeVersion } = useVersionInfo();
  const { info: cloudflared, refresh, refreshing } = useCloudflaredVersion();

  const cloudflaredVersion = !cloudflared
    ? '...'
    : !cloudflared.installed
      ? t('about.dependencies.notInstalled')
      : (cloudflared.version ?? t('about.versionInfo.notDetected'));

  return (
    <SettingSection title={t('about.dependencies.title')} description={t('about.dependencies.description')}>
      <ExtendKitRow />
      <SessionMcpRow />
      <SettingRow label="Node.js" description={t('about.dependencies.node.description')}>
        <VersionLine version={nodeVersion ?? t('about.versionInfo.notDetected')} />
      </SettingRow>
      <SettingRow label="cloudflared" description={t('about.dependencies.cloudflared.description')}>
        <VersionLine version={cloudflaredVersion} onRefresh={() => void refresh()} refreshing={refreshing} />
      </SettingRow>
    </SettingSection>
  );
}
