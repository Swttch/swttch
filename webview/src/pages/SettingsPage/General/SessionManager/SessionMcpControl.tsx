import toast from 'react-hot-toast';
import { ArrowDownTrayIcon, ArrowPathIcon, CheckCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useSessionMcp } from '@/hooks/queries/useSessionMcp';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { Tooltip } from '@/components/Tooltip';
import { runKitInstall } from '@/utils/runKitInstall';
import { useTranslation } from '@/i18n';

const BUTTON_CLASS =
  'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ' +
  'bg-accent-primary-hover hover:bg-accent-primary text-text-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

const REMOVE_BUTTON_CLASS =
  'text-text-tertiary/90 hover:text-state-error-fg transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-tertiary/90';

/** Where the install, removal and failure wording of this package lives (the same words About > Dependencies uses). */
const KEY_PREFIX = 'about.dependencies.sessionMcp.package';

/**
 * Version and install/update control of the session-management package, at the right of the section's title.
 *
 * Shaped after the voice input section's control. Installing runs a global package install, so it asks first;
 * once installed the backend keeps the package current by itself, and the Update button shows only when that
 * attempt failed, as the way to run it by hand.
 */
export function SessionMcpControl() {
  const { t } = useTranslation('settings');
  const { info, loading, install, installing, uninstall, uninstalling, refresh, refreshing } = useSessionMcp();
  const { confirmDialog, confirm } = useConfirmDialog();

  if (loading || !info) return null;

  const spinner = <ArrowPathIcon className="w-3 h-3 animate-spin" />;
  const updating = installing || info.updating;
  const busy = updating || uninstalling;

  const handleInstall = async () => {
    const ok = await confirm({
      title: t(`${KEY_PREFIX}.installConfirmTitle`),
      message: t(`${KEY_PREFIX}.installConfirmMessage`, { packageName: info.packageName }),
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

  if (!info.installed) {
    return (
      <>
        <button className={BUTTON_CLASS} disabled={installing} onClick={() => void handleInstall()}>
          {installing ? spinner : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
          {installing ? t('general.sessionManager.package.installing') : t('general.sessionManager.package.install')}
        </button>
        {confirmDialog}
      </>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {updating ? (
        <span className="flex items-center gap-1 text-xs text-text-tertiary">
          {spinner}
          {t('general.sessionManager.package.updating')}
        </span>
      ) : info.updatable ? (
        <button className={BUTTON_CLASS} disabled={busy} onClick={() => void runKitInstall(install, 'updated', KEY_PREFIX)}>
          {t('general.sessionManager.package.update')}
        </button>
      ) : (
        info.latest && (
          <span className="flex items-center gap-1 text-xs text-text-tertiary">
            <CheckCircleIcon className="w-3.5 h-3.5 text-state-success-fg" />
            {t('general.sessionManager.package.upToDate')}
          </span>
        )
      )}
      <Tooltip content={t('general.sessionManager.package.refresh')}>
        <button
          type="button"
          className="text-xs text-text-tertiary tabular-nums hover:text-text-secondary transition-colors disabled:cursor-not-allowed"
          disabled={busy || refreshing}
          onClick={() => void refresh()}
          aria-label={t('general.sessionManager.package.refresh')}
        >
          {refreshing ? t('general.sessionManager.package.refreshing') : `v${info.installed}`}
        </button>
      </Tooltip>
      <Tooltip content={t('general.sessionManager.package.remove')}>
        <button
          type="button"
          className={REMOVE_BUTTON_CLASS}
          disabled={busy}
          onClick={() => void handleRemove()}
          aria-label={t('general.sessionManager.package.remove')}
        >
          {uninstalling ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
        </button>
      </Tooltip>
      {confirmDialog}
    </span>
  );
}
