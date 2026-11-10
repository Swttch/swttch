import { SettingRow } from '../../common';
import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { runKitInstall } from '@/utils/runKitInstall';
import { useTranslation } from '@/i18n';
import { VersionLine } from '../VersionLine';
import { DependencyActivity, DependencyStatus } from './DependencyStatus';

/** Shown as the row's name until the backend has answered with the same string. */
const PACKAGE_NAME = '@swttch/extend-kit';

/**
 * The extend kit's version, with install and update.
 *
 * The Voice input section keeps its own control for the same package; both read one query, so an
 * install or update made in either place shows in the other.
 */
export function ExtendKitRow() {
  const { t } = useTranslation('settings');
  const { info, loading, install, installing, refresh, refreshing } = useExtendKit();

  const installed = Boolean(info?.installed);
  const activity = installing ? (installed ? DependencyActivity.UPDATING : DependencyActivity.INSTALLING) : null;

  return (
    <SettingRow label={info?.packageName || PACKAGE_NAME} description={t('about.dependencies.extendKit.description')}>
      <VersionLine
        status={
          info && (
            <DependencyStatus
              installed={installed}
              updatable={info.updatable}
              latestKnown={info.latest !== null}
              activity={activity}
              onInstall={() => void runKitInstall(install, 'installed')}
              onUpdate={() => void runKitInstall(install, 'updated')}
            />
          )
        }
        version={loading ? '...' : (info?.installed ?? t('about.dependencies.notInstalled'))}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
      />
    </SettingRow>
  );
}
