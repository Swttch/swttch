import toast from 'react-hot-toast';
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

const BUTTON_CLASS =
  'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ' +
  'bg-accent-primary-hover hover:bg-accent-primary text-text-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

/**
 * The remove button reads as part of the version line rather than as an action
 * competing with Install/Update: same size as the version text, and the same
 * colour a tenth of an opacity step stronger, so it is findable without
 * advertising itself. Hover drops the alpha and turns it red — destructive, but
 * only once you are on it.
 */
const REMOVE_BUTTON_CLASS =
  'text-text-tertiary/90 hover:text-state-error-fg transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-tertiary/90';

/**
 * Version and install/update control for the kit voice input depends on.
 *
 * Sits at the right of the Voice input section's title rather than in a row of
 * its own: it is the section's own state, not another thing to configure.
 *
 * Shaped after the CLI's update control so the two read the same way — a
 * version with an update button beside it when one is available.
 */
export function ExtendKitControl() {
  const { t } = useTranslation('settings');
  const { info, loading, install, installing, uninstall, uninstalling, refresh, refreshing } =
    useExtendKit();
  const { confirmDialog, confirm } = useConfirmDialog();

  if (loading || !info) return null;

  const spinner = <ArrowPathIcon className="w-3 h-3 animate-spin" />;
  const busy = installing || uninstalling;

  const run = async (successKey: 'installed' | 'updated') => {
    try {
      await install();
      toast.success(t(`general.voice.kit.${successKey}`));
    } catch (err) {
      // The backend hands back a runnable command when a global install needs
      // elevation, so the message is worth showing verbatim.
      toast.error(err instanceof Error ? err.message : t('general.voice.kit.failed'));
    }
  };

  // Removing the kit turns voice input off for the whole machine (the usage
  // panel reads the same package), and it is not a one-click undo — reinstalling
  // is a download. So it asks first.
  const handleRemove = async () => {
    const ok = await confirm({
      title: t('general.voice.kit.removeConfirmTitle'),
      message: t('general.voice.kit.removeConfirmMessage'),
      confirmLabel: t('general.voice.kit.remove'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await uninstall();
      toast.success(t('general.voice.kit.removed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('general.voice.kit.removeFailed'));
    }
  };

  // Not installed: the version has nothing to report, so the button carries the
  // whole message.
  if (!info.installed) {
    return (
      <button className={BUTTON_CLASS} disabled={installing} onClick={() => void run('installed')}>
        {installing ? spinner : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
        {installing ? t('general.voice.kit.installing') : t('general.voice.kit.install')}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {info.updatable ? (
        <button className={BUTTON_CLASS} disabled={busy} onClick={() => void run('updated')}>
          {installing ? spinner : null}
          {installing ? t('general.voice.kit.updating') : t('general.voice.kit.update')}
        </button>
      ) : (
        // Say it is current rather than leaving a bare version number, which
        // reads as "not checked yet" — the same note the CLI's control shows.
        // Absent when `latest` is unknown (offline): we cannot claim it then.
        info.latest && (
          <span className="flex items-center gap-1 text-xs text-text-tertiary">
            <CheckCircleIcon className="w-3.5 h-3.5 text-state-success-fg" />
            {t('general.voice.kit.upToDate')}
          </span>
        )
      )}
      {/* The version doubles as the re-check: it is the thing that would be
          wrong if the kit changed outside this app (installed, updated or
          removed in a terminal), so it is where you would press to ask again.
          Styled as text, not a button — it reports first and acts second. */}
      <button
        type="button"
        className={
          'text-xs text-text-tertiary tabular-nums hover:text-text-secondary transition-colors ' +
          'disabled:cursor-not-allowed'
        }
        disabled={busy || refreshing}
        onClick={() => void refresh()}
        title={t('general.voice.kit.refresh')}
        aria-label={t('general.voice.kit.refresh')}
      >
        {refreshing ? t('general.voice.kit.refreshing') : `v${info.installed}`}
      </button>
      {/* Sits after the version, spaced off it, because it acts ON the thing the
          version names. The icon matches the version's own text size. */}
      <button
        type="button"
        className={REMOVE_BUTTON_CLASS}
        disabled={busy}
        onClick={() => void handleRemove()}
        aria-label={t('general.voice.kit.remove')}
        title={t('general.voice.kit.remove')}
      >
        {uninstalling ? (
          <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <TrashIcon className="w-3.5 h-3.5" />
        )}
      </button>
      {confirmDialog}
    </span>
  );
}
