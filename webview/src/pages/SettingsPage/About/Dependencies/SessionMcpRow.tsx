import toast from 'react-hot-toast';
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';
import { SettingRow } from '../../common';
import { Tooltip } from '@/components/Tooltip';
import { useSessionMcp } from '@/hooks/queries/useSessionMcp';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { runKitInstall } from '@/utils/runKitInstall';
import { useTranslation } from '@/i18n';
import { VersionLine } from '../VersionLine';
import { DependencyActivity, DependencyStatus } from './DependencyStatus';

/** Shown as the row's name until the backend has answered with the same string. */
const PACKAGE_NAME = '@swttch/session-manager-mcp';
const KEY_PREFIX = 'about.dependencies.sessionMcp.package';

const REMOVE_BUTTON_CLASS =
  'text-text-tertiary/90 hover:text-state-error-fg transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-tertiary/90';

/**
 * The session-management MCP package's version, with install and removal.
 *
 * Installing is the one decision the user makes: it runs a global package install, so it asks
 * first and says that the package is attached to Claude from then on. After that there is nothing
 * to keep an eye on here. The backend updates an installed package by itself, so the row shows
 * that update running; the Update button appears only when the automatic attempt failed, as the
 * way to run it by hand and read why.
 *
 * Removal is here because this is the only screen the package has; it is how it is turned off.
 */
export function SessionMcpRow() {
  const { t } = useTranslation('settings');
  const { info, loading, install, installing, uninstall, uninstalling, refresh, refreshing } = useSessionMcp();
  const { confirmDialog, confirm } = useConfirmDialog();

  const installed = Boolean(info?.installed);
  const packageName = info?.packageName || PACKAGE_NAME;
  const activity = installing
    ? (installed ? DependencyActivity.UPDATING : DependencyActivity.INSTALLING)
    : info?.updating
      ? DependencyActivity.UPDATING
      : null;
  const busy = activity !== null || uninstalling;

  const handleInstall = async () => {
    const ok = await confirm({
      title: t(`${KEY_PREFIX}.installConfirmTitle`),
      message: t(`${KEY_PREFIX}.installConfirmMessage`, { packageName }),
      confirmLabel: t('about.dependencies.install'),
    });
    if (ok) await runKitInstall(install, 'installed', KEY_PREFIX);
  };

  const handleRemove = async () => {
    const ok = await confirm({
      title: t(`${KEY_PREFIX}.removeConfirmTitle`),
      message: t(`${KEY_PREFIX}.removeConfirmMessage`),
      confirmLabel: t(`${KEY_PREFIX}.remove`),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await uninstall();
      toast.success(t(`${KEY_PREFIX}.removed`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(`${KEY_PREFIX}.removeFailed`));
    }
  };

  return (
    <SettingRow label={packageName} description={t('about.dependencies.sessionMcp.description')}>
      <VersionLine
        status={
          info && (
            <DependencyStatus
              installed={installed}
              updatable={info.updatable}
              latestKnown={info.latest !== null}
              activity={activity}
              onInstall={() => void handleInstall()}
              onUpdate={() => void runKitInstall(install, 'updated', KEY_PREFIX)}
            />
          )
        }
        version={loading ? '...' : (info?.installed ?? t('about.dependencies.notInstalled'))}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        trailing={
          installed && (
            <Tooltip content={t(`${KEY_PREFIX}.remove`)}>
              <button
                type="button"
                className={REMOVE_BUTTON_CLASS}
                disabled={busy}
                onClick={() => void handleRemove()}
                aria-label={t(`${KEY_PREFIX}.remove`)}
              >
                {uninstalling ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
              </button>
            </Tooltip>
          )
        }
      />
      {confirmDialog}
    </SettingRow>
  );
}
